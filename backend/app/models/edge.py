from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.node import NodeRef
from app.models.tag import TagRef

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
    # Narrative (ADR-052 Slice 4 addendum). Lore → character/location/event.
    "EXPLAINS",
    # Canon symbolic / resonance verbs (ADR-077). Narrative/worldbuilding
    # projects extend the vocabulary where typed filtering is valuable; nuance
    # still lives in the edge note.
    "HOLDS_OPEN",
    "REFUSES_TO_NAME",
    "CARRIES_CHARGE_FOR",
    "FORESHADOWS",
    "MIRRORS",
    "INVERSION_OF",
    "PROTOTYPE_OF",
    "AMPLIFIES",
    "CORRUPTS",
    "DESTABILIZES",
    "STABILIZES",
    "PROTECTS",
    "THREATENS",
]

# Edge types on which the "mark resolved" action is meaningful. ADR-059:
# resolution applies to tension-bearing relationships only. The schema is
# generic across all types so future re-scoping doesn't require another
# CHECK-constraint table-recreate; the restriction lives in the API layer.
RESOLVABLE_EDGE_TYPES: frozenset[str] = frozenset({"CONTRADICTS", "QUESTIONS"})


class EdgeSummary(BaseModel):
    """An edge as seen from a specific node's detail view.

    `neighbor_tags` and `neighbor_is_story_event` are denormalised onto the
    summary (ADR-084) so the frontend Relationship Explorer can group a node's
    connections by role — Characters, Symbols, Scenes, etc. for narrative
    projects; Sources, Structures, etc. generally — without an N+1 fetch per
    neighbor. They default empty/false so existing consumers are unaffected.
    """

    id: str
    type: EdgeType
    note: str | None = None
    classifier_rationale: str | None = None
    resolved_at: datetime | None = None
    resolved_by_node_id: str | None = None
    created_at: datetime
    neighbor: NodeRef
    neighbor_tags: list[TagRef] = []
    neighbor_is_story_event: bool = False


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


class EdgeUpdate(BaseModel):
    """Edit a relationship's note — the edge-note authoring loop (ADR-088).

    Generic: the note explains why a link exists / what the connection means,
    feeding EntityArc, ConnectionsByRole, and RAG edge context. `None` clears
    the note; omitting the field leaves it unchanged.
    """

    note: str | None = None


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
