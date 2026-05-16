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
# ADR-061 — Scoped Ask (Phase 8.4)
# ---------------------------------------------------------------------------
# tag_filter and since on RagRequest restrict the *seed* set; graph expansion
# is unrestricted so typed edges can still reach into supporting context
# outside the scope. Provenance reports direct vs neighbour honestly.


def _create_tag(client, name: str) -> dict:
    r = client.post("/api/v1/tags", json={"name": name})
    assert r.status_code == 201
    return r.json()


def _tag_node(client, node_id: str, tag_ids: list[str]) -> None:
    r = client.patch(f"/api/v1/nodes/{node_id}", json={"tag_ids": tag_ids})
    assert r.status_code == 200


def test_rag_query_tag_filter_restricts_seeds(rag_query_client):
    c = rag_query_client
    eurorack = _create_tag(c, "eurorack")["id"]
    other = _create_tag(c, "other")["id"]

    n1 = _create_permanent(c, "Eurorack VCO basics", "voltage controlled oscillator")
    n2 = _create_permanent(c, "Cooking risotto", "stir the rice slowly")
    n3 = _create_permanent(c, "Eurorack envelope", "attack decay envelope shapes")
    _tag_node(c, n1["id"], [eurorack])
    _tag_node(c, n2["id"], [other])
    _tag_node(c, n3["id"], [eurorack])

    r = c.post(
        "/api/v1/rag/query",
        json={"query": "eurorack synthesis", "tag_filter": [eurorack]},
    )
    assert r.status_code == 200
    direct_ids = {
        p["node_id"] for p in r.json()["provenance"] if p["role"] == "direct"
    }
    # Off-tag note must not be a seed; eurorack notes may or may not all appear
    # depending on FTS ranking, but the off-tag one is forbidden.
    assert n2["id"] not in direct_ids
    assert direct_ids.issubset({n1["id"], n3["id"]})


def test_rag_query_tag_filter_or_semantics(rag_query_client):
    """tag_filter matches a node carrying ANY listed tag (OR semantics)."""
    c = rag_query_client
    t_a = _create_tag(c, "alpha")["id"]
    t_b = _create_tag(c, "beta")["id"]
    t_g = _create_tag(c, "gamma")["id"]

    n_a = _create_permanent(c, "Alpha note", "alpha content")
    n_b = _create_permanent(c, "Beta note", "beta content")
    n_g = _create_permanent(c, "Gamma note", "gamma content")
    _tag_node(c, n_a["id"], [t_a])
    _tag_node(c, n_b["id"], [t_b])
    _tag_node(c, n_g["id"], [t_g])

    r = c.post(
        "/api/v1/rag/query",
        json={"query": "content", "tag_filter": [t_a, t_b]},
    )
    assert r.status_code == 200
    direct_ids = {
        p["node_id"] for p in r.json()["provenance"] if p["role"] == "direct"
    }
    assert n_g["id"] not in direct_ids
    assert direct_ids.issubset({n_a["id"], n_b["id"]})


def test_rag_query_since_future_returns_no_seeds(rag_query_client):
    """A `since` timestamp in the future leaves zero seeds — the no-relevant
    sentinel path applies."""
    c = rag_query_client
    _create_permanent(c, "Anything", "some content")
    r = c.post(
        "/api/v1/rag/query",
        json={"query": "anything", "since": "2099-01-01T00:00:00Z"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provenance"] == []


def test_rag_query_no_filter_unchanged_behavior(rag_query_client):
    """Omitting tag_filter and since is identical to pre-Phase-8.4 behaviour."""
    c = rag_query_client
    _create_permanent(c, "Note A", "alpha content")
    _create_permanent(c, "Note B", "beta content")
    r = c.post("/api/v1/rag/query", json={"query": "alpha"})
    assert r.status_code == 200
    assert "answer" in r.json()


def test_rag_query_scope_seeds_only_neighbors_reach_outside(rag_query_client):
    """Graph expansion is *not* filtered: a seed within scope can pull an
    out-of-scope neighbour via an edge — that's exactly what typed edges
    (ADR-058) are for."""
    c = rag_query_client
    in_scope = _create_tag(c, "in_scope")["id"]
    seed = _create_permanent(c, "Scoped seed", "in scope content")
    outside = _create_permanent(c, "Out-of-scope neighbour", "supporting content")
    _tag_node(c, seed["id"], [in_scope])
    c.post(
        "/api/v1/edges",
        json={"from_id": seed["id"], "to_id": outside["id"], "type": "SUPPORTS"},
    )

    r = c.post(
        "/api/v1/rag/query",
        json={"query": "in scope content", "tag_filter": [in_scope], "depth": 1},
    )
    assert r.status_code == 200
    prov = r.json()["provenance"]
    roles_by_id = {p["node_id"]: p["role"] for p in prov}
    # Seed appears as direct (in scope)
    assert roles_by_id.get(seed["id"]) == "direct"
    # Neighbour reached via expansion comes through as "neighbor" even though
    # it doesn't carry the scoped tag.
    assert roles_by_id.get(outside["id"]) == "neighbor"


def test_rag_query_scope_composes_with_modes(captured_system_prompts):
    """Scope works with brief/critic modes; mode prompt is still selected
    correctly."""
    c, captured = captured_system_prompts
    r = c.post(
        "/api/v1/rag/query",
        json={"query": "argue for X", "mode": "brief", "tag_filter": []},
    )
    assert r.status_code == 200
    # Brief prompt is in play regardless of scope.
    assert "one-sided brief" in captured[0].lower()


# ---------------------------------------------------------------------------
# Mode-aware system prompt (ADR-053 + A10 — Ask supports default/brief/critic)
# ---------------------------------------------------------------------------


@pytest.fixture
def captured_system_prompts(monkeypatch):
    """A rag_query client that records every `system` arg passed to the gen provider."""
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()

    captured: list[str] = []

    class _FakeEmbed:
        model_id = "fake-embed"
        dimensions = 1024

        async def embed(self, text):
            return [0.0] * 1024

        async def embed_batch(self, texts):
            return [[0.0] * 1024 for _ in texts]

    class _CapturingGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            captured.append(system)
            return _RAG_ANSWER

    async def _fake_load(db, settings):
        return _FakeEmbed(), _CapturingGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c, captured

    cfg.get_settings.cache_clear()


@pytest.fixture
def captured_user_messages(tmp_path, monkeypatch):
    """A rag_query client that captures both the system prompt and the user
    message content sent to the gen provider, so tests can assert on the
    hedge prepended by the low-confidence path (ADR-057)."""
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    captured: list[dict] = []

    class _FakeEmbed:
        model_id = "fake-embed"
        dimensions = 1024

        async def embed(self, text):
            return [0.0] * 1024

        async def embed_batch(self, texts):
            return [[0.0] * 1024 for _ in texts]

    class _CapturingGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            captured.append({"system": system, "user": messages[0]["content"]})
            return _RAG_ANSWER

    async def _fake_load(db, settings):
        return _FakeEmbed(), _CapturingGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c, captured

    cfg.get_settings.cache_clear()


def test_rag_query_default_mode_uses_default_prompt(captured_system_prompts):
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "anything"})
    assert resp.status_code == 200
    assert len(captured) == 1
    # Default prompt mentions the balanced "preserve nuance" rule
    assert "preserve the nuance" in captured[0].lower()


def test_rag_query_brief_mode_uses_advocacy_prompt(captured_system_prompts):
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "argue for X", "mode": "brief"})
    assert resp.status_code == 200
    assert len(captured) == 1
    prompt = captured[0].lower()
    assert "one-sided brief" in prompt
    assert "do not introduce counterarguments" in prompt


def test_rag_query_critic_mode_uses_critic_prompt(captured_system_prompts):
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "review this note", "mode": "critic"})
    assert resp.status_code == 200
    assert len(captured) == 1
    prompt = captured[0].lower()
    assert "careful, skeptical reader" in prompt
    assert "numbered list" in prompt


def test_rag_query_rejects_unknown_mode(captured_system_prompts):
    c, _ = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "x", "mode": "snarky"})
    assert resp.status_code == 422


def test_rag_query_explicit_default_mode_matches_implicit(captured_system_prompts):
    """mode="default" and mode omitted must produce the same system prompt."""
    c, captured = captured_system_prompts
    c.post("/api/v1/rag/query", json={"query": "x", "mode": "default"})
    c.post("/api/v1/rag/query", json={"query": "x"})
    assert len(captured) == 2
    assert captured[0] == captured[1]


# ---------------------------------------------------------------------------
# ADR-058 — edge-aware prompt regression checks
# ---------------------------------------------------------------------------
# Structural guard for Phase 8.1: the default-mode prompt must instruct the
# model on the `Connections:` annotations `_build_context` writes into each
# note. The behaviour-level regression target is `evals/phase8_prototype/`
# (F3 fixture: model must respect encoded structure, not invent it).


def test_default_prompt_includes_edge_aware_block(captured_system_prompts):
    """ADR-058: default mode tells the model how to read the `Connections:` line."""
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "anything"})
    assert resp.status_code == 200
    prompt = captured[0]
    assert "Connections:" in prompt
    assert "CONTRADICTS" in prompt
    assert "SUPPORTS" in prompt
    assert "ANALOGOUS_TO" in prompt
    assert "COLLECTS" in prompt
    # The parenthesised note-text reminder is the most load-bearing token.
    assert "parenthesised text" in prompt.lower() or "parenthesized text" in prompt.lower()


def test_brief_prompt_does_not_include_edge_aware_block(captured_system_prompts):
    """ADR-058: brief mode intentionally omits the edge-aware block — the
    CONTRADICTS-naming instruction conflicts with brief's one-sided contract."""
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "argue for X", "mode": "brief"})
    assert resp.status_code == 200
    prompt = captured[0]
    # The diagnostic token chosen here is the literal "Connections:" header,
    # which only appears in the edge-aware block.
    assert "Connections:" not in prompt


def test_critic_prompt_does_not_include_edge_aware_block(captured_system_prompts):
    """ADR-058: critic mode operates on the input, not the retrieved corpus,
    so edge-type reasoning over neighbours is not the primary signal."""
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "review this", "mode": "critic"})
    assert resp.status_code == 200
    prompt = captured[0]
    assert "Connections:" not in prompt


# ---------------------------------------------------------------------------
# ADR-059 — resolved-edge annotation in `_build_context`
# ---------------------------------------------------------------------------
# Unit-level tests so the annotation format is pinned without needing to run
# the full retrieval+generation pipeline. The default-mode RAG prompt must
# also instruct the model on the `[resolved]` marker.


from datetime import UTC, datetime as _dt  # noqa: E402

from app.models.edge import EdgeDetail as _EdgeDetail  # noqa: E402
from app.models.node import NodeDetail as _NodeDetail  # noqa: E402
from app.services.rag_service import _build_context  # noqa: E402


def _make_node(node_id: str, title: str, content: str = "irrelevant") -> _NodeDetail:
    now = _dt.now(UTC)
    return _NodeDetail(
        id=node_id,
        type="permanent",
        title=title,
        content=content,
        summary=None,
        created_at=now,
        updated_at=now,
    )


def _make_edge(
    *,
    edge_id: str,
    from_id: str,
    to_id: str,
    edge_type: str = "CONTRADICTS",
    note: str | None = None,
    resolved_at: _dt | None = None,
    resolved_by_node_id: str | None = None,
) -> _EdgeDetail:
    return _EdgeDetail(
        id=edge_id,
        from_id=from_id,
        to_id=to_id,
        type=edge_type,
        note=note,
        resolved_at=resolved_at,
        resolved_by_node_id=resolved_by_node_id,
        created_at=_dt.now(UTC),
    )


def test_build_context_unresolved_edge_has_no_marker():
    a = _make_node("a", "A")
    b = _make_node("b", "B")
    edge = _make_edge(edge_id="e1", from_id="a", to_id="b", note="tension")
    context, _ = _build_context([a, b], [], [edge])
    assert "→ CONTRADICTS Note 2 (tension)" in context
    assert "[resolved" not in context


def test_build_context_resolved_edge_without_resolver_uses_bare_marker():
    a = _make_node("a", "A")
    b = _make_node("b", "B")
    edge = _make_edge(
        edge_id="e1",
        from_id="a",
        to_id="b",
        note="tension",
        resolved_at=_dt.now(UTC),
        resolved_by_node_id=None,
    )
    context, _ = _build_context([a, b], [], [edge])
    assert "→ CONTRADICTS [resolved] Note 2 (tension)" in context


def test_build_context_resolved_edge_with_in_context_resolver_includes_note_pointer():
    a = _make_node("a", "A")
    b = _make_node("b", "B")
    synth = _make_node("synth", "Synthesis")
    edge = _make_edge(
        edge_id="e1",
        from_id="a",
        to_id="b",
        note="tension",
        resolved_at=_dt.now(UTC),
        resolved_by_node_id="synth",
    )
    # synth shows up as a neighbor → note 3 in numbering
    context, _ = _build_context([a, b], [synth], [edge])
    assert "→ CONTRADICTS [resolved → Note 3] Note 2 (tension)" in context


def test_build_context_resolved_edge_with_out_of_context_resolver_falls_back_to_bare_marker():
    a = _make_node("a", "A")
    b = _make_node("b", "B")
    edge = _make_edge(
        edge_id="e1",
        from_id="a",
        to_id="b",
        resolved_at=_dt.now(UTC),
        resolved_by_node_id="not-in-context",
    )
    context, _ = _build_context([a, b], [], [edge])
    assert "→ CONTRADICTS [resolved] Note 2" in context
    assert "[resolved → Note" not in context


def test_default_prompt_explains_resolved_marker(captured_system_prompts):
    """ADR-059: default prompt must tell the model what `[resolved]` means."""
    c, captured = captured_system_prompts
    resp = c.post("/api/v1/rag/query", json={"query": "anything"})
    assert resp.status_code == 200
    prompt = captured[0]
    assert "[resolved]" in prompt
    assert "[resolved → Note N]" in prompt


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


# ---------------------------------------------------------------------------
# Cluster suggest-links (Bucket B — B3)
# ---------------------------------------------------------------------------


@pytest.fixture
def cluster_suggest_client(tmp_path, monkeypatch):
    """A test client whose gen provider routes per-source to a configurable
    response, so dedup behaviour can be exercised across multiple sources.

    Set `gen.responses_by_source[source_id] = candidate_id` before calling
    the cluster endpoint; the provider's `complete` sniffs the user prompt
    for the source's title and returns a suggestion pointing at the configured
    candidate.
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

    class _RoutedGen:
        model_id = "fake-gen"

        def __init__(self):
            # Maps source-title-substring → candidate_id for the returned suggestion
            self.candidate_for_title: dict[str, str] = {}

        async def complete(self, messages, system, max_tokens=1024):
            user_msg = messages[0]["content"]
            for title_marker, cid in self.candidate_for_title.items():
                if f"Title: {title_marker}" in user_msg.split("\n\nCANDIDATES:")[0]:
                    return VALID_LINKS_RESPONSE.replace("__PLACEHOLDER__", cid)
            return json.dumps({"suggestions": []})

    _gen = _RoutedGen()

    async def _fake_load(db, settings):
        return _FakeEmbed(), _gen

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c, _gen

    cfg.get_settings.cache_clear()


def test_cluster_suggest_requires_node_ids_or_tag(cluster_suggest_client):
    c, _ = cluster_suggest_client
    resp = c.post("/api/v1/rag/suggest-links/cluster", json={})
    assert resp.status_code == 422


def test_cluster_suggest_rejects_both_inputs(cluster_suggest_client):
    c, _ = cluster_suggest_client
    resp = c.post(
        "/api/v1/rag/suggest-links/cluster",
        json={"node_ids": ["x"], "tag_id": "y"},
    )
    assert resp.status_code == 422


def test_cluster_suggest_returns_proposals_with_endpoint_titles(cluster_suggest_client):
    c, gen = cluster_suggest_client
    a = _create_permanent(c, "Note A", "x")
    b = _create_permanent(c, "Note B", "y")
    # A's suggest-links call will return a suggestion pointing at B
    gen.candidate_for_title = {"Note A": b["id"]}
    resp = c.post("/api/v1/rag/suggest-links/cluster", json={"node_ids": [a["id"], b["id"]]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope_size"] == 2
    assert len(body["proposals"]) == 1
    p = body["proposals"][0]
    assert p["from_node"]["title"] == "Note A"
    assert p["to_node"]["title"] == "Note B"
    assert p["edge_type"] == "SUPPORTS"


def test_cluster_suggest_dedupes_reciprocal_pairs(cluster_suggest_client):
    """If A→B and B→A both surface, only one proposal survives."""
    c, gen = cluster_suggest_client
    a = _create_permanent(c, "Note A", "x")
    b = _create_permanent(c, "Note B", "y")
    # Both A's and B's calls produce a suggestion pointing at the other
    gen.candidate_for_title = {"Note A": b["id"], "Note B": a["id"]}
    resp = c.post("/api/v1/rag/suggest-links/cluster", json={"node_ids": [a["id"], b["id"]]})
    body = resp.json()
    assert len(body["proposals"]) == 1
    # First-seen wins → A is the source
    assert body["proposals"][0]["from_node"]["id"] == a["id"]


def test_cluster_suggest_excludes_fleeting_from_scope(cluster_suggest_client):
    c, gen = cluster_suggest_client
    fleeting = c.post("/api/v1/nodes/fleeting", json={"title": "F", "content": "x"}).json()
    perm = _create_permanent(c, "Perm", "y")
    resp = c.post(
        "/api/v1/rag/suggest-links/cluster",
        json={"node_ids": [fleeting["id"], perm["id"]]},
    )
    body = resp.json()
    # Fleeting filtered out → scope is just the permanent note
    assert body["scope_size"] == 1


def test_cluster_suggest_via_tag_resolves_nodes(cluster_suggest_client):
    c, gen = cluster_suggest_client
    tag = c.post("/api/v1/tags", json={"name": "topic"}).json()
    a = _create_permanent(c, "Note A", "x")
    b = _create_permanent(c, "Note B", "y")
    # Attach the tag to both
    for n in (a, b):
        r = c.patch(f"/api/v1/nodes/{n['id']}", json={"tag_ids": [tag["id"]]})
        assert r.status_code == 200
    gen.candidate_for_title = {"Note A": b["id"]}
    resp = c.post("/api/v1/rag/suggest-links/cluster", json={"tag_id": tag["id"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope_size"] == 2
    assert len(body["proposals"]) == 1


def test_cluster_suggest_empty_scope_returns_no_proposals(cluster_suggest_client):
    c, _ = cluster_suggest_client
    resp = c.post("/api/v1/rag/suggest-links/cluster", json={"node_ids": []})
    # Empty node_ids is the same as not providing it → 422 per the contract
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Low-confidence retrieval hedge (Bucket B — B5, ADR-057)
# ---------------------------------------------------------------------------


_LOW_CONFIDENCE_HEDGE_MARKER = "the knowledge base doesn't directly cover this question"


def _force_distance(monkeypatch, distance: float) -> None:
    """Patch search_similar_with_distances to return a single seed at the given
    L2 distance, so the test controls whether top_similarity is above or below
    the ADR-057 threshold.
    """
    from app.services import embedding_service

    async def _fake(db, vector, *, limit=10):
        # Return one seed id; the route then re-fetches the node to confirm
        # it exists, so the test must seed the DB with a single real node first.
        cursor = await db.execute("SELECT id FROM nodes LIMIT 1")
        row = await cursor.fetchone()
        if row is None:
            return []
        return [(row["id"], distance)]

    monkeypatch.setattr(embedding_service, "search_similar_with_distances", _fake)


def test_rag_query_high_confidence_omits_hedge(captured_user_messages, monkeypatch):
    c, captured = captured_user_messages
    _create_permanent(c, "Note", "x")
    # distance = 0 → similarity = 1.0, well above threshold
    _force_distance(monkeypatch, 0.0)
    resp = c.post("/api/v1/rag/query", json={"query": "anything"})
    assert resp.status_code == 200
    assert len(captured) == 1
    assert _LOW_CONFIDENCE_HEDGE_MARKER not in captured[0]["user"]


def test_rag_query_low_confidence_prepends_hedge(captured_user_messages, monkeypatch):
    c, captured = captured_user_messages
    _create_permanent(c, "Note", "x")
    # distance ≈ 1.2 → similarity ≈ 1 - 1.44/2 = 0.28, well below 0.55
    _force_distance(monkeypatch, 1.2)
    resp = c.post("/api/v1/rag/query", json={"query": "esoteric topic"})
    assert resp.status_code == 200
    assert len(captured) == 1
    assert _LOW_CONFIDENCE_HEDGE_MARKER in captured[0]["user"]
    # Hedge appears BEFORE the question
    hedge_idx = captured[0]["user"].index(_LOW_CONFIDENCE_HEDGE_MARKER)
    question_idx = captured[0]["user"].index("Question:")
    assert hedge_idx < question_idx


def test_rag_query_low_confidence_brief_mode_no_hedge(captured_user_messages, monkeypatch):
    """Brief mode handles weak retrieval in its own prompt — no separate hedge."""
    c, captured = captured_user_messages
    _create_permanent(c, "Note", "x")
    _force_distance(monkeypatch, 1.2)
    resp = c.post("/api/v1/rag/query", json={"query": "argue for X", "mode": "brief"})
    assert resp.status_code == 200
    assert _LOW_CONFIDENCE_HEDGE_MARKER not in captured[0]["user"]


def test_rag_query_low_confidence_critic_mode_no_hedge(captured_user_messages, monkeypatch):
    """Critic mode operates on the input, not the corpus — hedge irrelevant."""
    c, captured = captured_user_messages
    _create_permanent(c, "Note", "x")
    _force_distance(monkeypatch, 1.2)
    resp = c.post("/api/v1/rag/query", json={"query": "review", "mode": "critic"})
    assert resp.status_code == 200
    assert _LOW_CONFIDENCE_HEDGE_MARKER not in captured[0]["user"]


def test_rag_query_no_seeds_uses_existing_sentinel_not_hedge(captured_user_messages):
    """With zero seeds the existing '(No relevant notes found …)' kicks in."""
    c, captured = captured_user_messages
    # Empty corpus → no seeds, no neighbors → no hedge path
    resp = c.post("/api/v1/rag/query", json={"query": "anything"})
    assert resp.status_code == 200
    user = captured[0]["user"]
    assert "No relevant notes found" in user
    assert _LOW_CONFIDENCE_HEDGE_MARKER not in user
