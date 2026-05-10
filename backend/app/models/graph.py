from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

GraphNodeType = Literal["fleeting", "literature", "permanent", "structure", "source"]
GraphEdgeType = Literal[
    "SUPPORTS",
    "CONTRADICTS",
    "ELABORATES",
    "ANALOGOUS_TO",
    "QUESTIONS",
    "INSPIRED_BY",
    "COLLECTS",
    "CITES",
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


class GraphData(BaseModel):
    nodes: list[GraphNodeRef]
    edges: list[GraphEdgeRef]
