from app.models.common import Paginated
from app.models.graph import GraphData, GraphEdgeRef, GraphNodeRef
from app.models.search import SearchRequest, SearchResponse, SearchResult
from app.models.rag import (
    EdgeTraversed,
    LinkSuggestion,
    NodeUsed,
    PermanentCandidate,
    RagRequest,
    RagResponse,
    SuggestLinksResponse,
    SuggestPermanentResponse,
)
from app.models.config import ConfigEntry, ConfigUpdate
from app.models.tag import TagCreate, TagRef, TagUpdate
from app.models.node import (
    FleetingCreate,
    LiteratureCreate,
    NodeDetail,
    NodeRef,
    NodeSummary,
    NodeType,
    NodeUpdate,
    PermanentCreate,
    StructureCreate,
)
from app.models.edge import (
    EdgeCreate,
    EdgeDetail,
    EdgeSummary,
    EdgeType,
    NeighborResult,
)
from app.models.source import (
    SourceCreate,
    SourceDetail,
    SourceRef,
    SourceSummary,
    SourceType,
    SourceUpdate,
)

# EdgeSummary is imported under TYPE_CHECKING in node.py to break the mutual
# dependency at runtime. Now that both modules are loaded, resolve it.
NodeDetail.model_rebuild()

__all__ = [
    "Paginated",
    "ConfigEntry",
    "ConfigUpdate",
    "TagCreate",
    "TagRef",
    "TagUpdate",
    "FleetingCreate",
    "LiteratureCreate",
    "NodeDetail",
    "NodeRef",
    "NodeSummary",
    "NodeType",
    "NodeUpdate",
    "PermanentCreate",
    "StructureCreate",
    "EdgeCreate",
    "EdgeDetail",
    "EdgeSummary",
    "EdgeType",
    "NeighborResult",
    "SourceCreate",
    "SourceDetail",
    "SourceRef",
    "SourceSummary",
    "SourceType",
    "SourceUpdate",
    "PermanentCandidate",
    "SuggestPermanentResponse",
    "LinkSuggestion",
    "SuggestLinksResponse",
    "RagRequest",
    "RagResponse",
    "NodeUsed",
    "EdgeTraversed",
    "SearchRequest",
    "SearchResponse",
    "SearchResult",
    "GraphData",
    "GraphEdgeRef",
    "GraphNodeRef",
]
