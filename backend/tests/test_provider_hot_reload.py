"""Provider hot-reload consistency (ADR-091).

PATCH /api/v1/config rebuilds the active providers. Before ADR-091 it only
updated `app.state`, so the MCP tools (which read the module-level registry
in `app.core.lifespan`) kept embedding with the STALE provider after a live
model switch — while the corpus was being re-embedded to the new model.

These tests pin the single-authority behavior: after a live config change,
routes, the embedding worker path, and the MCP tools all see the same new
provider instance.
"""

import json

import pytest
from starlette.testclient import TestClient

import app.core.lifespan as lsp


class RecordingEmbeddingProvider:
    """Fake provider whose model_id mirrors the configured embedding_model
    at load time, recording every embed call."""

    dimensions = 1024

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.embed_calls: list[str] = []

    async def embed(self, text: str) -> list[float]:
        self.embed_calls.append(text)
        return [0.0] * 1024

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        self.embed_calls.extend(texts)
        return [[0.0] * 1024 for _ in texts]


class FakeGen:
    def __init__(self, model_id: str):
        self.model_id = model_id

    async def complete(self, messages, system, max_tokens=1024, *, enable_web_search=False):
        return "fake"


@pytest.fixture
def reload_client(tmp_path, monkeypatch):
    """Like the shared `client` fixture, but the fake provider loader is
    config-sensitive: each (re)load builds a provider named after the
    currently configured model, so a hot-reload is observable."""
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    async def _config_sensitive_load(db, settings):
        from app.repositories import config_repo

        embed_model = (await config_repo.get(db, "embedding_model")).value
        gen_model = (await config_repo.get(db, "generation_model")).value
        return RecordingEmbeddingProvider(embed_model), FakeGen(gen_model)

    monkeypatch.setattr(lsp, "_load_providers", _config_sensitive_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


def test_config_patch_swaps_provider_for_all_readers(reload_client):
    """The module registry (worker + MCP path), the route dependency path,
    and app.state all agree before and after a live model change."""
    initial = lsp.get_embedding_provider()
    assert initial.model_id == "voyage-4"  # seeded config
    assert reload_client.app.state.embedding_provider is initial

    r = reload_client.patch(
        "/api/v1/config", json={"embedding_model": "voyage-4-large"}
    )
    assert r.status_code == 200

    swapped = lsp.get_embedding_provider()
    assert swapped is not initial
    assert swapped.model_id == "voyage-4-large"
    # Route dependency path and introspection mirror are the same object.
    assert reload_client.app.state.embedding_provider is swapped
    # Generation provider swapped through the same single setter.
    assert lsp.get_generation_provider() is reload_client.app.state.generation_provider


def test_config_patch_reaches_mcp_tools(reload_client, monkeypatch):
    """Regression for the original defect: after a live embedding-model
    change, an MCP tool call embeds with the NEW provider, not the stale
    one captured at startup."""
    import app.core.config as cfg

    monkeypatch.setenv("MCP_TOKENS", "tok|Probe|read")
    cfg.get_settings.cache_clear()
    try:
        stale = lsp.get_embedding_provider()
        reload_client.patch(
            "/api/v1/config", json={"embedding_model": "voyage-5"}
        )
        fresh = lsp.get_embedding_provider()
        assert fresh is not stale and fresh.model_id == "voyage-5"

        r = reload_client.post(
            "/mcp/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "search_story",
                    "arguments": {"query": "vincent"},
                },
            },
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": "Bearer tok",
            },
        )
        assert r.status_code == 200
        result = r.json()["result"]
        assert not result.get("isError"), result
        json.loads(result["content"][0]["text"])  # well-formed tool payload

        assert fresh.embed_calls == ["vincent"]  # new provider did the work
        assert stale.embed_calls == []  # stale one untouched
    finally:
        cfg.get_settings.cache_clear()


def test_route_dependency_reads_registry_after_swap(reload_client):
    """A node created after the swap is embedded by the new provider via the
    normal HTTP route dependency (EmbedProvider)."""
    reload_client.patch("/api/v1/config", json={"embedding_model": "voyage-6"})
    fresh = lsp.get_embedding_provider()

    r = reload_client.post(
        "/api/v1/nodes/permanent",
        json={"title": "After the swap", "content": "embedded by the new model"},
    )
    assert r.status_code == 201
    assert fresh.embed_calls, "route did not embed via the swapped provider"
