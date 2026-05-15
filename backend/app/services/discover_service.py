"""Surface what the user has forgotten or never linked.

Three queries:

- **Orphans** — non-fleeting notes with zero edges (in or out). Pure SQL.
- **Stale** — notes ordered by oldest updated_at first. Pure SQL.
- **Bridges** — pairs of notes with high embedding similarity but no edge yet.
  Reuses the vec0 nearest-neighbour query against each node's stored embedding.

Bridge-finding caps the input set at the most-recently-updated 200 nodes. See
ADR-033 for why we don't precompute or scan the full corpus.
"""

import json
import logging
import re

import aiosqlite

from app.models import BridgeCandidate, BridgeClassification, NodeDetail, NodeRef, NodeSummary
from app.models.edge import EdgeType
from app.providers.base import GenerationProvider
from app.repositories import edge_repo, node_repo
from app.services import embedding_service, generation_service

_BRIDGE_SCAN_LIMIT = 200
_BRIDGE_NEIGHBORS_PER_NODE = 8

_log = logging.getLogger(__name__)

_CLASSIFY_BRIDGE_SYSTEM = """\
You are a zettelkasten assistant. The user will give you two notes from their \
knowledge base that share high embedding similarity but have no edge between \
them. Your job is to decide whether a real conceptual relationship exists \
between them, and if so, recommend a single best edge type and direction.

Edge types (all are directional except ANALOGOUS_TO, which is symmetric):
  SUPPORTS     — A provides evidence or argument for B
  CONTRADICTS  — A is in tension with B
  ELABORATES   — A zooms in on one aspect of B
  ANALOGOUS_TO — A and B share structural similarity, often across domains
  QUESTIONS    — A raises a problem with or about B
  INSPIRED_BY  — A is a looser creative or associative offshoot of B
  COLLECTS     — A (a structure note / MOC) includes B in its map
  CITES        — A references B as a specific reference (footnote-shaped, not curatorial)
  BUILDS_ON    — A advances or extends B's framework
  APPLIES_TO   — A applies B's idea to a new domain or instance
  MEASURES     — A is an empirical measurement of B's claim or quantity
  EXTENDS      — A adds scope or generality to B (dimension-ward rather than depth-ward)
  REFINES      — A sharpens or specializes B without contradicting it

Surface similarity is not enough. If both notes happen to share vocabulary or \
domain but have no real conceptual connection, return NO_CONNECTION. It is \
better to honestly reject a coincidence than invent a weak link.

When a connection exists, pick the SINGLE most fitting edge type. Identify which \
note is the source (`from_id`) and which is the target (`to_id`); for \
ANALOGOUS_TO, the choice is arbitrary — pick either. Provide a one- or \
two-sentence rationale that names the specific shared idea, not generic \
similarity.

Return ONLY valid JSON — no markdown fences, no commentary. One of:
  {"no_connection": false, "edge_type": "SUPPORTS",
   "from_id": "...", "to_id": "...", "rationale": "..."}
  {"no_connection": true, "rationale": "..."}\
"""


def _format_pair_user_message(a: NodeDetail, b: NodeDetail) -> str:
    return (
        f"NOTE A:\n  node_id: {a.id}\n  Title: {a.title}\n  Content: {a.content}"
        f"\n\nNOTE B:\n  node_id: {b.id}\n  Title: {b.title}\n  Content: {b.content}"
    )


def _parse_classification(raw: str, *, allowed_ids: set[str]) -> BridgeClassification:
    """Parse Claude's JSON response. Raises ValueError on unparseable output.

    `allowed_ids` is the {a.id, b.id} set; we reject `from_id`/`to_id` that
    aren't one of the pair to guard against model hallucination.
    """
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        cleaned = match.group()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not decode JSON: {exc}") from exc

    no_connection = bool(data.get("no_connection", False))
    rationale = str(data.get("rationale", "")).strip()

    if no_connection:
        return BridgeClassification(no_connection=True, rationale=rationale)

    edge_type_raw = data.get("edge_type")
    from_id = data.get("from_id")
    to_id = data.get("to_id")

    if edge_type_raw not in EdgeType.__args__:  # type: ignore[attr-defined]
        raise ValueError(f"Unknown edge_type: {edge_type_raw!r}")
    if from_id not in allowed_ids or to_id not in allowed_ids:
        raise ValueError(f"from_id/to_id ({from_id!r}, {to_id!r}) not in the supplied pair")
    if from_id == to_id:
        raise ValueError("from_id and to_id must differ")

    return BridgeClassification(
        no_connection=False,
        edge_type=edge_type_raw,
        from_id=from_id,
        to_id=to_id,
        rationale=rationale,
    )


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
    cross_tag: bool = False,
) -> list[BridgeCandidate]:
    """Find note pairs that look semantically related but have no edge.

    Algorithm: scan the most-recently-updated 200 non-fleeting nodes; for each,
    pull its top 8 nearest neighbours from vec_nodes; drop any pair that already
    has an edge; dedupe (canonical pair order); keep the highest similarity per
    pair; return the top `limit` ordered by similarity descending.

    When `cross_tag=True`, drop pairs whose endpoints share any tag — i.e.
    surface only "across the tag boundary" candidates. Filter is applied
    before the limit so the result count reflects actual cross-tag pairs.
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

    if not best:
        return []

    # cross_tag filter: drop pairs whose endpoints share any tag. Fetch tag-id
    # sets for involved nodes in a single query, then apply before the limit so
    # the user sees an accurate cross-tag result count.
    if cross_tag:
        involved_ids = {nid for pair in best for nid in pair}
        placeholders = ",".join("?" * len(involved_ids))
        cursor = await db.execute(
            f"SELECT node_id, tag_id FROM node_tags WHERE node_id IN ({placeholders})",  # noqa: S608
            list(involved_ids),
        )
        tag_rows = await cursor.fetchall()
        tags_by_node: dict[str, set[str]] = {}
        for r in tag_rows:
            tags_by_node.setdefault(r["node_id"], set()).add(r["tag_id"])
        best = {
            (a, b): sim
            for (a, b), sim in best.items()
            if not (tags_by_node.get(a, set()) & tags_by_node.get(b, set()))
        }
        if not best:
            return []

    # Resolve to NodeRef pairs, ordered by similarity desc
    sorted_pairs = sorted(best.items(), key=lambda kv: -kv[1])[:limit]

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


async def classify_pair(
    db: aiosqlite.Connection,
    gen_provider: GenerationProvider,
    *,
    node_a_id: str,
    node_b_id: str,
) -> BridgeClassification:
    """Ask Claude to evaluate whether two notes share a meaningful edge.

    Returns a BridgeClassification with either (a) a recommended edge_type +
    direction + rationale, or (b) `no_connection=True` if Claude rejects the
    apparent similarity as surface coincidence.

    Raises ValueError on unparseable model output (the route layer translates
    this to HTTP 500, consistent with `/rag/suggest-links`).
    """
    a = await node_repo.get_by_id(db, node_a_id)
    b = await node_repo.get_by_id(db, node_b_id)
    if a is None or b is None:
        raise LookupError("One or both notes not found")

    messages = [{"role": "user", "content": _format_pair_user_message(a, b)}]
    raw = await generation_service.complete(
        gen_provider, messages, _CLASSIFY_BRIDGE_SYSTEM, max_tokens=512
    )

    try:
        return _parse_classification(raw, allowed_ids={a.id, b.id})
    except ValueError:
        _log.error("Unparseable classify-bridge response: %r", raw)
        raise
