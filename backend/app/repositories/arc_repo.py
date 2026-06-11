"""Entity Arc assembly (Phase C, ADR-081).

Derives an entity's evolution-over-time purely from existing data: the nodes it
connects to, those nodes' timeline discourse positions / created_at timestamps,
and the per-edge note (read as the interpretation at that appearance). No schema
change. Works for any node — symbol, character, theme, world rule, open
question, research concept, learning topic.
"""

import aiosqlite

from app.models import ArcAppearance, EntityArc, NodeRef

# Sentinel used to push story events with no timeline position to the end of the
# timeline-ordered group while keeping them ahead of non-event appearances.
_NO_POSITION = 1_000_000_000


def ordering_basis(is_story_event_flags: list[bool]) -> str:
    """Which clock orders the arc: 'timeline' when every appearance is a story
    event, 'chronological' when none are, else 'mixed'. Pure."""
    if not is_story_event_flags:
        return "chronological"
    if all(is_story_event_flags):
        return "timeline"
    if any(is_story_event_flags):
        return "mixed"
    return "chronological"


def sort_appearance_rows(rows: list[dict]) -> list[dict]:
    """Order appearances chronologically. Pure.

    Story events sort first by their timeline `discourse_position` (the
    narrative clock); everything else sorts by `created_at` (the knowledge
    clock). ISO-8601 `created_at` strings compare lexicographically.
    """

    def key(row: dict):
        is_event = bool(row["is_story_event"])
        if is_event:
            dp = row["discourse_position"]
            return (0, dp if dp is not None else _NO_POSITION, row["created_at"])
        return (1, 0, row["created_at"])

    return sorted(rows, key=key)


async def assemble(db: aiosqlite.Connection, node_id: str) -> EntityArc | None:
    """Build the EntityArc for `node_id`, or None if the node doesn't exist."""
    cursor = await db.execute(
        "SELECT id, title, type FROM nodes WHERE id = ? AND deleted_at IS NULL",
        (node_id,),
    )
    entity_row = await cursor.fetchone()
    if entity_row is None:
        return None

    # One query for every neighbour (either edge direction) with the metadata
    # needed to order it and classify pending payoffs. The MIN() subquery gives
    # the neighbour's earliest timeline position across any timeline it sits on.
    cursor = await db.execute(
        """SELECT e.id AS edge_id, e.type AS edge_type, e.note,
                  CASE WHEN e.from_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
                  n.id AS nid, n.title, n.type AS ntype, n.created_at,
                  n.is_story_event, n.story_time, n.prose_status,
                  (SELECT MIN(discourse_position)
                     FROM event_timeline_positions etp
                    WHERE etp.event_node_id = n.id) AS discourse_position
           FROM edges e
           JOIN nodes n
             ON n.id = CASE WHEN e.from_id = ? THEN e.to_id ELSE e.from_id END
           WHERE (e.from_id = ? OR e.to_id = ?)
             AND n.deleted_at IS NULL""",
        (node_id, node_id, node_id, node_id),
    )
    rows = [dict(r) for r in await cursor.fetchall()]
    ordered = sort_appearance_rows(rows)

    appearances = [
        ArcAppearance(
            node=NodeRef(id=r["nid"], title=r["title"], type=r["ntype"]),
            edge_id=r["edge_id"],
            edge_type=r["edge_type"],
            direction=r["direction"],
            meaning=r["note"],
            story_time=r["story_time"],
            discourse_position=r["discourse_position"],
            prose_status=r["prose_status"],
            created_at=r["created_at"],
            is_pending=bool(r["is_story_event"]) and r["prose_status"] == "planned",
        )
        for r in ordered
    ]

    return EntityArc(
        entity=NodeRef(id=entity_row["id"], title=entity_row["title"], type=entity_row["type"]),
        ordering_basis=ordering_basis([bool(r["is_story_event"]) for r in ordered]),
        appearances=appearances,
        pending_count=sum(1 for a in appearances if a.is_pending),
    )
