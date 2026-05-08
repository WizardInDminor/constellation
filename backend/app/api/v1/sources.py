from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import SourceCreate, SourceDetail, SourceSummary, SourceUpdate
from app.repositories import source_repo

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
async def list_sources(db: DB) -> list[SourceSummary]:
    return await source_repo.list_sources(db)


@router.post("", status_code=201)
async def create_source(data: SourceCreate, db: DB) -> SourceDetail:
    return await source_repo.create(db, data)


@router.get("/{source_id}")
async def get_source(source_id: str, db: DB) -> SourceDetail:
    source = await source_repo.get_by_id(db, source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@router.patch("/{source_id}")
async def update_source(source_id: str, data: SourceUpdate, db: DB) -> SourceDetail:
    source = await source_repo.update(db, source_id, data)
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@router.delete("/{source_id}", status_code=204)
async def delete_source(source_id: str, db: DB) -> None:
    ok, reason = await source_repo.delete(db, source_id)
    if not ok:
        if reason:
            raise HTTPException(409, reason)
        raise HTTPException(404, "Source not found")
