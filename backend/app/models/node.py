from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from app.models.tag import TagRef

if TYPE_CHECKING:
    from app.models.edge import EdgeSummary

NodeType = Literal["fleeting", "literature", "permanent", "structure"]

# Canon readiness (ADR-073): uncertainty / canon-status vocabularies. These
# specialise a node's epistemic state without adding node types (ADR-006 kept).
CanonStatus = Literal["canon", "provisional", "speculative", "discarded", "image_only"]
NodeStatus = Literal["emerging", "stable", "contradicted", "retired", "unresolved"]
Charge = Literal["low", "medium", "high", "goosebump"]


class NodeRef(BaseModel):
    id: str
    title: str
    type: NodeType


class NodeSummary(BaseModel):
    id: str
    type: NodeType
    title: str
    summary: str | None = None
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = None
    # Slice 4 (ADR-064): surfaced for the Notes "hide story events" filter
    # and for the workspace's narrative-mode lists.
    is_story_event: bool = False
    # Canon uncertainty metadata (ADR-073). Surfaced on summaries so list views
    # and the Canon saved-views can badge/filter without a detail fetch.
    canon_status: CanonStatus | None = None
    node_status: NodeStatus | None = None
    charge: Charge | None = None
    do_not_name_yet: bool = False
    confidence: int | None = None
    tags: list[TagRef] = []


class NodeDetail(BaseModel):
    id: str
    type: NodeType
    title: str
    content: str
    summary: str | None = None
    source_id: str | None = None
    embedding_model: str | None = None
    processed_at: datetime | None = None
    # Slice 4 (ADR-064, ADR-071): event-specific fields. Nullable for non-event
    # nodes; populated only when is_story_event = True.
    is_story_event: bool = False
    story_time: str | None = None
    prose_status: str | None = None
    manuscript_location: str | None = None
    # Canon uncertainty metadata (ADR-073).
    canon_status: CanonStatus | None = None
    node_status: NodeStatus | None = None
    charge: Charge | None = None
    do_not_name_yet: bool = False
    confidence: int | None = None
    created_at: datetime
    updated_at: datetime
    outgoing_edges: list[EdgeSummary] = []
    incoming_edges: list[EdgeSummary] = []
    tags: list[TagRef] = []


class CanonFields(BaseModel):
    """Mixin of optional Canon uncertainty metadata (ADR-073).

    All optional so research capture is unaffected. Attaching these at create
    time lets an import set charge / canon_status / do_not_name_yet in one shot
    rather than a create-then-patch round trip.
    """

    canon_status: CanonStatus | None = None
    node_status: NodeStatus | None = None
    charge: Charge | None = None
    do_not_name_yet: bool = False
    confidence: int | None = Field(default=None, ge=0, le=100)


class FleetingCreate(BaseModel):
    title: str
    content: str
    tag_ids: list[str] = []


class PermanentCreate(CanonFields):
    title: str
    content: str
    summary: str | None = None
    tag_ids: list[str] = []


class LiteratureCreate(CanonFields):
    title: str
    content: str
    source_id: str
    summary: str | None = None
    tag_ids: list[str] = []


class StructureCreate(CanonFields):
    title: str
    content: str
    summary: str | None = None
    tag_ids: list[str] = []


class NodeUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    summary: str | None = None
    source_id: str | None = None
    tag_ids: list[str] | None = None
    # Slice 5: event-specific field writes (closes Slice 4 deferral).
    # These are pass-throughs to the same columns added in Slice 4
    # (ADR-064 / ADR-071). The route only writes them when they appear in
    # the request's model_fields_set, so omitting them leaves the value as
    # is. Sending null explicitly clears the column.
    story_time: str | None = None
    prose_status: str | None = None
    manuscript_location: str | None = None
    # Canon uncertainty metadata (ADR-073). Same model_fields_set convention:
    # omit to leave unchanged, send null to clear.
    canon_status: CanonStatus | None = None
    node_status: NodeStatus | None = None
    charge: Charge | None = None
    do_not_name_yet: bool | None = None
    confidence: int | None = Field(default=None, ge=0, le=100)
