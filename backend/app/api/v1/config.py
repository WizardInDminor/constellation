from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.deps import DB
from app.models import ConfigEntry, ConfigUpdate
from app.repositories import config_repo

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
async def get_embedding_jobs(db: DB) -> list[dict]:
    cursor = await db.execute(
        """SELECT id, node_id, status, target_model, error, created_at, completed_at
           FROM embedding_jobs
           ORDER BY created_at DESC
           LIMIT 100"""
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
