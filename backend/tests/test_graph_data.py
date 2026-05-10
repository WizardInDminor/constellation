"""Tests for GET /graph/data."""

import pytest
from starlette.testclient import TestClient


@pytest.fixture
def graph_client(tmp_path, monkeypatch):
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


def _make_node(client, node_type, title, content="content", **kwargs):
    endpoint = {
        "fleeting": "/api/v1/nodes/fleeting",
        "permanent": "/api/v1/nodes/permanent",
        "literature": "/api/v1/nodes/literature",
        "structure": "/api/v1/nodes/structure",
    }[node_type]
    body = {"title": title, "content": content, **kwargs}
    r = client.post(endpoint, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _make_edge(client, from_id, to_id, edge_type="SUPPORTS"):
    r = client.post(
        "/api/v1/edges",
        json={"from_id": from_id, "to_id": to_id, "type": edge_type},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_tag(client, name):
    r = client.post("/api/v1/tags", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Shape
# ---------------------------------------------------------------------------


def test_graph_data_empty_db(graph_client):
    r = graph_client.get("/api/v1/graph/data")
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body
    assert "edges" in body
    assert body["nodes"] == []
    assert body["edges"] == []


def test_graph_data_correct_shape(graph_client):
    _make_node(graph_client, "permanent", "Note A")
    r = graph_client.get("/api/v1/graph/data")
    assert r.status_code == 200
    body = r.json()
    assert len(body["nodes"]) == 1
    node = body["nodes"][0]
    assert "id" in node
    assert "title" in node
    assert "type" in node
    assert "tags" in node
    assert node["title"] == "Note A"
    assert node["type"] == "permanent"
    assert isinstance(node["tags"], list)


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------


def test_soft_deleted_node_excluded(graph_client):
    node = _make_node(graph_client, "permanent", "To Delete")
    graph_client.delete(f"/api/v1/nodes/{node['id']}")
    r = graph_client.get("/api/v1/graph/data")
    ids = [n["id"] for n in r.json()["nodes"]]
    assert node["id"] not in ids


def test_edge_excluded_when_from_node_deleted(graph_client):
    src = _make_node(graph_client, "permanent", "Source")
    dst = _make_node(graph_client, "permanent", "Dest")
    edge = _make_edge(graph_client, src["id"], dst["id"])
    graph_client.delete(f"/api/v1/nodes/{src['id']}")
    r = graph_client.get("/api/v1/graph/data")
    edge_ids = [e["id"] for e in r.json()["edges"]]
    assert edge["id"] not in edge_ids


def test_edge_excluded_when_to_node_deleted(graph_client):
    src = _make_node(graph_client, "permanent", "Source2")
    dst = _make_node(graph_client, "permanent", "Dest2")
    edge = _make_edge(graph_client, src["id"], dst["id"])
    graph_client.delete(f"/api/v1/nodes/{dst['id']}")
    r = graph_client.get("/api/v1/graph/data")
    edge_ids = [e["id"] for e in r.json()["edges"]]
    assert edge["id"] not in edge_ids


# ---------------------------------------------------------------------------
# Fleeting filter
# ---------------------------------------------------------------------------


def test_fleeting_excluded_by_default(graph_client):
    fleeting = _make_node(graph_client, "fleeting", "Quick thought")
    permanent = _make_node(graph_client, "permanent", "Solid idea")
    r = graph_client.get("/api/v1/graph/data")
    ids = [n["id"] for n in r.json()["nodes"]]
    assert fleeting["id"] not in ids
    assert permanent["id"] in ids


def test_fleeting_included_with_param(graph_client):
    fleeting = _make_node(graph_client, "fleeting", "Quick thought 2")
    r = graph_client.get("/api/v1/graph/data?include_fleeting=true")
    ids = [n["id"] for n in r.json()["nodes"]]
    assert fleeting["id"] in ids


def test_edges_to_fleeting_excluded_by_default(graph_client):
    fleeting = _make_node(graph_client, "fleeting", "Fleeting target")
    permanent = _make_node(graph_client, "permanent", "Permanent source")
    edge = _make_edge(graph_client, permanent["id"], fleeting["id"], "INSPIRED_BY")
    r = graph_client.get("/api/v1/graph/data")
    edge_ids = [e["id"] for e in r.json()["edges"]]
    assert edge["id"] not in edge_ids


def test_edges_to_fleeting_included_with_param(graph_client):
    fleeting = _make_node(graph_client, "fleeting", "Fleeting target 2")
    permanent = _make_node(graph_client, "permanent", "Permanent source 2")
    edge = _make_edge(graph_client, permanent["id"], fleeting["id"], "INSPIRED_BY")
    r = graph_client.get("/api/v1/graph/data?include_fleeting=true")
    edge_ids = [e["id"] for e in r.json()["edges"]]
    assert edge["id"] in edge_ids


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def test_node_tags_populated(graph_client):
    tag = _make_tag(graph_client, "circuits")
    node = _make_node(graph_client, "permanent", "Tagged note", tag_ids=[tag["id"]])
    r = graph_client.get("/api/v1/graph/data")
    node_data = next(n for n in r.json()["nodes"] if n["id"] == node["id"])
    assert "circuits" in node_data["tags"]


def test_node_without_tags_has_empty_list(graph_client):
    node = _make_node(graph_client, "permanent", "Untagged note")
    r = graph_client.get("/api/v1/graph/data")
    node_data = next(n for n in r.json()["nodes"] if n["id"] == node["id"])
    assert node_data["tags"] == []


# ---------------------------------------------------------------------------
# Source nodes
# ---------------------------------------------------------------------------


def _make_source(client, title="Test Source", src_type="datasheet", author=None, url=None):
    body = {"title": title, "type": src_type}
    if author:
        body["author"] = author
    if url:
        body["url"] = url
    r = client.post("/api/v1/sources", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_source_appears_as_graph_node(graph_client):
    src = _make_source(graph_client, "MCP4922 Datasheet")
    r = graph_client.get("/api/v1/graph/data")
    assert r.status_code == 200
    ids = [n["id"] for n in r.json()["nodes"]]
    assert src["id"] in ids


def test_source_node_has_correct_type(graph_client):
    src = _make_source(graph_client, "Some Manual")
    r = graph_client.get("/api/v1/graph/data")
    node = next(n for n in r.json()["nodes"] if n["id"] == src["id"])
    assert node["type"] == "source"


def test_source_node_carries_metadata(graph_client):
    src = _make_source(
        graph_client,
        title="Datasheet With Meta",
        src_type="datasheet",
        author="Microchip",
        url="file:///datasheets/mcp4922.pdf",
    )
    r = graph_client.get("/api/v1/graph/data")
    node = next(n for n in r.json()["nodes"] if n["id"] == src["id"])
    assert node["source_entry_type"] == "datasheet"
    assert node["source_author"] == "Microchip"
    assert node["source_url"] == "file:///datasheets/mcp4922.pdf"


def test_source_node_has_empty_tags(graph_client):
    src = _make_source(graph_client, "No Tags Source")
    r = graph_client.get("/api/v1/graph/data")
    node = next(n for n in r.json()["nodes"] if n["id"] == src["id"])
    assert node["tags"] == []


def test_cites_edge_appears_for_literature_note(graph_client):
    src = _make_source(graph_client, "Cited Source")
    lit = _make_node(graph_client, "literature", "Literature note", source_id=src["id"])
    r = graph_client.get("/api/v1/graph/data")
    edges = r.json()["edges"]
    cites = [e for e in edges if e["type"] == "CITES"]
    assert any(e["from_id"] == lit["id"] and e["to_id"] == src["id"] for e in cites)


def test_cites_edge_id_is_deterministic(graph_client):
    src = _make_source(graph_client, "Stable Source")
    lit = _make_node(graph_client, "literature", "Stable Lit", source_id=src["id"])
    r = graph_client.get("/api/v1/graph/data")
    edges = r.json()["edges"]
    cites = next(e for e in edges if e["type"] == "CITES" and e["from_id"] == lit["id"])
    assert cites["id"] == f"cites-{lit['id']}"


def test_source_always_appears_regardless_of_include_fleeting(graph_client):
    src = _make_source(graph_client, "Persistent Source")
    for param in ["", "?include_fleeting=false", "?include_fleeting=true"]:
        r = graph_client.get(f"/api/v1/graph/data{param}")
        ids = [n["id"] for n in r.json()["nodes"]]
        assert src["id"] in ids, f"Source missing with param={param!r}"


def test_cites_edge_excluded_when_literature_node_deleted(graph_client):
    src = _make_source(graph_client, "Source For Deleted Lit")
    lit = _make_node(graph_client, "literature", "Deleted Lit", source_id=src["id"])
    graph_client.delete(f"/api/v1/nodes/{lit['id']}")
    r = graph_client.get("/api/v1/graph/data")
    edges = r.json()["edges"]
    assert not any(e["from_id"] == lit["id"] for e in edges)
