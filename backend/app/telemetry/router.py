import logging
import uuid
from fastapi import APIRouter, Depends, BackgroundTasks
from neo4j import AsyncDriver

from app.dependencies import get_current_user, get_db
from app.telemetry.models import TelemetryEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

LOG_EVENT_QUERY = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:PERFORMED]->(e:TelemetryEvent {
    uid: $uid,
    event_type: $event_type,
    page_path: $page_path,
    component_name: $component_name,
    properties: $properties,
    timestamp: datetime($timestamp)
})
"""

async def _log_event_to_db(db: AsyncDriver, user_id: str, event: TelemetryEvent):
    uid = str(uuid.uuid4())
    async with db.session() as session:
        try:
            await session.run(
                LOG_EVENT_QUERY,
                user_id=user_id,
                uid=uid,
                event_type=event.event_type,
                page_path=event.page_path,
                component_name=event.component_name or "",
                properties=str(event.properties), # Store as string or handle as Map
                timestamp=event.timestamp.isoformat()
            )
        except Exception as e:
            logger.error("Failed to log telemetry event: %s", e)

@router.post("/event")
async def log_event(
    event: TelemetryEvent,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db)
):
    """Log a user interaction event in the background."""
    background_tasks.add_task(_log_event_to_db, db, current_user["user_id"], event)
    return {"status": "ok"}
