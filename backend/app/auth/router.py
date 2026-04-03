import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from neo4j import AsyncDriver

logger = logging.getLogger(__name__)

from app.auth.models import TokenResponse, UserInfo
from app.auth.service import create_jwt, exchange_google_code
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_value
from app.graph.queries import CREATE_PERSON, GET_PERSON_BY_USER_ID
from app.messages.welcome import send_welcome_message

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


@router.get("/google")
async def google_login():
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": f"{settings.backend_url}/auth/callback",
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/callback")
async def google_callback(
    code: str = Query(...),
    db: AsyncDriver = Depends(get_db),
):
    try:
        userinfo = await exchange_google_code(code)
    except Exception as e:
        logger.error("Google OAuth exchange failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to authenticate with Google")

    user_id = userinfo["sub"]
    email = userinfo.get("email", "")
    name = userinfo.get("name", "")

    # Create user in Neo4j if not exists
    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        record = await result.single()

        if record is None:
            orb_id = name.lower().replace(" ", "-") if name else user_id[:8]
            await session.run(
                CREATE_PERSON,
                user_id=user_id,
                email=encrypt_value(email),
                name=name,
                orb_id=orb_id,
            )
            await send_welcome_message(db, user_id)

    token = create_jwt(user_id, email)

    # Redirect to frontend with token
    return RedirectResponse(
        f"{settings.frontend_url}/auth/callback?token={token}"
    )


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
    return {"access_token": token, "token_type": "bearer", "user": {"user_id": user_id, "email": email, "name": name}}


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
        )
