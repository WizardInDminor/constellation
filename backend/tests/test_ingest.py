"""Route tests for POST /ingest/document, GET /ingest/pending/{source_id},
and DELETE /ingest/pending/{source_id}.

Uses the FakeGenerationProvider pattern from conftest.py.
"""

import json

import pytest
from starlette.testclient import TestClient

_VALID_GEN_RESPONSE = json.dumps(
    {
        "candidates": [
            {
                "title": "MCP4922 SPI clock maximum is 20 MHz at 5V",
                "content": (
                    "The MCP4922 supports SPI clock frequencies up to 20 MHz when "
                    "operating at 5V supply. At 3.3V, the maximum drops to 10 MHz."
                ),
                "summary": "MCP4922 SPI clock limited to 20 MHz at 5V.",
            }
        ]
    }
)


# ---------------------------------------------------------------------------
# Fixture: ingest client with a gen provider that returns valid JSON
# ---------------------------------------------------------------------------


@pytest.fixture
def ingest_client(tmp_path, monkeypatch):
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
            return _VALID_GEN_RESPONSE

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


@pytest.fixture
def bad_json_ingest_client(tmp_path, monkeypatch):
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
# Helpers
# ---------------------------------------------------------------------------

_SAMPLE_CONTENT = """\
## Pin Description

Each pin is numbered 1–8 and serves a specific function.

## Electrical Characteristics

The device operates at 2.7V to 5.5V supply voltage.
"""

_SOURCE_META = {
    "title": "MCP4922 Datasheet",
    "type": "datasheet",
    "url": "file:///home/matt/docs/mcp4922.pdf",
}


def _post_ingest(client, content=_SAMPLE_CONTENT, source=_SOURCE_META, source_id=None):
    body: dict = {"content": content}
    if source_id is not None:
        body["source_id"] = source_id
    else:
        body["source"] = source
    return client.post("/api/v1/ingest/document", json=body)


def _create_source(client):
    resp = client.post("/api/v1/sources", json=_SOURCE_META)
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# POST /ingest/document — happy paths
# ---------------------------------------------------------------------------


def test_ingest_new_source_creates_source_and_returns_candidates(ingest_client):
    resp = _post_ingest(ingest_client)
    assert resp.status_code == 200
    body = resp.json()

    # Response shape
    assert "source_id" in body
    assert "pending_ingest_id" in body
    assert body["chunks_processed"] >= 1
    assert body["total_candidates"] >= 1
    assert isinstance(body["chunks"], list)

    # Candidate shape
    for chunk in body["chunks"]:
        assert "chunk_index" in chunk
        assert "heading" in chunk
        assert isinstance(chunk["candidates"], list)
        for cand in chunk["candidates"]:
            assert "title" in cand
            assert "content" in cand
            assert "summary" in cand

    # Source was written to DB
    source_id = body["source_id"]
    src_resp = ingest_client.get(f"/api/v1/sources/{source_id}")
    assert src_resp.status_code == 200
    assert src_resp.json()["title"] == "MCP4922 Datasheet"


def test_ingest_no_nodes_written(ingest_client):
    resp = _post_ingest(ingest_client)
    assert resp.status_code == 200
    # No literature nodes should exist — candidates are not written
    nodes_resp = ingest_client.get("/api/v1/nodes", params={"type": "literature"})
    assert nodes_resp.status_code == 200
    assert nodes_resp.json()["items"] == []


def test_ingest_with_existing_source_id(ingest_client):
    existing_id = _create_source(ingest_client)
    resp = _post_ingest(ingest_client, source_id=existing_id)
    assert resp.status_code == 200
    assert resp.json()["source_id"] == existing_id

    # Only one source should exist
    sources = ingest_client.get("/api/v1/sources").json()
    assert len(sources) == 1


def test_ingest_pending_record_written(ingest_client):
    resp = _post_ingest(ingest_client)
    assert resp.status_code == 200
    source_id = resp.json()["source_id"]

    pending = ingest_client.get(f"/api/v1/ingest/pending/{source_id}")
    assert pending.status_code == 200
    body = pending.json()
    assert body["source_id"] == source_id
    assert isinstance(body["chunks"], list)
    assert len(body["chunks"]) >= 1


def test_ingest_upserts_pending_record_on_re_ingest(ingest_client):
    existing_id = _create_source(ingest_client)
    resp1 = _post_ingest(ingest_client, source_id=existing_id)
    pid1 = resp1.json()["pending_ingest_id"]

    resp2 = _post_ingest(ingest_client, source_id=existing_id)
    pid2 = resp2.json()["pending_ingest_id"]

    assert pid1 != pid2  # old record replaced

    # Only the new record should be retrievable
    pending = ingest_client.get(f"/api/v1/ingest/pending/{existing_id}")
    assert pending.json()["id"] == pid2


# ---------------------------------------------------------------------------
# POST /ingest/document — validation errors
# ---------------------------------------------------------------------------


def test_ingest_both_source_and_source_id_returns_422(ingest_client):
    existing_id = _create_source(ingest_client)
    resp = ingest_client.post(
        "/api/v1/ingest/document",
        json={"content": "text", "source_id": existing_id, "source": _SOURCE_META},
    )
    assert resp.status_code == 422


def test_ingest_neither_source_nor_source_id_returns_422(ingest_client):
    resp = ingest_client.post("/api/v1/ingest/document", json={"content": "text"})
    assert resp.status_code == 422


def test_ingest_missing_source_id_returns_404(ingest_client):
    resp = _post_ingest(ingest_client, source_id="nonexistent-id")
    assert resp.status_code == 404


def test_ingest_empty_content_returns_400(ingest_client):
    resp = _post_ingest(ingest_client, content="   ")
    assert resp.status_code == 400


def test_ingest_over_chunk_limit_returns_400(ingest_client):
    from app.services.doc_chunker import MAX_CHUNKS

    # Build a markdown doc with MAX_CHUNKS + 5 sections, each short
    sections = "\n\n".join(f"## Section {i}\n\nShort content." for i in range(MAX_CHUNKS + 5))
    resp = _post_ingest(ingest_client, content=sections)
    assert resp.status_code == 400
    assert "chunk" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Per-chunk failure isolation (ADR-030)
# ---------------------------------------------------------------------------


def test_bad_json_from_ai_yields_error_chunk_not_500(bad_json_ingest_client):
    resp = _post_ingest(bad_json_ingest_client)
    assert resp.status_code == 200
    body = resp.json()
    # All chunks errored but request succeeded
    assert body["total_candidates"] == 0
    for chunk in body["chunks"]:
        assert chunk["candidates"] == []
        assert chunk["error"] is not None


# ---------------------------------------------------------------------------
# GET /ingest/pending/{source_id}
# ---------------------------------------------------------------------------


def test_get_pending_not_found_returns_404(ingest_client):
    resp = ingest_client.get("/api/v1/ingest/pending/nonexistent-id")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /ingest/pending/{source_id}
# ---------------------------------------------------------------------------


def test_delete_pending_removes_record(ingest_client):
    resp = _post_ingest(ingest_client)
    source_id = resp.json()["source_id"]

    del_resp = ingest_client.delete(f"/api/v1/ingest/pending/{source_id}")
    assert del_resp.status_code == 204

    get_resp = ingest_client.get(f"/api/v1/ingest/pending/{source_id}")
    assert get_resp.status_code == 404


def test_delete_pending_idempotent(ingest_client):
    resp = _post_ingest(ingest_client)
    source_id = resp.json()["source_id"]

    ingest_client.delete(f"/api/v1/ingest/pending/{source_id}")
    # Second delete should not error
    del_resp = ingest_client.delete(f"/api/v1/ingest/pending/{source_id}")
    assert del_resp.status_code == 204
