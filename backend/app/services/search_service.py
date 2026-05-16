from collections import defaultdict

import aiosqlite

from app.models import NodeSummary, TagRef
from app.providers.base import EmbeddingProvider
from app.repositories import node_repo
from app.services import embedding_service


def rrf_merge(ranked_lists: list[list[str]], k: int = 60) -> list[str]:
    """Reciprocal Rank Fusion over multiple ranked ID lists.

    k=60 is the standard constant from Cormack & Clarke 2009. Higher k
    reduces the impact of top-rank dominance; 60 works well in practice.
    """
    scores: dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for i, node_id in enumerate(ranked):
            scores[node_id] += 1.0 / (k + i + 1)
    return sorted(scores, key=scores.__getitem__, reverse=True)


async def _fetch_summaries(db: aiosqlite.Connection, node_ids: list[str]) -> list[NodeSummary]:
    """Bulk-fetch NodeSummary for an ordered list of IDs, preserving order."""
    if not node_ids:
        return []
    placeholders = ",".join("?" * len(node_ids))
    cursor = await db.execute(
        f"SELECT id, type, title, summary, created_at, updated_at, processed_at"  # noqa: S608
        f" FROM nodes WHERE id IN ({placeholders}) AND deleted_at IS NULL",
        node_ids,
    )
    rows = await cursor.fetchall()
    row_map = {r["id"]: r for r in rows}

    tags_map: dict[str, list[TagRef]] = await node_repo._fetch_tags_bulk(db, node_ids)

    result = []
    for nid in node_ids:
        r = row_map.get(nid)
        if r is None:
            continue
        result.append(
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
        )
    return result


async def semantic_search(
    db: aiosqlite.Connection,
    provider: EmbeddingProvider,
    query: str,
    *,
    limit: int = 20,
) -> list[NodeSummary]:
    vector = await provider.embed(query)
    node_ids = await embedding_service.search_similar(db, vector, limit=limit)
    return await _fetch_summaries(db, node_ids)


async def fulltext_search(
    db: aiosqlite.Connection,
    query: str,
    *,
    limit: int = 20,
) -> list[NodeSummary]:
    node_ids = await node_repo.fts_search(db, q=query, limit=limit)
    return await _fetch_summaries(db, node_ids)


async def hybrid_search(
    db: aiosqlite.Connection,
    provider: EmbeddingProvider,
    query: str,
    *,
    limit: int = 20,
) -> list[NodeSummary]:
    vector = await provider.embed(query)
    semantic_ids, fts_ids = (
        await embedding_service.search_similar(db, vector, limit=limit),
        await node_repo.fts_search(db, q=query, limit=limit),
    )
    merged = rrf_merge([semantic_ids, fts_ids])[:limit]
    return await _fetch_summaries(db, merged)


# ---------------------------------------------------------------------------
# Dedup search (ADR-062)
# ---------------------------------------------------------------------------


def _distance_to_similarity(distance: float) -> float:
    """L2 distance → clamped cosine similarity. Mirrors rag_service helper."""
    sim = 1.0 - (distance * distance) / 2.0
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


async def dedup_search(
    db: aiosqlite.Connection,
    provider: EmbeddingProvider,
    query: str,
    *,
    limit: int = 8,
) -> list[tuple[NodeSummary, float]]:
    """Top-K semantic matches with raw clamped-cosine similarities.

    Distinct from `semantic_search` in that the returned scores are absolute
    similarities (callable against a fixed threshold) rather than rank-
    normalized positions. Used by the capture-modal dedup panel (ADR-062).
    Ordering is by similarity descending.
    """
    vector = await provider.embed(query)
    pairs = await embedding_service.search_similar_with_distances(
        db, vector, limit=limit
    )
    if not pairs:
        return []
    ids = [nid for nid, _ in pairs]
    summaries = await _fetch_summaries(db, ids)
    sim_by_id = {nid: _distance_to_similarity(d) for nid, d in pairs}
    return [(s, sim_by_id[s.id]) for s in summaries if s.id in sim_by_id]
