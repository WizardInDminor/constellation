from fastapi import APIRouter, HTTPException

from app.core.deps import DB, EmbedProvider
from app.models.search import (
    DedupRequest,
    DedupResponse,
    DedupResult,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


def _scored(summaries, /) -> list[SearchResult]:
    """Attach rank-normalized scores (1.0 for rank 1, descending to ~0)."""
    n = len(summaries)
    return [
        SearchResult(node=s, score=round(1.0 - i / max(n, 1), 4)) for i, s in enumerate(summaries)
    ]


@router.post("/semantic")
async def search_semantic(body: SearchRequest, db: DB, provider: EmbedProvider) -> SearchResponse:
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        summaries = await search_service.semantic_search(db, provider, body.query, limit=body.limit)
    except Exception as exc:
        raise HTTPException(503, "Embedding service unavailable") from exc
    return SearchResponse(results=_scored(summaries), query=body.query)


@router.post("/fulltext")
async def search_fulltext(body: SearchRequest, db: DB) -> SearchResponse:
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    summaries = await search_service.fulltext_search(db, body.query, limit=body.limit)
    return SearchResponse(results=_scored(summaries), query=body.query)


@router.post("/hybrid")
async def search_hybrid(body: SearchRequest, db: DB, provider: EmbedProvider) -> SearchResponse:
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        summaries = await search_service.hybrid_search(db, provider, body.query, limit=body.limit)
    except Exception as exc:
        raise HTTPException(503, "Embedding service unavailable") from exc
    return SearchResponse(results=_scored(summaries), query=body.query)


@router.post("/dedup")
async def search_dedup(body: DedupRequest, db: DB, provider: EmbedProvider) -> DedupResponse:
    """ADR-062: capture-time dedup search. Top-K matches with raw clamped-
    cosine similarities (absolute, not rank-normalized) so the client can
    threshold against an absolute "looks like a duplicate" bar."""
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        pairs = await search_service.dedup_search(db, provider, body.query, limit=body.limit)
    except Exception as exc:
        raise HTTPException(503, "Embedding service unavailable") from exc
    return DedupResponse(
        results=[DedupResult(node=node, similarity=sim) for node, sim in pairs],
        query=body.query,
    )
