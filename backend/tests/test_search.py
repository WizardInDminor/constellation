"""Tests for /search/* endpoints and RRF fusion logic."""

import pytest
from starlette.testclient import TestClient

from app.services.search_service import rrf_merge


# ---------------------------------------------------------------------------
# Pure unit tests for RRF fusion (no DB, no HTTP)
# ---------------------------------------------------------------------------


def test_rrf_merge_single_list():
    result = rrf_merge([["a", "b", "c"]])
    assert result == ["a", "b", "c"]


def test_rrf_merge_two_lists_boosts_overlap():
    # "b" appears at rank 0 in list2 and rank 1 in list1 → higher combined score than "a"
    result = rrf_merge([["a", "b", "c"], ["b", "c", "a"]])
    # "b" and "c" both appear in both lists, "a" appears in both but at worse ranks
    assert result[0] in ("b", "c")
    assert "a" in result
    assert len(result) == 3


def test_rrf_merge_disjoint_lists():
    result = rrf_merge([["x", "y"], ["p", "q"]])
    assert set(result) == {"x", "y", "p", "q"}
    # rank-0 items from each list beat rank-1 items
    assert result.index("x") < result.index("y")
    assert result.index("p") < result.index("q")


def test_rrf_merge_empty_lists():
    assert rrf_merge([]) == []
    assert rrf_merge([[], []]) == []
    assert rrf_merge([[], ["a"]]) == ["a"]


def test_rrf_merge_preserves_top_rank():
    # A node at rank 0 in both lists beats anything at rank 0 in only one list
    result = rrf_merge([["winner", "a"], ["winner", "b"]])
    assert result[0] == "winner"


# ---------------------------------------------------------------------------
# Fixture: client with a fake embedding provider
# ---------------------------------------------------------------------------


@pytest.fixture
def search_client(tmp_path, monkeypatch):
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
            return ""

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


def _make_permanent(client, title, content="Some content."):
    r = client.post("/api/v1/nodes/permanent", json={"title": title, "content": content})
    assert r.status_code == 201
    return r.json()


# ---------------------------------------------------------------------------
# POST /search/semantic
# ---------------------------------------------------------------------------


def test_semantic_empty_db(search_client):
    r = search_client.post("/api/v1/search/semantic", json={"query": "anything"})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "anything"
    assert body["results"] == []


def test_semantic_returns_results(search_client):
    _make_permanent(search_client, "Note Alpha")
    _make_permanent(search_client, "Note Beta")
    r = search_client.post("/api/v1/search/semantic", json={"query": "note"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["results"]) == 2
    for res in body["results"]:
        assert "node" in res
        assert 0.0 <= res["score"] <= 1.0


def test_semantic_empty_query(search_client):
    r = search_client.post("/api/v1/search/semantic", json={"query": "   "})
    assert r.status_code == 400


def test_semantic_limit_respected(search_client):
    for i in range(5):
        _make_permanent(search_client, f"Note {i}")
    r = search_client.post("/api/v1/search/semantic", json={"query": "note", "limit": 2})
    assert r.status_code == 200
    assert len(r.json()["results"]) <= 2


# ---------------------------------------------------------------------------
# POST /search/fulltext
# ---------------------------------------------------------------------------


def test_fulltext_empty_db(search_client):
    r = search_client.post("/api/v1/search/fulltext", json={"query": "anything"})
    assert r.status_code == 200
    assert r.json()["results"] == []


def test_fulltext_finds_by_keyword(search_client):
    _make_permanent(search_client, "SPI bus configuration", "How to set up SPI.")
    _make_permanent(search_client, "I2C device addressing", "Address bits explained.")
    r = search_client.post("/api/v1/search/fulltext", json={"query": "SPI"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) >= 1
    assert results[0]["node"]["title"] == "SPI bus configuration"


def test_fulltext_prefix_match(search_client):
    _make_permanent(search_client, "Transistor biasing", "BJT basics.")
    r = search_client.post("/api/v1/search/fulltext", json={"query": "Trans"})
    assert r.status_code == 200
    assert len(r.json()["results"]) >= 1


def test_fulltext_empty_query(search_client):
    r = search_client.post("/api/v1/search/fulltext", json={"query": ""})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /search/hybrid
# ---------------------------------------------------------------------------


def test_hybrid_empty_db(search_client):
    r = search_client.post("/api/v1/search/hybrid", json={"query": "anything"})
    assert r.status_code == 200
    assert r.json()["results"] == []


def test_hybrid_returns_results(search_client):
    _make_permanent(search_client, "PWM motor control", "Duty cycle drives speed.")
    _make_permanent(search_client, "PID controller basics", "Error correction loop.")
    r = search_client.post("/api/v1/search/hybrid", json={"query": "motor"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) >= 1
    for res in results:
        assert 0.0 <= res["score"] <= 1.0


def test_hybrid_no_duplicates(search_client):
    _make_permanent(search_client, "Unique note title", "Content here.")
    r = search_client.post("/api/v1/search/hybrid", json={"query": "Unique"})
    assert r.status_code == 200
    ids = [res["node"]["id"] for res in r.json()["results"]]
    assert len(ids) == len(set(ids))


def test_hybrid_empty_query(search_client):
    r = search_client.post("/api/v1/search/hybrid", json={"query": "  "})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /search/dedup (ADR-062 — Phase 8.5)
# ---------------------------------------------------------------------------
# Distinct from /search/semantic: returns raw clamped-cosine similarities
# (absolute, not rank-normalized) so callers can threshold against a fixed
# "looks like a duplicate" bar.


def test_dedup_empty_db(search_client):
    r = search_client.post("/api/v1/search/dedup", json={"query": "anything"})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "anything"
    assert body["results"] == []


def test_dedup_empty_query(search_client):
    r = search_client.post("/api/v1/search/dedup", json={"query": "   "})
    assert r.status_code == 400


def test_dedup_returns_raw_similarity(search_client):
    """Similarity must be a 0-1 clamped cosine value, *not* a rank-normalised
    1.0/0.5/0.0 ladder. With the fake embedder returning identical zero
    vectors, distance = 0 for every pair, so similarity = 1.0 across the
    board (clamped at top). The test only asserts the absolute-value
    invariant; rank-normalisation would step down the values."""
    _make_permanent(search_client, "Note Alpha")
    _make_permanent(search_client, "Note Beta")
    r = search_client.post("/api/v1/search/dedup", json={"query": "alpha"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    for res in results:
        sim = res["similarity"]
        assert 0.0 <= sim <= 1.0
    # With the fake embedder, all similarities are 1.0 (identical vectors).
    # The rank-normalised endpoint would give 1.0 then 0.5; this is the
    # diagnostic that distinguishes the two scoring schemes.
    assert all(res["similarity"] == 1.0 for res in results)


def test_dedup_limit_respected(search_client):
    for i in range(8):
        _make_permanent(search_client, f"Note {i}")
    r = search_client.post("/api/v1/search/dedup", json={"query": "note", "limit": 3})
    assert r.status_code == 200
    assert len(r.json()["results"]) <= 3


def test_dedup_excludes_deleted_nodes(search_client):
    alive = _make_permanent(search_client, "Alive note")
    dead = _make_permanent(search_client, "Doomed note")
    search_client.delete(f"/api/v1/nodes/{dead['id']}")
    r = search_client.post("/api/v1/search/dedup", json={"query": "note"})
    assert r.status_code == 200
    ids = [res["node"]["id"] for res in r.json()["results"]]
    assert alive["id"] in ids
    assert dead["id"] not in ids


def test_dedup_results_ordered_by_similarity_desc(search_client):
    """When the fake embedder is identical, ties result; the test simply asserts
    a non-increasing sequence (and not, e.g., ascending)."""
    for i in range(5):
        _make_permanent(search_client, f"Note {i}")
    r = search_client.post("/api/v1/search/dedup", json={"query": "note"})
    body = r.json()
    sims = [res["similarity"] for res in body["results"]]
    assert sims == sorted(sims, reverse=True)
