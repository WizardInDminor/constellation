"""Surface what the user has forgotten or never linked.

Three queries:

- **Orphans** — non-fleeting notes with zero edges (in or out). Pure SQL.
- **Stale** — notes ordered by oldest updated_at first. Pure SQL.
- **Bridges** — pairs of notes with high embedding similarity but no edge yet.
  Reuses the vec0 nearest-neighbour query against each node's stored embedding.

Bridge-finding caps the input set at the most-recently-updated 200 nodes. See
ADR-033 for why we don't precompute or scan the full corpus.
"""

import aiosqlite

from app.models import BridgeCandidate, NodeRef, NodeSummary
from app.repositories import edge_repo, node_repo
from app.services import embedding_service

_BRIDGE_SCAN_LIMIT = 200
_BRIDGE_NEIGHBORS_PER_NODE = 8


async def find_orphans(
    db: aiosqlite.Connection,
    *,
    node_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[NodeSummary]:
    return await node_repo.find_orphans(db, node_type=node_type, limit=limit, offset=offset)


async def find_stale(
    db: aiosqlite.Connection,
    *,
    node_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    exclude_fleeting: bool = True,
) -> list[NodeSummary]:
    return await node_repo.find_stale(
        db,
        node_type=node_type,
        limit=limit,
        offset=offset,
        exclude_fleeting=exclude_fleeting,
    )


def _distance_to_similarity(distance: float) -> float:
    """Convert vec0 L2 distance to a [0, 1] similarity score.

    Voyage and mxbai embeddings are L2-normalized, so for unit vectors
    L2_dist² = 2 - 2·cos_sim, giving cos_sim = 1 - dist²/2 in [-1, 1].
    Clamped to [0, 1] for UX — negative cosine similarity is rare on
    semantically-related notes and noisier than useful.
    """
    sim = 1.0 - (distance * distance) / 2.0
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


async def find_bridges(
    db: aiosqlite.Connection,
    *,
    limit: int = 30,
    min_similarity: float = 0.7,
) -> list[BridgeCandidate]:
    """Find note pairs that look semantically related but have no edge.

    Algorithm: scan the most-recently-updated 200 non-fleeting nodes; for each,
    pull its top 8 nearest neighbours from vec_nodes; drop any pair that already
    has an edge; dedupe (canonical pair order); keep the highest similarity per
    pair; return the top `limit` ordered by similarity descending.
    """
    scan_ids = await node_repo.list_recent_for_bridge_scan(db, limit=_BRIDGE_SCAN_LIMIT)
    scan_set = set(scan_ids)

    # canonical pair (sorted ids) → similarity
    best: dict[tuple[str, str], float] = {}

    for node_id in scan_ids:
        neighbors = await embedding_service.find_similar_to_node(
            db, node_id, limit=_BRIDGE_NEIGHBORS_PER_NODE
        )
        for neighbor_id, distance in neighbors:
            if neighbor_id not in scan_set:
                continue  # only consider pairs where both ends are in scope
            if await edge_repo.exists_between(db, node_id, neighbor_id):
                continue
            similarity = _distance_to_similarity(distance)
            if similarity < min_similarity:
                continue
            key = (node_id, neighbor_id) if node_id < neighbor_id else (neighbor_id, node_id)
            if key not in best or similarity > best[key]:
                best[key] = similarity

    # Resolve to NodeRef pairs, ordered by similarity desc
    sorted_pairs = sorted(best.items(), key=lambda kv: -kv[1])[:limit]
    if not sorted_pairs:
        return []

    needed_ids: set[str] = set()
    for (a, b), _ in sorted_pairs:
        needed_ids.add(a)
        needed_ids.add(b)

    placeholders = ",".join("?" * len(needed_ids))
    cursor = await db.execute(
        f"SELECT id, title, type FROM nodes WHERE id IN ({placeholders}) AND deleted_at IS NULL",  # noqa: S608
        list(needed_ids),
    )
    rows = await cursor.fetchall()
    refs: dict[str, NodeRef] = {
        r["id"]: NodeRef(id=r["id"], title=r["title"], type=r["type"]) for r in rows
    }

    results: list[BridgeCandidate] = []
    for (a, b), sim in sorted_pairs:
        if a in refs and b in refs:
            results.append(BridgeCandidate(node_a=refs[a], node_b=refs[b], similarity=sim))
    return results
