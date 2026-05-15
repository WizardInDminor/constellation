from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.node import NodeRef

EdgeType = Literal[
    # Author-stance verbs — the original vocabulary.
    "SUPPORTS",
    "CONTRADICTS",
    "ELABORATES",
    "ANALOGOUS_TO",
    "QUESTIONS",
    "INSPIRED_BY",
    # Structural verbs.
    "COLLECTS",
    "CITES",
    # Literature-stance verbs (ADR-052).
    "BUILDS_ON",
    "APPLIES_TO",
    "MEASURES",
    "EXTENDS",
    "REFINES",
]


class EdgeSummary(BaseModel):
    """An edge as seen from a specific node's detail view."""

    id: str
    type: EdgeType
    note: str | None = None
    created_at: datetime
    neighbor: NodeRef


class EdgeDetail(BaseModel):
    id: str
    from_id: str
    to_id: str
    type: EdgeType
    note: str | None = None
    created_at: datetime


class EdgeCreate(BaseModel):
    from_id: str
    to_id: str
    type: EdgeType
    note: str | None = None


class NeighborResult(BaseModel):
    node: NodeRef
    edge_id: str
    edge_type: EdgeType
    edge_note: str | None = None
    direction: Literal["outgoing", "incoming"]
