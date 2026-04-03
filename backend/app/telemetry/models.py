from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any, Dict

class TelemetryEvent(BaseModel):
    event_type: str
    page_path: str
    component_name: Optional[str] = None
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
