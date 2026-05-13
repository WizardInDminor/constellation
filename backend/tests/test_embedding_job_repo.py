import uuid

from app.models import PermanentCreate
from app.repositories import embedding_job_repo, node_repo


async def _insert_job(
    db,
    node_id: str,
    *,
    status: str = "pending",
    target_model: str = "voyage-4",
    error: str | None = None,
    attempt_count: int = 0,
) -> str:
    job_id = str(uuid.uuid4())
    completed = "datetime('now')" if status == "complete" else "NULL"
    await db.execute(
        f"INSERT INTO embedding_jobs(id, node_id, status, target_model, error, attempt_count, "  # noqa: S608
        f"created_at, completed_at) "
        f"VALUES (?, ?, ?, ?, ?, ?, datetime('now'), {completed})",
        (job_id, node_id, status, target_model, error, attempt_count),
    )
    await db.commit()
    return job_id


async def test_list_jobs_returns_typed_items_with_title(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="My Note", content="c"))
    await _insert_job(db, node.id, attempt_count=1)

    jobs = await embedding_job_repo.list_jobs(db)
    assert len(jobs) == 1
    assert jobs[0].node_id == node.id
    assert jobs[0].node_title == "My Note"
    assert jobs[0].status == "pending"
    assert jobs[0].attempt_count == 1


async def test_list_jobs_filters_by_status(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    await _insert_job(db, node.id, status="pending")
    await _insert_job(db, node.id, status="failed", error="boom")

    pending = await embedding_job_repo.list_jobs(db, status="pending")
    failed = await embedding_job_repo.list_jobs(db, status="failed")
    assert len(pending) == 1
    assert len(failed) == 1
    assert pending[0].status == "pending"
    assert failed[0].status == "failed"
    assert failed[0].error == "boom"


async def test_list_jobs_omits_soft_deleted_nodes(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    await _insert_job(db, node.id)
    await node_repo.soft_delete(db, node.id)

    jobs = await embedding_job_repo.list_jobs(db)
    assert jobs == []


async def test_get_counts_returns_zeros_for_missing_statuses(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    await _insert_job(db, node.id, status="pending")
    await _insert_job(db, node.id, status="pending")
    await _insert_job(db, node.id, status="failed", error="x")

    counts = await embedding_job_repo.get_counts(db)
    assert counts.pending == 2
    assert counts.failed == 1
    assert counts.processing == 0
    assert counts.complete == 0


async def test_retry_job_flips_failed_to_pending_and_bumps_attempt(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    job_id = await _insert_job(db, node.id, status="failed", error="rate limit", attempt_count=2)

    updated = await embedding_job_repo.retry_job(db, job_id)
    assert updated is not None
    assert updated.status == "pending"
    assert updated.error is None
    assert updated.completed_at is None
    assert updated.attempt_count == 3


async def test_retry_job_returns_none_when_not_failed(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    job_id = await _insert_job(db, node.id, status="pending")
    assert await embedding_job_repo.retry_job(db, job_id) is None


async def test_retry_job_returns_none_when_missing(db):
    assert await embedding_job_repo.retry_job(db, "ghost-id") is None


async def test_retry_all_failed_only_touches_failed(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    await _insert_job(db, node.id, status="failed", error="a")
    await _insert_job(db, node.id, status="failed", error="b")
    await _insert_job(db, node.id, status="pending")
    await _insert_job(db, node.id, status="complete")

    n = await embedding_job_repo.retry_all_failed(db)
    assert n == 2

    counts = await embedding_job_repo.get_counts(db)
    assert counts.failed == 0
    assert counts.pending == 3
    assert counts.complete == 1


async def test_get_by_id_returns_none_for_missing(db):
    assert await embedding_job_repo.get_by_id(db, "ghost") is None


async def test_increment_attempt(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="N", content="c"))
    job_id = await _insert_job(db, node.id, attempt_count=1)
    await embedding_job_repo.increment_attempt(db, job_id)
    job = await embedding_job_repo.get_by_id(db, job_id)
    assert job is not None
    assert job.attempt_count == 2
