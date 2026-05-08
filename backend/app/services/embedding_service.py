import logging
import struct
import uuid

import aiosqlite

from app.providers.base import EmbeddingProvider

logger = logging.getLogger(__name__)

_EXPECTED_DIM = 1024


def _pack_vector(v: list[float]) -> bytes:
    return struct.pack(f"{len(v)}f", *v)


async def _queue_job(db: aiosqlite.Connection, node_id: str, target_model: str) -> None:
    await db.execute(
        """INSERT INTO embedding_jobs(id, node_id, status, target_model, created_at)
           VALUES (?, ?, 'pending', ?, datetime('now'))""",
        (str(uuid.uuid4()), node_id, target_model),
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
        raise ValueError(
            f"Provider returned {len(vector)}-dim vector; expected {_EXPECTED_DIM}"
        )

    packed = _pack_vector(vector)

    # Upsert: delete stale row (if any) then insert fresh
    await db.execute("DELETE FROM vec_nodes WHERE node_id = ?", (node_id,))
    await db.execute(
        "INSERT INTO vec_nodes(node_id, embedding) VALUES (?, ?)",
        (node_id, packed),
    )

    # Record which model produced the current vector
    await db.execute(
        "UPDATE nodes SET embedding_model = ?, updated_at = datetime('now') WHERE id = ?",
        (provider.model_id, node_id),
    )
    await db.commit()


async def embed_or_queue(
    db: aiosqlite.Connection,
    node_id: str,
    provider: EmbeddingProvider,
) -> None:
    """Attempt inline embedding; on failure queue a job for the background worker."""
    try:
        await embed_node(db, node_id, provider)
    except Exception as exc:
        logger.warning("Inline embed failed for node %s, queuing: %s", node_id, exc)
        await _queue_job(db, node_id, provider.model_id)


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


async def drain_jobs(db: aiosqlite.Connection, provider: EmbeddingProvider) -> None:
    """Drain up to 10 pending embedding jobs. Called by the background worker."""
    cursor = await db.execute(
        "SELECT id, node_id FROM embedding_jobs WHERE status = 'pending' LIMIT 10"
    )
    jobs = await cursor.fetchall()

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
                "UPDATE embedding_jobs SET status = 'complete', completed_at = datetime('now') "
                "WHERE id = ?",
                (job_id,),
            )
        except Exception as exc:
            logger.error("Embedding job %s failed for node %s: %s", job_id, node_id, exc)
            await db.execute(
                "UPDATE embedding_jobs SET status = 'failed', error = ? WHERE id = ?",
                (str(exc), job_id),
            )
        await db.commit()
