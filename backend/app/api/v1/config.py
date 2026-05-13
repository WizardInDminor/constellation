from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import get_settings
from app.core.deps import DB
from app.models import (
    ConfigEntry,
    ConfigUpdate,
    EmbeddingJob,
    EmbeddingJobList,
    EmbeddingJobStatus,
    RetryAllResponse,
)
from app.repositories import config_repo, embedding_job_repo

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
async def get_config(db: DB) -> list[ConfigEntry]:
    return await config_repo.get_all(db)


@router.patch("")
async def update_config(data: ConfigUpdate, db: DB, request: Request) -> list[ConfigEntry]:
    from app.core.lifespan import _load_providers
    from app.services import embedding_service

    settings = get_settings()

    # Snapshot the current embedding model before applying updates
    current = await config_repo.get(db, "embedding_model")
    old_embed_model = current.value if current else None

    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is not None:
            await config_repo.set(db, field, value)

    if data.model_fields_set:
        new_embed, new_gen = await _load_providers(db, settings)
        request.app.state.embedding_provider = new_embed
        request.app.state.generation_provider = new_gen

        new_entry = await config_repo.get(db, "embedding_model")
        new_embed_model = new_entry.value if new_entry else None
        if new_embed_model and new_embed_model != old_embed_model:
            await embedding_service.queue_reembed_all(db, new_embed_model)

    return await config_repo.get_all(db)


@router.get("/embedding-jobs")
async def get_embedding_jobs(
    db: DB,
    status: EmbeddingJobStatus | None = Query(None),
) -> EmbeddingJobList:
    items = await embedding_job_repo.list_jobs(db, status=status, limit=100)
    counts = await embedding_job_repo.get_counts(db)
    return EmbeddingJobList(items=items, counts=counts)


@router.post("/embedding-jobs/{job_id}/retry")
async def retry_embedding_job(job_id: str, db: DB) -> EmbeddingJob:
    updated = await embedding_job_repo.retry_job(db, job_id)
    if updated is not None:
        return updated
    existing = await embedding_job_repo.get_by_id(db, job_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    raise HTTPException(
        status_code=409,
        detail=f"Job is in status {existing.status!r}; only failed jobs can be retried",
    )


@router.post("/embedding-jobs/retry-all-failed")
async def retry_all_failed_embedding_jobs(db: DB) -> RetryAllResponse:
    n = await embedding_job_repo.retry_all_failed(db)
    return RetryAllResponse(retried=n)
