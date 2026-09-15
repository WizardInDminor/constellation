"""Proposal lifecycle service (Phase C1, ADR-084/086).

Owns the pieces the repositories deliberately don't:

* the status machine (`ALLOWED_TRANSITIONS`, direction pack verbatim);
* revision appending on create and on every edit (AT-032);
* acceptance materialization — the ONLY path from proposal to accepted
  truth. Accepted node-producing proposals become permanent nodes with
  `canon_status='provisional'` (the promote precedent, ADR-081), role-tagged
  per the reserved `narrative:*` vocabulary (ADR-086); proposed links become
  real edges only here (ADR-084, AT-002);
* activity event emission for every lifecycle step.

The composite operations commit sequentially (house pattern; see ADR-035b
precedent) — the status flip is last, so a crash mid-acceptance leaves the
proposal unresolved and re-acceptance is safe to retry after cleanup.
"""

import aiosqlite

from app.core.errors import (
    Conflict,
    InvalidStatusTransition,
    ObjectNotFound,
    ProjectNotFound,
    ValidationFailed,
)
from app.models import EdgeCreate, PermanentCreate
from app.models.narrative import PROPOSAL_ROLE_TAGS
from app.models.proposal import (
    ALLOWED_TRANSITIONS,
    AcceptResult,
    ProposalCreate,
    ProposalDetail,
    ProposalStatus,
    ProposalTransitionRequest,
    ProposalUpdate,
)
from app.models.provenance import UI_PROVENANCE
from app.providers.base import EmbeddingProvider
from app.repositories import (
    edge_repo,
    node_repo,
    project_repo,
    proposal_repo,
    provenance_repo,
    tag_repo,
)
from app.services import activity_service, embedding_service

_EDITABLE_STATUSES: frozenset[ProposalStatus] = frozenset(
    {"captured", "proposed", "under_review"}
)


async def create(db: aiosqlite.Connection, data: ProposalCreate) -> ProposalDetail:
    if not await project_repo.is_project_hub(db, data.project_hub_id):
        raise ProjectNotFound(
            "Project hub not found", details={"project_hub_id": data.project_hub_id}
        )
    for ref in data.related_objects:
        if await node_repo.get_by_id(db, ref.object_id) is None:
            raise ValidationFailed(
                "Related object does not reference an existing node",
                details={"object_id": ref.object_id},
            )

    provenance = await provenance_repo.create(db, data.provenance)
    proposal = await proposal_repo.create(db, data, provenance.id)
    await proposal_repo.append_revision(
        db,
        proposal.id,
        title=proposal.title,
        summary=proposal.summary,
        payload=proposal.payload,
        related_objects=proposal.related_objects,
        change_summary="Initial version",
        provenance_id=provenance.id,
    )
    await activity_service.emit(
        db,
        event_type="proposal.created",
        object_type="proposal",
        object_id=proposal.id,
        summary=f"{data.proposal_type.capitalize()} proposal created: {proposal.title}",
        project_hub_id=proposal.project_hub_id,
        provenance_id=provenance.id,
    )
    refreshed = await proposal_repo.get_by_id(db, proposal.id)
    assert refreshed is not None
    return refreshed


async def update(
    db: aiosqlite.Connection, proposal_id: str, data: ProposalUpdate
) -> ProposalDetail:
    existing = await proposal_repo.get_by_id(db, proposal_id)
    if existing is None:
        raise ObjectNotFound("Proposal not found", details={"object_type": "proposal"})
    if existing.status not in _EDITABLE_STATUSES:
        raise Conflict(
            f"Proposal in status {existing.status!r} is not editable",
            details={"status": existing.status},
        )
    if data.related_objects is not None:
        for ref in data.related_objects:
            if await node_repo.get_by_id(db, ref.object_id) is None:
                raise ValidationFailed(
                    "Related object does not reference an existing node",
                    details={"object_id": ref.object_id},
                )

    updated = await proposal_repo.update_content(
        db,
        proposal_id,
        title=data.title,
        summary=data.summary,
        payload=data.payload,
        related_objects=data.related_objects,
    )
    assert updated is not None
    provenance = await provenance_repo.create(db, data.provenance or UI_PROVENANCE)
    await proposal_repo.append_revision(
        db,
        proposal_id,
        title=updated.title,
        summary=updated.summary,
        payload=updated.payload,
        related_objects=updated.related_objects,
        change_summary=data.change_summary,
        provenance_id=provenance.id,
    )
    await activity_service.emit(
        db,
        event_type="proposal.updated",
        object_type="proposal",
        object_id=proposal_id,
        summary=f"Proposal edited: {updated.title}",
        project_hub_id=updated.project_hub_id,
        provenance_id=provenance.id,
    )
    refreshed = await proposal_repo.get_by_id(db, proposal_id)
    assert refreshed is not None
    return refreshed


def _check_transition(current: ProposalStatus, to: ProposalStatus) -> None:
    if (current, to) not in ALLOWED_TRANSITIONS:
        raise InvalidStatusTransition(
            f"Transition {current!r} -> {to!r} is not allowed",
            details={"from_status": current, "to_status": to},
        )


async def transition(
    db: aiosqlite.Connection,
    proposal_id: str,
    request: ProposalTransitionRequest,
    embed: EmbeddingProvider,
) -> AcceptResult:
    """Apply one lifecycle transition. Acceptance additionally materializes
    the proposal's substance (node, role tag, edges).

    Convenience: accepting a 'proposed' proposal auto-passes through
    'under_review' (both hops are recorded) — the pack's state machine has no
    proposed->accepted arc, and the inbox shouldn't need two clicks.
    """
    proposal = await proposal_repo.get_by_id(db, proposal_id)
    if proposal is None:
        raise ObjectNotFound("Proposal not found", details={"object_type": "proposal"})

    to_status = request.to_status
    current = proposal.status

    if to_status == "accepted" and current == "proposed":
        _check_transition("proposed", "under_review")
        interim = await proposal_repo.set_status(db, proposal_id, "under_review")
        assert interim is not None
        proposal = interim
        current = "under_review"

    _check_transition(current, to_status)

    if to_status == "superseded" and request.superseded_by_proposal_id is not None:
        successor = await proposal_repo.get_by_id(db, request.superseded_by_proposal_id)
        if successor is None:
            raise ValidationFailed(
                "superseded_by_proposal_id does not reference an existing proposal",
                details={"superseded_by_proposal_id": request.superseded_by_proposal_id},
            )

    provenance = await provenance_repo.create(db, request.provenance or UI_PROVENANCE)

    created_node_id: str | None = None
    created_edge_ids: list[str] = []
    if to_status == "accepted":
        created_node_id, created_edge_ids = await _materialize(db, proposal, embed)

    updated = await proposal_repo.set_status(
        db,
        proposal_id,
        to_status,
        resolution_note=request.resolution_note,
        resolution_provenance_id=provenance.id,
        superseded_by_proposal_id=request.superseded_by_proposal_id,
        accepted_node_id=created_node_id,
    )
    assert updated is not None

    await activity_service.emit(
        db,
        event_type=f"proposal.{to_status}",
        object_type="proposal",
        object_id=proposal_id,
        summary=f"Proposal {to_status.replace('_', ' ')}: {updated.title}",
        project_hub_id=updated.project_hub_id,
        metadata=(
            {"accepted_node_id": created_node_id, "created_edge_ids": created_edge_ids}
            if to_status == "accepted"
            else None
        ),
        provenance_id=provenance.id,
    )
    return AcceptResult(
        proposal=updated,
        created_node_id=created_node_id,
        created_edge_ids=created_edge_ids,
    )


async def _materialize(
    db: aiosqlite.Connection, proposal: ProposalDetail, embed: EmbeddingProvider
) -> tuple[str | None, list[str]]:
    """Turn an accepted proposal into accepted truth (AT-003).

    Node-producing types create a permanent node (canon_status='provisional' —
    newly accepted truth is not yet settled, ADR-081 precedent). Edge
    proposals create the edge directly. Proposed related-object links become
    real edges anchored on the new node.
    """
    payload = proposal.payload or {}

    if proposal.proposal_type == "edge":
        for key in ("from_id", "to_id", "type"):
            if key not in payload:
                raise ValidationFailed(
                    f"Edge proposal payload missing {key!r}", details={"missing": key}
                )
        for endpoint in (payload["from_id"], payload["to_id"]):
            if await node_repo.get_by_id(db, endpoint) is None:
                raise ValidationFailed(
                    "Edge proposal endpoint does not reference an existing node",
                    details={"object_id": endpoint},
                )
        edge = await edge_repo.create(
            db,
            EdgeCreate(
                from_id=payload["from_id"],
                to_id=payload["to_id"],
                type=payload["type"],
                note=payload.get("note"),
            ),
        )
        await activity_service.emit(
            db,
            event_type="edge.created",
            object_type="edge",
            object_id=edge.id,
            summary=f"Edge accepted from proposal: {payload['type']}",
            project_hub_id=proposal.project_hub_id,
        )
        return None, [edge.id]

    # Node-producing types.
    title = payload.get("title") or proposal.title
    content = payload.get("content") or proposal.summary or proposal.title
    if proposal.proposal_type == "scene":
        node = await node_repo.create_story_event(
            db,
            title=title,
            content=content,
            story_time=payload.get("story_time"),
            prose_status=payload.get("prose_status"),
        )
        # Story events are permanents without canon metadata by default; mark
        # newly accepted material provisional like every other acceptance.
        await db.execute(
            "UPDATE nodes SET canon_status = 'provisional' WHERE id = ?", (node.id,)
        )
        await db.commit()
    else:
        node = await node_repo.create_permanent(
            db,
            PermanentCreate(
                title=title,
                content=content,
                summary=payload.get("summary") or proposal.summary,
                canon_status="provisional",
            ),
        )

    role_tag = PROPOSAL_ROLE_TAGS.get(proposal.proposal_type)
    if role_tag is not None:
        tag = await tag_repo.get_or_create_by_name(db, role_tag)
        await tag_repo.attach_to_node(db, node.id, tag.id)

    await embedding_service.embed_or_queue(db, node.id, embed)

    edge_ids: list[str] = []
    for ref in proposal.related_objects:
        from_id, to_id = (
            (node.id, ref.object_id)
            if ref.direction == "outgoing"
            else (ref.object_id, node.id)
        )
        try:
            edge = await edge_repo.create(
                db,
                EdgeCreate(
                    from_id=from_id,
                    to_id=to_id,
                    type=ref.relationship_type,
                    note=ref.note,
                ),
            )
        except Exception:
            # Duplicate or invalid link: skip rather than fail the acceptance
            # mid-way — the node is already accepted truth at this point.
            continue
        edge_ids.append(edge.id)

    await activity_service.emit(
        db,
        event_type="node.created",
        object_type="node",
        object_id=node.id,
        summary=f"Accepted from proposal: {node.title}",
        project_hub_id=proposal.project_hub_id,
    )
    return node.id, edge_ids
