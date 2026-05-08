import uuid
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
    await db.execute(
        """INSERT INTO nodes(id, type, title, content, summary, source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))""",
        (node_id, type_, title, content, summary, source_id),
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
    items = [
        NodeSummary(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            summary=r["summary"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            processed_at=r["processed_at"],
        )
        for r in rows
    ]
    return items, total


async def list_inbox(db: aiosqlite.Connection) -> list[NodeSummary]:
    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE type = 'fleeting' AND processed_at IS NULL AND deleted_at IS NULL
           ORDER BY created_at ASC""",
    )
    rows = await cursor.fetchall()
    return [
        NodeSummary(
            id=r["id"],
            type=r["type"],
            title=r["title"],
            summary=r["summary"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            processed_at=r["processed_at"],
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
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE nodes SET {set_clause}, updated_at = datetime('now') "  # noqa: S608
            f"WHERE id = ? AND deleted_at IS NULL",
            [*updates.values(), node_id],
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
    cursor = await db.execute(
        """UPDATE nodes
           SET deleted_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND deleted_at IS NULL""",
        (node_id,),
    )
    await db.commit()
    return cursor.rowcount > 0


async def mark_processed(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    await db.execute(
        """UPDATE nodes
           SET processed_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND deleted_at IS NULL""",
        (node_id,),
    )
    await db.commit()
    return await _fetch_full(db, node_id)
