"""Route-level tests for Phase 2 config and embedding integration."""


def test_patch_config_updates_single_value(client):
    r = client.patch("/api/v1/config", json={"generation_model": "claude-opus-4-7"})
    assert r.status_code == 200
    entries = {e["key"]: e["value"] for e in r.json()}
    assert entries["generation_model"] == "claude-opus-4-7"
    # Unrelated keys unchanged
    assert entries["embedding_provider"] == "voyage"


def test_patch_config_updates_multiple_values(client):
    r = client.patch(
        "/api/v1/config",
        json={"embedding_model": "voyage-4-lite", "generation_model": "claude-haiku-4-5-20251001"},
    )
    assert r.status_code == 200
    entries = {e["key"]: e["value"] for e in r.json()}
    assert entries["embedding_model"] == "voyage-4-lite"
    assert entries["generation_model"] == "claude-haiku-4-5-20251001"


def test_patch_config_returns_full_config(client):
    r = client.patch("/api/v1/config", json={"generation_model": "claude-opus-4-7"})
    keys = {e["key"] for e in r.json()}
    assert keys == {
        "embedding_provider",
        "embedding_model",
        "generation_provider",
        "generation_model",
    }


def test_patch_config_empty_body_is_noop(client):
    before = {e["key"]: e["value"] for e in client.get("/api/v1/config").json()}
    r = client.patch("/api/v1/config", json={})
    assert r.status_code == 200
    after = {e["key"]: e["value"] for e in r.json()}
    assert before == after


def test_create_permanent_sets_embedding_model(client):
    r = client.post("/api/v1/nodes/permanent", json={"title": "T", "content": "c"})
    assert r.status_code == 201
    node = client.get(f"/api/v1/nodes/{r.json()['id']}").json()
    assert node["embedding_model"] == "fake-embed"


def test_create_literature_sets_embedding_model(client):
    src = client.post("/api/v1/sources", json={"title": "Book", "type": "book"}).json()
    r = client.post(
        "/api/v1/nodes/literature",
        json={"title": "Note", "content": "body", "source_id": src["id"]},
    )
    assert r.status_code == 201
    node = client.get(f"/api/v1/nodes/{r.json()['id']}").json()
    assert node["embedding_model"] == "fake-embed"


def test_create_structure_sets_embedding_model(client):
    r = client.post("/api/v1/nodes/structure", json={"title": "MOC", "content": "overview"})
    assert r.status_code == 201
    node = client.get(f"/api/v1/nodes/{r.json()['id']}").json()
    assert node["embedding_model"] == "fake-embed"


def test_create_fleeting_does_not_embed(client):
    r = client.post("/api/v1/nodes/fleeting", json={"title": "Raw", "content": "thought"})
    assert r.status_code == 201
    node = client.get(f"/api/v1/nodes/{r.json()['id']}").json()
    assert node["embedding_model"] is None


def test_update_content_triggers_reembed(client):
    node = client.post("/api/v1/nodes/permanent", json={"title": "T", "content": "original"}).json()
    assert node["embedding_model"] == "fake-embed"

    r = client.patch(f"/api/v1/nodes/{node['id']}", json={"content": "revised"})
    assert r.status_code == 200
    assert r.json()["embedding_model"] == "fake-embed"


def test_update_tags_only_does_not_reembed(client):
    # Create a tag then a node
    tag = client.post("/api/v1/tags", json={"name": "ai"}).json()
    node = client.post("/api/v1/nodes/permanent", json={"title": "T", "content": "c"}).json()

    # Patch only tags — should not trigger re-embed (embedding_model stays set)
    r = client.patch(f"/api/v1/nodes/{node['id']}", json={"tag_ids": [tag["id"]]})
    assert r.status_code == 200
    assert r.json()["embedding_model"] == "fake-embed"


def test_patch_config_queues_reembed_on_model_change(client):
    # Create a node — embedding_model = "fake-embed" (from FakeEmbeddingProvider)
    node = client.post("/api/v1/nodes/permanent", json={"title": "T", "content": "c"}).json()
    assert node["embedding_model"] == "fake-embed"

    # Change embedding model — config was "voyage-4", now "voyage-4-ultra"
    r = client.patch("/api/v1/config", json={"embedding_model": "voyage-4-ultra"})
    assert r.status_code == 200

    # A job should be queued (node has "fake-embed" != "voyage-4-ultra")
    body = client.get("/api/v1/config/embedding-jobs").json()
    assert len(body["items"]) == 1
    assert body["items"][0]["node_id"] == node["id"]
    assert body["items"][0]["target_model"] == "voyage-4-ultra"
    assert body["items"][0]["status"] == "pending"
    assert body["counts"]["pending"] == 1


def test_patch_config_no_reembed_when_model_unchanged(client):
    client.post("/api/v1/nodes/permanent", json={"title": "T", "content": "c"})

    # PATCH with the same model value that's already in config ("voyage-4")
    r = client.patch("/api/v1/config", json={"embedding_model": "voyage-4"})
    assert r.status_code == 200

    body = client.get("/api/v1/config/embedding-jobs").json()
    assert body["items"] == []
    assert body["counts"] == {"pending": 0, "processing": 0, "complete": 0, "failed": 0}
