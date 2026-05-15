from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, GenProvider
from app.models import (
    BridgeCandidate,
    BridgeClassification,
    ClassifyBridgeRequest,
    NodeSummary,
    NodeType,
)
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
    cross_tag: bool = Query(default=False),
) -> list[BridgeCandidate]:
    return await discover_service.find_bridges(
        db, limit=limit, min_similarity=min_similarity, cross_tag=cross_tag
    )


@router.post("/bridges/classify")
async def classify_bridge(
    body: ClassifyBridgeRequest, db: DB, gen_provider: GenProvider
) -> BridgeClassification:
    if body.node_a_id == body.node_b_id:
        raise HTTPException(422, "node_a_id and node_b_id must differ")
    try:
        return await discover_service.classify_pair(
            db, gen_provider, node_a_id=body.node_a_id, node_b_id=body.node_b_id
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(500, "AI returned unparseable response") from exc
