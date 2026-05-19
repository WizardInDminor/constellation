from sqlite3 import IntegrityError
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, EmbedProvider
from app.models import (
    EdgeCreate,
    FleetingCreate,
    LiteratureCreate,
    NeighborResult,
    NodeDetail,
    NodeRef,
    NodeSummary,
    NodeUpdate,
    Paginated,
    PermanentCreate,
    StoryEventCreate,
    StructureCreate,
    TimelinePositionUpdate,
)
from app.repositories import edge_repo, node_repo, source_repo, timeline_repo
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


@router.post("/story-event", status_code=201)
async def create_story_event(data: StoryEventCreate, db: DB, provider: EmbedProvider) -> NodeDetail:
    """Phase 9 Slice 4 (ADR-064 + ADR-065).

    Creates a permanent node flagged as a story event, places it at
    `discourse_position` on the named timeline structure node, writes a
    `COLLECTS` edge from the timeline to the event, and (when
    `auto_follows_from`) chains a `FOLLOWS_FROM` edge from the preceding
    event in that lane.
    """
    # Validate the timeline structure node exists.
    timeline = await node_repo.get_by_id(db, data.timeline_node_id)
    if timeline is None or timeline.type != "structure":
        raise HTTPException(422, "timeline_node_id must reference a structure node")

    # Create the event node itself.
    event = await node_repo.create_story_event(
        db,
        title=data.title,
        content=data.content,
        story_time=data.story_time,
        prose_status=data.prose_status,
        manuscript_location=data.manuscript_location,
    )

    # Place on the timeline.
    await timeline_repo.place_event(
        db,
        event_node_id=event.id,
        timeline_node_id=data.timeline_node_id,
        discourse_position=data.discourse_position,
    )

    # COLLECTS edge from the timeline to the new event (per ADR-065).
    try:
        await edge_repo.create(
            db,
            EdgeCreate(
                from_id=data.timeline_node_id,
                to_id=event.id,
                type="COLLECTS",
            ),
        )
    except IntegrityError:
        # Edge already exists (idempotency); fine.
        pass

    # Auto-FOLLOWS_FROM from the preceding event in this lane (ADR-065).
    if data.auto_follows_from:
        predecessor_id = await timeline_repo.get_predecessor(
            db,
            timeline_node_id=data.timeline_node_id,
            discourse_position=data.discourse_position,
        )
        if predecessor_id and predecessor_id != event.id:
            try:
                await edge_repo.create(
                    db,
                    EdgeCreate(
                        from_id=event.id,
                        to_id=predecessor_id,
                        type="FOLLOWS_FROM",
                        note="auto: timeline discourse order",
                    ),
                )
            except IntegrityError:
                pass

    await embedding_service.embed_or_queue(db, event.id, provider)
    return await node_repo.get_by_id(db, event.id) or event


# ── parameterised paths ───────────────────────────────────────────────────────


@router.get("")
async def list_nodes(
    db: DB,
    type: Annotated[str | None, Query(description="Filter by node type")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    no_summary: Annotated[bool, Query(description="Only notes with empty/null summary")] = False,
    no_outgoing: Annotated[bool, Query(description="Only notes with no outgoing edges")] = False,
    no_edges: Annotated[
        bool, Query(description="Only notes with no edges in either direction")
    ] = False,
    summary_max_length: Annotated[
        int | None,
        Query(ge=1, description="Only notes whose non-null summary is shorter than N chars"),
    ] = None,
    hide_story_events: Annotated[
        bool, Query(description="Exclude is_story_event=1 nodes (ADR-064)")
    ] = False,
) -> Paginated[NodeSummary]:
    items, total = await node_repo.list_nodes(
        db,
        type_=type,
        page=page,
        page_size=page_size,
        no_summary=no_summary,
        no_outgoing=no_outgoing,
        no_edges=no_edges,
        summary_max_length=summary_max_length,
        hide_story_events=hide_story_events,
    )
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
    if "source_id" in data.model_fields_set:
        existing = await node_repo.get_by_id(db, node_id)
        if existing is None:
            raise HTTPException(404, "Node not found")
        if existing.type == "fleeting":
            raise HTTPException(422, "Sources cannot be attached to fleeting notes")
        if data.source_id is not None:
            src = await source_repo.get_by_id(db, data.source_id)
            if src is None:
                raise HTTPException(422, f"Source '{data.source_id}' does not exist")

    try:
        node = await node_repo.update(db, node_id, data)
    except IntegrityError as exc:
        # CHECK-constraint violation (e.g. bogus prose_status) — surface as 422.
        raise HTTPException(422, str(exc)) from exc
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


@router.patch("/{node_id}/timeline-position")
async def update_timeline_position(
    node_id: str, data: TimelinePositionUpdate, db: DB
) -> NodeDetail:
    """Phase 9 Slice 4 (ADR-065). Updates a story event's
    `discourse_position` on the named timeline and rewires the
    `FOLLOWS_FROM` chain so the moved event's predecessor edge points at
    the new predecessor (per-lane chain consistency).

    Edges to events in *other* timelines are not touched (ADR-065:
    positions are per-timeline).
    """
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Event not found")
    if not node.is_story_event:
        raise HTTPException(422, "timeline-position updates are only valid for story events")

    # Find the old position (if any) so we can update the previous
    # predecessor's outgoing FOLLOWS_FROM edge as needed.
    old_position = await timeline_repo.get_position(
        db,
        event_node_id=node_id,
        timeline_node_id=data.timeline_node_id,
    )
    if old_position is None:
        raise HTTPException(404, "Event is not placed on the named timeline")

    # Identify the OLD predecessor and OLD successor (in the lane, by old pos)
    # and the NEW predecessor (by new pos). We need this before mutating the
    # join row, so the queries reflect the pre-move state.
    old_pred = await timeline_repo.get_predecessor(
        db,
        timeline_node_id=data.timeline_node_id,
        discourse_position=old_position,
    )

    # Move the join row.
    await timeline_repo.place_event(
        db,
        event_node_id=node_id,
        timeline_node_id=data.timeline_node_id,
        discourse_position=data.discourse_position,
    )

    new_pred = await timeline_repo.get_predecessor(
        db,
        timeline_node_id=data.timeline_node_id,
        discourse_position=data.discourse_position,
    )

    # Rewire FOLLOWS_FROM only if the predecessor changed.
    if old_pred != new_pred:
        # Remove the stale FOLLOWS_FROM (this event -> old predecessor).
        if old_pred is not None and old_pred != node_id:
            stale = await edge_repo.find_by_endpoints(
                db,
                from_id=node_id,
                to_id=old_pred,
                edge_type="FOLLOWS_FROM",
            )
            if stale is not None:
                await edge_repo.delete(db, stale.id)
        # Create the new FOLLOWS_FROM if there's a new predecessor.
        if new_pred is not None and new_pred != node_id:
            try:
                await edge_repo.create(
                    db,
                    EdgeCreate(
                        from_id=node_id,
                        to_id=new_pred,
                        type="FOLLOWS_FROM",
                        note="auto: timeline discourse order",
                    ),
                )
            except IntegrityError:
                pass

    refreshed = await node_repo.get_by_id(db, node_id)
    assert refreshed is not None
    return refreshed
