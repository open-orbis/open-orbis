from __future__ import annotations

from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    sender_name: str = Field(..., min_length=1, max_length=200)
    sender_email: str = Field(..., min_length=1, max_length=300)
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1, max_length=5000)


class ReplyRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


class ReplyOut(BaseModel):
    uid: str
    body: str
    created_at: str
    from_owner: bool


class MessageOut(BaseModel):
    uid: str
    sender_name: str
    sender_email: str
    subject: str
    body: str
    created_at: str
    read: bool
    replies: list[ReplyOut] = []


class MessageSentResponse(BaseModel):
    uid: str
    detail: str = "Message sent successfully"
