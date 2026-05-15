import aiosqlite

from app.models import EdgeDetail


async def expand(
    db: aiosqlite.Connection,
    seed_ids: list[str],
    *,
    depth: int = 1,
) -> tuple[list[str], list[str]]:
    """BFS from seed_ids up to `depth` hops.

    Returns (neighbor_ids, traversed_edge_ids).
    neighbor_ids does NOT include seed_ids — the caller already has them.
    Both lists are deduplicated and stable-ordered (discovery order).
    Cycle-safe: visited set prevents re-traversing any node.
    """
    if not seed_ids or depth < 1:
        return [], []

    visited: set[str] = set(seed_ids)
    frontier: set[str] = set(seed_ids)
    neighbor_ids: list[str] = []
    edge_ids: list[str] = []
    seen_edges: set[str] = set()

    for _ in range(depth):
        if not frontier:
            break

        placeholders = ",".join("?" * len(frontier))
        frontier_list = list(frontier)

        # Fetch all edges incident to the current frontier in one query.
        # Both endpoints must belong to non-deleted nodes.
        cursor = await db.execute(
            f"""
            SELECT e.id, e.from_id, e.to_id
            FROM edges e
            JOIN nodes fn ON fn.id = e.from_id AND fn.deleted_at IS NULL
            JOIN nodes tn ON tn.id = e.to_id   AND tn.deleted_at IS NULL
            WHERE e.from_id IN ({placeholders})
               OR e.to_id   IN ({placeholders})
            """,  # noqa: S608
            frontier_list + frontier_list,
        )
        rows = await cursor.fetchall()

        next_frontier: set[str] = set()
        for r in rows:
            eid, from_id, to_id = r["id"], r["from_id"], r["to_id"]
            if eid not in seen_edges:
                seen_edges.add(eid)
                edge_ids.append(eid)

            for nid in (from_id, to_id):
                if nid not in visited:
                    visited.add(nid)
                    neighbor_ids.append(nid)
                    next_frontier.add(nid)

        frontier = next_frontier

    return neighbor_ids, edge_ids


async def fetch_edges_by_ids(db: aiosqlite.Connection, edge_ids: list[str]) -> list[EdgeDetail]:
    """Bulk-fetch EdgeDetail records for a list of IDs."""
    if not edge_ids:
        return []
    placeholders = ",".join("?" * len(edge_ids))
    cursor = await db.execute(
        "SELECT id, from_id, to_id, type, note, classifier_rationale, "
        "resolved_at, resolved_by_node_id, created_at"
        f" FROM edges WHERE id IN ({placeholders})",  # noqa: S608
        edge_ids,
    )
    rows = await cursor.fetchall()
    id_to_row = {r["id"]: r for r in rows}
    return [
        EdgeDetail(
            id=r["id"],
            from_id=r["from_id"],
            to_id=r["to_id"],
            type=r["type"],
            note=r["note"],
            classifier_rationale=r["classifier_rationale"],
            resolved_at=r["resolved_at"],
            resolved_by_node_id=r["resolved_by_node_id"],
            created_at=r["created_at"],
        )
        for eid in edge_ids
        if (r := id_to_row.get(eid)) is not None
    ]
