import json

import pytest
from starlette.testclient import TestClient


VALID_RESPONSE = json.dumps(
    {
        "candidates": [
            {
                "title": "Atomic notes improve recall over summaries",
                "content": (
                    "Breaking a source into one-idea notes forces active synthesis. "
                    "Each note stands alone, so retrieval doesn't depend on reading "
                    "adjacent context. This mirrors how long-term memory consolidates "
                    "information through repeated, isolated retrieval."
                ),
                "summary": "One-idea notes are easier to retrieve than multi-idea summaries.",
            },
            {
                "title": "Spaced repetition compounds with atomic notes",
                "content": (
                    "Atomic notes pair naturally with spaced repetition because each "
                    "note is a single testable proposition. Reviewing a dense summary "
                    "means re-reading; reviewing an atomic note means recalling one idea."
                ),
                "summary": "Atomic notes make spaced repetition more precise.",
            },
        ]
    }
)


# ---------------------------------------------------------------------------
# Fixture: HTTP client backed by a generation provider that returns valid JSON
# ---------------------------------------------------------------------------


@pytest.fixture
def rag_client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    class _FakeEmbed:
        model_id = "fake-embed"
        dimensions = 1024

        async def embed(self, text):
            return [0.0] * 1024

        async def embed_batch(self, texts):
            return [[0.0] * 1024 for _ in texts]

    class _FakeGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            return VALID_RESPONSE

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


@pytest.fixture
def bad_json_rag_client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    class _FakeEmbed:
        model_id = "fake-embed"
        dimensions = 1024

        async def embed(self, text):
            return [0.0] * 1024

        async def embed_batch(self, texts):
            return [[0.0] * 1024 for _ in texts]

    class _FakeGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            return "this is not json"

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# POST /rag/suggest-permanent/{node_id}
# ---------------------------------------------------------------------------


def _create_fleeting(client, title="Quick thought", content="Need to think more."):
    resp = client.post("/api/v1/nodes/fleeting", json={"title": title, "content": content})
    assert resp.status_code == 201
    return resp.json()["id"]


def test_suggest_permanent_happy_path(rag_client):
    node_id = _create_fleeting(rag_client, "Atomic notes and memory")
    resp = rag_client.post(f"/api/v1/rag/suggest-permanent/{node_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["fleeting_id"] == node_id
    candidates = body["candidates"]
    assert 1 <= len(candidates) <= 3
    for c in candidates:
        assert "title" in c
        assert "content" in c
        assert "summary" in c


def test_suggest_permanent_not_found(rag_client):
    resp = rag_client.post("/api/v1/rag/suggest-permanent/nonexistent-id")
    assert resp.status_code == 404


def test_suggest_permanent_wrong_type(rag_client):
    perm = rag_client.post(
        "/api/v1/nodes/permanent",
        json={"title": "A permanent note", "content": "Already processed."},
    )
    assert perm.status_code == 201
    node_id = perm.json()["id"]
    resp = rag_client.post(f"/api/v1/rag/suggest-permanent/{node_id}")
    assert resp.status_code == 422


def test_suggest_permanent_bad_json_from_ai(bad_json_rag_client):
    node_id = _create_fleeting(bad_json_rag_client)
    resp = bad_json_rag_client.post(f"/api/v1/rag/suggest-permanent/{node_id}")
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# POST /nodes/{node_id}/process
# ---------------------------------------------------------------------------


def test_process_node_sets_processed_at(client):
    node_id = _create_fleeting(client)
    node_before = client.get(f"/api/v1/nodes/{node_id}").json()
    assert node_before["processed_at"] is None

    resp = client.post(f"/api/v1/nodes/{node_id}/process")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == node_id
    assert body["processed_at"] is not None


def test_process_node_not_found(client):
    resp = client.post("/api/v1/nodes/nonexistent-id/process")
    assert resp.status_code == 404


def test_process_node_wrong_type(client):
    perm = client.post(
        "/api/v1/nodes/permanent",
        json={"title": "A permanent note", "content": "Already processed."},
    )
    assert perm.status_code == 201
    node_id = perm.json()["id"]
    resp = client.post(f"/api/v1/nodes/{node_id}/process")
    assert resp.status_code == 422
