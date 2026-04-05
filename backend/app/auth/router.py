import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.auth.models import UserInfo
from app.auth.service import create_jwt
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_value
from app.graph.queries import CREATE_PERSON, GET_PERSON_BY_USER_ID
from app.messages.welcome import send_welcome_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/dev-login")
async def dev_login(
    db: AsyncDriver = Depends(get_db),
):
    """Dev-only login that creates a test user without Google OAuth."""
    user_id = "seed-alessandro-berti"
    email = "dev@orbis.local"
    name = "Alessandro Berti"

    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        record = await result.single()

        if record is None:
            await session.run(
                CREATE_PERSON,
                user_id=user_id,
                email=encrypt_value(email),
                name=name,
                orb_id="alessandro",
            )
            await send_welcome_message(db, user_id)

    token = create_jwt(user_id, email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"user_id": user_id, "email": email, "name": name},
    }


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


@router.delete("/account")
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Schedule account deletion. Marks account for deletion after 30 days.

    Sets deletion_requested_at on the Person node. A background job
    should permanently delete accounts 30 days after this timestamp.
    """
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.deletion_requested_at = $now",
            user_id=current_user["user_id"],
            now=datetime.now(timezone.utc).isoformat(),
        )
    return {"status": "scheduled", "message": "Account will be permanently deleted in 30 days."}
