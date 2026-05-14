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


def test_open_source_file_url(open_client, tmp_path):
    c, opened = open_client
    target = tmp_path / "datasheet.pdf"
    target.write_text("noop")
    source = _make_source(c, f"file://{target}")
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 200
    assert r.json()["opened"] == f"file://{target}"
    assert opened == [f"file://{target}"]


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


def test_open_source_calls_open_url_exactly_once(open_client, tmp_path):
    c, opened = open_client
    target = tmp_path / "once.pdf"
    target.write_text("noop")
    url = f"file://{target}"
    source = _make_source(c, url)
    c.get(f"/api/v1/sources/{source['id']}/open")
    c.get(f"/api/v1/sources/{source['id']}/open")
    assert len(opened) == 2
    assert all(u == url for u in opened)


def test_normalize_file_url_expands_tilde(monkeypatch):
    """`file://~/foo` and `file:///~/foo` both expand via os.path.expanduser."""
    from app.api.v1.sources import _normalize_file_url

    monkeypatch.setenv("HOME", "/home/user")
    assert _normalize_file_url("file://~/docs/x.pdf") == "file:///home/user/docs/x.pdf"
    assert _normalize_file_url("file:///~/docs/x.pdf") == "file:///home/user/docs/x.pdf"


def test_normalize_file_url_expands_home_var(monkeypatch):
    from app.api.v1.sources import _normalize_file_url

    monkeypatch.setenv("HOME", "/home/user")
    assert _normalize_file_url("file://$HOME/x.pdf") == "file:///home/user/x.pdf"


def test_normalize_file_url_decodes_percent_escapes():
    from app.api.v1.sources import _normalize_file_url

    assert _normalize_file_url("file:///tmp/a%20b.pdf") == "file:///tmp/a b.pdf"


def test_normalize_file_url_passes_through_http():
    from app.api.v1.sources import _normalize_file_url

    assert _normalize_file_url("https://example.com/x") == "https://example.com/x"


def test_normalize_file_url_bare_absolute_path():
    from app.api.v1.sources import _normalize_file_url

    assert _normalize_file_url("/tmp/x.pdf") == "file:///tmp/x.pdf"


def test_normalize_file_url_bare_tilde(monkeypatch):
    from app.api.v1.sources import _normalize_file_url

    monkeypatch.setenv("HOME", "/home/user")
    assert _normalize_file_url("~/docs/x.pdf") == "file:///home/user/docs/x.pdf"


def test_normalize_file_url_bare_home_var(monkeypatch):
    from app.api.v1.sources import _normalize_file_url

    monkeypatch.setenv("HOME", "/home/user")
    assert _normalize_file_url("$HOME/x.pdf") == "file:///home/user/x.pdf"


def test_normalize_file_url_passes_through_non_path():
    """Bare strings that don't look like filesystem paths must not be coerced
    to file:// — they may be opaque identifiers like git remotes or domains."""
    from app.api.v1.sources import _normalize_file_url

    assert _normalize_file_url("example.com") == "example.com"
    assert _normalize_file_url("git@host:repo.git") == "git@host:repo.git"


def test_open_source_normalizes_tilde(open_client, monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / "docs").mkdir()
    target = tmp_path / "docs" / "x.pdf"
    target.write_text("noop")
    c, opened = open_client
    source = _make_source(c, "file://~/docs/x.pdf")
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 200
    assert r.json()["opened"] == f"file://{target}"
    assert opened == [f"file://{target}"]


def test_open_source_404_on_missing_file(open_client):
    """A file:// URL pointing at a path that does not exist must return 404
    so the user gets immediate feedback instead of a silent xdg-open failure."""
    c, opened = open_client
    source = _make_source(c, "file:///definitely/does/not/exist.pdf")
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 404
    assert "File not found" in r.json()["detail"]
    assert opened == []


def test_open_source_bare_path_normalised_and_opened(open_client, tmp_path):
    """A bare absolute path (no scheme) is coerced to file:// and opened."""
    c, opened = open_client
    target = tmp_path / "note.md"
    target.write_text("hello")
    source = _make_source(c, str(target))
    r = c.get(f"/api/v1/sources/{source['id']}/open")
    assert r.status_code == 200
    assert r.json()["opened"] == f"file://{target}"
    assert opened == [f"file://{target}"]


def test_open_source_surfaces_warning(tmp_path, monkeypatch):
    """When _open_url returns a string (xdg-open stderr or non-zero exit), the
    route includes it as `warning` in the 200 response."""
    import app.api.v1.sources as sources_module
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    async def _warning_open(url: str) -> str:
        return "xdg-open exited with code 4"

    monkeypatch.setattr(sources_module, "_open_url", _warning_open)

    async def _fake_load(db, settings):
        from tests.conftest import FakeEmbeddingProvider, FakeGenerationProvider

        return FakeEmbeddingProvider(), FakeGenerationProvider()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    target = tmp_path / "doc.xyz"
    target.write_text("noop")

    with TestClient(fastapi_app) as c:
        source = _make_source(c, f"file://{target}")
        r = c.get(f"/api/v1/sources/{source['id']}/open")
        assert r.status_code == 200
        body = r.json()
        assert body["warning"] == "xdg-open exited with code 4"
        assert body["opened"] == f"file://{target}"

    cfg.get_settings.cache_clear()
