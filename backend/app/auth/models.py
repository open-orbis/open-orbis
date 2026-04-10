from pydantic import BaseModel


class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    profile_image: str = ""
    gdpr_consent: bool = False
    is_admin: bool = False
    activated: bool = False
    deletion_requested_at: str | None = None
    deletion_days_remaining: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


class OAuthCodeRequest(BaseModel):
    code: str
