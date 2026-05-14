import uuid
from datetime import datetime, timezone
from typing import Any

import aiosqlite

from app.models import NodeSummary, SourceCreate, SourceDetail, SourceSummary, SourceUpdate


async def _row_to_summary(row: aiosqlite.Row) -> SourceSummary:
    return SourceSummary(
        id=row["id"],
        title=row["title"],
        author=row["author"],
        type=row["type"],
        url=row["url"],
        published_at=row["published_at"],
        created_at=row["created_at"],
    )


async def get_by_id(db: aiosqlite.Connection, source_id: str) -> SourceDetail | None:
    cursor = await db.execute(
        "SELECT id, title, author, url, type, published_at, created_at FROM sources WHERE id = ?",
        (source_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE source_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC""",
        (source_id,),
    )
    note_rows = await cursor.fetchall()
    literature_notes = [
        NodeSummary(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            summary=r["summary"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            processed_at=r["processed_at"],
        )
        for r in note_rows
    ]

    return SourceDetail(
        id=row["id"],
        title=row["title"],
        author=row["author"],
        type=row["type"],
        url=row["url"],
        published_at=row["published_at"],
        created_at=row["created_at"],
        literature_notes=literature_notes,
    )


async def create(db: aiosqlite.Connection, data: SourceCreate) -> SourceDetail:
    source_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO sources(id, title, author, url, type, published_at, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (source_id, data.title, data.author, data.url, data.type, data.published_at, now),
    )
    await db.commit()
    result = await get_by_id(db, source_id)
    assert result is not None
    return result


async def list_sources(db: aiosqlite.Connection) -> list[SourceSummary]:
    cursor = await db.execute(
        "SELECT id, title, author, url, type, published_at, created_at FROM sources ORDER BY title"
    )
    rows = await cursor.fetchall()
    return [await _row_to_summary(r) for r in rows]


async def count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COUNT(*) AS n FROM sources")
    row = await cursor.fetchone()
    return row["n"] if row else 0


async def update(
    db: aiosqlite.Connection, source_id: str, data: SourceUpdate
) -> SourceDetail | None:
    updates: dict[str, Any] = {}
    for field in ("title", "author", "type", "url"):
        val = getattr(data, field)
        if val is not None:
            updates[field] = val
    if "published_at" in data.model_fields_set:
        updates["published_at"] = data.published_at

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE sources SET {set_clause} WHERE id = ?",  # noqa: S608
            [*updates.values(), source_id],
        )
        await db.commit()

    return await get_by_id(db, source_id)


async def delete(db: aiosqlite.Connection, source_id: str) -> tuple[bool, str]:
    """Returns (success, error_reason). error_reason is non-empty on constraint failure."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM nodes WHERE source_id = ? AND deleted_at IS NULL",
        (source_id,),
    )
    count = (await cursor.fetchone())[0]
    if count > 0:
        return False, f"Source has {count} linked literature note(s); unlink or delete them first"

    cursor = await db.execute("DELETE FROM sources WHERE id = ?", (source_id,))
    await db.commit()
    return cursor.rowcount > 0, ""
