from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Direction(str, Enum):
    outgoing = "outgoing"
    incoming = "incoming"


class CreateConnectionRequest(BaseModel):
    target_user_id: str = Field(..., min_length=1, max_length=200)
    direction: Direction = Direction.outgoing


class ConnectionOut(BaseModel):
    user_id: str
    direction: str
    created_at: str


class ConnectionListResponse(BaseModel):
    connections: list[ConnectionOut] = []
