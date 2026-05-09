from sqlite3 import IntegrityError
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, EmbedProvider
from app.models import (
    FleetingCreate,
    LiteratureCreate,
    NeighborResult,
    NodeDetail,
    NodeRef,
    NodeSummary,
    NodeUpdate,
    Paginated,
    PermanentCreate,
    StructureCreate,
)
from app.repositories import edge_repo, node_repo
from app.services import embedding_service

router = APIRouter(prefix="/nodes", tags=["nodes"])

# ── literal paths must be registered before /{node_id} ───────────────────────


@router.get("/inbox")
async def get_inbox(db: DB) -> list[NodeSummary]:
    return await node_repo.list_inbox(db)


@router.get("/search")
async def search_nodes(
    db: DB,
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[NodeRef]:
    return await node_repo.search_nodes(db, q=q, limit=limit)


@router.post("/fleeting", status_code=201)
async def create_fleeting(data: FleetingCreate, db: DB) -> NodeDetail:
    return await node_repo.create_fleeting(db, data)


@router.post("/permanent", status_code=201)
async def create_permanent(data: PermanentCreate, db: DB, provider: EmbedProvider) -> NodeDetail:
    try:
        node = await node_repo.create_permanent(db, data)
    except IntegrityError as exc:
        raise HTTPException(422, str(exc))
    await embedding_service.embed_or_queue(db, node.id, provider)
    # Re-fetch so the response reflects the embedding_model written by embed_or_queue
    return await node_repo.get_by_id(db, node.id) or node


@router.post("/literature", status_code=201)
async def create_literature(data: LiteratureCreate, db: DB, provider: EmbedProvider) -> NodeDetail:
    try:
        node = await node_repo.create_literature(db, data)
    except IntegrityError as exc:
        raise HTTPException(422, str(exc))
    await embedding_service.embed_or_queue(db, node.id, provider)
    return await node_repo.get_by_id(db, node.id) or node


@router.post("/structure", status_code=201)
async def create_structure(data: StructureCreate, db: DB, provider: EmbedProvider) -> NodeDetail:
    node = await node_repo.create_structure(db, data)
    await embedding_service.embed_or_queue(db, node.id, provider)
    return await node_repo.get_by_id(db, node.id) or node


# ── parameterised paths ───────────────────────────────────────────────────────


@router.get("")
async def list_nodes(
    db: DB,
    type: Annotated[str | None, Query(description="Filter by node type")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Paginated[NodeSummary]:
    items, total = await node_repo.list_nodes(db, type_=type, page=page, page_size=page_size)
    return Paginated(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{node_id}/neighbors")
async def get_neighbors(
    node_id: str,
    db: DB,
    type: Annotated[str | None, Query(alias="type")] = None,
) -> list[NeighborResult]:
    return await edge_repo.get_neighbors(db, node_id, edge_type=type)


@router.get("/{node_id}")
async def get_node(node_id: str, db: DB) -> NodeDetail:
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    return node


@router.patch("/{node_id}")
async def update_node(
    node_id: str, data: NodeUpdate, db: DB, provider: EmbedProvider
) -> NodeDetail:
    node = await node_repo.update(db, node_id, data)
    if node is None:
        raise HTTPException(404, "Node not found")
    if {"title", "content"} & data.model_fields_set and node.type != "fleeting":
        await embedding_service.embed_or_queue(db, node.id, provider)
    return node


@router.delete("/{node_id}", status_code=204)
async def delete_node(node_id: str, db: DB) -> None:
    deleted = await node_repo.soft_delete(db, node_id)
    if not deleted:
        raise HTTPException(404, "Node not found")


@router.post("/{node_id}/process")
async def process_node(node_id: str, db: DB) -> NodeDetail:
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    if node.type != "fleeting":
        raise HTTPException(
            422, f"Node is type '{node.type}'; only fleeting notes can be marked processed"
        )
    result = await node_repo.mark_processed(db, node_id)
    assert result is not None
    return result
