import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import aiosqlite

from app.models import (
    FleetingCreate,
    LiteratureCreate,
    NodeDetail,
    NodeSummary,
    NodeUpdate,
    PermanentCreate,
    StructureCreate,
    TagRef,
)
from app.repositories import edge_repo, tag_repo


async def _fetch_full(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    cursor = await db.execute(
        """SELECT id, type, title, content, summary, source_id,
                  embedding_model, processed_at, created_at, updated_at
           FROM nodes WHERE id = ? AND deleted_at IS NULL""",
        (node_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    outgoing = await edge_repo.get_outgoing(db, node_id)
    incoming = await edge_repo.get_incoming(db, node_id)
    tags = await tag_repo.get_tags_for_node(db, node_id)

    return NodeDetail(
        id=row["id"],
        type=row["type"],
        title=row["title"],
        content=row["content"],
        summary=row["summary"],
        source_id=row["source_id"],
        embedding_model=row["embedding_model"],
        processed_at=row["processed_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        outgoing_edges=outgoing,
        incoming_edges=incoming,
        tags=tags,
    )


async def _fetch_tags_bulk(
    db: aiosqlite.Connection, node_ids: list[str]
) -> dict[str, list[TagRef]]:
    """Fetch tags for multiple nodes in a single query. Returns {node_id: [TagRef]}."""
    if not node_ids:
        return {}
    placeholders = ",".join("?" * len(node_ids))
    cursor = await db.execute(
        f"SELECT nt.node_id, t.id, t.name, t.color"  # noqa: S608
        f" FROM node_tags nt JOIN tags t ON t.id = nt.tag_id"
        f" WHERE nt.node_id IN ({placeholders})"
        f" ORDER BY t.name",
        node_ids,
    )
    rows = await cursor.fetchall()
    result: dict[str, list[TagRef]] = defaultdict(list)
    for r in rows:
        result[r["node_id"]].append(TagRef(id=r["id"], name=r["name"], color=r["color"]))
    return result


async def _create_node(
    db: aiosqlite.Connection,
    *,
    type_: str,
    title: str,
    content: str,
    summary: str | None = None,
    source_id: str | None = None,
    tag_ids: list[str] | None = None,
) -> NodeDetail:
    node_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO nodes(id, type, title, content, summary, source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (node_id, type_, title, content, summary, source_id, now, now),
    )
    if tag_ids:
        await db.executemany(
            "INSERT OR IGNORE INTO node_tags(node_id, tag_id) VALUES (?, ?)",
            [(node_id, tid) for tid in tag_ids],
        )
    await db.commit()
    result = await _fetch_full(db, node_id)
    assert result is not None
    return result


async def create_fleeting(db: aiosqlite.Connection, data: FleetingCreate) -> NodeDetail:
    return await _create_node(db, type_="fleeting", title=data.title, content=data.content)


async def create_permanent(db: aiosqlite.Connection, data: PermanentCreate) -> NodeDetail:
    return await _create_node(
        db,
        type_="permanent",
        title=data.title,
        content=data.content,
        summary=data.summary,
        tag_ids=data.tag_ids,
    )


async def create_literature(db: aiosqlite.Connection, data: LiteratureCreate) -> NodeDetail:
    return await _create_node(
        db,
        type_="literature",
        title=data.title,
        content=data.content,
        summary=data.summary,
        source_id=data.source_id,
        tag_ids=data.tag_ids,
    )


async def create_structure(db: aiosqlite.Connection, data: StructureCreate) -> NodeDetail:
    return await _create_node(
        db,
        type_="structure",
        title=data.title,
        content=data.content,
        summary=data.summary,
        tag_ids=data.tag_ids,
    )


async def get_by_id(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    return await _fetch_full(db, node_id)


async def list_nodes(
    db: aiosqlite.Connection,
    *,
    type_: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[NodeSummary], int]:
    offset = (page - 1) * page_size

    cursor = await db.execute(
        "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL AND type = COALESCE(?, type)",
        (type_,),
    )
    total: int = (await cursor.fetchone())[0]

    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE deleted_at IS NULL AND type = COALESCE(?, type)
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?""",
        (type_, page_size, offset),
    )
    rows = await cursor.fetchall()
    node_ids = [r["id"] for r in rows]
    tags_map = await _fetch_tags_bulk(db, node_ids)
    items = [
        NodeSummary(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            summary=r["summary"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            processed_at=r["processed_at"],
            tags=tags_map.get(r["id"], []),
        )
        for r in rows
    ]
    return items, total


async def search_nodes(
    db: aiosqlite.Connection, *, q: str, limit: int = 10
) -> list["NodeRef"]:
    from app.models import NodeRef

    # Build FTS5 prefix-match query: each token gets a trailing * for prefix search
    import re as _re
    fts_query = " ".join(tok + "*" for tok in _re.findall(r"[A-Za-z0-9]+", q) if tok)
    if not fts_query:
        return []
    cursor = await db.execute(
        """SELECT n.id, n.title, n.type
           FROM nodes_fts f
           JOIN nodes n ON n.rowid = f.rowid
           WHERE f.nodes_fts MATCH ?
             AND n.deleted_at IS NULL
             AND n.type != 'fleeting'
           ORDER BY f.rank
           LIMIT ?""",
        (fts_query, limit),
    )
    rows = await cursor.fetchall()
    return [NodeRef(id=r["id"], title=r["title"], type=r["type"]) for r in rows]


async def fts_search(db: aiosqlite.Connection, *, q: str, limit: int = 10) -> list[str]:
    """Full-text search via FTS5. Returns node IDs ordered by relevance (best first).

    Includes all non-deleted node types, including fleeting — callers that want to
    exclude a type should filter the returned IDs against a subsequent fetch.
    """
    import re as _re
    # Keep only alphanumeric tokens; strip punctuation that FTS5 treats as syntax
    tokens = _re.findall(r"[A-Za-z0-9]+", q)
    fts_query = " ".join(tok + "*" for tok in tokens if tok)
    if not fts_query:
        return []
    cursor = await db.execute(
        """SELECT n.id
           FROM nodes_fts f
           JOIN nodes n ON n.rowid = f.rowid
           WHERE f.nodes_fts MATCH ?
             AND n.deleted_at IS NULL
           ORDER BY f.rank
           LIMIT ?""",
        (fts_query, limit),
    )
    rows = await cursor.fetchall()
    return [r["id"] for r in rows]


async def list_inbox(db: aiosqlite.Connection) -> list[NodeSummary]:
    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE type = 'fleeting' AND processed_at IS NULL AND deleted_at IS NULL
           ORDER BY created_at ASC""",
    )
    rows = await cursor.fetchall()
    node_ids = [r["id"] for r in rows]
    tags_map = await _fetch_tags_bulk(db, node_ids)
    return [
        NodeSummary(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            summary=r["summary"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            processed_at=r["processed_at"],
            tags=tags_map.get(r["id"], []),
        )
        for r in rows
    ]


async def update(
    db: aiosqlite.Connection, node_id: str, data: NodeUpdate
) -> NodeDetail | None:
    updates: dict[str, Any] = {}
    if data.title is not None:
        updates["title"] = data.title
    if data.content is not None:
        updates["content"] = data.content
    if "summary" in data.model_fields_set:
        updates["summary"] = data.summary

    if updates:
        now = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE nodes SET {set_clause}, updated_at = ? "  # noqa: S608
            f"WHERE id = ? AND deleted_at IS NULL",
            [*updates.values(), now, node_id],
        )

    if data.tag_ids is not None:
        await db.execute("DELETE FROM node_tags WHERE node_id = ?", (node_id,))
        if data.tag_ids:
            await db.executemany(
                "INSERT OR IGNORE INTO node_tags(node_id, tag_id) VALUES (?, ?)",
                [(node_id, tid) for tid in data.tag_ids],
            )

    await db.commit()
    return await _fetch_full(db, node_id)


async def soft_delete(db: aiosqlite.Connection, node_id: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    cursor = await db.execute(
        "UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        (now, now, node_id),
    )
    await db.commit()
    return cursor.rowcount > 0


async def mark_processed(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE nodes SET processed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        (now, now, node_id),
    )
    await db.commit()
    return await _fetch_full(db, node_id)
