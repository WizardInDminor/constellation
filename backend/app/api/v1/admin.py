from datetime import datetime

from fastapi import APIRouter, Request

from app.core.deps import DB
from app.models import AdminStatus, CorpusStats
from app.repositories import edge_repo, embedding_job_repo, node_repo, source_repo, tag_repo

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


@router.get("/stats")
async def get_stats(db: DB) -> CorpusStats:
    """Corpus stats for the home dashboard. See ADR-048."""
    nodes_by_type = await node_repo.count_by_type(db)
    last_processed_raw = await node_repo.last_processed_at(db)
    last_processed = datetime.fromisoformat(last_processed_raw) if last_processed_raw else None
    return CorpusStats(
        nodes_by_type=nodes_by_type,
        edges=await edge_repo.count(db),
        sources=await source_repo.count(db),
        tags=await tag_repo.count(db),
        inbox=await node_repo.count_inbox(db),
        last_processed_at=last_processed,
    )
