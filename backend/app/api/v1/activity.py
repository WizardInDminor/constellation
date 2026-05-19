from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.models import ActivityFeed
from app.repositories import edge_repo, node_repo

router = APIRouter(prefix="/activity", tags=["activity"])

_PER_SECTION_LIMIT = 10


@router.get("")
async def get_activity(
    db: DB,
    days: int = Query(default=7, ge=1, le=90),
) -> ActivityFeed:
    """Recent captures, edits, and edge creations for the Home dashboard.

    See ADR-054 for windowing semantics.
    """
    since = datetime.now(UTC) - timedelta(days=days)
    since_iso = since.isoformat()

    captured = await node_repo.list_recently_captured(
        db, since_iso=since_iso, limit=_PER_SECTION_LIMIT
    )
    edited = await node_repo.list_recently_edited(db, since_iso=since_iso, limit=_PER_SECTION_LIMIT)
    edges = await edge_repo.list_recent(db, since_iso=since_iso, limit=_PER_SECTION_LIMIT)

    return ActivityFeed(
        captured=captured,
        edited=edited,
        edges=edges,
        window_days=days,
    )
