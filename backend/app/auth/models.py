from pydantic import BaseModel


class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""


class ChangeEmailRequest(BaseModel):
    new_email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
