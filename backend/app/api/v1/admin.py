from fastapi import APIRouter, Request

from app.core.deps import DB
from app.models import AdminStatus
from app.repositories import embedding_job_repo

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/status")
async def get_status(db: DB, request: Request) -> AdminStatus:
    counts = await embedding_job_repo.get_counts(db)
    return AdminStatus(
        last_drain_at=getattr(request.app.state, "last_drain_at", None),
        drain_count=getattr(request.app.state, "drain_count", 0),
        pending_jobs=counts.pending,
        failed_jobs=counts.failed,
        cooldown_until=getattr(request.app.state, "cooldown_until", None),
    )
