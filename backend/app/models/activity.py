from datetime import datetime

from pydantic import BaseModel

from app.models.edge import EdgeType
from app.models.node import NodeRef, NodeSummary


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
