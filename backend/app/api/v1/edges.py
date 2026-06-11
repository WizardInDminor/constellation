from sqlite3 import IntegrityError

from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import (
    RESOLVABLE_EDGE_TYPES,
    EdgeCreate,
    EdgeDetail,
    EdgeResolveRequest,
    EdgeUpdate,
)
from app.repositories import edge_repo, node_repo

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


@router.patch("/{edge_id}")
async def update_edge(edge_id: str, data: EdgeUpdate, db: DB) -> EdgeDetail:
    """Edit a relationship's note (ADR-082) — the edge-note authoring loop."""
    updated = await edge_repo.update_note(db, edge_id, data.note)
    if updated is None:
        raise HTTPException(404, "Edge not found")
    return updated


@router.delete("/{edge_id}", status_code=204)
async def delete_edge(edge_id: str, db: DB) -> None:
    deleted = await edge_repo.delete(db, edge_id)
    if not deleted:
        raise HTTPException(404, "Edge not found")


@router.post("/{edge_id}/resolve")
async def resolve_edge(edge_id: str, data: EdgeResolveRequest, db: DB) -> EdgeDetail:
    """Mark a tension edge resolved (ADR-059).

    Restricted to `RESOLVABLE_EDGE_TYPES` (CONTRADICTS, QUESTIONS) — resolution
    has no semantic meaning on other edge types. When `resolved_by_node_id` is
    provided, it must reference a non-deleted node.
    """
    existing = await edge_repo.get_by_id(db, edge_id)
    if existing is None:
        raise HTTPException(404, "Edge not found")
    if existing.type not in RESOLVABLE_EDGE_TYPES:
        raise HTTPException(
            422,
            f"Edge type {existing.type!r} is not resolvable; only "
            f"{sorted(RESOLVABLE_EDGE_TYPES)} carry resolvable semantics.",
        )
    if data.resolved_by_node_id is not None:
        resolver = await node_repo.get_by_id(db, data.resolved_by_node_id)
        if resolver is None:
            raise HTTPException(422, "resolved_by_node_id does not reference an existing node")

    updated = await edge_repo.resolve(db, edge_id, resolved_by_node_id=data.resolved_by_node_id)
    assert updated is not None  # existence already verified above
    return updated


@router.delete("/{edge_id}/resolve")
async def unresolve_edge(edge_id: str, db: DB) -> EdgeDetail:
    """Clear resolved-state on an edge (ADR-059). 404 if the edge does not exist."""
    existing = await edge_repo.get_by_id(db, edge_id)
    if existing is None:
        raise HTTPException(404, "Edge not found")
    updated = await edge_repo.unresolve(db, edge_id)
    assert updated is not None
    return updated
