from fastapi import APIRouter, Query

from app.core.deps import DB
from app.models import BridgeCandidate, NodeSummary, NodeType
from app.services import discover_service

router = APIRouter(prefix="/discover", tags=["discover"])


@router.get("/orphans")
async def list_orphans(
    db: DB,
    node_type: NodeType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[NodeSummary]:
    return await discover_service.find_orphans(db, node_type=node_type, limit=limit, offset=offset)


@router.get("/stale")
async def list_stale(
    db: DB,
    node_type: NodeType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    exclude_fleeting: bool = Query(default=True),
) -> list[NodeSummary]:
    return await discover_service.find_stale(
        db,
        node_type=node_type,
        limit=limit,
        offset=offset,
        exclude_fleeting=exclude_fleeting,
    )


@router.get("/bridges")
async def list_bridges(
    db: DB,
    limit: int = Query(default=30, ge=1, le=100),
    min_similarity: float = Query(default=0.7, ge=0.0, le=1.0),
) -> list[BridgeCandidate]:
    return await discover_service.find_bridges(db, limit=limit, min_similarity=min_similarity)
