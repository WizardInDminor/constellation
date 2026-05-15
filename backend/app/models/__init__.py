from app.models.activity import ActivityFeed, RecentEdge
from app.models.common import Paginated
from app.models.config import ConfigEntry, ConfigUpdate
from app.models.discover import BridgeCandidate, BridgeClassification, ClassifyBridgeRequest
from app.models.edge import (
    EdgeCreate,
    EdgeDetail,
    EdgeSummary,
    EdgeType,
    NeighborResult,
)
from app.models.embedding_job import (
    AdminStatus,
    EmbeddingJob,
    EmbeddingJobCounts,
    EmbeddingJobList,
    EmbeddingJobStatus,
    RetryAllResponse,
)
from app.models.graph import GraphData, GraphEdgeRef, GraphNodeRef
from app.models.ingest import (
    ChunkResult,
    IngestDocumentRequest,
    IngestDocumentResponse,
    IngestSourceCreate,
    LiteratureCandidate,
    PendingIngestResponse,
)
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
from app.models.rag import (
    EdgeTraversed,
    LinkSuggestion,
    NodeUsed,
    PermanentCandidate,
    RagRequest,
    RagResponse,
    SaveAnswerRequest,
    ScopedRagRequest,
    SuggestLinksResponse,
    SuggestPermanentResponse,
)
from app.models.search import SearchRequest, SearchResponse, SearchResult
from app.models.source import (
    SourceCreate,
    SourceDetail,
    SourceRef,
    SourceSummary,
    SourceType,
    SourceUpdate,
)
from app.models.stats import CorpusStats
from app.models.tag import TagCreate, TagRef, TagUpdate

# EdgeSummary is imported under TYPE_CHECKING in node.py to break the mutual
# dependency at runtime. Now that both modules are loaded, resolve it.
NodeDetail.model_rebuild()

__all__ = [
    "ActivityFeed",
    "RecentEdge",
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
    "ScopedRagRequest",
    "SaveAnswerRequest",
    "NodeUsed",
    "EdgeTraversed",
    "SearchRequest",
    "SearchResponse",
    "SearchResult",
    "GraphData",
    "GraphEdgeRef",
    "GraphNodeRef",
    "ChunkResult",
    "IngestDocumentRequest",
    "IngestDocumentResponse",
    "IngestSourceCreate",
    "LiteratureCandidate",
    "PendingIngestResponse",
    "BridgeCandidate",
    "BridgeClassification",
    "ClassifyBridgeRequest",
    "CorpusStats",
    "AdminStatus",
    "EmbeddingJob",
    "EmbeddingJobCounts",
    "EmbeddingJobList",
    "EmbeddingJobStatus",
    "RetryAllResponse",
]
