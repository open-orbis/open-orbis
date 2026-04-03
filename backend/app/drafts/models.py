from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DraftNote(BaseModel):
    uid: str
    text: str
    from_voice: bool
    created_at: datetime
    updated_at: datetime

class CreateDraftRequest(BaseModel):
    text: str
    from_voice: bool = False

class UpdateDraftRequest(BaseModel):
    text: str
