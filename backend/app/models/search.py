from pydantic import BaseModel, Field

from app.models.node import NodeSummary


class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=20, ge=1, le=100)


class SearchResult(BaseModel):
    node: NodeSummary
    score: float  # 0–1 rank-normalized; higher is more relevant


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str


# ---------------------------------------------------------------------------
# Dedup search — ADR-062 (Phase 8.5)
# ---------------------------------------------------------------------------
# Distinct from /search/semantic in two ways:
# (1) `similarity` is the raw clamped-cosine projection of the underlying L2
#     distance, NOT a rank-normalized score. The caller can compare it
#     against an absolute threshold (e.g. ≥0.75 "looks like a duplicate").
# (2) Result ordering is by similarity descending — the rank carries less
#     meaning than the absolute value.
#
# Used by the capture-modal "compare to corpus" panel to surface potential
# duplicates and related notes before commit.


class DedupRequest(BaseModel):
    query: str
    limit: int = Field(default=8, ge=1, le=50)


class DedupResult(BaseModel):
    node: NodeSummary
    similarity: float  # 0–1 clamped cosine, raw absolute value


class DedupResponse(BaseModel):
    results: list[DedupResult]
    query: str
