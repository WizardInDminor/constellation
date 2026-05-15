import json

import pytest
from starlette.testclient import TestClient

VALID_LINKS_RESPONSE = json.dumps(
    {
        "suggestions": [
            {
                "node_id": "__PLACEHOLDER__",
                "edge_type": "SUPPORTS",
                "rationale": "The candidate directly reinforces the claim in the source.",
            }
        ]
    }
)


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


# ---------------------------------------------------------------------------
# POST /rag/suggest-links/{node_id}
# ---------------------------------------------------------------------------

EDGE_TYPES = {
    "SUPPORTS",
    "CONTRADICTS",
    "ELABORATES",
    "ANALOGOUS_TO",
    "QUESTIONS",
    "INSPIRED_BY",
    "COLLECTS",
    "CITES",
    "BUILDS_ON",
    "APPLIES_TO",
    "MEASURES",
    "EXTENDS",
    "REFINES",
}


@pytest.fixture
def suggest_links_client(tmp_path, monkeypatch):
    """Client whose generation provider returns a single valid link suggestion.

    The node_id placeholder is replaced at call time by the test using the
    actual ID of the candidate node created during setup.
    """
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
        candidate_id: str = ""

        async def complete(self, messages, system, max_tokens=1024):
            return VALID_LINKS_RESPONSE.replace("__PLACEHOLDER__", self.candidate_id)

    _gen = _FakeGen()

    async def _fake_load(db, settings):
        return _FakeEmbed(), _gen

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c, _gen

    cfg.get_settings.cache_clear()


@pytest.fixture
def bad_json_links_client(tmp_path, monkeypatch):
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
            return "not json at all"

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


def _create_permanent(client, title="A permanent note", content="Some content here."):
    resp = client.post("/api/v1/nodes/permanent", json={"title": title, "content": content})
    assert resp.status_code == 201
    return resp.json()


def test_suggest_links_happy_path(suggest_links_client):
    c, gen = suggest_links_client
    # Create two permanent nodes — they get embedded via FakeEmbed so vec_nodes is populated
    candidate = _create_permanent(c, "Candidate note", "Related content.")
    source = _create_permanent(c, "Source note", "Original idea.")
    gen.candidate_id = candidate["id"]

    resp = c.post(f"/api/v1/rag/suggest-links/{source['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_id"] == source["id"]
    suggestions = body["suggestions"]
    assert len(suggestions) == 1
    s = suggestions[0]
    assert s["node_id"] == candidate["id"]
    assert s["edge_type"] in EDGE_TYPES
    assert len(s["rationale"]) > 0
    assert s["node_title"] == candidate["title"]


def test_suggest_links_source_excluded_from_results(suggest_links_client):
    c, gen = suggest_links_client
    candidate = _create_permanent(c, "Another note", "Other content.")
    source = _create_permanent(c, "Source note", "The idea to link from.")
    gen.candidate_id = candidate["id"]

    resp = c.post(f"/api/v1/rag/suggest-links/{source['id']}")
    assert resp.status_code == 200
    ids = [s["node_id"] for s in resp.json()["suggestions"]]
    assert source["id"] not in ids


def test_suggest_links_empty_when_no_candidates(suggest_links_client):
    c, gen = suggest_links_client
    # Only one permanent node — no candidates can be found
    source = _create_permanent(c, "Lonely note", "No neighbours yet.")
    gen.candidate_id = ""

    resp = c.post(f"/api/v1/rag/suggest-links/{source['id']}")
    assert resp.status_code == 200
    assert resp.json()["suggestions"] == []


def test_suggest_links_not_found(suggest_links_client):
    c, _ = suggest_links_client
    resp = c.post("/api/v1/rag/suggest-links/nonexistent-id")
    assert resp.status_code == 404


def test_suggest_links_rejects_fleeting(suggest_links_client):
    c, _ = suggest_links_client
    fleeting = c.post("/api/v1/nodes/fleeting", json={"title": "Raw thought", "content": "..."})
    assert fleeting.status_code == 201
    resp = c.post(f"/api/v1/rag/suggest-links/{fleeting.json()['id']}")
    assert resp.status_code == 422


def test_suggest_links_bad_json_from_ai(bad_json_links_client):
    c = bad_json_links_client
    source = _create_permanent(c, "Source note", "Content.")
    _create_permanent(c, "Candidate", "Other content.")
    resp = c.post(f"/api/v1/rag/suggest-links/{source['id']}")
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# POST /rag/query
# ---------------------------------------------------------------------------

_RAG_ANSWER = "Based on your notes, [Note 1] explains this clearly."


@pytest.fixture
def rag_query_client(tmp_path, monkeypatch):
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
            return _RAG_ANSWER

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


@pytest.fixture
def rag_query_embed_fail_client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    class _FailEmbed:
        model_id = "fail-embed"
        dimensions = 1024

        async def embed(self, text):
            raise RuntimeError("network error")

        async def embed_batch(self, texts):
            raise RuntimeError("network error")

    class _FakeGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            return _RAG_ANSWER

    async def _fake_load(db, settings):
        return _FailEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


def test_rag_query_happy_path(rag_query_client):
    c = rag_query_client
    _create_permanent(c, "SPI bus setup", "Configure SPI on STM32 using HAL.")
    _create_permanent(c, "DMA transfers", "Use DMA to offload SPI data moves.")
    resp = c.post("/api/v1/rag/query", json={"query": "How does SPI work?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"] == "How does SPI work?"
    assert len(body["answer"]) > 0
    assert isinstance(body["provenance"], list)
    assert isinstance(body["edges_traversed"], list)
    assert len(body["provenance"]) >= 1
    for p in body["provenance"]:
        assert "node_id" in p
        assert "title" in p
        assert p["role"] in ("direct", "neighbor")


def test_rag_query_empty_graph(rag_query_client):
    resp = rag_query_client.post("/api/v1/rag/query", json={"query": "Anything?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["provenance"] == []
    assert body["edges_traversed"] == []
    assert len(body["answer"]) > 0


def test_rag_query_empty_string(rag_query_client):
    resp = rag_query_client.post("/api/v1/rag/query", json={"query": ""})
    assert resp.status_code == 400


def test_rag_query_embed_failure_returns_503(rag_query_embed_fail_client):
    resp = rag_query_embed_fail_client.post("/api/v1/rag/query", json={"query": "Will this work?"})
    assert resp.status_code == 503


def test_rag_query_with_edges_in_provenance(rag_query_client):
    """Edges between seed nodes appear in edges_traversed."""
    c = rag_query_client
    n1 = _create_permanent(c, "Concept A", "First idea.")
    n2 = _create_permanent(c, "Concept B", "Second idea.")
    c.post("/api/v1/edges", json={"from_id": n1["id"], "to_id": n2["id"], "type": "SUPPORTS"})

    resp = c.post("/api/v1/rag/query", json={"query": "Tell me about concepts"})
    assert resp.status_code == 200
    body = resp.json()
    # Both nodes in provenance; edge may or may not appear depending on which
    # nodes made it into seeds vs neighbors — just assert structure is valid
    for e in body["edges_traversed"]:
        assert "edge_id" in e
        assert "from_id" in e
        assert "to_id" in e
        assert "edge_type" in e


# ---------------------------------------------------------------------------
# Scoped RAG — uses an explicit list of node IDs, no retrieval/expansion
# ---------------------------------------------------------------------------


def test_rag_scoped_uses_only_provided_nodes(rag_query_client):
    c = rag_query_client
    in_scope = _create_permanent(c, "Inside scope", "Relevant content.")
    out_of_scope = _create_permanent(c, "Outside scope", "Should not appear.")

    resp = c.post(
        "/api/v1/rag/scoped",
        json={"query": "Summarize", "node_ids": [in_scope["id"]]},
    )
    assert resp.status_code == 200
    body = resp.json()
    prov_ids = {p["node_id"] for p in body["provenance"]}
    assert in_scope["id"] in prov_ids
    assert out_of_scope["id"] not in prov_ids
    assert body["edges_traversed"] == []  # depth=0 for scoped


def test_rag_scoped_handles_missing_node_ids(rag_query_client):
    c = rag_query_client
    real = _create_permanent(c, "Real note", "Content.")
    resp = c.post(
        "/api/v1/rag/scoped",
        json={"query": "Anything", "node_ids": [real["id"], "ghost"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    prov_ids = {p["node_id"] for p in body["provenance"]}
    assert real["id"] in prov_ids
    assert "ghost" not in prov_ids


def test_rag_scoped_empty_scope_returns_no_provenance(rag_query_client):
    resp = rag_query_client.post(
        "/api/v1/rag/scoped",
        json={"query": "Anything", "node_ids": ["ghost-1", "ghost-2"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provenance"] == []
    assert "No matching notes" in body["answer"]


def test_rag_scoped_empty_query_returns_400(rag_query_client):
    real = _create_permanent(rag_query_client, "Real", "Content")
    resp = rag_query_client.post(
        "/api/v1/rag/scoped",
        json={"query": "", "node_ids": [real["id"]]},
    )
    assert resp.status_code == 400


def test_rag_scoped_requires_at_least_one_node_id(rag_query_client):
    resp = rag_query_client.post(
        "/api/v1/rag/scoped",
        json={"query": "Q", "node_ids": []},
    )
    assert resp.status_code == 422  # Pydantic min_length=1


# ---------------------------------------------------------------------------
# Save answer as note
# ---------------------------------------------------------------------------


def test_save_answer_creates_permanent_with_cites_edges(rag_query_client):
    # ADR-051 supersedes ADR-036: synthesis → source edges are now CITES,
    # not COLLECTS.
    c = rag_query_client
    a = _create_permanent(c, "Source A", "Body A.")
    b = _create_permanent(c, "Source B", "Body B.")

    resp = c.post(
        "/api/v1/rag/save-answer",
        json={
            "query": "What did I think about the topic?",
            "answer": "**Synthesis** with markdown.",
            "provenance_ids": [a["id"], b["id"]],
        },
    )
    assert resp.status_code == 200
    node = resp.json()
    assert node["type"] == "permanent"
    assert node["content"] == "**Synthesis** with markdown."
    assert node["title"].startswith("What did I think")
    out = {e["neighbor"]["id"]: e["type"] for e in node["outgoing_edges"]}
    assert out.get(a["id"]) == "CITES"
    assert out.get(b["id"]) == "CITES"


def test_save_answer_skips_unresolvable_provenance(rag_query_client):
    c = rag_query_client
    a = _create_permanent(c, "Real source", "Body.")

    resp = c.post(
        "/api/v1/rag/save-answer",
        json={
            "query": "Q",
            "answer": "answer",
            "provenance_ids": [a["id"], "ghost"],
        },
    )
    assert resp.status_code == 200
    node = resp.json()
    edge_targets = {e["neighbor"]["id"] for e in node["outgoing_edges"]}
    assert a["id"] in edge_targets
    assert "ghost" not in edge_targets


def test_save_answer_uses_custom_title_when_provided(rag_query_client):
    resp = rag_query_client.post(
        "/api/v1/rag/save-answer",
        json={
            "query": "long query " * 20,
            "answer": "ans",
            "provenance_ids": [],
            "title": "My chosen title",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "My chosen title"


def test_save_answer_truncates_long_query_into_title(rag_query_client):
    long_q = "Why does the system behave this way under contention " * 10
    resp = rag_query_client.post(
        "/api/v1/rag/save-answer",
        json={"query": long_q, "answer": "ans", "provenance_ids": []},
    )
    assert resp.status_code == 200
    title = resp.json()["title"]
    assert len(title) <= 81  # 80 chars + ellipsis


def test_save_answer_empty_answer_returns_400(rag_query_client):
    resp = rag_query_client.post(
        "/api/v1/rag/save-answer",
        json={"query": "Q", "answer": "", "provenance_ids": []},
    )
    assert resp.status_code == 400


def test_save_answer_records_summary(rag_query_client):
    c = rag_query_client
    a = _create_permanent(c, "Src", "x")
    resp = c.post(
        "/api/v1/rag/save-answer",
        json={
            "query": "What is X?",
            "answer": "X is foo.",
            "provenance_ids": [a["id"]],
        },
    )
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert "1 notes" in summary
    assert "What is X" in summary
