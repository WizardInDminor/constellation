"""Project workspace repository — Phase 9 Slice 0.

Covers the three project-foundation aggregates:
  * `project_scopes` — sidecar config keyed by hub_node_id
  * `drafts` — free-writing pad content, one row per project
  * `work_sessions` (+ session_nodes / session_edges) — intentional work
    session records

Each function returns Pydantic models, never raw rows. See ADR-063.
"""

import json
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    Draft,
    DraftUpdate,
    ProjectScope,
    ProjectScopeUpdate,
    ProjectSummary,
    WorkSession,
    WorkSessionCreate,
    WorkSessionUpdate,
)
from app.models.node import NodeRef

# ---------------------------------------------------------------------------
# project_scopes
# ---------------------------------------------------------------------------


def _scope_from_row(row: aiosqlite.Row) -> ProjectScope:
    return ProjectScope(
        hub_node_id=row["hub_node_id"],
        pinned_node_ids=json.loads(row["pinned_node_ids"] or "[]"),
        tag_ids=json.loads(row["tag_ids"] or "[]"),
        primary_tag_id=row["primary_tag_id"],
        briefing_prompt=row["briefing_prompt"],
        last_visited_at=row["last_visited_at"],
        mode=row["mode"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def create_scope(
    db: aiosqlite.Connection,
    *,
    hub_node_id: str,
    mode: str = "research",
) -> ProjectScope:
    """Flip `is_project_hub` on the hub node and create the sidecar row.

    Idempotent on the flag; raises IntegrityError if a scope row already exists.
    """
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE nodes SET is_project_hub = 1 WHERE id = ?",
        (hub_node_id,),
    )
    await db.execute(
        """INSERT INTO project_scopes(
              hub_node_id, pinned_node_ids, tag_ids, primary_tag_id,
              briefing_prompt, last_visited_at, mode,
              created_at, updated_at)
           VALUES (?, '[]', '[]', NULL, NULL, NULL, ?, ?, ?)""",
        (hub_node_id, mode, now, now),
    )
    await db.commit()
    result = await get_scope(db, hub_node_id)
    assert result is not None
    return result


async def get_scope(db: aiosqlite.Connection, hub_node_id: str) -> ProjectScope | None:
    cursor = await db.execute(
        """SELECT hub_node_id, pinned_node_ids, tag_ids, primary_tag_id,
                  briefing_prompt, last_visited_at, mode,
                  created_at, updated_at
           FROM project_scopes WHERE hub_node_id = ?""",
        (hub_node_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return _scope_from_row(row)


async def update_scope(
    db: aiosqlite.Connection,
    hub_node_id: str,
    data: ProjectScopeUpdate,
) -> ProjectScope | None:
    """Patch a project scope. Only fields explicitly set in the update payload
    are written; omitted fields keep their current value.
    """
    fields = data.model_fields_set
    if not fields:
        return await get_scope(db, hub_node_id)

    updates: dict[str, object] = {}
    if "pinned_node_ids" in fields and data.pinned_node_ids is not None:
        updates["pinned_node_ids"] = json.dumps(data.pinned_node_ids)
    if "tag_ids" in fields and data.tag_ids is not None:
        updates["tag_ids"] = json.dumps(data.tag_ids)
    if "primary_tag_id" in fields:
        updates["primary_tag_id"] = data.primary_tag_id
    if "briefing_prompt" in fields:
        updates["briefing_prompt"] = data.briefing_prompt
    if "mode" in fields and data.mode is not None:
        updates["mode"] = data.mode

    if not updates:
        return await get_scope(db, hub_node_id)

    updates["updated_at"] = datetime.now(UTC).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    await db.execute(
        f"UPDATE project_scopes SET {set_clause} WHERE hub_node_id = ?",  # noqa: S608
        [*updates.values(), hub_node_id],
    )
    await db.commit()
    return await get_scope(db, hub_node_id)


async def touch_last_visited(db: aiosqlite.Connection, hub_node_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE project_scopes SET last_visited_at = ?, updated_at = ? WHERE hub_node_id = ?",
        (now, now, hub_node_id),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Project list / detail
# ---------------------------------------------------------------------------


async def list_projects(db: aiosqlite.Connection) -> list[ProjectSummary]:
    """All non-deleted project hubs with their mode, last-visited time, note
    count, and active-session indicator.

    Note count is the pinned-node count plus the count of notes carrying any
    of the project's tags (deduplicated). For Slice 0 we approximate with the
    pinned count only — tag-based membership joins land alongside scope
    editing in Slice 2.
    """
    cursor = await db.execute(
        """SELECT n.id AS hub_id, n.title, n.type,
                  s.mode, s.last_visited_at, s.pinned_node_ids,
                  EXISTS (
                      SELECT 1 FROM work_sessions w
                      WHERE w.project_id = n.id AND w.status = 'active'
                  ) AS has_active
           FROM nodes n
           JOIN project_scopes s ON s.hub_node_id = n.id
           WHERE n.is_project_hub = 1 AND n.deleted_at IS NULL
           ORDER BY COALESCE(s.last_visited_at, s.created_at) DESC"""
    )
    rows = await cursor.fetchall()
    out: list[ProjectSummary] = []
    for r in rows:
        pinned = json.loads(r["pinned_node_ids"] or "[]")
        out.append(
            ProjectSummary(
                hub=NodeRef(id=r["hub_id"], title=r["title"], type=r["type"]),
                mode=r["mode"],
                last_visited_at=r["last_visited_at"],
                note_count=len(pinned),
                has_active_session=bool(r["has_active"]),
            )
        )
    return out


async def is_project_hub(db: aiosqlite.Connection, hub_node_id: str) -> bool:
    cursor = await db.execute(
        "SELECT is_project_hub FROM nodes WHERE id = ? AND deleted_at IS NULL",
        (hub_node_id,),
    )
    row = await cursor.fetchone()
    return bool(row and row["is_project_hub"])


async def resolve_by_name(db: aiosqlite.Connection, name: str) -> tuple[str, str] | None:
    """Resolve a `--project <name>` value to (hub_node_id, primary_tag_id).

    Match strategy (ADR-063): join `tags` against `project_scopes.primary_tag_id`
    on `tags.name`. Tag names are UNIQUE so a name matches at most one tag,
    which is associated with at most one project. Case-insensitive match for
    CLI friendliness.

    Returns None if no project has a primary tag whose name matches (either
    no project has set a primary tag yet, or the name is wrong).
    """
    cursor = await db.execute(
        """SELECT n.id AS hub_id, s.primary_tag_id
           FROM project_scopes s
           JOIN tags t ON t.id = s.primary_tag_id
           JOIN nodes n ON n.id = s.hub_node_id
           WHERE LOWER(t.name) = LOWER(?)
             AND n.is_project_hub = 1
             AND n.deleted_at IS NULL
           LIMIT 1""",
        (name,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return row["hub_id"], row["primary_tag_id"]


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------


def _draft_from_row(row: aiosqlite.Row) -> Draft:
    return Draft(
        project_id=row["project_id"],
        content=row["content"],
        updated_at=row["updated_at"],
    )


async def get_draft(db: aiosqlite.Connection, project_id: str) -> Draft | None:
    cursor = await db.execute(
        "SELECT project_id, content, updated_at FROM drafts WHERE project_id = ?",
        (project_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return _draft_from_row(row)


async def upsert_draft(db: aiosqlite.Connection, project_id: str, data: DraftUpdate) -> Draft:
    now = datetime.now(UTC).isoformat()
    existing = await get_draft(db, project_id)
    if existing is None:
        await db.execute(
            """INSERT INTO drafts(id, project_id, content, updated_at)
               VALUES (?, ?, ?, ?)""",
            (str(uuid.uuid4()), project_id, data.content, now),
        )
    else:
        await db.execute(
            "UPDATE drafts SET content = ?, updated_at = ? WHERE project_id = ?",
            (data.content, now, project_id),
        )
    await db.commit()
    result = await get_draft(db, project_id)
    assert result is not None
    return result


async def delete_draft(db: aiosqlite.Connection, project_id: str) -> bool:
    cursor = await db.execute("DELETE FROM drafts WHERE project_id = ?", (project_id,))
    await db.commit()
    return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Work sessions
# ---------------------------------------------------------------------------


def _session_from_row(row: aiosqlite.Row) -> WorkSession:
    return WorkSession(
        id=row["id"],
        project_id=row["project_id"],
        mode=row["mode"],
        intent=row["intent"],
        status=row["status"],
        progress_notes=row["progress_notes"],
        blockers=row["blockers"],
        closing_notes=row["closing_notes"],
        next_session_intent=row["next_session_intent"],
        intent_assessment=row["intent_assessment"],
        estimated_duration_minutes=row["estimated_duration_minutes"],
        started_at=row["started_at"],
        closed_at=row["closed_at"],
        duration_seconds=row["duration_seconds"],
        created_at=row["created_at"],
    )


async def create_session(
    db: aiosqlite.Connection,
    project_id: str,
    data: WorkSessionCreate,
) -> WorkSession:
    """Start a new work session for a project. The caller is responsible for
    closing any currently-active session first (route handlers enforce
    one-active-session-per-project).
    """
    session_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT INTO work_sessions(
              id, project_id, mode, intent, status,
              estimated_duration_minutes, started_at, created_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)""",
        (
            session_id,
            project_id,
            data.mode,
            data.intent,
            data.estimated_duration_minutes,
            now,
            now,
        ),
    )
    await db.commit()
    result = await get_session(db, session_id)
    assert result is not None
    return result


async def get_session(db: aiosqlite.Connection, session_id: str) -> WorkSession | None:
    cursor = await db.execute(
        """SELECT id, project_id, mode, intent, status,
                  progress_notes, blockers, closing_notes,
                  next_session_intent, intent_assessment,
                  estimated_duration_minutes,
                  started_at, closed_at, duration_seconds, created_at
           FROM work_sessions WHERE id = ?""",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return _session_from_row(row)


async def get_active_session(db: aiosqlite.Connection, project_id: str) -> WorkSession | None:
    cursor = await db.execute(
        """SELECT id, project_id, mode, intent, status,
                  progress_notes, blockers, closing_notes,
                  next_session_intent, intent_assessment,
                  estimated_duration_minutes,
                  started_at, closed_at, duration_seconds, created_at
           FROM work_sessions
           WHERE project_id = ? AND status = 'active'
           ORDER BY started_at DESC LIMIT 1""",
        (project_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return _session_from_row(row)


async def list_sessions(
    db: aiosqlite.Connection, project_id: str, *, limit: int = 50
) -> list[WorkSession]:
    cursor = await db.execute(
        """SELECT id, project_id, mode, intent, status,
                  progress_notes, blockers, closing_notes,
                  next_session_intent, intent_assessment,
                  estimated_duration_minutes,
                  started_at, closed_at, duration_seconds, created_at
           FROM work_sessions
           WHERE project_id = ?
           ORDER BY started_at DESC LIMIT ?""",
        (project_id, limit),
    )
    rows = await cursor.fetchall()
    return [_session_from_row(r) for r in rows]


async def update_session(
    db: aiosqlite.Connection,
    session_id: str,
    data: WorkSessionUpdate,
) -> WorkSession | None:
    """Patch a session. When `close=True`, sets `closed_at` and computes
    `duration_seconds`. Status defaults to 'completed' on close if not
    otherwise set.
    """
    existing = await get_session(db, session_id)
    if existing is None:
        return None

    fields = data.model_fields_set
    updates: dict[str, object] = {}
    if "progress_notes" in fields:
        updates["progress_notes"] = data.progress_notes
    if "blockers" in fields:
        updates["blockers"] = data.blockers
    if "closing_notes" in fields:
        updates["closing_notes"] = data.closing_notes
    if "next_session_intent" in fields:
        updates["next_session_intent"] = data.next_session_intent
    if "intent_assessment" in fields:
        updates["intent_assessment"] = data.intent_assessment
    if "status" in fields and data.status is not None:
        updates["status"] = data.status

    if data.close:
        now = datetime.now(UTC)
        started = existing.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        updates["closed_at"] = now.isoformat()
        updates["duration_seconds"] = int((now - started).total_seconds())
        if "status" not in updates:
            updates["status"] = "completed"

    if not updates:
        return existing

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    await db.execute(
        f"UPDATE work_sessions SET {set_clause} WHERE id = ?",  # noqa: S608
        [*updates.values(), session_id],
    )
    await db.commit()
    return await get_session(db, session_id)
