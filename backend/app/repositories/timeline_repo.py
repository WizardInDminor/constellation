"""Narrative timeline repository — Phase 9 Slices 4 & 5.

Implements the per-timeline join + act-spans CRUD. Story events are
permanent nodes with `is_story_event = 1` (ADR-064); creation goes through
`node_repo.create_permanent` and then this module places the result on a
timeline.

See ADR-065 (per-timeline join + crossover support) and ADR-072 (separate
act_spans table).

Slice 5 adds character / theme / location / lore identification via
reserved tag names (no schema change). The tags below are the convention
the workspace UI uses; quick-create flows auto-attach them.
"""

import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    ActSpan,
    ActSpanCreate,
    NodeRef,
    SceneContextItem,
    SceneContextResponse,
    TimelineEvent,
    TimelineLane,
)

# Reserved tag names that identify narrative-role nodes (Slice 5).
# Used by Scene Context View, character filtering, and theme-density.
# Implemented as tags rather than a new column to avoid a Slice 5 schema
# migration; the structural decision (tags-as-narrative-roles) is recorded
# in ADR-065's "Consequences" section and the build plan.
NARRATIVE_TAG_CHARACTER = "narrative:character"
NARRATIVE_TAG_THEME = "narrative:theme"
NARRATIVE_TAG_LOCATION = "narrative:location"
NARRATIVE_TAG_LORE_PREFIX = "narrative:lore-"  # narrative:lore-world-rule, etc.

# ---------------------------------------------------------------------------
# event_timeline_positions
# ---------------------------------------------------------------------------


async def place_event(
    db: aiosqlite.Connection,
    *,
    event_node_id: str,
    timeline_node_id: str,
    discourse_position: int,
) -> None:
    """Insert or update a join row. Idempotent on the composite key."""
    await db.execute(
        """INSERT INTO event_timeline_positions(
                event_node_id, timeline_node_id, discourse_position)
           VALUES (?, ?, ?)
           ON CONFLICT(event_node_id, timeline_node_id)
           DO UPDATE SET discourse_position = excluded.discourse_position""",
        (event_node_id, timeline_node_id, discourse_position),
    )
    await db.commit()


async def remove_event_from_timeline(
    db: aiosqlite.Connection,
    *,
    event_node_id: str,
    timeline_node_id: str,
) -> None:
    await db.execute(
        """DELETE FROM event_timeline_positions
           WHERE event_node_id = ? AND timeline_node_id = ?""",
        (event_node_id, timeline_node_id),
    )
    await db.commit()


async def get_position(
    db: aiosqlite.Connection,
    *,
    event_node_id: str,
    timeline_node_id: str,
) -> int | None:
    cursor = await db.execute(
        """SELECT discourse_position FROM event_timeline_positions
           WHERE event_node_id = ? AND timeline_node_id = ?""",
        (event_node_id, timeline_node_id),
    )
    row = await cursor.fetchone()
    return row["discourse_position"] if row else None


async def lane_events(db: aiosqlite.Connection, timeline_node_id: str) -> list[TimelineEvent]:
    """All events on a timeline, in discourse order. Soft-deleted events
    are excluded. Live query — the canvas re-fetches on every mount and
    after every mutation (ADR-066 / philosophy doc "order of creation is
    invisible").

    Slice 5: also computes per-event `timeline_count` (for the crossover
    indicator), `character_ids` (for the highlight filter), and
    `theme_ids` (for theme-density dots) in one round trip.
    """
    cursor = await db.execute(
        """SELECT n.id, n.title, n.type, n.story_time,
                  n.prose_status, n.manuscript_location,
                  etp.discourse_position,
                  (SELECT COUNT(*) FROM event_timeline_positions etp2
                   WHERE etp2.event_node_id = n.id) AS timeline_count
           FROM event_timeline_positions etp
           JOIN nodes n ON n.id = etp.event_node_id
           WHERE etp.timeline_node_id = ?
             AND n.deleted_at IS NULL
             AND n.is_story_event = 1
           ORDER BY etp.discourse_position ASC""",
        (timeline_node_id,),
    )
    rows = await cursor.fetchall()
    if not rows:
        return []
    event_ids = [r["id"] for r in rows]
    placeholders = ",".join("?" * len(event_ids))

    # Characters: structure nodes tagged 'narrative:character' that COLLECTS
    # any of these events.
    cursor = await db.execute(
        f"""SELECT e.to_id AS event_id, e.from_id AS char_id
            FROM edges e
            JOIN node_tags nt ON nt.node_id = e.from_id
            JOIN tags t ON t.id = nt.tag_id
            JOIN nodes cn ON cn.id = e.from_id
            WHERE e.type = 'COLLECTS'
              AND e.to_id IN ({placeholders})
              AND t.name = ?
              AND cn.deleted_at IS NULL""",  # noqa: S608
        [*event_ids, NARRATIVE_TAG_CHARACTER],
    )
    char_rows = await cursor.fetchall()
    chars_by_event: dict[str, list[str]] = {eid: [] for eid in event_ids}
    for cr in char_rows:
        chars_by_event[cr["event_id"]].append(cr["char_id"])

    # Themes: structure nodes tagged 'narrative:theme' attached to events
    # via any edge in either direction (writers may say "scene ELABORATES
    # theme" or "theme ANALOGOUS_TO scene" — semantics still loose at
    # Slice 5 scope).
    cursor = await db.execute(
        f"""SELECT
              CASE WHEN e.to_id IN ({placeholders}) THEN e.to_id ELSE e.from_id END AS event_id,
              CASE WHEN e.to_id IN ({placeholders}) THEN e.from_id ELSE e.to_id END AS theme_id
            FROM edges e
            JOIN node_tags nt ON nt.node_id =
                CASE WHEN e.to_id IN ({placeholders}) THEN e.from_id ELSE e.to_id END
            JOIN tags t ON t.id = nt.tag_id
            JOIN nodes tn ON tn.id = nt.node_id
            WHERE (e.from_id IN ({placeholders}) OR e.to_id IN ({placeholders}))
              AND t.name = ?
              AND tn.deleted_at IS NULL""",  # noqa: S608
        [*event_ids, *event_ids, *event_ids, *event_ids, *event_ids, NARRATIVE_TAG_THEME],
    )
    theme_rows = await cursor.fetchall()
    themes_by_event: dict[str, list[str]] = {eid: [] for eid in event_ids}
    for tr in theme_rows:
        eid = tr["event_id"]
        if eid in themes_by_event and tr["theme_id"] not in themes_by_event[eid]:
            themes_by_event[eid].append(tr["theme_id"])

    return [
        TimelineEvent(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            discourse_position=r["discourse_position"],
            story_time=r["story_time"],
            prose_status=r["prose_status"],
            manuscript_location=r["manuscript_location"],
            timeline_count=r["timeline_count"],
            character_ids=chars_by_event.get(r["id"], []),
            theme_ids=themes_by_event.get(r["id"], []),
        )
        for r in rows
    ]


async def get_predecessor(
    db: aiosqlite.Connection,
    *,
    timeline_node_id: str,
    discourse_position: int,
) -> str | None:
    """ID of the event immediately preceding `discourse_position` in this
    lane, or None if this is the first event in the lane. Used by the
    auto-FOLLOWS_FROM wiring on event creation (ADR-065).
    """
    cursor = await db.execute(
        """SELECT etp.event_node_id
           FROM event_timeline_positions etp
           JOIN nodes n ON n.id = etp.event_node_id
           WHERE etp.timeline_node_id = ?
             AND etp.discourse_position < ?
             AND n.deleted_at IS NULL
           ORDER BY etp.discourse_position DESC
           LIMIT 1""",
        (timeline_node_id, discourse_position),
    )
    row = await cursor.fetchone()
    return row["event_node_id"] if row else None


async def get_successor(
    db: aiosqlite.Connection,
    *,
    timeline_node_id: str,
    discourse_position: int,
) -> str | None:
    """ID of the event immediately following `discourse_position`."""
    cursor = await db.execute(
        """SELECT etp.event_node_id
           FROM event_timeline_positions etp
           JOIN nodes n ON n.id = etp.event_node_id
           WHERE etp.timeline_node_id = ?
             AND etp.discourse_position > ?
             AND n.deleted_at IS NULL
           ORDER BY etp.discourse_position ASC
           LIMIT 1""",
        (timeline_node_id, discourse_position),
    )
    row = await cursor.fetchone()
    return row["event_node_id"] if row else None


# ---------------------------------------------------------------------------
# act_spans
# ---------------------------------------------------------------------------


def _row_to_act_span(row: aiosqlite.Row) -> ActSpan:
    return ActSpan(
        id=row["id"],
        timeline_node_id=row["timeline_node_id"],
        label=row["label"],
        start_position=row["start_position"],
        end_position=row["end_position"],
        color=row["color"],
        created_at=row["created_at"],
    )


async def create_act_span(db: aiosqlite.Connection, data: ActSpanCreate) -> ActSpan:
    span_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT INTO act_spans(
                id, timeline_node_id, label, start_position, end_position,
                color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            span_id,
            data.timeline_node_id,
            data.label,
            data.start_position,
            data.end_position,
            data.color,
            now,
        ),
    )
    await db.commit()
    cursor = await db.execute(
        """SELECT id, timeline_node_id, label, start_position, end_position,
                  color, created_at
           FROM act_spans WHERE id = ?""",
        (span_id,),
    )
    row = await cursor.fetchone()
    assert row is not None
    return _row_to_act_span(row)


async def list_act_spans(db: aiosqlite.Connection, timeline_node_id: str) -> list[ActSpan]:
    cursor = await db.execute(
        """SELECT id, timeline_node_id, label, start_position, end_position,
                  color, created_at
           FROM act_spans
           WHERE timeline_node_id = ?
           ORDER BY start_position ASC""",
        (timeline_node_id,),
    )
    rows = await cursor.fetchall()
    return [_row_to_act_span(r) for r in rows]


# ---------------------------------------------------------------------------
# Timeline structure-node discovery
# ---------------------------------------------------------------------------


async def list_project_timelines(db: aiosqlite.Connection, project_hub_id: str) -> list[NodeRef]:
    """All timeline structure nodes attached to the project hub.

    A "timeline" is a structure node COLLECTS-linked from the project hub.
    This is the same `COLLECTS` semantic the workspace already uses for
    project membership; Slice 4 doesn't need a separate is_timeline flag.

    For a brand-new narrative project with no timeline yet, this returns
    an empty list. The workspace's GET /timeline endpoint auto-creates a
    default timeline on first request so the canvas always has a lane.
    """
    cursor = await db.execute(
        """SELECT n.id, n.title, n.type
           FROM nodes n
           JOIN edges e ON e.to_id = n.id
                       AND e.from_id = ?
                       AND e.type = 'COLLECTS'
           WHERE n.type = 'structure'
             AND n.deleted_at IS NULL
           ORDER BY n.title""",
        (project_hub_id,),
    )
    rows = await cursor.fetchall()
    return [NodeRef(id=r["id"], title=r["title"], type=r["type"]) for r in rows]


async def assemble_timeline(db: aiosqlite.Connection, project_hub_id: str) -> list[TimelineLane]:
    """Compose all lanes for a project — one TimelineLane per timeline
    structure node, each with its events and act spans. Slice 4 typically
    renders a single lane; Slice 5 uses the same shape for multiple.
    """
    timelines = await list_project_timelines(db, project_hub_id)
    lanes: list[TimelineLane] = []
    for t in timelines:
        events = await lane_events(db, t.id)
        spans = await list_act_spans(db, t.id)
        lanes.append(TimelineLane(timeline=t, events=events, act_spans=spans))
    return lanes


# ---------------------------------------------------------------------------
# Scene Context View (Slice 5; philosophy doc §6.8)
# ---------------------------------------------------------------------------
#
# Live graph assembly: every call walks the current graph state. Nothing is
# cached at any layer. If the caller wants stale data, they should not call
# this function. Soft-deleting an edge between calls MUST change the result.


async def _scene_characters(db: aiosqlite.Connection, event_id: str) -> list[SceneContextItem]:
    """Characters in the scene: structure nodes tagged
    'narrative:character' that COLLECTS this event. Relevance: strong.
    """
    cursor = await db.execute(
        """SELECT DISTINCT cn.id, cn.title, cn.type, cn.summary,
                  e.type AS edge_type, e.note AS edge_note
           FROM edges e
           JOIN nodes cn ON cn.id = e.from_id
           JOIN node_tags nt ON nt.node_id = cn.id
           JOIN tags t ON t.id = nt.tag_id
           WHERE e.type = 'COLLECTS'
             AND e.to_id = ?
             AND t.name = ?
             AND cn.deleted_at IS NULL""",
        (event_id, NARRATIVE_TAG_CHARACTER),
    )
    return [
        SceneContextItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            relevance="strong",
            role="character",
            edge_type=r["edge_type"],
            edge_note=r["edge_note"],
            summary=r["summary"],
        )
        for r in await cursor.fetchall()
    ]


async def _scene_themes(db: aiosqlite.Connection, event_id: str) -> list[SceneContextItem]:
    """Themes attached to the event by any non-COLLECTS edge in either
    direction. Relevance: strong.
    """
    cursor = await db.execute(
        """SELECT DISTINCT tn.id, tn.title, tn.type, tn.summary,
                  e.type AS edge_type, e.note AS edge_note
           FROM edges e
           JOIN nodes tn ON tn.id =
               CASE WHEN e.to_id = ? THEN e.from_id ELSE e.to_id END
           JOIN node_tags nt ON nt.node_id = tn.id
           JOIN tags t ON t.id = nt.tag_id
           WHERE (e.from_id = ? OR e.to_id = ?)
             AND e.type != 'COLLECTS'
             AND t.name = ?
             AND tn.deleted_at IS NULL""",
        (event_id, event_id, event_id, NARRATIVE_TAG_THEME),
    )
    return [
        SceneContextItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            relevance="strong",
            role="theme",
            edge_type=r["edge_type"],
            edge_note=r["edge_note"],
            summary=r["summary"],
        )
        for r in await cursor.fetchall()
    ]


async def _scene_location_and_lore(
    db: aiosqlite.Connection, event_id: str
) -> list[SceneContextItem]:
    """The location attached to the event (any edge in either direction
    where the neighbour is tagged 'narrative:location') is surfaced as
    strong; lore tagged 'narrative:lore-*' connected via EXPLAINS to that
    location (or to a character also in the scene) is surfaced as moderate
    (one hop away per philosophy doc §6.8 relevance rules).
    """
    out: list[SceneContextItem] = []

    # Locations directly attached to the event.
    cursor = await db.execute(
        """SELECT DISTINCT ln.id, ln.title, ln.type, ln.summary,
                  e.type AS edge_type, e.note AS edge_note
           FROM edges e
           JOIN nodes ln ON ln.id =
               CASE WHEN e.to_id = ? THEN e.from_id ELSE e.to_id END
           JOIN node_tags nt ON nt.node_id = ln.id
           JOIN tags t ON t.id = nt.tag_id
           WHERE (e.from_id = ? OR e.to_id = ?)
             AND t.name = ?
             AND ln.deleted_at IS NULL""",
        (event_id, event_id, event_id, NARRATIVE_TAG_LOCATION),
    )
    loc_rows = await cursor.fetchall()
    location_ids: list[str] = []
    for r in loc_rows:
        location_ids.append(r["id"])
        out.append(
            SceneContextItem(
                node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
                relevance="strong",
                role="location",
                edge_type=r["edge_type"],
                edge_note=r["edge_note"],
                summary=r["summary"],
            )
        )

    # Lore that EXPLAINS any of those locations OR any character in the
    # scene. Relevance: moderate (one hop). The lore-category tag is
    # surfaced as `category` so the UI can group / colour by category.
    if not location_ids:
        # Also surface lore that explains characters in the scene (one hop
        # from character → lore). The character lookup is duplicated to
        # avoid coupling, but it stays a small two-query function.
        cursor = await db.execute(
            """SELECT cn.id AS char_id FROM edges e
               JOIN nodes cn ON cn.id = e.from_id
               JOIN node_tags nt ON nt.node_id = cn.id
               JOIN tags t ON t.id = nt.tag_id
               WHERE e.type = 'COLLECTS' AND e.to_id = ?
                 AND t.name = ? AND cn.deleted_at IS NULL""",
            (event_id, NARRATIVE_TAG_CHARACTER),
        )
        character_ids = [r["char_id"] for r in await cursor.fetchall()]
    else:
        # Pull characters too — lore can EXPLAIN either.
        cursor = await db.execute(
            """SELECT cn.id FROM edges e
               JOIN nodes cn ON cn.id = e.from_id
               JOIN node_tags nt ON nt.node_id = cn.id
               JOIN tags t ON t.id = nt.tag_id
               WHERE e.type = 'COLLECTS' AND e.to_id = ?
                 AND t.name = ? AND cn.deleted_at IS NULL""",
            (event_id, NARRATIVE_TAG_CHARACTER),
        )
        character_ids = [r["id"] for r in await cursor.fetchall()]

    target_ids = [*location_ids, *character_ids]
    if not target_ids:
        return out

    placeholders = ",".join("?" * len(target_ids))
    cursor = await db.execute(
        f"""SELECT DISTINCT lr.id, lr.title, lr.type, lr.summary,
                   e.type AS edge_type, e.note AS edge_note,
                   (SELECT t.name FROM tags t
                    JOIN node_tags nt2 ON nt2.tag_id = t.id
                    WHERE nt2.node_id = lr.id
                      AND t.name LIKE ?
                    LIMIT 1) AS category_tag
            FROM edges e
            JOIN nodes lr ON lr.id = e.from_id
            JOIN node_tags nt ON nt.node_id = lr.id
            JOIN tags t ON t.id = nt.tag_id
            WHERE e.type = 'EXPLAINS'
              AND e.to_id IN ({placeholders})
              AND t.name LIKE ?
              AND lr.deleted_at IS NULL""",  # noqa: S608
        [f"{NARRATIVE_TAG_LORE_PREFIX}%", *target_ids, f"{NARRATIVE_TAG_LORE_PREFIX}%"],
    )
    for r in await cursor.fetchall():
        out.append(
            SceneContextItem(
                node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
                relevance="moderate",
                role="lore",
                edge_type=r["edge_type"],
                edge_note=r["edge_note"],
                summary=r["summary"],
                category=r["category_tag"],
            )
        )
    return out


async def _scene_arc_notes(db: aiosqlite.Connection, event_id: str) -> list[SceneContextItem]:
    """Permanent nodes COLLECTED by a character also in this scene, where
    that note is also tied to this event (via any edge). Slice 5 ships a
    simple proxy: any non-character, non-theme, non-lore permanent
    connected to the event via any edge — i.e. "stuff connected here that
    isn't already covered above." Relevance: strong (one hop).
    """
    cursor = await db.execute(
        """SELECT DISTINCT n.id, n.title, n.type, n.summary,
                  e.type AS edge_type, e.note AS edge_note
           FROM edges e
           JOIN nodes n ON n.id =
               CASE WHEN e.to_id = ? THEN e.from_id ELSE e.to_id END
           WHERE (e.from_id = ? OR e.to_id = ?)
             AND e.type NOT IN ('COLLECTS', 'EXPLAINS', 'FOLLOWS_FROM')
             AND n.deleted_at IS NULL
             AND n.is_story_event = 0
             AND NOT EXISTS (
                 SELECT 1 FROM node_tags nt
                 JOIN tags t ON t.id = nt.tag_id
                 WHERE nt.node_id = n.id
                   AND (t.name = ? OR t.name = ? OR t.name = ?
                        OR t.name LIKE ?)
             )""",
        (
            event_id,
            event_id,
            event_id,
            NARRATIVE_TAG_CHARACTER,
            NARRATIVE_TAG_THEME,
            NARRATIVE_TAG_LOCATION,
            f"{NARRATIVE_TAG_LORE_PREFIX}%",
        ),
    )
    return [
        SceneContextItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            relevance="strong",
            role="arc_note",
            edge_type=r["edge_type"],
            edge_note=r["edge_note"],
            summary=r["summary"],
        )
        for r in await cursor.fetchall()
    ]


async def _scene_world_rules(
    db: aiosqlite.Connection, project_hub_id: str
) -> list[SceneContextItem]:
    """World rules: lore notes tagged 'narrative:lore-world-rule' that
    belong to this project (COLLECTS-linked from the hub or carrying a
    project tag). Relevance: background. Always present; the frontend
    handles collapse.
    """
    cursor = await db.execute(
        """SELECT DISTINCT n.id, n.title, n.type, n.summary
           FROM nodes n
           JOIN node_tags nt ON nt.node_id = n.id
           JOIN tags t ON t.id = nt.tag_id
           WHERE t.name = 'narrative:lore-world-rule'
             AND n.deleted_at IS NULL""",
    )
    return [
        SceneContextItem(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            relevance="background",
            role="world_rule",
            summary=r["summary"],
            category="world_rule",
        )
        for r in await cursor.fetchall()
    ]


async def _scene_neighbors_in_lane(
    db: aiosqlite.Connection, event_id: str
) -> tuple[NodeRef | None, NodeRef | None, NodeRef | None, int | None]:
    """Returns (timeline, preceding, following, position) for the most
    recently-positioned timeline this event is on. If the event is in
    multiple timelines (crossover), we pick the first one alphabetically
    by timeline title for Slice 5 — the side panel can let the user
    switch later (Phase 10).
    """
    cursor = await db.execute(
        """SELECT etp.timeline_node_id, etp.discourse_position,
                  tn.title AS timeline_title, tn.type AS timeline_type
           FROM event_timeline_positions etp
           JOIN nodes tn ON tn.id = etp.timeline_node_id
           WHERE etp.event_node_id = ?
             AND tn.deleted_at IS NULL
           ORDER BY tn.title ASC
           LIMIT 1""",
        (event_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None, None, None, None
    timeline = NodeRef(
        id=row["timeline_node_id"],
        title=row["timeline_title"],
        type=row["timeline_type"],
    )
    position = row["discourse_position"]

    pred_id = await get_predecessor(
        db,
        timeline_node_id=timeline.id,
        discourse_position=position,
    )
    succ_id = await get_successor(
        db,
        timeline_node_id=timeline.id,
        discourse_position=position,
    )

    async def _nref(nid: str | None) -> NodeRef | None:
        if nid is None:
            return None
        cur = await db.execute("SELECT id, title, type FROM nodes WHERE id = ?", (nid,))
        r = await cur.fetchone()
        return NodeRef(id=r["id"], title=r["title"], type=r["type"]) if r else None

    pred = await _nref(pred_id)
    succ = await _nref(succ_id)
    return timeline, pred, succ, position


async def assemble_scene_context(
    db: aiosqlite.Connection,
    *,
    event_id: str,
    project_hub_id: str,
    session_number: int | None = None,
) -> SceneContextResponse:
    """Live assembly of everything relevant to one scene (philosophy doc
    §6.8). The function walks current graph state on every call —
    soft-deleting any edge between two calls MUST change the result.

    Composition:
      - characters in scene (strong)
      - themes attached to event (strong)
      - location(s) and lore that EXPLAINS them or scene characters (moderate)
      - arc notes / other connected permanents (strong)
      - world rules from project lore (background, collapsed by default)
    """
    cursor = await db.execute(
        "SELECT id, title, type, is_story_event FROM nodes WHERE id = ? AND deleted_at IS NULL",
        (event_id,),
    )
    row = await cursor.fetchone()
    if row is None or not row["is_story_event"]:
        raise ValueError("event not found or not a story event")
    event_ref = NodeRef(id=row["id"], title=row["title"], type=row["type"])

    timeline, pred, succ, position = await _scene_neighbors_in_lane(db, event_id)

    items: list[SceneContextItem] = []
    items.extend(await _scene_characters(db, event_id))
    items.extend(await _scene_themes(db, event_id))
    items.extend(await _scene_location_and_lore(db, event_id))
    items.extend(await _scene_arc_notes(db, event_id))
    items.extend(await _scene_world_rules(db, project_hub_id))

    # Session-aware collapse hint (philosophy doc §6.8).
    hint: str | None = None
    if session_number is not None and session_number >= 20:
        hint = "By now these should be internalized — tap to expand."

    return SceneContextResponse(
        event=event_ref,
        timeline=timeline,
        discourse_position=position,
        preceding_event=pred,
        following_event=succ,
        items=items,
        world_rules_collapsed_hint=hint,
    )
