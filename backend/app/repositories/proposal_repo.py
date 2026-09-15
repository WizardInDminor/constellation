"""Proposal aggregate — proposals + revisions (Phase C1, ADR-084).

Persistence only. The status machine, acceptance materialization, and event
emission live in `services/proposal_service.py`; this module trusts its
callers to have validated transitions.
"""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import aiosqlite

from app.models.proposal import (
    ProposalCreate,
    ProposalDetail,
    ProposalRevision,
    ProposalStatus,
    ProposalSummary,
    RelatedObjectRef,
)
from app.repositories import provenance_repo


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _dump_payload(
    payload: dict[str, Any] | None, related_objects: list[RelatedObjectRef]
) -> str | None:
    """Payload and proposed links are stored together in the `payload` JSON
    column: {'data': {...}, 'related_objects': [...]}. Links are materialized
    as edges only on acceptance (ADR-084)."""
    if payload is None and not related_objects:
        return None
    return json.dumps(
        {
            "data": payload,
            "related_objects": [r.model_dump() for r in related_objects],
        }
    )


def _load_payload(raw: str | None) -> tuple[dict[str, Any] | None, list[RelatedObjectRef]]:
    if raw is None:
        return None, []
    parsed = json.loads(raw)
    related = [RelatedObjectRef(**r) for r in parsed.get("related_objects", [])]
    return parsed.get("data"), related


def _summary(row: aiosqlite.Row) -> ProposalSummary:
    return ProposalSummary(
        id=row["id"],
        project_hub_id=row["project_hub_id"],
        proposal_type=row["proposal_type"],
        title=row["title"],
        summary=row["summary"],
        status=row["status"],
        source_client_name=row["client_name"],
        source_actor_type=row["actor_type"],
        related_count=row["related_count"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        resolved_at=row["resolved_at"],
    )


async def create(
    db: aiosqlite.Connection, data: ProposalCreate, source_provenance_id: str
) -> ProposalDetail:
    proposal_id = str(uuid.uuid4())
    now = _now()
    await db.execute(
        """INSERT INTO proposals(id, project_hub_id, proposal_type, title, summary,
                                 payload, status, source_provenance_id,
                                 created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            proposal_id,
            data.project_hub_id,
            data.proposal_type,
            data.title,
            data.summary,
            _dump_payload(data.payload, data.related_objects),
            data.status,
            source_provenance_id,
            now,
            now,
        ),
    )
    await db.commit()
    detail = await get_by_id(db, proposal_id)
    assert detail is not None
    return detail


async def get_by_id(db: aiosqlite.Connection, proposal_id: str) -> ProposalDetail | None:
    cursor = await db.execute(
        """SELECT p.*, pr.client_name, pr.actor_type,
                  0 AS related_count
           FROM proposals p
           JOIN provenance_records pr ON pr.id = p.source_provenance_id
           WHERE p.id = ?""",
        (proposal_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    payload, related = _load_payload(row["payload"])
    source_provenance = await provenance_repo.get_by_id(db, row["source_provenance_id"])
    assert source_provenance is not None
    resolution_provenance = None
    if row["resolution_provenance_id"] is not None:
        resolution_provenance = await provenance_repo.get_by_id(
            db, row["resolution_provenance_id"]
        )

    summary = _summary(row)
    return ProposalDetail(
        **summary.model_dump()
        | {
            "related_count": len(related),
            "payload": payload,
            "related_objects": related,
            "source_provenance": source_provenance,
            "resolution_provenance": resolution_provenance,
            "resolution_note": row["resolution_note"],
            "accepted_node_id": row["accepted_node_id"],
            "superseded_by_proposal_id": row["superseded_by_proposal_id"],
            "revisions": await list_revisions(db, proposal_id),
        }
    )


async def list_proposals(
    db: aiosqlite.Connection,
    *,
    project_hub_id: str | None = None,
    statuses: list[ProposalStatus] | None = None,
    proposal_type: str | None = None,
    limit: int = 100,
) -> list[ProposalSummary]:
    where: list[str] = []
    params: list[Any] = []
    if project_hub_id is not None:
        where.append("p.project_hub_id = ?")
        params.append(project_hub_id)
    if statuses:
        where.append(f"p.status IN ({','.join('?' * len(statuses))})")
        params.extend(statuses)
    if proposal_type is not None:
        where.append("p.proposal_type = ?")
        params.append(proposal_type)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    cursor = await db.execute(
        f"""SELECT p.*, pr.client_name, pr.actor_type,
                   0 AS related_count
            FROM proposals p
            JOIN provenance_records pr ON pr.id = p.source_provenance_id
            {where_sql}
            ORDER BY p.created_at DESC
            LIMIT ?""",
        (*params, limit),
    )
    rows = await cursor.fetchall()
    summaries = []
    for row in rows:
        _, related = _load_payload(row["payload"])
        summary = _summary(row)
        summary.related_count = len(related)
        summaries.append(summary)
    return summaries


async def update_content(
    db: aiosqlite.Connection,
    proposal_id: str,
    *,
    title: str | None = None,
    summary: str | None = None,
    payload: dict[str, Any] | None = None,
    related_objects: list[RelatedObjectRef] | None = None,
) -> ProposalDetail | None:
    """Apply an edit in place. The service appends the revision row."""
    existing = await get_by_id(db, proposal_id)
    if existing is None:
        return None
    new_payload = payload if payload is not None else existing.payload
    new_related = related_objects if related_objects is not None else existing.related_objects
    await db.execute(
        """UPDATE proposals
           SET title = COALESCE(?, title), summary = COALESCE(?, summary),
               payload = ?, updated_at = ?
           WHERE id = ?""",
        (title, summary, _dump_payload(new_payload, new_related), _now(), proposal_id),
    )
    await db.commit()
    return await get_by_id(db, proposal_id)


async def set_status(
    db: aiosqlite.Connection,
    proposal_id: str,
    to_status: ProposalStatus,
    *,
    resolution_note: str | None = None,
    resolution_provenance_id: str | None = None,
    superseded_by_proposal_id: str | None = None,
    accepted_node_id: str | None = None,
) -> ProposalDetail | None:
    """Persist a status change the service has already validated."""
    resolved = to_status in ("accepted", "rejected", "superseded", "archived")
    await db.execute(
        """UPDATE proposals
           SET status = ?,
               resolution_note = COALESCE(?, resolution_note),
               resolution_provenance_id = COALESCE(?, resolution_provenance_id),
               superseded_by_proposal_id = COALESCE(?, superseded_by_proposal_id),
               accepted_node_id = COALESCE(?, accepted_node_id),
               resolved_at = CASE WHEN ? THEN ? ELSE resolved_at END,
               updated_at = ?
           WHERE id = ?""",
        (
            to_status,
            resolution_note,
            resolution_provenance_id,
            superseded_by_proposal_id,
            accepted_node_id,
            1 if resolved else 0,
            _now(),
            _now(),
            proposal_id,
        ),
    )
    await db.commit()
    return await get_by_id(db, proposal_id)


# ---------------------------------------------------------------------------
# Revisions
# ---------------------------------------------------------------------------


async def append_revision(
    db: aiosqlite.Connection,
    proposal_id: str,
    *,
    title: str,
    summary: str | None,
    payload: dict[str, Any] | None,
    related_objects: list[RelatedObjectRef],
    change_summary: str | None = None,
    provenance_id: str | None = None,
) -> ProposalRevision:
    cursor = await db.execute(
        "SELECT COALESCE(MAX(revision_number), 0) AS max_rev FROM proposal_revisions "
        "WHERE proposal_id = ?",
        (proposal_id,),
    )
    row = await cursor.fetchone()
    revision_number = row["max_rev"] + 1
    revision_id = str(uuid.uuid4())
    snapshot = json.dumps(
        {
            "title": title,
            "summary": summary,
            "payload": payload,
            "related_objects": [r.model_dump() for r in related_objects],
        }
    )
    await db.execute(
        """INSERT INTO proposal_revisions(id, proposal_id, revision_number, snapshot_json,
                                          change_summary, provenance_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (revision_id, proposal_id, revision_number, snapshot, change_summary, provenance_id, _now()),
    )
    await db.commit()
    revisions = await list_revisions(db, proposal_id)
    return next(r for r in revisions if r.id == revision_id)


async def list_revisions(db: aiosqlite.Connection, proposal_id: str) -> list[ProposalRevision]:
    cursor = await db.execute(
        """SELECT id, proposal_id, revision_number, snapshot_json, change_summary,
                  provenance_id, created_at
           FROM proposal_revisions WHERE proposal_id = ?
           ORDER BY revision_number""",
        (proposal_id,),
    )
    rows = await cursor.fetchall()
    revisions = []
    for row in rows:
        snapshot = json.loads(row["snapshot_json"])
        provenance = None
        if row["provenance_id"] is not None:
            provenance = await provenance_repo.get_by_id(db, row["provenance_id"])
        revisions.append(
            ProposalRevision(
                id=row["id"],
                proposal_id=row["proposal_id"],
                revision_number=row["revision_number"],
                title=snapshot["title"],
                summary=snapshot.get("summary"),
                payload=snapshot.get("payload"),
                related_objects=[
                    RelatedObjectRef(**r) for r in snapshot.get("related_objects", [])
                ],
                change_summary=row["change_summary"],
                provenance=provenance,
                created_at=row["created_at"],
            )
        )
    return revisions
