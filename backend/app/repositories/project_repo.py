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
    ProjectThreads,
    TensionThread,
    ThreadItem,
    WorkSession,
    WorkSessionCreate,
    WorkSessionUpdate,
)
from app.models.node import NodeRef

# Lifecycle status tags that mark a node as an unresolved thread (ADR-086/083).
_OPEN_STATUS_TAGS = ("status:open", "status:developing")
_TENSION_EDGE_TYPES = ("CONTRADICTS", "QUESTIONS")

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
        prior_knowledge=row["prior_knowledge"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def create_scope(
    db: aiosqlite.Connection,
    *,
    hub_node_id: str,
    mode: str = "research",
    prior_knowledge: str | None = None,
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
              briefing_prompt, last_visited_at, mode, prior_knowledge,
              created_at, updated_at)
           VALUES (?, '[]', '[]', NULL, NULL, NULL, ?, ?, ?, ?)""",
        (hub_node_id, mode, prior_knowledge, now, now),
    )
    await db.commit()
    result = await get_scope(db, hub_node_id)
    assert result is not None
    return result


async def get_scope(db: aiosqlite.Connection, hub_node_id: str) -> ProjectScope | None:
    cursor = await db.execute(
        """SELECT hub_node_id, pinned_node_ids, tag_ids, primary_tag_id,
                  briefing_prompt, last_visited_at, mode, prior_knowledge,
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
    if "prior_knowledge" in fields:
        updates["prior_knowledge"] = data.prior_knowledge

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

    Note count is the union of pinned node IDs and notes carrying any of the
    project's tags, deduped and excluding soft-deleted nodes.
    """
    cursor = await db.execute(
        """SELECT n.id AS hub_id, n.title, n.type,
                  s.mode, s.last_visited_at, s.pinned_node_ids, s.tag_ids,
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
        tag_ids = json.loads(r["tag_ids"] or "[]")
        seen = set(pinned)
        if tag_ids:
            placeholders = ",".join("?" * len(tag_ids))
            cursor2 = await db.execute(
                f"""SELECT DISTINCT nt.node_id FROM node_tags nt
                    JOIN nodes n2 ON n2.id = nt.node_id
                    WHERE nt.tag_id IN ({placeholders})
                      AND n2.deleted_at IS NULL""",  # noqa: S608
                tag_ids,
            )
            for nr in await cursor2.fetchall():
                seen.add(nr["node_id"])
        out.append(
            ProjectSummary(
                hub=NodeRef(id=r["hub_id"], title=r["title"], type=r["type"]),
                mode=r["mode"],
                last_visited_at=r["last_visited_at"],
                note_count=len(seen),
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


async def count_project_notes(db: aiosqlite.Connection, scope: ProjectScope) -> int:
    """Total notes in scope: pinned + tag-membership, deduped, non-deleted.

    Used by `GET /projects` for the per-card note count and by the workspace's
    left-panel scope stats. Slice 0 approximated with the pinned count only;
    Slice 2 unions in tag-tagged notes.
    """
    seen: set[str] = set(scope.pinned_node_ids)
    if scope.tag_ids:
        placeholders = ",".join("?" * len(scope.tag_ids))
        cursor = await db.execute(
            f"""SELECT DISTINCT nt.node_id FROM node_tags nt
                JOIN nodes n ON n.id = nt.node_id
                WHERE nt.tag_id IN ({placeholders})
                  AND n.deleted_at IS NULL""",  # noqa: S608
            scope.tag_ids,
        )
        rows = await cursor.fetchall()
        for r in rows:
            seen.add(r["node_id"])
    return len(seen)


async def project_member_ids(
    db: aiosqlite.Connection, hub_node_id: str, scope: ProjectScope
) -> set[str]:
    """Node ids considered part of the project (ADR-089): pinned nodes, nodes
    carrying any project tag, and story events on the project's timelines (so
    narrative scenes count even though they're attached via COLLECTS, not
    tags)."""
    members: set[str] = set(scope.pinned_node_ids)

    if scope.tag_ids:
        placeholders = ",".join("?" * len(scope.tag_ids))
        cursor = await db.execute(
            f"""SELECT DISTINCT nt.node_id FROM node_tags nt
                JOIN nodes n ON n.id = nt.node_id
                WHERE nt.tag_id IN ({placeholders})
                  AND n.deleted_at IS NULL""",  # noqa: S608
            scope.tag_ids,
        )
        for r in await cursor.fetchall():
            members.add(r["node_id"])

    # Story events on timelines COLLECTS-linked from the hub.
    cursor = await db.execute(
        """SELECT DISTINCT etp.event_node_id
           FROM edges e
           JOIN event_timeline_positions etp ON etp.timeline_node_id = e.to_id
           JOIN nodes n ON n.id = etp.event_node_id
           WHERE e.from_id = ? AND e.type = 'COLLECTS'
             AND n.deleted_at IS NULL""",
        (hub_node_id,),
    )
    for r in await cursor.fetchall():
        members.add(r["event_node_id"])

    return members


async def assemble_threads(
    db: aiosqlite.Connection, hub_node_id: str, scope: ProjectScope
) -> ProjectThreads:
    """Open threads (status:open/developing nodes + unresolved tensions) and
    pending payoffs (planned story events) within the project scope. ADR-089."""
    members = await project_member_ids(db, hub_node_id, scope)
    if not members:
        return ProjectThreads(open_questions=[], pending_payoffs=[], unresolved_tensions=[])

    # Open questions/threads: nodes carrying an open lifecycle status tag.
    status_placeholders = ",".join("?" * len(_OPEN_STATUS_TAGS))
    cursor = await db.execute(
        f"""SELECT n.id, n.title, n.type, n.created_at, t.name AS status_tag
            FROM nodes n
            JOIN node_tags nt ON nt.node_id = n.id
            JOIN tags t ON t.id = nt.tag_id
            WHERE t.name IN ({status_placeholders})
              AND n.deleted_at IS NULL
            ORDER BY n.created_at DESC""",  # noqa: S608
        _OPEN_STATUS_TAGS,
    )
    open_questions = [
        ThreadItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            status=r["status_tag"].split(":", 1)[1],
            created_at=r["created_at"],
        )
        for r in await cursor.fetchall()
        if r["id"] in members
    ]

    # Pending payoffs: planned (not-yet-written) story events.
    cursor = await db.execute(
        """SELECT id, title, type, created_at, prose_status
           FROM nodes
           WHERE is_story_event = 1 AND prose_status = 'planned'
             AND deleted_at IS NULL
           ORDER BY created_at DESC""",
    )
    pending_payoffs = [
        ThreadItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            prose_status=r["prose_status"],
            created_at=r["created_at"],
        )
        for r in await cursor.fetchall()
        if r["id"] in members
    ]

    # Unresolved tensions: CONTRADICTS/QUESTIONS edges, not resolved, with at
    # least one endpoint in the project.
    tension_placeholders = ",".join("?" * len(_TENSION_EDGE_TYPES))
    cursor = await db.execute(
        f"""SELECT e.id AS edge_id, e.type, e.note,
                   fn.id AS from_id, fn.title AS from_title, fn.type AS from_type,
                   tn.id AS to_id, tn.title AS to_title, tn.type AS to_type
            FROM edges e
            JOIN nodes fn ON fn.id = e.from_id AND fn.deleted_at IS NULL
            JOIN nodes tn ON tn.id = e.to_id AND tn.deleted_at IS NULL
            WHERE e.type IN ({tension_placeholders})
              AND e.resolved_at IS NULL
            ORDER BY e.created_at DESC""",  # noqa: S608
        _TENSION_EDGE_TYPES,
    )
    unresolved_tensions = [
        TensionThread(
            edge_id=r["edge_id"],
            type=r["type"],
            note=r["note"],
            from_node=NodeRef(id=r["from_id"], title=r["from_title"], type=r["from_type"]),
            to_node=NodeRef(id=r["to_id"], title=r["to_title"], type=r["to_type"]),
        )
        for r in await cursor.fetchall()
        if r["from_id"] in members or r["to_id"] in members
    ]

    return ProjectThreads(
        open_questions=open_questions,
        pending_payoffs=pending_payoffs,
        unresolved_tensions=unresolved_tensions,
    )


async def coverage_per_tag(db: aiosqlite.Connection, tag_ids: list[str]) -> list[dict]:
    """Per-tag coverage stats: note count and average outgoing edge count.

    Used by the research-mode coverage panel. Returns a list of
    `{tag_id, tag_name, note_count, avg_edges}` dicts ordered thin-to-dense
    by avg_edges. Tags with zero notes are omitted (they wouldn't surface a
    meaningful sub-topic).
    """
    if not tag_ids:
        return []
    placeholders = ",".join("?" * len(tag_ids))
    cursor = await db.execute(
        f"""SELECT t.id AS tag_id, t.name AS tag_name,
                   COUNT(DISTINCT nt.node_id) AS note_count,
                   COALESCE(AVG(
                       (SELECT COUNT(*) FROM edges e WHERE e.from_id = n.id)
                   ), 0) AS avg_edges
            FROM tags t
            JOIN node_tags nt ON nt.tag_id = t.id
            JOIN nodes n ON n.id = nt.node_id
            WHERE t.id IN ({placeholders})
              AND n.deleted_at IS NULL
            GROUP BY t.id, t.name
            HAVING note_count > 0
            ORDER BY avg_edges ASC, note_count ASC""",  # noqa: S608
        tag_ids,
    )
    rows = await cursor.fetchall()
    return [
        {
            "tag_id": r["tag_id"],
            "tag_name": r["tag_name"],
            "note_count": r["note_count"],
            "avg_edges": float(r["avg_edges"]),
        }
        for r in rows
    ]


async def session_wrap_counts(db: aiosqlite.Connection, session_id: str) -> dict[str, int]:
    """Counts for the session-close wrap summary.

    Returns `{nodes_created, edges_created, fleetings_created}` where each
    count is restricted to rows with `session_tagged = 1` (per-philosophy-doc
    §IIIb.6 session bypass: opted-out captures aren't credited to the session).
    """
    cursor = await db.execute(
        """SELECT
              SUM(CASE WHEN n.type IS NOT NULL THEN 1 ELSE 0 END) AS nodes_created,
              SUM(CASE WHEN n.type = 'fleeting' THEN 1 ELSE 0 END) AS fleetings_created
           FROM session_nodes sn
           JOIN nodes n ON n.id = sn.node_id
           WHERE sn.session_id = ? AND sn.session_tagged = 1
             AND n.deleted_at IS NULL""",
        (session_id,),
    )
    n_row = await cursor.fetchone()
    cursor = await db.execute(
        """SELECT COUNT(*) AS edges_created
           FROM session_edges se
           WHERE se.session_id = ? AND se.session_tagged = 1""",
        (session_id,),
    )
    e_row = await cursor.fetchone()
    return {
        "nodes_created": (n_row["nodes_created"] or 0) if n_row else 0,
        "fleetings_created": (n_row["fleetings_created"] or 0) if n_row else 0,
        "edges_created": (e_row["edges_created"] or 0) if e_row else 0,
    }


async def attach_node_to_session(
    db: aiosqlite.Connection,
    *,
    session_id: str,
    node_id: str,
    session_tagged: bool = True,
) -> None:
    """Best-effort attribution row in `session_nodes`. Idempotent."""
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT OR IGNORE INTO session_nodes(
                session_id, node_id, created_at, session_tagged)
           VALUES (?, ?, ?, ?)""",
        (session_id, node_id, now, 1 if session_tagged else 0),
    )
    await db.commit()


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
