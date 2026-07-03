import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

import aiosqlite

from app.models import (
    FleetingCreate,
    LiteratureCreate,
    NodeDetail,
    NodeRef,
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
                  embedding_model, processed_at,
                  is_story_event, story_time, prose_status, manuscript_location,
                  canon_status, node_status, charge, do_not_name_yet, confidence,
                  created_at, updated_at
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
        is_story_event=bool(row["is_story_event"]),
        story_time=row["story_time"],
        prose_status=row["prose_status"],
        manuscript_location=row["manuscript_location"],
        canon_status=row["canon_status"],
        node_status=row["node_status"],
        charge=row["charge"],
        do_not_name_yet=bool(row["do_not_name_yet"]),
        confidence=row["confidence"],
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
    canon_status: str | None = None,
    node_status: str | None = None,
    charge: str | None = None,
    do_not_name_yet: bool = False,
    confidence: int | None = None,
) -> NodeDetail:
    node_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT INTO nodes(
                id, type, title, content, summary, source_id,
                canon_status, node_status, charge, do_not_name_yet, confidence,
                created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            node_id,
            type_,
            title,
            content,
            summary,
            source_id,
            canon_status,
            node_status,
            charge,
            int(do_not_name_yet),
            confidence,
            now,
            now,
        ),
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
    return await _create_node(
        db,
        type_="fleeting",
        title=data.title,
        content=data.content,
        tag_ids=data.tag_ids,
    )


def _canon_kwargs(data: PermanentCreate | LiteratureCreate | StructureCreate) -> dict[str, Any]:
    """Extract the Canon uncertainty fields (ADR-076) shared by the create DTOs."""
    return {
        "canon_status": data.canon_status,
        "node_status": data.node_status,
        "charge": data.charge,
        "do_not_name_yet": data.do_not_name_yet,
        "confidence": data.confidence,
    }


async def create_permanent(db: aiosqlite.Connection, data: PermanentCreate) -> NodeDetail:
    return await _create_node(
        db,
        type_="permanent",
        title=data.title,
        content=data.content,
        summary=data.summary,
        tag_ids=data.tag_ids,
        **_canon_kwargs(data),
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
        **_canon_kwargs(data),
    )


async def create_structure(db: aiosqlite.Connection, data: StructureCreate) -> NodeDetail:
    return await _create_node(
        db,
        type_="structure",
        title=data.title,
        content=data.content,
        summary=data.summary,
        tag_ids=data.tag_ids,
        **_canon_kwargs(data),
    )


async def create_story_event(
    db: aiosqlite.Connection,
    *,
    title: str,
    content: str,
    story_time: str | None = None,
    prose_status: str | None = None,
    manuscript_location: str | None = None,
) -> NodeDetail:
    """Phase 9 Slice 4 (ADR-064): create a permanent node flagged as a story
    event. The node lives in `nodes` like any other permanent and is
    embeddable / searchable via existing pipelines; the `is_story_event = 1`
    flag is what places it on the timeline canvas.
    """
    node_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT INTO nodes(
                id, type, title, content,
                is_story_event, story_time, prose_status, manuscript_location,
                created_at, updated_at)
           VALUES (?, 'permanent', ?, ?, 1, ?, ?, ?, ?, ?)""",
        (
            node_id,
            title,
            content,
            story_time,
            prose_status,
            manuscript_location,
            now,
            now,
        ),
    )
    await db.commit()
    result = await _fetch_full(db, node_id)
    assert result is not None
    return result


async def update_event_fields(
    db: aiosqlite.Connection,
    node_id: str,
    *,
    story_time: str | None = None,
    prose_status: str | None = None,
    manuscript_location: str | None = None,
    set_story_time: bool = False,
    set_prose_status: bool = False,
    set_manuscript_location: bool = False,
) -> NodeDetail | None:
    """Patch event-only columns. Uses explicit `set_*` flags so the caller
    can distinguish "leave as is" from "set to NULL".
    """
    updates: dict[str, object] = {}
    if set_story_time:
        updates["story_time"] = story_time
    if set_prose_status:
        updates["prose_status"] = prose_status
    if set_manuscript_location:
        updates["manuscript_location"] = manuscript_location

    if not updates:
        return await _fetch_full(db, node_id)

    updates["updated_at"] = datetime.now(UTC).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    await db.execute(
        f"UPDATE nodes SET {set_clause} WHERE id = ?",  # noqa: S608
        [*updates.values(), node_id],
    )
    await db.commit()
    return await _fetch_full(db, node_id)


async def get_by_id(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    return await _fetch_full(db, node_id)


async def list_nodes(
    db: aiosqlite.Connection,
    *,
    type_: str | None = None,
    page: int = 1,
    page_size: int = 20,
    no_summary: bool = False,
    no_outgoing: bool = False,
    no_edges: bool = False,
    summary_max_length: int | None = None,
    hide_story_events: bool = False,
    canon_status: str | None = None,
    node_status: str | None = None,
    charge_in: list[str] | None = None,
    do_not_name_yet: bool = False,
    no_scene: bool = False,
) -> tuple[list[NodeSummary], int]:
    """Paginated node list. ADR-055 — schema-level filters AND-compose.

    Filters:
    - no_summary: summary IS NULL or empty string.
    - no_outgoing: id absent from `edges.from_id`.
    - no_edges: id absent from both edges.from_id and edges.to_id (stricter).
    - summary_max_length: non-null summaries shorter than the given length.
    - hide_story_events: excludes nodes with is_story_event = 1 (ADR-064).
      Default off — events are visible in Notes by default.

    Canon filters (ADR-076) — power the Canon saved-views:
    - canon_status / node_status: exact match on the uncertainty enums.
    - charge_in: charge is one of the given values (e.g. high/goosebump).
    - do_not_name_yet: only nodes with the protected flag set.
    - no_scene: only nodes with no edge (either direction) to a story event —
      the "charged image with no scene yet" filter.
    """
    offset = (page - 1) * page_size

    where_clauses = ["deleted_at IS NULL"]
    params: list = []
    if type_ is not None:
        where_clauses.append("type = ?")
        params.append(type_)
    if no_summary:
        where_clauses.append("(summary IS NULL OR summary = '')")
    if no_outgoing:
        where_clauses.append("id NOT IN (SELECT from_id FROM edges)")
    if no_edges:
        where_clauses.append("id NOT IN (SELECT from_id FROM edges UNION SELECT to_id FROM edges)")
    if summary_max_length is not None:
        where_clauses.append("summary IS NOT NULL AND LENGTH(summary) < ?")
        params.append(summary_max_length)
    if hide_story_events:
        where_clauses.append("is_story_event = 0")
    if canon_status is not None:
        where_clauses.append("canon_status = ?")
        params.append(canon_status)
    if node_status is not None:
        where_clauses.append("node_status = ?")
        params.append(node_status)
    if charge_in:
        placeholders = ",".join("?" * len(charge_in))
        where_clauses.append(f"charge IN ({placeholders})")
        params.extend(charge_in)
    if do_not_name_yet:
        where_clauses.append("do_not_name_yet = 1")
    if no_scene:
        where_clauses.append(
            "id NOT IN ("
            "  SELECT e.from_id FROM edges e JOIN nodes ev ON ev.id = e.to_id"
            "  WHERE ev.is_story_event = 1"
            "  UNION"
            "  SELECT e.to_id FROM edges e JOIN nodes ev ON ev.id = e.from_id"
            "  WHERE ev.is_story_event = 1"
            ")"
        )

    where_sql = " AND ".join(where_clauses)

    cursor = await db.execute(
        f"SELECT COUNT(*) FROM nodes WHERE {where_sql}",  # noqa: S608
        params,
    )
    total: int = (await cursor.fetchone())[0]

    cursor = await db.execute(
        f"""SELECT id, type, title, summary, created_at, updated_at,
                   processed_at, is_story_event,
                   canon_status, node_status, charge, do_not_name_yet, confidence
            FROM nodes
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?""",  # noqa: S608
        [*params, page_size, offset],
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
            is_story_event=bool(r["is_story_event"]),
            canon_status=r["canon_status"],
            node_status=r["node_status"],
            charge=r["charge"],
            do_not_name_yet=bool(r["do_not_name_yet"]),
            confidence=r["confidence"],
            tags=tags_map.get(r["id"], []),
        )
        for r in rows
    ]
    return items, total


async def search_nodes(db: aiosqlite.Connection, *, q: str, limit: int = 10) -> list[NodeRef]:
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


async def find_orphans(
    db: aiosqlite.Connection,
    *,
    node_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[NodeSummary]:
    """Permanent/literature/structure notes with zero edges (in or out).

    Fleeting notes are excluded by default since they're inbox material, not
    forgotten ideas — but a caller can request a specific type.
    """
    if node_type is None:
        type_clause = "AND n.type IN ('permanent', 'literature', 'structure')"
        params: tuple = (limit, offset)
    else:
        type_clause = "AND n.type = ?"
        params = (node_type, limit, offset)

    cursor = await db.execute(
        f"""SELECT n.id, n.type, n.title, n.summary, n.created_at, n.updated_at, n.processed_at
            FROM nodes n
            WHERE n.deleted_at IS NULL
              {type_clause}
              AND NOT EXISTS (
                  SELECT 1 FROM edges e
                  WHERE e.from_id = n.id OR e.to_id = n.id
              )
            ORDER BY n.updated_at DESC
            LIMIT ? OFFSET ?""",  # noqa: S608
        params,
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


async def find_stale(
    db: aiosqlite.Connection,
    *,
    node_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    exclude_fleeting: bool = True,
) -> list[NodeSummary]:
    """Notes ordered by oldest updated_at first — what the user has touched least recently."""
    clauses: list[str] = ["deleted_at IS NULL"]
    params: list = []
    if node_type is not None:
        clauses.append("type = ?")
        params.append(node_type)
    elif exclude_fleeting:
        clauses.append("type != 'fleeting'")
    where = " AND ".join(clauses)
    params.extend([limit, offset])

    cursor = await db.execute(
        f"""SELECT id, type, title, summary, created_at, updated_at, processed_at
            FROM nodes
            WHERE {where}
            ORDER BY updated_at ASC
            LIMIT ? OFFSET ?""",  # noqa: S608
        params,
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


async def list_recently_captured(
    db: aiosqlite.Connection, *, since_iso: str, limit: int = 10
) -> list[NodeSummary]:
    """Fleeting notes created on or after `since_iso`. ADR-054 — Home activity feed."""
    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE type = 'fleeting'
             AND deleted_at IS NULL
             AND created_at >= ?
           ORDER BY created_at DESC
           LIMIT ?""",
        (since_iso, limit),
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


async def list_recently_edited(
    db: aiosqlite.Connection, *, since_iso: str, limit: int = 10
) -> list[NodeSummary]:
    """Non-fleeting notes edited on or after `since_iso`. ADR-054.

    Excludes notes where `updated_at == created_at` — those were born, not
    edited.
    """
    cursor = await db.execute(
        """SELECT id, type, title, summary, created_at, updated_at, processed_at
           FROM nodes
           WHERE type != 'fleeting'
             AND deleted_at IS NULL
             AND updated_at >= ?
             AND updated_at > created_at
           ORDER BY updated_at DESC
           LIMIT ?""",
        (since_iso, limit),
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


async def list_recent_for_bridge_scan(db: aiosqlite.Connection, *, limit: int = 200) -> list[str]:
    """IDs of the most-recently-updated non-fleeting nodes — bridge scan input set."""
    cursor = await db.execute(
        """SELECT id FROM nodes
           WHERE deleted_at IS NULL AND type != 'fleeting'
           ORDER BY updated_at DESC
           LIMIT ?""",
        (limit,),
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


async def update(db: aiosqlite.Connection, node_id: str, data: NodeUpdate) -> NodeDetail | None:
    updates: dict[str, Any] = {}
    if data.title is not None:
        updates["title"] = data.title
    if data.content is not None:
        updates["content"] = data.content
    if "summary" in data.model_fields_set:
        updates["summary"] = data.summary
    if "source_id" in data.model_fields_set:
        updates["source_id"] = data.source_id
    # Slice 5: event-specific field writes. Use model_fields_set so explicit
    # null clears the column (distinct from "leave alone").
    if "story_time" in data.model_fields_set:
        updates["story_time"] = data.story_time
    if "prose_status" in data.model_fields_set:
        updates["prose_status"] = data.prose_status
    if "manuscript_location" in data.model_fields_set:
        updates["manuscript_location"] = data.manuscript_location
    # Canon uncertainty metadata (ADR-076). do_not_name_yet stores as 0/1.
    if "canon_status" in data.model_fields_set:
        updates["canon_status"] = data.canon_status
    if "node_status" in data.model_fields_set:
        updates["node_status"] = data.node_status
    if "charge" in data.model_fields_set:
        updates["charge"] = data.charge
    if "do_not_name_yet" in data.model_fields_set:
        updates["do_not_name_yet"] = int(bool(data.do_not_name_yet))
    if "confidence" in data.model_fields_set:
        updates["confidence"] = data.confidence

    if updates:
        now = datetime.now(UTC).isoformat()
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
    now = datetime.now(UTC).isoformat()
    cursor = await db.execute(
        "UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        (now, now, node_id),
    )
    await db.commit()
    return cursor.rowcount > 0


async def mark_processed(db: aiosqlite.Connection, node_id: str) -> NodeDetail | None:
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE nodes SET processed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        (now, now, node_id),
    )
    await db.commit()
    return await _fetch_full(db, node_id)


async def count_by_type(db: aiosqlite.Connection) -> dict[str, int]:
    cursor = await db.execute(
        """SELECT type, COUNT(*) AS n
           FROM nodes
           WHERE deleted_at IS NULL
           GROUP BY type""",
    )
    rows = await cursor.fetchall()
    return {r["type"]: r["n"] for r in rows}


async def count_inbox(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        """SELECT COUNT(*) AS n FROM nodes
           WHERE type = 'fleeting' AND processed_at IS NULL AND deleted_at IS NULL""",
    )
    row = await cursor.fetchone()
    return row["n"] if row else 0


async def last_processed_at(db: aiosqlite.Connection) -> str | None:
    cursor = await db.execute(
        """SELECT MAX(processed_at) AS t FROM nodes
           WHERE deleted_at IS NULL AND processed_at IS NOT NULL""",
    )
    row = await cursor.fetchone()
    return row["t"] if row and row["t"] else None
