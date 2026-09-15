from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.edge import EdgeType
from app.models.node import NodeRef, NodeSummary
from app.models.provenance import ProvenanceRecord


class RecentEdge(BaseModel):
    """An edge plus enough metadata to render 'A → TYPE → B' without lookups."""

    id: str
    type: EdgeType
    created_at: datetime
    from_node: NodeRef
    to_node: NodeRef


class ActivityFeed(BaseModel):
    """Three windowed lists for the Home 'recent activity' sections.

    See ADR-054 for windowing semantics.
    """

    captured: list[NodeSummary]
    edited: list[NodeSummary]
    edges: list[RecentEdge]
    window_days: int


class ActivityEvent(BaseModel):
    """One row of the append-only project event log (Phase C1, ADR-085).

    `id` is a monotonically increasing integer and doubles as the pagination
    cursor for recent-changes queries.
    """

    id: int
    project_hub_id: str | None = None
    event_type: str  # 'proposal.created', 'edge.resolved', ...
    object_type: str  # 'proposal', 'node', 'edge', 'decision', ...
    object_id: str
    summary: str
    metadata: dict[str, Any] | None = None
    provenance: ProvenanceRecord | None = None
    created_at: datetime


class RecentChangesResponse(BaseModel):
    """Cursor-paged event slice (direction pack `get_recent_changes`).

    `next_cursor` is the id of the last event returned; pass it back as
    `after` to continue. None when the slice is empty.
    """

    events: list[ActivityEvent] = Field(default_factory=list)
    next_cursor: int | None = None
