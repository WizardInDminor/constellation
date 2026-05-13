from datetime import datetime
from typing import Literal

from pydantic import BaseModel

EmbeddingJobStatus = Literal["pending", "processing", "complete", "failed"]


class EmbeddingJob(BaseModel):
    id: str
    node_id: str
    node_title: str
    status: EmbeddingJobStatus
    target_model: str
    error: str | None
    attempt_count: int
    created_at: datetime
    completed_at: datetime | None


class EmbeddingJobCounts(BaseModel):
    pending: int = 0
    processing: int = 0
    complete: int = 0
    failed: int = 0


class EmbeddingJobList(BaseModel):
    items: list[EmbeddingJob]
    counts: EmbeddingJobCounts


class RetryAllResponse(BaseModel):
    retried: int


class AdminStatus(BaseModel):
    last_drain_at: datetime | None
    drain_count: int
    pending_jobs: int
    failed_jobs: int
    cooldown_until: datetime | None = None
