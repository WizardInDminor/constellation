from fastapi import APIRouter

from app.core.deps import DB
from app.models import ConfigEntry
from app.repositories import config_repo

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
async def get_config(db: DB) -> list[ConfigEntry]:
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
