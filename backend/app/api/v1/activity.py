from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.models import ActivityFeed
from app.models.activity import RecentChangesResponse
from app.repositories import edge_repo, node_repo
from app.services import activity_service

router = APIRouter(prefix="/activity", tags=["activity"])

_PER_SECTION_LIMIT = 10


@router.get("/changes")
async def get_recent_changes(
    db: DB,
    after: int = Query(default=0, ge=0, description="Event-id cursor; 0 = from start"),
    project_hub_id: str | None = None,
    object_types: list[str] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> RecentChangesResponse:
    """Cursor-paged slice of the append-only event log (Phase C1, ADR-085;
    direction pack `get_recent_changes`). Any client that stores the returned
    cursor sees every subsequent event exactly once (AT-024)."""
    return await activity_service.recent_changes(
        db,
        after=after,
        project_hub_id=project_hub_id,
        object_types=object_types,
        limit=limit,
    )


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
