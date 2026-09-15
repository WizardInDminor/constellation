"""In-project decisions (Phase C1, ADR-084). Persistence only."""

import uuid
from datetime import UTC, datetime
from typing import Any

import aiosqlite

from app.models.decision import DecisionCreate, DecisionRecord, DecisionStatus
from app.repositories import provenance_repo


def _now() -> str:
    return datetime.now(UTC).isoformat()


async def _hydrate(db: aiosqlite.Connection, row: aiosqlite.Row) -> DecisionRecord:
    provenance = await provenance_repo.get_by_id(db, row["provenance_id"])
    return DecisionRecord(
        id=row["id"],
        project_hub_id=row["project_hub_id"],
        statement=row["statement"],
        decision_type=row["decision_type"],
        rationale=row["rationale"],
        implications=row["implications"],
        status=row["status"],
        supersedes_decision_id=row["supersedes_decision_id"],
        superseded_by_decision_id=row["superseded_by_decision_id"],
        proposal_id=row["proposal_id"],
        provenance=provenance,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


_SELECT = """
    SELECT d.*,
           (SELECT s.id FROM decisions s WHERE s.supersedes_decision_id = d.id
            ORDER BY s.created_at DESC LIMIT 1) AS superseded_by_decision_id
    FROM decisions d
"""


async def create(
    db: aiosqlite.Connection, data: DecisionCreate, provenance_id: str
) -> DecisionRecord:
    """Insert the decision and, if it supersedes another, flip the old row to
    'superseded' in the same commit (AT-005)."""
    decision_id = str(uuid.uuid4())
    now = _now()
    await db.execute(
        """INSERT INTO decisions(id, project_hub_id, decision_type, statement, rationale,
                                 implications, status, supersedes_decision_id, proposal_id,
                                 provenance_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)""",
        (
            decision_id,
            data.project_hub_id,
            data.decision_type,
            data.statement,
            data.rationale,
            data.implications,
            data.supersedes_decision_id,
            data.proposal_id,
            provenance_id,
            now,
            now,
        ),
    )
    if data.supersedes_decision_id is not None:
        await db.execute(
            "UPDATE decisions SET status = 'superseded', updated_at = ? WHERE id = ?",
            (now, data.supersedes_decision_id),
        )
    await db.commit()
    record = await get_by_id(db, decision_id)
    assert record is not None
    return record


async def get_by_id(db: aiosqlite.Connection, decision_id: str) -> DecisionRecord | None:
    cursor = await db.execute(f"{_SELECT} WHERE d.id = ?", (decision_id,))
    row = await cursor.fetchone()
    return await _hydrate(db, row) if row is not None else None


async def list_decisions(
    db: aiosqlite.Connection,
    *,
    project_hub_id: str | None = None,
    statuses: list[DecisionStatus] | None = None,
    limit: int = 100,
) -> list[DecisionRecord]:
    where: list[str] = []
    params: list[Any] = []
    if project_hub_id is not None:
        where.append("d.project_hub_id = ?")
        params.append(project_hub_id)
    if statuses:
        where.append(f"d.status IN ({','.join('?' * len(statuses))})")
        params.extend(statuses)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    cursor = await db.execute(
        f"{_SELECT} {where_sql} ORDER BY d.created_at DESC LIMIT ?",
        (*params, limit),
    )
    rows = await cursor.fetchall()
    return [await _hydrate(db, row) for row in rows]
