from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

GraphNodeType = Literal["fleeting", "literature", "permanent", "structure", "source"]
# Mirror of EdgeType (app.models.edge) plus no separate semantics. Drifted
# during ADR-052 and again during ADR-060; brought up to date in Phase 8.3.
GraphEdgeType = Literal[
    "SUPPORTS",
    "CONTRADICTS",
    "ELABORATES",
    "ANALOGOUS_TO",
    "QUESTIONS",
    "INSPIRED_BY",
    "COLLECTS",
    "CITES",
    "BUILDS_ON",
    "APPLIES_TO",
    "MEASURES",
    "EXTENDS",
    "REFINES",
    "SUPERSEDED_BY",
    "SCOPED_TO",
    "REGIME_OF",
    "FOLLOWS_FROM",
]


class GraphNodeRef(BaseModel):
    id: str
    title: str
    type: GraphNodeType
    tags: list[str]
    source_url: str | None = None
    source_author: str | None = None
    source_entry_type: str | None = None


class GraphEdgeRef(BaseModel):
    id: str
    from_id: str
    to_id: str
    type: GraphEdgeType
    note: str | None = None
    classifier_rationale: str | None = None
    resolved_at: str | None = None
    resolved_by_node_id: str | None = None


class GraphData(BaseModel):
    nodes: list[GraphNodeRef]
    edges: list[GraphEdgeRef]
