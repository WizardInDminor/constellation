import logging
import struct
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import aiosqlite

from app.core.config import settings
from app.providers.base import EmbeddingProvider
from app.repositories import embedding_job_repo
from app.services.embedding_errors import (
    extract_retry_after_seconds,
    is_retriable,
)

logger = logging.getLogger(__name__)

_EXPECTED_DIM = 1024


@dataclass
class DrainResult:
    """Summary of one `drain_jobs` cycle.

    `cooldown_seconds` is non-None when the worker hit a retriable provider
    error and should pause before its next cycle.
    """

    processed: int
    cooldown_seconds: int | None


def _pack_vector(v: list[float]) -> bytes:
    return struct.pack(f"{len(v)}f", *v)


async def _queue_job(
    db: aiosqlite.Connection,
    node_id: str,
    target_model: str,
    *,
    attempt_count: int = 0,
) -> None:
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "INSERT INTO embedding_jobs(id, node_id, status, target_model, created_at, attempt_count) "
        "VALUES (?, ?, 'pending', ?, ?, ?)",
        (str(uuid.uuid4()), node_id, target_model, now, attempt_count),
    )
    await db.commit()


async def embed_node(
    db: aiosqlite.Connection,
    node_id: str,
    provider: EmbeddingProvider,
) -> None:
    """Embed a node and persist the vector + update embedding_model on the node row."""
    cursor = await db.execute(
        "SELECT title, content FROM nodes WHERE id = ? AND deleted_at IS NULL",
        (node_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError(f"Node {node_id!r} not found or deleted")

    vector = await provider.embed(f"{row['title']}\n\n{row['content']}")
    if len(vector) != _EXPECTED_DIM:
        raise ValueError(f"Provider returned {len(vector)}-dim vector; expected {_EXPECTED_DIM}")

    packed = _pack_vector(vector)

    # Upsert: delete stale row (if any) then insert fresh
    await db.execute("DELETE FROM vec_nodes WHERE node_id = ?", (node_id,))
    await db.execute(
        "INSERT INTO vec_nodes(node_id, embedding) VALUES (?, ?)",
        (node_id, packed),
    )

    # Record which model produced the current vector. Do NOT bump updated_at
    # here — embedding is system-managed metadata, not user-edited content.
    # Bumping updated_at would make freshly-processed notes look "edited" in
    # the Home activity feed (ADR-054) and on the Synthesize pool ordering.
    await db.execute(
        "UPDATE nodes SET embedding_model = ? WHERE id = ?",
        (provider.model_id, node_id),
    )
    await db.commit()


async def embed_or_queue(
    db: aiosqlite.Connection,
    node_id: str,
    provider: EmbeddingProvider,
) -> None:
    """Attempt inline embedding; on failure queue a job for the background worker.

    The queued job starts at attempt_count=1 because the failed inline attempt counts.
    """
    try:
        await embed_node(db, node_id, provider)
    except Exception as exc:
        logger.warning("Inline embed failed for node %s, queuing: %s", node_id, exc)
        await _queue_job(db, node_id, provider.model_id, attempt_count=1)


async def queue_reembed_all(db: aiosqlite.Connection, target_model: str) -> int:
    """Queue re-embedding for all eligible nodes not yet at target_model.

    Skips nodes that already have a pending or processing job for this model to
    avoid duplicates across repeated PATCH /config calls.
    """
    cursor = await db.execute(
        """
        SELECT id FROM nodes
        WHERE deleted_at IS NULL
          AND type IN ('permanent', 'literature', 'structure')
          AND (embedding_model IS NULL OR embedding_model != ?)
          AND id NOT IN (
              SELECT node_id FROM embedding_jobs
              WHERE status IN ('pending', 'processing') AND target_model = ?
          )
        """,
        (target_model, target_model),
    )
    rows = await cursor.fetchall()
    for row in rows:
        await _queue_job(db, row["id"], target_model)
    return len(rows)


async def find_similar(
    db: aiosqlite.Connection,
    vector: list[float],
    *,
    exclude_id: str,
    limit: int = 10,
) -> list[str]:
    """Return node IDs of the nearest neighbours, excluding exclude_id."""
    packed = _pack_vector(vector)
    cursor = await db.execute(
        "SELECT node_id FROM vec_nodes"
        " WHERE embedding MATCH ? AND k = ?"
        " AND node_id != ?"
        " ORDER BY distance",
        (packed, limit + 1, exclude_id),
    )
    rows = await cursor.fetchall()
    return [r["node_id"] for r in rows][:limit]


async def find_similar_to_node(
    db: aiosqlite.Connection,
    node_id: str,
    *,
    limit: int = 8,
) -> list[tuple[str, float]]:
    """Nearest neighbours to a node, computed from its stored embedding.

    Returns (neighbor_id, distance) tuples, closest first. Distance is the
    raw vec0 metric (L2 for FLOAT[1024]); lower means more similar. Returns
    [] when the node has no embedding yet.
    """
    cursor = await db.execute(
        "SELECT embedding FROM vec_nodes WHERE node_id = ?",
        (node_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return []
    packed = row["embedding"]
    cursor = await db.execute(
        "SELECT node_id, distance FROM vec_nodes"
        " WHERE embedding MATCH ? AND k = ?"
        " AND node_id != ?"
        " ORDER BY distance",
        (packed, limit + 1, node_id),
    )
    rows = await cursor.fetchall()
    return [(r["node_id"], r["distance"]) for r in rows][:limit]


async def search_similar(
    db: aiosqlite.Connection,
    vector: list[float],
    *,
    limit: int = 10,
) -> list[str]:
    """Return node IDs of the nearest neighbours for a query vector.

    Unlike find_similar(), no node is excluded — this is for search queries
    that have no associated node ID.
    """
    packed = _pack_vector(vector)
    cursor = await db.execute(
        "SELECT node_id FROM vec_nodes WHERE embedding MATCH ? AND k = ? ORDER BY distance",
        (packed, limit),
    )
    rows = await cursor.fetchall()
    return [r["node_id"] for r in rows]


async def search_similar_with_distances(
    db: aiosqlite.Connection,
    vector: list[float],
    *,
    limit: int = 10,
) -> list[tuple[str, float]]:
    """Same as search_similar(), but also returns the raw vec0 distance.

    Used by `rag_service.query` to detect low-confidence retrieval per
    ADR-057 (Bucket B — B5). Distance is L2 against normalized vectors;
    lower means more similar. Tuples come back sorted ascending by distance.
    """
    packed = _pack_vector(vector)
    cursor = await db.execute(
        "SELECT node_id, distance FROM vec_nodes"
        " WHERE embedding MATCH ? AND k = ? ORDER BY distance",
        (packed, limit),
    )
    rows = await cursor.fetchall()
    return [(r["node_id"], r["distance"]) for r in rows]


async def drain_jobs(db: aiosqlite.Connection, provider: EmbeddingProvider) -> DrainResult:
    """Drain up to `embedding_drain_batch_size` pending embedding jobs.

    Retriable provider errors (rate limit, transient network, 5xx) revert the
    job to `pending` without bumping `attempt_count` and stop the loop early
    so the worker can cool down. Terminal errors keep the existing path:
    bump `attempt_count` and mark the job `failed`.
    """
    cursor = await db.execute(
        "SELECT id, node_id FROM embedding_jobs WHERE status = 'pending' LIMIT ?",
        (settings.embedding_drain_batch_size,),
    )
    jobs = await cursor.fetchall()

    processed = 0
    for job in jobs:
        job_id = job["id"]
        node_id = job["node_id"]

        await db.execute(
            "UPDATE embedding_jobs SET status = 'processing' WHERE id = ?",
            (job_id,),
        )
        await db.commit()

        try:
            await embed_node(db, node_id, provider)
            await db.execute(
                "UPDATE embedding_jobs SET status = 'complete', completed_at = ? WHERE id = ?",
                (datetime.now(UTC).isoformat(), job_id),
            )
            await db.commit()
            processed += 1
        except Exception as exc:
            if is_retriable(exc):
                cooldown = (
                    extract_retry_after_seconds(exc)
                    or settings.embedding_rate_limit_cooldown_seconds
                )
                logger.warning(
                    "Embedding job %s for node %s hit retriable error (%s); "
                    "reverting to pending and cooling down %ss",
                    job_id,
                    node_id,
                    exc.__class__.__name__,
                    cooldown,
                )
                await db.execute(
                    "UPDATE embedding_jobs SET status = 'pending', error = NULL WHERE id = ?",
                    (job_id,),
                )
                await db.commit()
                return DrainResult(processed=processed, cooldown_seconds=cooldown)

            logger.error("Embedding job %s failed for node %s: %s", job_id, node_id, exc)
            await embedding_job_repo.increment_attempt(db, job_id)
            await db.execute(
                "UPDATE embedding_jobs SET status = 'failed', error = ? WHERE id = ?",
                (str(exc), job_id),
            )
            await db.commit()

    return DrainResult(processed=processed, cooldown_seconds=None)
