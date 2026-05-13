import uuid

import pytest
from voyageai.error import (
    APIConnectionError,
    AuthenticationError,
    RateLimitError,
)

from app.core.config import settings
from app.models import LiteratureCreate, PermanentCreate, StructureCreate, SourceCreate
from app.repositories import node_repo, source_repo
from app.services import embedding_service


# ---------------------------------------------------------------------------
# Local provider stubs for edge-case testing
# ---------------------------------------------------------------------------


class _FailingProvider:
    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        raise RuntimeError("API down")

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("API down")


class _WrongDimProvider:
    model_id = "fake-embed"
    dimensions = 512

    async def embed(self, text: str) -> list[float]:
        return [0.0] * 512

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 512 for _ in texts]


class _RateLimitedProvider:
    """Always raises Voyage's RateLimitError — simulates the free-tier 3 RPM ceiling."""

    model_id = "fake-embed"
    dimensions = 1024

    def __init__(self, headers: dict[str, str] | None = None) -> None:
        self._headers = headers or {}

    async def embed(self, text: str) -> list[float]:
        raise RateLimitError(message="rate limited", http_status=429, headers=self._headers)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        raise RateLimitError(message="rate limited", http_status=429, headers=self._headers)


class _AuthFailProvider:
    """Terminal-error provider — bad credentials should never be retried."""

    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        raise AuthenticationError(message="bad key", http_status=401)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        raise AuthenticationError(message="bad key", http_status=401)


class _TransientNetworkProvider:
    """APIConnectionError — retriable transient network blip."""

    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        raise APIConnectionError(message="connection reset")

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        raise APIConnectionError(message="connection reset")


# ---------------------------------------------------------------------------
# embed_node
# ---------------------------------------------------------------------------


async def test_embed_node_writes_vec_and_updates_model(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_node(db, node.id, fake_embed_provider)

    cursor = await db.execute("SELECT node_id FROM vec_nodes WHERE node_id = ?", (node.id,))
    assert await cursor.fetchone() is not None

    cursor = await db.execute("SELECT embedding_model FROM nodes WHERE id = ?", (node.id,))
    row = await cursor.fetchone()
    assert row["embedding_model"] == "fake-embed"


async def test_embed_node_upserts_existing_vector(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_node(db, node.id, fake_embed_provider)
    await embedding_service.embed_node(db, node.id, fake_embed_provider)  # second call — no error

    cursor = await db.execute("SELECT COUNT(*) FROM vec_nodes WHERE node_id = ?", (node.id,))
    assert (await cursor.fetchone())[0] == 1


async def test_embed_node_wrong_dimensions_raises(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    with pytest.raises(ValueError, match="dim"):
        await embedding_service.embed_node(db, node.id, _WrongDimProvider())


async def test_embed_node_missing_node_raises(db, fake_embed_provider):
    with pytest.raises(ValueError, match="not found"):
        await embedding_service.embed_node(db, "ghost", fake_embed_provider)


# ---------------------------------------------------------------------------
# embed_or_queue
# ---------------------------------------------------------------------------


async def test_embed_or_queue_success_no_job_created(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_or_queue(db, node.id, fake_embed_provider)

    cursor = await db.execute("SELECT COUNT(*) FROM embedding_jobs")
    assert (await cursor.fetchone())[0] == 0


async def test_embed_or_queue_failure_queues_job(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_or_queue(db, node.id, _FailingProvider())

    cursor = await db.execute(
        "SELECT status, target_model, attempt_count FROM embedding_jobs WHERE node_id = ?",
        (node.id,),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["status"] == "pending"
    assert row["target_model"] == "fake-embed"
    # The inline attempt failed → that's attempt #1.
    assert row["attempt_count"] == 1


async def test_drain_failure_increments_attempt_count(db):
    """A job queued at attempt_count=1 that also fails in the worker should reach 2."""
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_or_queue(db, node.id, _FailingProvider())

    await embedding_service.drain_jobs(db, _FailingProvider())

    cursor = await db.execute(
        "SELECT status, attempt_count FROM embedding_jobs WHERE node_id = ?", (node.id,)
    )
    row = await cursor.fetchone()
    assert row["status"] == "failed"
    assert row["attempt_count"] == 2


async def test_drain_success_leaves_attempt_count_unchanged(db, fake_embed_provider):
    """A successful drain shouldn't bump attempt_count — only failures do."""
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await embedding_service.embed_or_queue(db, node.id, _FailingProvider())  # queue at 1

    await embedding_service.drain_jobs(db, fake_embed_provider)  # succeeds

    cursor = await db.execute(
        "SELECT status, attempt_count FROM embedding_jobs WHERE node_id = ?", (node.id,)
    )
    row = await cursor.fetchone()
    assert row["status"] == "complete"
    assert row["attempt_count"] == 1


# ---------------------------------------------------------------------------
# drain_jobs
# ---------------------------------------------------------------------------


async def _insert_pending_job(db, node_id: str, model: str = "fake-embed") -> str:
    job_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO embedding_jobs(id, node_id, status, target_model, created_at) "
        "VALUES (?, ?, 'pending', ?, datetime('now'))",
        (job_id, node_id, model),
    )
    await db.commit()
    return job_id


async def test_drain_jobs_marks_complete(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    job_id = await _insert_pending_job(db, node.id)

    await embedding_service.drain_jobs(db, fake_embed_provider)

    cursor = await db.execute("SELECT status FROM embedding_jobs WHERE id = ?", (job_id,))
    assert (await cursor.fetchone())["status"] == "complete"


async def test_drain_jobs_marks_failed_on_error(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    job_id = await _insert_pending_job(db, node.id)

    await embedding_service.drain_jobs(db, _FailingProvider())

    cursor = await db.execute("SELECT status, error FROM embedding_jobs WHERE id = ?", (job_id,))
    row = await cursor.fetchone()
    assert row["status"] == "failed"
    assert row["error"] is not None


async def test_drain_jobs_writes_vec_on_success(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await _insert_pending_job(db, node.id)

    await embedding_service.drain_jobs(db, fake_embed_provider)

    cursor = await db.execute("SELECT node_id FROM vec_nodes WHERE node_id = ?", (node.id,))
    assert await cursor.fetchone() is not None


# ---------------------------------------------------------------------------
# drain_jobs — rate-limit / retriable error handling
# ---------------------------------------------------------------------------


async def test_drain_jobs_rate_limit_reverts_to_pending(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    job_id = await _insert_pending_job(db, node.id)

    result = await embedding_service.drain_jobs(db, _RateLimitedProvider())

    cursor = await db.execute(
        "SELECT status, error, attempt_count FROM embedding_jobs WHERE id = ?",
        (job_id,),
    )
    row = await cursor.fetchone()
    assert row["status"] == "pending"
    assert row["error"] is None
    assert row["attempt_count"] == 0
    assert result.cooldown_seconds == settings.embedding_rate_limit_cooldown_seconds
    assert result.processed == 0


async def test_drain_jobs_rate_limit_honors_retry_after(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await _insert_pending_job(db, node.id)

    result = await embedding_service.drain_jobs(
        db, _RateLimitedProvider(headers={"retry-after": "42"})
    )
    assert result.cooldown_seconds == 42


async def test_drain_jobs_transient_network_error_is_retriable(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    job_id = await _insert_pending_job(db, node.id)

    result = await embedding_service.drain_jobs(db, _TransientNetworkProvider())

    cursor = await db.execute(
        "SELECT status, attempt_count FROM embedding_jobs WHERE id = ?", (job_id,)
    )
    row = await cursor.fetchone()
    assert row["status"] == "pending"
    assert row["attempt_count"] == 0
    assert result.cooldown_seconds is not None


async def test_drain_jobs_terminal_voyage_error_still_fails(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    job_id = await _insert_pending_job(db, node.id)

    result = await embedding_service.drain_jobs(db, _AuthFailProvider())

    cursor = await db.execute(
        "SELECT status, error, attempt_count FROM embedding_jobs WHERE id = ?",
        (job_id,),
    )
    row = await cursor.fetchone()
    assert row["status"] == "failed"
    assert row["error"] is not None
    assert row["attempt_count"] == 1
    assert result.cooldown_seconds is None


async def test_drain_jobs_success_returns_no_cooldown(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="T", content="C"))
    await _insert_pending_job(db, node.id)

    result = await embedding_service.drain_jobs(db, fake_embed_provider)
    assert result.cooldown_seconds is None
    assert result.processed == 1


# ---------------------------------------------------------------------------
# queue_reembed_all
# ---------------------------------------------------------------------------


async def test_queue_reembed_all_creates_jobs_for_eligible_types(db, fake_embed_provider):
    src = await source_repo.create(db, SourceCreate(title="Book", type="book"))
    n1 = await node_repo.create_permanent(db, PermanentCreate(title="P", content="c"))
    n2 = await node_repo.create_structure(db, StructureCreate(title="S", content="c"))
    n3 = await node_repo.create_literature(
        db, LiteratureCreate(title="L", content="c", source_id=src.id)
    )
    _ = n1, n2, n3  # created but not yet embedded

    count = await embedding_service.queue_reembed_all(db, "voyage-4-ultra")
    assert count == 3

    cursor = await db.execute(
        "SELECT COUNT(*) FROM embedding_jobs WHERE target_model = 'voyage-4-ultra'"
    )
    assert (await cursor.fetchone())[0] == 3


async def test_queue_reembed_all_skips_fleeting(db):
    await node_repo.create_fleeting(db, PermanentCreate(title="F", content="c"))  # type: ignore[arg-type]
    count = await embedding_service.queue_reembed_all(db, "voyage-4-ultra")
    assert count == 0


async def test_queue_reembed_all_skips_nodes_already_at_target(db, fake_embed_provider):
    node = await node_repo.create_permanent(db, PermanentCreate(title="P", content="c"))
    await embedding_service.embed_node(
        db, node.id, fake_embed_provider
    )  # sets model to "fake-embed"

    count = await embedding_service.queue_reembed_all(db, "fake-embed")
    assert count == 0


async def test_queue_reembed_all_skips_nodes_with_pending_job(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="P", content="c"))

    count1 = await embedding_service.queue_reembed_all(db, "voyage-4")
    assert count1 == 1

    count2 = await embedding_service.queue_reembed_all(db, "voyage-4")
    assert count2 == 0  # already has a pending job for this model
