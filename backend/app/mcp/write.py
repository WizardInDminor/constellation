"""Controlled MCP write tools (Phase C5, ADR-090; direction pack Phase 4).

Rules, enforced here and in the services beneath:

* every write requires the `write` scope (`record_story_decision` requires
  the separate `decisions` scope — grant it deliberately);
* every write carries provenance derived from the authenticated client,
  plus optional conversation references supplied by the caller (AT-022);
* AI-created story material defaults to `proposed` (proposals) or
  `speculative` (development notes) — there is NO tool that sets a proposal
  to `accepted` or writes settled canon (AT-023): acceptance lives only in
  the human review UI;
* proposed links stay inside the proposal payload until acceptance
  (AT-002).

Registered against the same MCPServer instance as the read tools; imported
at the bottom of `app.mcp.server`.
"""

import logging
from typing import Any

from app.core.lifespan import get_db, get_embedding_provider
from app.mcp import auth
from app.mcp.server import mcp_server
from app.models import DecisionCreate, ProposalCreate, ProposalUpdate
from app.models.proposal import ProposalType, RelatedObjectRef
from app.models.provenance import ProvenanceCreate
from app.repositories import decision_repo, project_repo, provenance_repo
from app.services import activity_service, note_service, proposal_service

logger = logging.getLogger(__name__)


def _client_provenance(
    conversation_id: str | None = None, message_reference: str | None = None
) -> ProvenanceCreate:
    identity = auth.require_identity()
    return ProvenanceCreate(
        actor_type="ai_client",
        client_type="mcp",
        client_name=identity.client_name,
        source_conversation_id=conversation_id,
        source_message_reference=message_reference,
    )


def _parse_related(related_objects: list[dict[str, Any]] | None) -> list[RelatedObjectRef]:
    return [RelatedObjectRef(**r) for r in (related_objects or [])]


@mcp_server.tool()
async def create_story_proposal(
    project_id: str,
    proposal_type: ProposalType,
    title: str,
    summary: str | None = None,
    payload: dict[str, Any] | None = None,
    related_objects: list[dict[str, Any]] | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Propose new story material (scene, character, theme, location,
    world_rule, edge, general). The proposal enters the user's review inbox
    with status 'proposed'; it becomes accepted truth only if the user
    accepts it there. related_objects entries:
    {object_id, relationship_type, direction?, note?} — these links are
    created only on acceptance."""
    auth.require_scope("write")
    provenance = _client_provenance(conversation_id)
    proposal = await proposal_service.create(
        get_db(),
        ProposalCreate(
            project_hub_id=project_id,
            proposal_type=proposal_type,
            title=title,
            summary=summary,
            payload=payload,
            related_objects=_parse_related(related_objects),
            provenance=provenance,
        ),
    )
    logger.info("mcp write create_story_proposal id=%s", proposal.id)
    return proposal.model_dump(mode="json")


@mcp_server.tool()
async def update_proposal(
    proposal_id: str,
    title: str | None = None,
    summary: str | None = None,
    payload: dict[str, Any] | None = None,
    change_summary: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Update an unresolved proposal's mutable fields. Every applied edit
    appends a revision; the original stays queryable. Resolved proposals
    cannot be edited."""
    auth.require_scope("write")
    updated = await proposal_service.update(
        get_db(),
        proposal_id,
        ProposalUpdate(
            title=title,
            summary=summary,
            payload=payload,
            change_summary=change_summary,
            provenance=_client_provenance(conversation_id),
        ),
    )
    return updated.model_dump(mode="json")


@mcp_server.tool()
async def link_proposal_to_objects(
    proposal_id: str,
    related_objects: list[dict[str, Any]],
    conversation_id: str | None = None,
) -> dict:
    """Add proposed links from a proposal to existing objects. Links live
    inside the proposal and become real edges only when the user accepts
    it — they never appear as accepted relationships before that."""
    auth.require_scope("write")
    db = get_db()
    from app.repositories import proposal_repo

    existing = await proposal_repo.get_by_id(db, proposal_id)
    if existing is None:
        raise ValueError("OBJECT_NOT_FOUND: proposal does not exist")
    merged = list(existing.related_objects)
    seen = {(r.object_id, r.relationship_type) for r in merged}
    for ref in _parse_related(related_objects):
        if (ref.object_id, ref.relationship_type) not in seen:
            merged.append(ref)
    updated = await proposal_service.update(
        db,
        proposal_id,
        ProposalUpdate(
            related_objects=merged,
            change_summary="Linked objects via MCP",
            provenance=_client_provenance(conversation_id),
        ),
    )
    return updated.model_dump(mode="json")


@mcp_server.tool()
async def create_development_note(
    project_id: str,
    title: str,
    body: str,
    note_type: str | None = None,
    related_objects: list[dict[str, Any]] | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Capture a development note. It lands in the graph immediately as a
    clearly-marked speculative node (never accepted canon) linked to its
    related objects. related_objects entries:
    {object_id, relationship_type?} (default ELABORATES)."""
    auth.require_scope("write")
    related = [
        (r["object_id"], r.get("relationship_type", "ELABORATES"))
        for r in (related_objects or [])
    ]
    node = await note_service.create_development_note(
        get_db(),
        get_embedding_provider(),
        project_hub_id=project_id,
        title=title,
        body=body,
        note_type=note_type,
        related_objects=related,
        provenance=_client_provenance(conversation_id),
    )
    return node.model_dump(mode="json")


@mcp_server.tool()
async def record_story_decision(
    project_id: str,
    statement: str,
    rationale: str | None = None,
    implications: str | None = None,
    supersedes_decision_id: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Record an accepted in-project decision. USE ONLY when the user has
    explicitly approved the decision in your conversation — never infer
    approval because a statement sounds decisive. Requires the `decisions`
    scope, which the user grants per client deliberately."""
    auth.require_scope("decisions")
    db = get_db()
    if not await project_repo.is_project_hub(db, project_id):
        raise ValueError("PROJECT_NOT_FOUND: not a project hub")
    provenance = await provenance_repo.create(db, _client_provenance(conversation_id))
    decision = await decision_repo.create(
        db,
        DecisionCreate(
            project_hub_id=project_id,
            statement=statement,
            rationale=rationale,
            implications=implications,
            supersedes_decision_id=supersedes_decision_id,
            provenance=_client_provenance(conversation_id),
        ),
        provenance.id,
    )
    await activity_service.emit(
        db,
        event_type="decision.recorded",
        object_type="decision",
        object_id=decision.id,
        summary=f"Decision recorded via MCP: {statement[:120]}",
        project_hub_id=project_id,
        provenance_id=provenance.id,
    )
    return decision.model_dump(mode="json")
