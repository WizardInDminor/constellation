"""Narrative timeline repository — Phase 9 Slice 4.

Implements the per-timeline join + act-spans CRUD. Story events are
permanent nodes with `is_story_event = 1` (ADR-064); creation goes through
`node_repo.create_permanent` and then this module places the result on a
timeline.

See ADR-065 (per-timeline join + crossover support) and ADR-072 (separate
act_spans table).
"""

import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    ActSpan,
    ActSpanCreate,
    NodeRef,
    TimelineEvent,
    TimelineLane,
)

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
    """
    cursor = await db.execute(
        """SELECT n.id, n.title, n.type, n.story_time,
                  n.prose_status, n.manuscript_location,
                  etp.discourse_position
           FROM event_timeline_positions etp
           JOIN nodes n ON n.id = etp.event_node_id
           WHERE etp.timeline_node_id = ?
             AND n.deleted_at IS NULL
             AND n.is_story_event = 1
           ORDER BY etp.discourse_position ASC""",
        (timeline_node_id,),
    )
    rows = await cursor.fetchall()
    return [
        TimelineEvent(
            node=NodeRef(id=r["id"], title=r["title"], type=r["type"]),
            discourse_position=r["discourse_position"],
            story_time=r["story_time"],
            prose_status=r["prose_status"],
            manuscript_location=r["manuscript_location"],
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
