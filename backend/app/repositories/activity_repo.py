"""Append-only activity event log (Phase C1, ADR-085). Persistence only.

The integer primary key is the pagination cursor: `list_after(cursor)` is a
single indexed comparison. Events are never updated or deleted.
"""

import json
from datetime import UTC, datetime
from typing import Any

import aiosqlite

from app.models.activity import ActivityEvent
from app.repositories import provenance_repo


async def append(
    db: aiosqlite.Connection,
    *,
    event_type: str,
    object_type: str,
    object_id: str,
    summary: str,
    project_hub_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    provenance_id: str | None = None,
) -> int:
    """Insert one event; returns its id (the cursor value)."""
    cursor = await db.execute(
        """INSERT INTO activity_events(project_hub_id, event_type, object_type, object_id,
                                       summary, metadata, provenance_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            project_hub_id,
            event_type,
            object_type,
            object_id,
            summary,
            json.dumps(metadata) if metadata is not None else None,
            provenance_id,
            datetime.now(UTC).isoformat(),
        ),
    )
    await db.commit()
    assert cursor.lastrowid is not None
    return cursor.lastrowid


async def _hydrate(db: aiosqlite.Connection, row: aiosqlite.Row) -> ActivityEvent:
    provenance = None
    if row["provenance_id"] is not None:
        provenance = await provenance_repo.get_by_id(db, row["provenance_id"])
    return ActivityEvent(
        id=row["id"],
        project_hub_id=row["project_hub_id"],
        event_type=row["event_type"],
        object_type=row["object_type"],
        object_id=row["object_id"],
        summary=row["summary"],
        metadata=json.loads(row["metadata"]) if row["metadata"] is not None else None,
        provenance=provenance,
        created_at=row["created_at"],
    )


async def list_after(
    db: aiosqlite.Connection,
    *,
    after: int = 0,
    project_hub_id: str | None = None,
    object_types: list[str] | None = None,
    limit: int = 50,
) -> list[ActivityEvent]:
    where = ["id > ?"]
    params: list[Any] = [after]
    if project_hub_id is not None:
        where.append("project_hub_id = ?")
        params.append(project_hub_id)
    if object_types:
        where.append(f"object_type IN ({','.join('?' * len(object_types))})")
        params.extend(object_types)
    cursor = await db.execute(
        f"""SELECT * FROM activity_events
            WHERE {' AND '.join(where)}
            ORDER BY id
            LIMIT ?""",
        (*params, limit),
    )
    rows = await cursor.fetchall()
    return [await _hydrate(db, row) for row in rows]


async def list_recent(
    db: aiosqlite.Connection,
    *,
    project_hub_id: str | None = None,
    limit: int = 50,
) -> list[ActivityEvent]:
    """Newest-first slice for feed displays."""
    where: list[str] = []
    params: list[Any] = []
    if project_hub_id is not None:
        where.append("project_hub_id = ?")
        params.append(project_hub_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    cursor = await db.execute(
        f"SELECT * FROM activity_events {where_sql} ORDER BY id DESC LIMIT ?",
        (*params, limit),
    )
    rows = await cursor.fetchall()
    return [await _hydrate(db, row) for row in rows]
