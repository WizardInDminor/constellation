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
    # Evolution / D1 (ADR-060). RESOLVES intentionally absent — see ADR-059.
    "SUPERSEDED_BY",
    "SCOPED_TO",
    "REGIME_OF",
    "FOLLOWS_FROM",
]

# Edge types on which the "mark resolved" action is meaningful. ADR-059:
# resolution applies to tension-bearing relationships only. The schema is
# generic across all types so future re-scoping doesn't require another
# CHECK-constraint table-recreate; the restriction lives in the API layer.
RESOLVABLE_EDGE_TYPES: frozenset[str] = frozenset({"CONTRADICTS", "QUESTIONS"})


class EdgeSummary(BaseModel):
    """An edge as seen from a specific node's detail view."""

    id: str
    type: EdgeType
    note: str | None = None
    classifier_rationale: str | None = None
    resolved_at: datetime | None = None
    resolved_by_node_id: str | None = None
    created_at: datetime
    neighbor: NodeRef


class EdgeDetail(BaseModel):
    id: str
    from_id: str
    to_id: str
    type: EdgeType
    note: str | None = None
    classifier_rationale: str | None = None
    resolved_at: datetime | None = None
    resolved_by_node_id: str | None = None
    created_at: datetime


class EdgeCreate(BaseModel):
    from_id: str
    to_id: str
    type: EdgeType
    note: str | None = None
    classifier_rationale: str | None = None


class EdgeResolveRequest(BaseModel):
    """Mark a tension edge resolved (ADR-059).

    `resolved_by_node_id` is optional. When provided, it points to a synthesis
    note that supersedes the tension; when omitted, the edge is marked dormant
    without a specific resolving artifact.
    """

    resolved_by_node_id: str | None = None


class NeighborResult(BaseModel):
    node: NodeRef
    edge_id: str
    edge_type: EdgeType
    edge_note: str | None = None
    edge_classifier_rationale: str | None = None
    edge_resolved_at: datetime | None = None
    edge_resolved_by_node_id: str | None = None
    direction: Literal["outgoing", "incoming"]
