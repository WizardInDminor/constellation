import json
import uuid
from datetime import datetime, timedelta, timezone

import aiosqlite

from app.models.ingest import ChunkResult, PendingIngestResponse

_TTL_DAYS = 7


async def expire_old(db: aiosqlite.Connection) -> None:
    await db.execute(
        "DELETE FROM pending_ingests WHERE expires_at < datetime('now')"
    )
    await db.commit()


async def upsert(
    db: aiosqlite.Connection,
    source_id: str,
    chunks: list[ChunkResult],
) -> str:
    """Write (or replace) the pending ingest record for *source_id*. Returns the record id."""
    await db.execute(
        "DELETE FROM pending_ingests WHERE source_id = ?",
        (source_id,),
    )
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=_TTL_DAYS)
    candidates_json = json.dumps([c.model_dump() for c in chunks])
    await db.execute(
        "INSERT INTO pending_ingests(id, source_id, candidates_json, created_at, expires_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            record_id,
            source_id,
            candidates_json,
            now.isoformat(),
            expires_at.isoformat(),
        ),
    )
    await db.commit()
    return record_id


async def get_by_source(
    db: aiosqlite.Connection, source_id: str
) -> PendingIngestResponse | None:
    cursor = await db.execute(
        "SELECT id, source_id, candidates_json FROM pending_ingests "
        "WHERE source_id = ? AND expires_at > datetime('now')",
        (source_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    chunks = [ChunkResult.model_validate(c) for c in json.loads(row["candidates_json"])]
    return PendingIngestResponse(id=row["id"], source_id=row["source_id"], chunks=chunks)


async def delete_by_source(db: aiosqlite.Connection, source_id: str) -> None:
    await db.execute(
        "DELETE FROM pending_ingests WHERE source_id = ?",
        (source_id,),
    )
    await db.commit()
