import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import EdgeCreate, EdgeDetail, EdgeSummary, NeighborResult, NodeRef, RecentEdge


async def get_by_id(db: aiosqlite.Connection, edge_id: str) -> EdgeDetail | None:
    cursor = await db.execute(
        "SELECT id, from_id, to_id, type, note, classifier_rationale, created_at"
        " FROM edges WHERE id = ?",
        (edge_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return EdgeDetail(
        id=row["id"],
        from_id=row["from_id"],
        to_id=row["to_id"],
        type=row["type"],
        note=row["note"],
        classifier_rationale=row["classifier_rationale"],
        created_at=row["created_at"],
    )


async def create(db: aiosqlite.Connection, data: EdgeCreate) -> EdgeDetail:
    edge_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "INSERT INTO edges(id, from_id, to_id, type, note, classifier_rationale, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            edge_id,
            data.from_id,
            data.to_id,
            data.type,
            data.note,
            data.classifier_rationale,
            now,
        ),
    )
    await db.commit()
    result = await get_by_id(db, edge_id)
    assert result is not None
    return result


async def delete(db: aiosqlite.Connection, edge_id: str) -> bool:
    cursor = await db.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
    await db.commit()
    return cursor.rowcount > 0


async def count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COUNT(*) AS n FROM edges")
    row = await cursor.fetchone()
    return row["n"] if row else 0


async def exists_between(db: aiosqlite.Connection, a_id: str, b_id: str) -> bool:
    cursor = await db.execute(
        """SELECT 1 FROM edges
           WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
           LIMIT 1""",
        (a_id, b_id, b_id, a_id),
    )
    return await cursor.fetchone() is not None


async def get_neighbors(
    db: aiosqlite.Connection,
    node_id: str,
    *,
    edge_type: str | None = None,
) -> list[NeighborResult]:
    type_clause = "AND e.type = ?" if edge_type else ""
    base_params = (node_id, edge_type) if edge_type else (node_id,)

    cursor = await db.execute(
        f"""SELECT e.id, e.type, e.note, e.classifier_rationale,
                   n.id AS nid, n.title, n.type AS ntype
            FROM edges e JOIN nodes n ON e.to_id = n.id
            WHERE e.from_id = ? {type_clause} AND n.deleted_at IS NULL""",  # noqa: S608
        base_params,
    )
    outgoing = await cursor.fetchall()

    cursor = await db.execute(
        f"""SELECT e.id, e.type, e.note, e.classifier_rationale,
                   n.id AS nid, n.title, n.type AS ntype
            FROM edges e JOIN nodes n ON e.from_id = n.id
            WHERE e.to_id = ? {type_clause} AND n.deleted_at IS NULL""",  # noqa: S608
        base_params,
    )
    incoming = await cursor.fetchall()

    results: list[NeighborResult] = []
    for r in outgoing:
        results.append(
            NeighborResult(
                node=NodeRef(id=r["nid"], title=r["title"], type=r["ntype"]),
                edge_id=r["id"],
                edge_type=r["type"],
                edge_note=r["note"],
                edge_classifier_rationale=r["classifier_rationale"],
                direction="outgoing",
            )
        )
    for r in incoming:
        results.append(
            NeighborResult(
                node=NodeRef(id=r["nid"], title=r["title"], type=r["ntype"]),
                edge_id=r["id"],
                edge_type=r["type"],
                edge_note=r["note"],
                edge_classifier_rationale=r["classifier_rationale"],
                direction="incoming",
            )
        )
    return results


async def get_outgoing(db: aiosqlite.Connection, node_id: str) -> list[EdgeSummary]:
    cursor = await db.execute(
        """SELECT e.id, e.type, e.note, e.classifier_rationale, e.created_at,
                  n.id AS nid, n.title, n.type AS ntype
           FROM edges e JOIN nodes n ON e.to_id = n.id
           WHERE e.from_id = ? AND n.deleted_at IS NULL
           ORDER BY e.created_at DESC""",
        (node_id,),
    )
    rows = await cursor.fetchall()
    return [
        EdgeSummary(
            id=r["id"],
            type=r["type"],
            note=r["note"],
            classifier_rationale=r["classifier_rationale"],
            created_at=r["created_at"],
            neighbor=NodeRef(id=r["nid"], title=r["title"], type=r["ntype"]),
        )
        for r in rows
    ]


async def list_recent(
    db: aiosqlite.Connection, *, since_iso: str, limit: int = 10
) -> list[RecentEdge]:
    """Edges created on or after `since_iso`, with both endpoint titles.

    Excludes edges whose endpoints are soft-deleted. ADR-054 — Home activity feed.
    """
    cursor = await db.execute(
        """SELECT e.id, e.type, e.created_at,
                  fn.id AS from_id, fn.title AS from_title, fn.type AS from_type,
                  tn.id AS to_id,   tn.title AS to_title,   tn.type AS to_type
           FROM edges e
           JOIN nodes fn ON fn.id = e.from_id AND fn.deleted_at IS NULL
           JOIN nodes tn ON tn.id = e.to_id   AND tn.deleted_at IS NULL
           WHERE e.created_at >= ?
           ORDER BY e.created_at DESC
           LIMIT ?""",
        (since_iso, limit),
    )
    rows = await cursor.fetchall()
    return [
        RecentEdge(
            id=r["id"],
            type=r["type"],
            created_at=r["created_at"],
            from_node=NodeRef(id=r["from_id"], title=r["from_title"], type=r["from_type"]),
            to_node=NodeRef(id=r["to_id"], title=r["to_title"], type=r["to_type"]),
        )
        for r in rows
    ]


async def get_incoming(db: aiosqlite.Connection, node_id: str) -> list[EdgeSummary]:
    cursor = await db.execute(
        """SELECT e.id, e.type, e.note, e.classifier_rationale, e.created_at,
                  n.id AS nid, n.title, n.type AS ntype
           FROM edges e JOIN nodes n ON e.from_id = n.id
           WHERE e.to_id = ? AND n.deleted_at IS NULL
           ORDER BY e.created_at DESC""",
        (node_id,),
    )
    rows = await cursor.fetchall()
    return [
        EdgeSummary(
            id=r["id"],
            type=r["type"],
            note=r["note"],
            classifier_rationale=r["classifier_rationale"],
            created_at=r["created_at"],
            neighbor=NodeRef(id=r["nid"], title=r["title"], type=r["ntype"]),
        )
        for r in rows
    ]
