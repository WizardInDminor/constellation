import pytest
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
