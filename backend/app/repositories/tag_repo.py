import uuid
from typing import Any

import aiosqlite

from app.models import TagCreate, TagRef, TagUpdate


async def create(db: aiosqlite.Connection, data: TagCreate) -> TagRef:
    tag_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO tags(id, name, color) VALUES (?, ?, ?)",
        (tag_id, data.name, data.color),
    )
    await db.commit()
    return TagRef(id=tag_id, name=data.name, color=data.color)


async def get_by_id(db: aiosqlite.Connection, tag_id: str) -> TagRef | None:
    cursor = await db.execute("SELECT id, name, color FROM tags WHERE id = ?", (tag_id,))
    row = await cursor.fetchone()
    if row is None:
        return None
    return TagRef(id=row["id"], name=row["name"], color=row["color"])


async def list_tags(db: aiosqlite.Connection) -> list[TagRef]:
    cursor = await db.execute("SELECT id, name, color FROM tags ORDER BY name")
    rows = await cursor.fetchall()
    return [TagRef(id=r["id"], name=r["name"], color=r["color"]) for r in rows]


async def count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COUNT(*) AS n FROM tags")
    row = await cursor.fetchone()
    return row["n"] if row else 0


async def update(db: aiosqlite.Connection, tag_id: str, data: TagUpdate) -> TagRef | None:
    updates: dict[str, Any] = {}
    if data.name is not None:
        updates["name"] = data.name
    if "color" in data.model_fields_set:
        updates["color"] = data.color

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE tags SET {set_clause} WHERE id = ?",  # noqa: S608
            [*updates.values(), tag_id],
        )
        await db.commit()

    return await get_by_id(db, tag_id)


async def delete(db: aiosqlite.Connection, tag_id: str) -> bool:
    await db.execute("DELETE FROM node_tags WHERE tag_id = ?", (tag_id,))
    cursor = await db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    await db.commit()
    return cursor.rowcount > 0


async def list_node_ids_for_tag(
    db: aiosqlite.Connection,
    tag_id: str,
    *,
    exclude_fleeting: bool = True,
    limit: int = 50,
) -> list[str]:
    """Node IDs carrying the given tag. Used by the cluster suggest-links endpoint."""
    type_clause = "AND n.type != 'fleeting'" if exclude_fleeting else ""
    cursor = await db.execute(
        f"""SELECT n.id FROM nodes n
            JOIN node_tags nt ON nt.node_id = n.id
            WHERE nt.tag_id = ? AND n.deleted_at IS NULL {type_clause}
            ORDER BY n.created_at ASC
            LIMIT ?""",  # noqa: S608
        (tag_id, limit),
    )
    rows = await cursor.fetchall()
    return [r["id"] for r in rows]


async def get_tags_for_node(db: aiosqlite.Connection, node_id: str) -> list[TagRef]:
    cursor = await db.execute(
        """SELECT t.id, t.name, t.color
           FROM tags t JOIN node_tags nt ON t.id = nt.tag_id
           WHERE nt.node_id = ?
           ORDER BY t.name""",
        (node_id,),
    )
    rows = await cursor.fetchall()
    return [TagRef(id=r["id"], name=r["name"], color=r["color"]) for r in rows]
