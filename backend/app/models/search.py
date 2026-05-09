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
