from typing import Literal

from pydantic import BaseModel, Field

from app.models.edge import EdgeType
from app.models.node import NodeRef, NodeType


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
# Cluster suggest-links — batch the per-node suggestion across a scope
# ---------------------------------------------------------------------------


class ClusterSuggestRequest(BaseModel):
    """Scope for batch suggest-links. Exactly one of node_ids or tag_id is required."""

    node_ids: list[str] | None = None
    tag_id: str | None = None


class ClusterLinkProposal(BaseModel):
    """A single proposed edge from the cluster suggestion run. Deduped per
    canonical (from, to) pair across all source perspectives — see B3."""

    from_node: NodeRef
    to_node: NodeRef
    edge_type: EdgeType
    rationale: str


class ClusterSuggestResponse(BaseModel):
    proposals: list[ClusterLinkProposal]
    scope_size: int


# ---------------------------------------------------------------------------
# RAG query
# ---------------------------------------------------------------------------


RagMode = Literal["default", "brief", "critic"]


class RagRequest(BaseModel):
    query: str
    depth: int = Field(default=1, ge=0, le=2)
    mode: RagMode | None = None


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


# ---------------------------------------------------------------------------
# Scoped RAG — answer a query using only a user-selected subset of notes
# ---------------------------------------------------------------------------


class ScopedRagRequest(BaseModel):
    query: str
    node_ids: list[str] = Field(min_length=1)
    custom_prompt: str | None = None


# ---------------------------------------------------------------------------
# Save-answer-as-note — persist a RAG answer as a permanent note
# ---------------------------------------------------------------------------


class SaveAnswerRequest(BaseModel):
    query: str
    answer: str
    provenance_ids: list[str] = []
    custom_prompt: str | None = None
    title: str | None = None  # if omitted, derived from query
