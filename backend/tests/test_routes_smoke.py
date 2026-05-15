"""Smoke tests for edges, sources, tags, and config routes."""


# ── edges ─────────────────────────────────────────────────────────────────────


def _two_nodes(client):
    a = client.post("/api/v1/nodes/fleeting", json={"title": "A", "content": "a"}).json()
    b = client.post("/api/v1/nodes/fleeting", json={"title": "B", "content": "b"}).json()
    return a, b


def test_create_edge(client):
    a, b = _two_nodes(client)
    r = client.post(
        "/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"}
    )
    assert r.status_code == 201
    data = r.json()
    assert data["from_id"] == a["id"]
    assert data["to_id"] == b["id"]
    assert data["type"] == "SUPPORTS"


def test_create_edge_duplicate_returns_409(client):
    a, b = _two_nodes(client)
    client.post("/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"})
    r = client.post(
        "/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"}
    )
    assert r.status_code == 409


def test_create_edge_invalid_type_returns_422(client):
    a, b = _two_nodes(client)
    r = client.post("/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "INVALID"})
    assert r.status_code == 422


def test_delete_edge(client):
    a, b = _two_nodes(client)
    edge = client.post(
        "/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "ELABORATES"}
    ).json()
    r = client.delete(f"/api/v1/edges/{edge['id']}")
    assert r.status_code == 204


def test_delete_edge_not_found(client):
    assert client.delete("/api/v1/edges/ghost").status_code == 404


def test_create_edge_accepts_classifier_rationale(client):
    a, b = _two_nodes(client)
    rationale = "Both describe converging-but-not-identical control loops."
    r = client.post(
        "/api/v1/edges",
        json={
            "from_id": a["id"],
            "to_id": b["id"],
            "type": "ANALOGOUS_TO",
            "note": "interesting",
            "classifier_rationale": rationale,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["note"] == "interesting"
    assert body["classifier_rationale"] == rationale


# ── sources ───────────────────────────────────────────────────────────────────


def test_create_and_get_source(client):
    r = client.post("/api/v1/sources", json={"title": "STM32 RM", "type": "manual", "author": "ST"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "STM32 RM"
    assert data["literature_notes"] == []

    fetched = client.get(f"/api/v1/sources/{data['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == data["id"]


def test_get_source_not_found(client):
    assert client.get("/api/v1/sources/ghost").status_code == 404


def test_list_sources(client):
    client.post("/api/v1/sources", json={"title": "Book A", "type": "book"})
    client.post("/api/v1/sources", json={"title": "Article B", "type": "article"})
    r = client.get("/api/v1/sources")
    assert r.status_code == 200
    titles = [s["title"] for s in r.json()]
    assert "Book A" in titles
    assert "Article B" in titles


def test_update_source(client):
    src = client.post("/api/v1/sources", json={"title": "Draft", "type": "other"}).json()
    r = client.patch(f"/api/v1/sources/{src['id']}", json={"title": "Final"})
    assert r.status_code == 200
    assert r.json()["title"] == "Final"


def test_update_source_not_found(client):
    assert client.patch("/api/v1/sources/ghost", json={"title": "X"}).status_code == 404


def test_delete_source(client):
    src = client.post("/api/v1/sources", json={"title": "Ephemeral", "type": "other"}).json()
    r = client.delete(f"/api/v1/sources/{src['id']}")
    assert r.status_code == 204
    assert client.get(f"/api/v1/sources/{src['id']}").status_code == 404


def test_delete_source_not_found(client):
    assert client.delete("/api/v1/sources/ghost").status_code == 404


def test_delete_source_with_linked_notes_returns_409(client):
    src = client.post("/api/v1/sources", json={"title": "Referenced", "type": "book"}).json()
    client.post(
        "/api/v1/nodes/literature",
        json={"title": "Note", "content": "body", "source_id": src["id"]},
    )
    r = client.delete(f"/api/v1/sources/{src['id']}")
    assert r.status_code == 409


# ── tags ──────────────────────────────────────────────────────────────────────


def test_create_and_get_tag(client):
    r = client.post("/api/v1/tags", json={"name": "electronics", "color": "#ff0000"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "electronics"
    assert data["color"] == "#ff0000"

    fetched = client.get(f"/api/v1/tags/{data['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "electronics"


def test_get_tag_not_found(client):
    assert client.get("/api/v1/tags/ghost").status_code == 404


def test_list_tags(client):
    client.post("/api/v1/tags", json={"name": "zettel"})
    client.post("/api/v1/tags", json={"name": "embedded"})
    r = client.get("/api/v1/tags")
    assert r.status_code == 200
    names = [t["name"] for t in r.json()]
    assert "zettel" in names
    assert "embedded" in names


def test_update_tag(client):
    tag = client.post("/api/v1/tags", json={"name": "old"}).json()
    r = client.patch(f"/api/v1/tags/{tag['id']}", json={"name": "new"})
    assert r.status_code == 200
    assert r.json()["name"] == "new"


def test_update_tag_not_found(client):
    assert client.patch("/api/v1/tags/ghost", json={"name": "x"}).status_code == 404


def test_delete_tag(client):
    tag = client.post("/api/v1/tags", json={"name": "to-delete"}).json()
    r = client.delete(f"/api/v1/tags/{tag['id']}")
    assert r.status_code == 204
    assert client.get(f"/api/v1/tags/{tag['id']}").status_code == 404


def test_delete_tag_not_found(client):
    assert client.delete("/api/v1/tags/ghost").status_code == 404


# ── config ────────────────────────────────────────────────────────────────────


def test_get_config_returns_seeded_values(client):
    r = client.get("/api/v1/config")
    assert r.status_code == 200
    keys = {entry["key"] for entry in r.json()}
    assert {
        "embedding_provider",
        "embedding_model",
        "generation_provider",
        "generation_model",
    } == keys


def test_get_embedding_jobs_empty(client):
    r = client.get("/api/v1/config/embedding-jobs")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["counts"] == {"pending": 0, "processing": 0, "complete": 0, "failed": 0}
