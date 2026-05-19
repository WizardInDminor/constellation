import pytest
import aiosqlite
from starlette.testclient import TestClient


# ---------------------------------------------------------------------------
# Fake providers — no network calls, deterministic 1024-dim output
# ---------------------------------------------------------------------------


class FakeEmbeddingProvider:
    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        return [0.0] * 1024

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1024 for _ in texts]


class FakeGenerationProvider:
    model_id = "fake-gen"

    def __init__(self, response: str = "fake response"):
        self._response = response

    async def complete(
        self, messages, system, max_tokens=1024, *, enable_web_search: bool = False
    ) -> str:
        return self._response


@pytest.fixture
def fake_embed_provider():
    return FakeEmbeddingProvider()


@pytest.fixture
def fake_gen_provider():
    return FakeGenerationProvider()


# ---------------------------------------------------------------------------
# HTTP client fixture — full lifespan, fake providers injected
# ---------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    async def _fake_load_providers(db, settings):
        return FakeEmbeddingProvider(), FakeGenerationProvider()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load_providers)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Async DB fixture — for repository-level tests, migrations applied, vec loaded
# ---------------------------------------------------------------------------


@pytest.fixture
async def db(tmp_path, monkeypatch):
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    from app.core.config import get_settings
    from app.core.database import open_database
    from app.core.lifespan import _run_migrations

    conn = await open_database(get_settings().db_path)
    await _run_migrations(conn)
    yield conn
    await conn.close()
    cfg.get_settings.cache_clear()
