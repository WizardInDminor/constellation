"""Tests for GET /sources/{id}/open."""

import pytest
from starlette.testclient import TestClient


@pytest.fixture
def open_client(tmp_path, monkeypatch):
    """Standard client with _open_url patched to a no-op that records calls."""
    import app.api.v1.sources as sources_module
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    opened: list[str] = []

    async def _fake_open(url: str) -> None:
        opened.append(url)

    monkeypatch.setattr(sources_module, "_open_url", _fake_open)

    async def _fake_load(db, settings):
        from tests.conftest import FakeEmbeddingProvider, FakeGenerationProvider

        return FakeEmbeddingProvider(), FakeGenerationProvider()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c, opened

    cfg.get_settings.cache_clear()


def _make_source(client, url: str = "file:///tmp/doc.pdf"):
    r = client.post(
        "/api/v1/sources",
        json={"title": "Test Source", "type": "datasheet", "url": url},
    )
    assert r.status_code == 201
    return r.json()


def test_open_source_file_url(open_client):
    c, opened = open_client
    source = _make_source(c, "file:///home/matt/docs/datasheet.pdf")
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 200
    assert r.json()["opened"] == "file:///home/matt/docs/datasheet.pdf"
    assert opened == ["file:///home/matt/docs/datasheet.pdf"]


def test_open_source_web_url(open_client):
    c, opened = open_client
    source = _make_source(c, "https://example.com/paper.pdf")
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 200
    assert opened == ["https://example.com/paper.pdf"]


def test_open_source_not_found(open_client):
    c, opened = open_client
    r = c.get("/api/v1/sources/nonexistent-id/open")
    assert r.status_code == 404
    assert opened == []


def test_open_source_no_url(open_client):
    c, opened = open_client
    r = c.post(
        "/api/v1/sources",
        json={"title": "No URL Source", "type": "book"},
    )
    assert r.status_code == 201
    source_id = r.json()["id"]
    r = c.get(f"/api/v1/sources/{source_id}/open")
    assert r.status_code == 400
    assert opened == []


def test_open_source_calls_open_url_exactly_once(open_client):
    c, opened = open_client
    source = _make_source(c, "file:///tmp/once.pdf")
    c.get(f"/api/v1/sources/{source['id']}/open")
    c.get(f"/api/v1/sources/{source['id']}/open")
    assert len(opened) == 2
    assert all(u == "file:///tmp/once.pdf" for u in opened)
