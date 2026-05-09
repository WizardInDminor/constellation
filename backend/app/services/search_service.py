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
