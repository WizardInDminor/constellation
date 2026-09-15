"""Activity event emission + recent-changes retrieval (Phase C1, ADR-085).

`emit` is the single entry point for recording a meaningful change. Write
paths call it after their own persistence succeeds; the event insert is a
separate commit (mirroring the house pattern of sequential repo commits in
composite operations — see ADR-035b precedent), so a crash between the write
and the event loses the event, not the write.
"""

from typing import Any

import aiosqlite

from app.models.activity import ActivityEvent, RecentChangesResponse
from app.models.provenance import ProvenanceCreate
from app.repositories import activity_repo, provenance_repo


async def emit(
    db: aiosqlite.Connection,
    *,
    event_type: str,
    object_type: str,
    object_id: str,
    summary: str,
    project_hub_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    provenance_id: str | None = None,
    provenance: ProvenanceCreate | None = None,
) -> int:
    """Append one event. Pass either an existing `provenance_id` or a
    `ProvenanceCreate` to record inline (or neither, for legacy paths)."""
    if provenance_id is None and provenance is not None:
        provenance_id = (await provenance_repo.create(db, provenance)).id
    return await activity_repo.append(
        db,
        event_type=event_type,
        object_type=object_type,
        object_id=object_id,
        summary=summary,
        project_hub_id=project_hub_id,
        metadata=metadata,
        provenance_id=provenance_id,
    )


async def recent_changes(
    db: aiosqlite.Connection,
    *,
    after: int = 0,
    project_hub_id: str | None = None,
    object_types: list[str] | None = None,
    limit: int = 50,
) -> RecentChangesResponse:
    """Cursor-paged slice of the event log (direction pack
    `get_recent_changes`). `after=0` starts from the beginning."""
    events = await activity_repo.list_after(
        db,
        after=after,
        project_hub_id=project_hub_id,
        object_types=object_types,
        limit=limit,
    )
    next_cursor = events[-1].id if events else None
    return RecentChangesResponse(events=events, next_cursor=next_cursor)


async def recent_feed(
    db: aiosqlite.Connection,
    *,
    project_hub_id: str | None = None,
    limit: int = 50,
) -> list[ActivityEvent]:
    return await activity_repo.list_recent(db, project_hub_id=project_hub_id, limit=limit)
