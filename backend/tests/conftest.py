import pytest
import aiosqlite
from starlette.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


@pytest.fixture
async def db(tmp_path, monkeypatch) -> aiosqlite.Connection:
    """Async DB fixture for repository-level tests — migrations applied, vec loaded."""
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
