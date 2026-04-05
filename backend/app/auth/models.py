from pydantic import BaseModel


class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    gdpr_consent: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
