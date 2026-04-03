import uuid
from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.dependencies import get_current_user, get_db
from app.drafts.models import DraftNote, CreateDraftRequest, UpdateDraftRequest

router = APIRouter(prefix="/drafts", tags=["drafts"])

LIST_DRAFTS = """
MATCH (p:Person {user_id: $user_id})-[:HAS_DRAFT]->(d:DraftNote)
RETURN d ORDER BY d.created_at DESC
"""

CREATE_DRAFT = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:HAS_DRAFT]->(d:DraftNote {
    uid: $uid,
    text: $text,
    from_voice: $from_voice,
    created_at: datetime(),
    updated_at: datetime()
})
RETURN d
"""

UPDATE_DRAFT = """
MATCH (p:Person {user_id: $user_id})-[:HAS_DRAFT]->(d:DraftNote {uid: $uid})
SET d.text = $text, d.updated_at = datetime()
RETURN d
"""

DELETE_DRAFT = """
MATCH (p:Person {user_id: $user_id})-[:HAS_DRAFT]->(d:DraftNote {uid: $uid})
DETACH DELETE d
"""

def _sanitize_node(node):
    data = dict(node)
    for k, v in data.items():
        if hasattr(v, "isoformat"):
            data[k] = v.isoformat()
    return data

@router.get("", response_model=list[DraftNote])
async def get_drafts(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db)
):
    async with db.session() as session:
        result = await session.run(LIST_DRAFTS, user_id=current_user["user_id"])
        records = await result.list()
        return [_sanitize_node(r["d"]) for r in records]

@router.post("", response_model=DraftNote)
async def create_draft(
    request: CreateDraftRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db)
):
    uid = str(uuid.uuid4())
    async with db.session() as session:
        result = await session.run(
            CREATE_DRAFT,
            user_id=current_user["user_id"],
            uid=uid,
            text=request.text,
            from_voice=request.from_voice
        )
        record = await result.single()
        return _sanitize_node(record["d"])

@router.put("/{uid}", response_model=DraftNote)
async def update_draft(
    uid: str,
    request: UpdateDraftRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db)
):
    async with db.session() as session:
        result = await session.run(
            UPDATE_DRAFT,
            user_id=current_user["user_id"],
            uid=uid,
            text=request.text
        )
        record = await result.single()
        if not record:
            raise HTTPException(status_code=404, detail="Draft not found")
        return _sanitize_node(record["d"])

@router.delete("/{uid}")
async def delete_draft(
    uid: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db)
):
    async with db.session() as session:
        await session.run(DELETE_DRAFT, user_id=current_user["user_id"], uid=uid)
    return {"status": "ok"}
