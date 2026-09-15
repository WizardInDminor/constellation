"""Provenance records — write-once identity/origin rows (Phase C1, ADR-084)."""

import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models.provenance import ProvenanceCreate, ProvenanceRecord

_COLUMNS = (
    "id, actor_type, actor_id, client_type, client_name, source_session_id, "
    "source_conversation_id, source_message_reference, request_id, created_at"
)


def _record(row: aiosqlite.Row) -> ProvenanceRecord:
    return ProvenanceRecord(
        id=row["id"],
        actor_type=row["actor_type"],
        actor_id=row["actor_id"],
        client_type=row["client_type"],
        client_name=row["client_name"],
        source_session_id=row["source_session_id"],
        source_conversation_id=row["source_conversation_id"],
        source_message_reference=row["source_message_reference"],
        request_id=row["request_id"],
        created_at=row["created_at"],
    )


async def create(db: aiosqlite.Connection, data: ProvenanceCreate) -> ProvenanceRecord:
    record_id = str(uuid.uuid4())
    await db.execute(
        f"""INSERT INTO provenance_records({_COLUMNS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            record_id,
            data.actor_type,
            data.actor_id,
            data.client_type,
            data.client_name,
            data.source_session_id,
            data.source_conversation_id,
            data.source_message_reference,
            data.request_id,
            datetime.now(UTC).isoformat(),
        ),
    )
    await db.commit()
    record = await get_by_id(db, record_id)
    assert record is not None
    return record


async def get_by_id(db: aiosqlite.Connection, record_id: str) -> ProvenanceRecord | None:
    cursor = await db.execute(
        f"SELECT {_COLUMNS} FROM provenance_records WHERE id = ?", (record_id,)
    )
    row = await cursor.fetchone()
    return _record(row) if row is not None else None
