import aiosqlite

from app.models import (
    EmbeddingJob,
    EmbeddingJobCounts,
    EmbeddingJobStatus,
)


def _row_to_job(row: aiosqlite.Row) -> EmbeddingJob:
    return EmbeddingJob(
        id=row["id"],
        node_id=row["node_id"],
        node_title=row["node_title"],
        status=row["status"],
        target_model=row["target_model"],
        error=row["error"],
        attempt_count=row["attempt_count"],
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


async def list_jobs(
    db: aiosqlite.Connection,
    *,
    status: EmbeddingJobStatus | None = None,
    limit: int = 100,
) -> list[EmbeddingJob]:
    """Most-recent first. Joins node title; omits jobs whose node is soft-deleted."""
    base = (
        "SELECT j.id, j.node_id, n.title AS node_title, j.status, j.target_model,"
        " j.error, j.attempt_count, j.created_at, j.completed_at"
        " FROM embedding_jobs j"
        " JOIN nodes n ON n.id = j.node_id"
        " WHERE n.deleted_at IS NULL"
    )
    params: tuple = ()
    if status is not None:
        base += " AND j.status = ?"
        params = (status,)
    base += " ORDER BY j.created_at DESC LIMIT ?"
    params = (*params, limit)

    cursor = await db.execute(base, params)
    rows = await cursor.fetchall()
    return [_row_to_job(r) for r in rows]


async def get_counts(db: aiosqlite.Connection) -> EmbeddingJobCounts:
    """One count per status. Zeros for statuses with no rows."""
    cursor = await db.execute(
        "SELECT j.status, COUNT(*) AS n"
        " FROM embedding_jobs j"
        " JOIN nodes n ON n.id = j.node_id"
        " WHERE n.deleted_at IS NULL"
        " GROUP BY j.status"
    )
    rows = await cursor.fetchall()
    counts = EmbeddingJobCounts()
    for r in rows:
        setattr(counts, r["status"], r["n"])
    return counts


async def get_by_id(db: aiosqlite.Connection, job_id: str) -> EmbeddingJob | None:
    cursor = await db.execute(
        "SELECT j.id, j.node_id, n.title AS node_title, j.status, j.target_model,"
        " j.error, j.attempt_count, j.created_at, j.completed_at"
        " FROM embedding_jobs j"
        " JOIN nodes n ON n.id = j.node_id"
        " WHERE j.id = ?",
        (job_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return _row_to_job(row)


async def retry_job(db: aiosqlite.Connection, job_id: str) -> EmbeddingJob | None:
    """Flip a failed job back to pending and bump attempt_count.

    Returns the updated job, or None if no row matched (job missing OR not failed).
    Callers can distinguish 404 vs 409 by calling get_by_id afterwards.
    """
    cursor = await db.execute(
        "UPDATE embedding_jobs"
        " SET status = 'pending', error = NULL, completed_at = NULL,"
        "     attempt_count = attempt_count + 1"
        " WHERE id = ? AND status = 'failed'",
        (job_id,),
    )
    await db.commit()
    if cursor.rowcount == 0:
        return None
    return await get_by_id(db, job_id)


async def retry_all_failed(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "UPDATE embedding_jobs"
        " SET status = 'pending', error = NULL, completed_at = NULL,"
        "     attempt_count = attempt_count + 1"
        " WHERE status = 'failed'"
    )
    await db.commit()
    return cursor.rowcount


async def increment_attempt(db: aiosqlite.Connection, job_id: str) -> None:
    """Worker calls this before marking a job 'failed'."""
    await db.execute(
        "UPDATE embedding_jobs SET attempt_count = attempt_count + 1 WHERE id = ?",
        (job_id,),
    )
    await db.commit()
