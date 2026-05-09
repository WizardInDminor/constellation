from pydantic import BaseModel, model_validator

from app.models.source import SourceType


class IngestSourceCreate(BaseModel):
    title: str
    type: SourceType
    author: str | None = None
    url: str | None = None


class IngestDocumentRequest(BaseModel):
    content: str
    source_id: str | None = None
    source: IngestSourceCreate | None = None

    @model_validator(mode="after")
    def _require_exactly_one_source(self) -> "IngestDocumentRequest":
        if (self.source_id is None) == (self.source is None):
            raise ValueError("Provide exactly one of source_id or source")
        return self


class LiteratureCandidate(BaseModel):
    title: str
    content: str
    summary: str


class ChunkResult(BaseModel):
    chunk_index: int
    heading: str | None
    candidates: list[LiteratureCandidate]
    error: str | None = None


class IngestDocumentResponse(BaseModel):
    source_id: str
    pending_ingest_id: str
    chunks_processed: int
    total_candidates: int
    chunks: list[ChunkResult]


class PendingIngestResponse(BaseModel):
    id: str
    source_id: str
    chunks: list[ChunkResult]
