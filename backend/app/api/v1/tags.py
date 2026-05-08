from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import TagCreate, TagRef, TagUpdate
from app.repositories import tag_repo

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("")
async def list_tags(db: DB) -> list[TagRef]:
    return await tag_repo.list_tags(db)


@router.post("", status_code=201)
async def create_tag(data: TagCreate, db: DB) -> TagRef:
    return await tag_repo.create(db, data)


@router.get("/{tag_id}")
async def get_tag(tag_id: str, db: DB) -> TagRef:
    tag = await tag_repo.get_by_id(db, tag_id)
    if tag is None:
        raise HTTPException(404, "Tag not found")
    return tag


@router.patch("/{tag_id}")
async def update_tag(tag_id: str, data: TagUpdate, db: DB) -> TagRef:
    tag = await tag_repo.update(db, tag_id, data)
    if tag is None:
        raise HTTPException(404, "Tag not found")
    return tag


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, db: DB) -> None:
    deleted = await tag_repo.delete(db, tag_id)
    if not deleted:
        raise HTTPException(404, "Tag not found")
