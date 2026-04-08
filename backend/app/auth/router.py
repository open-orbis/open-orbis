import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.auth.models import (
    OAuthCodeRequest,
    TokenResponse,
    UserInfo,
)
from app.auth.service import (
    create_jwt,
    exchange_google_code,
    exchange_linkedin_code,
    generate_orb_id,
)
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_value
from app.graph.queries import CREATE_PERSON, GET_PERSON_BY_USER_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_or_create_person(
    db: AsyncDriver,
    user_id: str,
    email: str,
    name: str,
    picture: str,
    provider: str,
) -> None:
    """Create a Person node if it doesn't exist yet."""
    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        if await result.single() is not None:
            return

        orb_id = await generate_orb_id(name, db)
        await session.run(
            CREATE_PERSON,
            user_id=user_id,
            email=encrypt_value(email),
            name=name,
            orb_id=orb_id,
            picture=picture,
            provider=provider,
        )


@router.post("/google", response_model=TokenResponse)
async def google_login(
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a Google authorization code for a JWT."""
    try:
        userinfo = await exchange_google_code(body.code)
    except Exception as e:
        logger.error("Google OAuth failed: %s", e)
        raise HTTPException(
            status_code=401, detail="Google authentication failed"
        ) from None

    user_id = f"google-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    await _get_or_create_person(db, user_id, email, name, picture, "google")

    token = create_jwt(user_id, email)
    return TokenResponse(
        access_token=token,
        user=UserInfo(user_id=user_id, email=email, name=name, picture=picture),
    )


@router.post("/linkedin", response_model=TokenResponse)
async def linkedin_login(
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a LinkedIn authorization code for a JWT."""
    try:
        userinfo = await exchange_linkedin_code(
            body.code, settings.linkedin_redirect_uri
        )
    except Exception as e:
        logger.error("LinkedIn OAuth failed: %s", e)
        raise HTTPException(
            status_code=401, detail="LinkedIn authentication failed"
        ) from None

    user_id = f"linkedin-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    await _get_or_create_person(db, user_id, email, name, picture, "linkedin")

    token = create_jwt(user_id, email)
    return TokenResponse(
        access_token=token,
        user=UserInfo(user_id=user_id, email=email, name=name, picture=picture),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(
            GET_PERSON_BY_USER_ID, user_id=current_user["user_id"]
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")

        person = dict(record["p"])
        return UserInfo(
            user_id=person["user_id"],
            email=current_user["email"],
            name=person.get("name", ""),
            picture=person.get("picture", ""),
            profile_image=person.get("profile_image", ""),
            gdpr_consent=bool(person.get("gdpr_consent", False)),
        )


@router.post("/gdpr-consent")
async def grant_gdpr_consent(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Record GDPR consent for the current user."""
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.gdpr_consent = true, p.gdpr_consent_at = $now",
            user_id=current_user["user_id"],
            now=datetime.now(timezone.utc).isoformat(),
        )
    return {"status": "ok"}


@router.delete("/me")
async def delete_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Permanently delete the current user: Person node and the entire subgraph reachable from it.

    Uses a variable-length path so nested nodes like Replies (Message → Reply)
    are removed too, not just direct children of Person.
    """
    async with db.session() as session:
        # Remove every node reachable from the Person via any outgoing path (any depth).
        await session.run(
            """
            MATCH (p:Person {user_id: $user_id})-[*1..]->(n)
            WITH DISTINCT n
            DETACH DELETE n
            """,
            user_id=current_user["user_id"],
        )
        # Remove the Person node itself
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) DETACH DELETE p",
            user_id=current_user["user_id"],
        )
    return {"status": "deleted"}
