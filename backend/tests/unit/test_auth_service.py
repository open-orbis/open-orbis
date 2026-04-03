from jose import jwt

from app.auth.service import create_jwt
from app.config import settings


def test_create_jwt():
    user_id = "test-user"
    email = "test@example.com"
    token = create_jwt(user_id, email)

    payload = jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    assert payload["sub"] == user_id
    assert payload["email"] == email
    assert "exp" in payload
