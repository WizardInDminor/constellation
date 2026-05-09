from __future__ import annotations

from pydantic import BaseModel

from app.models.edge import EdgeType
from app.models.node import NodeType


class GraphNodeRef(BaseModel):
    id: str
    title: str
    type: NodeType
    tags: list[str]


class GraphEdgeRef(BaseModel):
    id: str
    from_id: str
    to_id: str
    type: EdgeType
    note: str | None = None


class GraphData(BaseModel):
    nodes: list[GraphNodeRef]
    edges: list[GraphEdgeRef]
