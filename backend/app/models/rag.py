from typing import Literal

from pydantic import BaseModel, Field

from app.models.edge import EdgeType
from app.models.node import NodeType


class PermanentCandidate(BaseModel):
    title: str
    content: str
    summary: str | None = None


class SuggestPermanentResponse(BaseModel):
    fleeting_id: str
    candidates: list[PermanentCandidate]


class LinkSuggestion(BaseModel):
    node_id: str
    node_title: str
    node_type: NodeType
    edge_type: EdgeType
    rationale: str


class SuggestLinksResponse(BaseModel):
    source_id: str
    suggestions: list[LinkSuggestion]


# ---------------------------------------------------------------------------
# RAG query
# ---------------------------------------------------------------------------


class RagRequest(BaseModel):
    query: str
    depth: int = Field(default=1, ge=0, le=2)


class NodeUsed(BaseModel):
    node_id: str
    title: str
    node_type: NodeType
    role: Literal["direct", "neighbor"]


class EdgeTraversed(BaseModel):
    edge_id: str
    from_id: str
    to_id: str
    edge_type: EdgeType
    note: str | None = None


class RagResponse(BaseModel):
    answer: str
    query: str
    provenance: list[NodeUsed]
    edges_traversed: list[EdgeTraversed]
