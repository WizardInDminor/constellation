def test_create_fleeting(client):
    r = client.post("/api/v1/nodes/fleeting", json={"title": "Quick", "content": "body"})
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "fleeting"
    assert data["title"] == "Quick"
    assert data["outgoing_edges"] == []
    assert data["tags"] == []


def test_create_permanent(client):
    r = client.post("/api/v1/nodes/permanent", json={"title": "Perm", "content": "body"})
    assert r.status_code == 201
    assert r.json()["type"] == "permanent"


def test_create_structure(client):
    r = client.post("/api/v1/nodes/structure", json={"title": "MOC", "content": "overview"})
    assert r.status_code == 201
    assert r.json()["type"] == "structure"


def test_create_literature_bad_source(client):
    r = client.post(
        "/api/v1/nodes/literature",
        json={"title": "Note", "content": "body", "source_id": "bad-id"},
    )
    assert r.status_code == 422


def test_create_literature_valid_source(client):
    src = client.post("/api/v1/sources", json={"title": "A Book", "type": "book"}).json()
    r = client.post(
        "/api/v1/nodes/literature",
        json={"title": "Note", "content": "body", "source_id": src["id"]},
    )
    assert r.status_code == 201
    assert r.json()["source_id"] == src["id"]


def test_list_nodes_empty(client):
    r = client.get("/api/v1/nodes")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_list_nodes_with_data(client):
    client.post("/api/v1/nodes/fleeting", json={"title": "F1", "content": "x"})
    client.post("/api/v1/nodes/permanent", json={"title": "P1", "content": "x"})
    r = client.get("/api/v1/nodes")
    assert r.json()["total"] == 2


def test_list_nodes_type_filter(client):
    client.post("/api/v1/nodes/fleeting", json={"title": "F1", "content": "x"})
    client.post("/api/v1/nodes/permanent", json={"title": "P1", "content": "x"})
    r = client.get("/api/v1/nodes?type=fleeting")
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["type"] == "fleeting"


def test_get_node(client):
    created = client.post("/api/v1/nodes/fleeting", json={"title": "Hi", "content": "body"}).json()
    r = client.get(f"/api/v1/nodes/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_get_node_not_found(client):
    assert client.get("/api/v1/nodes/ghost").status_code == 404


def test_get_inbox(client):
    client.post("/api/v1/nodes/fleeting", json={"title": "Inbox", "content": "x"})
    client.post("/api/v1/nodes/permanent", json={"title": "NotInbox", "content": "x"})
    r = client.get("/api/v1/nodes/inbox")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["title"] == "Inbox"


def test_update_node(client):
    created = client.post("/api/v1/nodes/fleeting", json={"title": "Old", "content": "old"}).json()
    r = client.patch(f"/api/v1/nodes/{created['id']}", json={"title": "New"})
    assert r.status_code == 200
    assert r.json()["title"] == "New"


def test_update_node_not_found(client):
    r = client.patch("/api/v1/nodes/ghost", json={"title": "X"})
    assert r.status_code == 404


def test_delete_node(client):
    created = client.post("/api/v1/nodes/fleeting", json={"title": "Bye", "content": "x"}).json()
    r = client.delete(f"/api/v1/nodes/{created['id']}")
    assert r.status_code == 204
    assert client.get(f"/api/v1/nodes/{created['id']}").status_code == 404


def test_delete_node_not_found(client):
    assert client.delete("/api/v1/nodes/ghost").status_code == 404


def test_get_neighbors(client):
    a = client.post("/api/v1/nodes/fleeting", json={"title": "A", "content": "a"}).json()
    b = client.post("/api/v1/nodes/fleeting", json={"title": "B", "content": "b"}).json()
    client.post("/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"})
    r = client.get(f"/api/v1/nodes/{a['id']}/neighbors")
    assert r.status_code == 200
    neighbors = r.json()
    assert len(neighbors) == 1
    assert neighbors[0]["node"]["id"] == b["id"]
    assert neighbors[0]["direction"] == "outgoing"


def test_process_node_marks_processed(client):
    created = client.post("/api/v1/nodes/fleeting", json={"title": "R", "content": "x"}).json()
    r = client.post(f"/api/v1/nodes/{created['id']}/process")
    assert r.status_code == 200
    assert r.json()["processed_at"] is not None
