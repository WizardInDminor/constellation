"""Proposal lifecycle routes (Phase C1, ADR-084).

- POST  /proposals                      → create (201)
- GET   /proposals                      → list summaries (inbox)
- GET   /proposals/{id}                 → detail (payload, provenance, revisions)
- PATCH /proposals/{id}                 → edit mutable content (appends a revision)
- POST  /proposals/{id}/transition      → lifecycle transition; accept materializes
- GET   /proposals/{id}/revisions       → revision history

Errors use the structured envelope from `core/errors.py`; the handler is
registered in main.py.
"""

from fastapi import APIRouter, Query

from app.core.deps import DB, EmbedProvider
from app.core.errors import ObjectNotFound
from app.models.proposal import (
    AcceptResult,
    ProposalCreate,
    ProposalDetail,
    ProposalRevision,
    ProposalStatus,
    ProposalSummary,
    ProposalTransitionRequest,
    ProposalUpdate,
)
from app.repositories import proposal_repo
from app.services import proposal_service

router = APIRouter(prefix="/proposals", tags=["proposals"])


@router.post("", status_code=201)
async def create_proposal(data: ProposalCreate, db: DB) -> ProposalDetail:
    """Create a proposal. AI-created material lands here with status
    'proposed' — never directly in accepted truth (direction pack ADR-002)."""
    return await proposal_service.create(db, data)


@router.get("")
async def list_proposals(
    db: DB,
    project_hub_id: str | None = None,
    status: list[ProposalStatus] | None = Query(default=None),
    proposal_type: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ProposalSummary]:
    return await proposal_repo.list_proposals(
        db,
        project_hub_id=project_hub_id,
        statuses=status,
        proposal_type=proposal_type,
        limit=limit,
    )


@router.get("/{proposal_id}")
async def get_proposal(proposal_id: str, db: DB) -> ProposalDetail:
    proposal = await proposal_repo.get_by_id(db, proposal_id)
    if proposal is None:
        raise ObjectNotFound("Proposal not found", details={"object_type": "proposal"})
    return proposal


@router.patch("/{proposal_id}")
async def update_proposal(proposal_id: str, data: ProposalUpdate, db: DB) -> ProposalDetail:
    """Edit mutable content while unresolved. Every applied edit appends a
    revision, so the original and each edited version stay queryable
    (AT-032)."""
    return await proposal_service.update(db, proposal_id, data)


@router.post("/{proposal_id}/transition")
async def transition_proposal(
    proposal_id: str, data: ProposalTransitionRequest, db: DB, embed: EmbedProvider
) -> AcceptResult:
    """Apply one lifecycle transition (submit, accept, reject, supersede,
    archive). Acceptance is the only path that materializes proposal content
    into accepted truth."""
    return await proposal_service.transition(db, proposal_id, data, embed)


@router.get("/{proposal_id}/revisions")
async def list_revisions(proposal_id: str, db: DB) -> list[ProposalRevision]:
    proposal = await proposal_repo.get_by_id(db, proposal_id)
    if proposal is None:
        raise ObjectNotFound("Proposal not found", details={"object_type": "proposal"})
    return proposal.revisions
