"""Proposal lifecycle contracts (Track C Phase C1, ADR-084).

A proposal is a suggested change or new object awaiting explicit human
resolution. AI-created story material defaults here (direction pack ADR-002);
acceptance is the only path from proposal to accepted truth, and it is never
available to AI clients directly.

The status machine is fixed by the direction pack
(docs/direction/06_WORKFLOW_AND_STATE_MODEL.md); `ALLOWED_TRANSITIONS` is the
single source of truth the service layer enforces.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.edge import EdgeType
from app.models.provenance import ProvenanceCreate, ProvenanceRecord

ProposalStatus = Literal[
    "captured",
    "proposed",
    "under_review",
    "accepted",
    "rejected",
    "superseded",
    "archived",
]

# Type vocabulary is model-enforced, not schema-enforced (ADR-084): it is
# expected to grow, and the edges table taught us what CHECK growth costs.
ProposalType = Literal[
    "scene",
    "character",
    "theme",
    "location",
    "world_rule",
    "development_note",
    "edge",
    "general",
]

# The direction pack's allowed transitions, verbatim. Anything not listed is
# an INVALID_STATUS_TRANSITION. Notably absent: rejected -> accepted (a
# rejected idea returns via a new proposal or revision) and archived ->
# anything (archived is terminal but stays queryable).
ALLOWED_TRANSITIONS: frozenset[tuple[ProposalStatus, ProposalStatus]] = frozenset(
    {
        ("captured", "proposed"),
        ("captured", "archived"),
        ("proposed", "under_review"),
        ("proposed", "rejected"),
        ("proposed", "superseded"),
        ("under_review", "accepted"),
        ("under_review", "rejected"),
        ("under_review", "superseded"),
        ("accepted", "superseded"),
        ("rejected", "archived"),
        ("superseded", "archived"),
    }
)


class RelatedObjectRef(BaseModel):
    """A proposed link from the proposal's subject to an existing node.

    Proposed links live inside the proposal payload and are materialized as
    real edges only on acceptance (ADR-084) — `edges` stays accepted truth,
    satisfying direction pack AT-002.
    """

    object_id: str  # existing node id
    relationship_type: EdgeType
    direction: Literal["outgoing", "incoming"] = "outgoing"  # relative to the accepted node
    note: str | None = None


class ProposalCreate(BaseModel):
    project_hub_id: str
    proposal_type: ProposalType
    title: str = Field(min_length=1)
    summary: str | None = None
    # Type-specific substance. Recognized keys at acceptance time (v1):
    # 'title', 'content', 'summary' (all node-producing types);
    # 'story_time', 'prose_status' (scene); 'from_id', 'to_id', 'type',
    # 'note' (edge proposals).
    payload: dict[str, Any] | None = None
    related_objects: list[RelatedObjectRef] = Field(default_factory=list)
    provenance: ProvenanceCreate
    status: Literal["captured", "proposed"] = "proposed"


class ProposalUpdate(BaseModel):
    """Edit of mutable content. Every applied edit appends a revision."""

    title: str | None = None
    summary: str | None = None
    payload: dict[str, Any] | None = None
    related_objects: list[RelatedObjectRef] | None = None
    change_summary: str | None = None
    provenance: ProvenanceCreate | None = None  # defaults to UI provenance


class ProposalTransitionRequest(BaseModel):
    to_status: ProposalStatus
    resolution_note: str | None = None
    superseded_by_proposal_id: str | None = None
    provenance: ProvenanceCreate | None = None  # defaults to UI provenance


class ProposalRevision(BaseModel):
    id: str
    proposal_id: str
    revision_number: int
    title: str
    summary: str | None = None
    payload: dict[str, Any] | None = None
    related_objects: list[RelatedObjectRef] = Field(default_factory=list)
    change_summary: str | None = None
    provenance: ProvenanceRecord | None = None
    created_at: datetime


class ProposalSummary(BaseModel):
    id: str
    project_hub_id: str
    proposal_type: ProposalType
    title: str
    summary: str | None = None
    status: ProposalStatus
    source_client_name: str | None = None  # denormalized for the inbox
    source_actor_type: str | None = None
    related_count: int = 0
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class ProposalDetail(ProposalSummary):
    payload: dict[str, Any] | None = None
    related_objects: list[RelatedObjectRef] = Field(default_factory=list)
    source_provenance: ProvenanceRecord
    resolution_provenance: ProvenanceRecord | None = None
    resolution_note: str | None = None
    accepted_node_id: str | None = None
    superseded_by_proposal_id: str | None = None
    revisions: list[ProposalRevision] = Field(default_factory=list)


class AcceptResult(BaseModel):
    """What acceptance materialized (direction pack AT-003)."""

    proposal: ProposalDetail
    created_node_id: str | None = None
    created_edge_ids: list[str] = Field(default_factory=list)
