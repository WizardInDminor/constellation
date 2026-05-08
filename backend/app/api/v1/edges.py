from sqlite3 import IntegrityError

from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import EdgeCreate, EdgeDetail
from app.repositories import edge_repo

router = APIRouter(prefix="/edges", tags=["edges"])


@router.post("", status_code=201)
async def create_edge(data: EdgeCreate, db: DB) -> EdgeDetail:
    try:
        return await edge_repo.create(db, data)
    except IntegrityError as exc:
        detail = str(exc)
        if "UNIQUE" in detail:
            raise HTTPException(409, "Edge already exists between these nodes with this type")
        raise HTTPException(422, detail)


@router.delete("/{edge_id}", status_code=204)
async def delete_edge(edge_id: str, db: DB) -> None:
    deleted = await edge_repo.delete(db, edge_id)
    if not deleted:
        raise HTTPException(404, "Edge not found")
