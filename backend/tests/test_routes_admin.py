"""Route tests for /admin/status."""

import sqlite3
import uuid


def _insert_failed(db_path: str, node_id: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO embedding_jobs(id, node_id, status, target_model, error, attempt_count, "
        "created_at) VALUES (?, ?, 'failed', 'voyage-4', 'boom', 1, datetime('now'))",
        (str(uuid.uuid4()), node_id),
    )
    conn.commit()
    conn.close()


def test_status_returns_expected_shape(client):
    r = client.get("/api/v1/admin/status")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {
        "last_drain_at",
        "drain_count",
        "pending_jobs",
        "failed_jobs",
        "cooldown_until",
    }


def test_status_initial_values_pre_drain(client):
    body = client.get("/api/v1/admin/status").json()
    # Worker may have ticked once during startup; allow either None/0 or a small int.
    assert body["last_drain_at"] is None or isinstance(body["last_drain_at"], str)
    assert isinstance(body["drain_count"], int)
    assert body["pending_jobs"] == 0
    assert body["failed_jobs"] == 0
    assert body["cooldown_until"] is None


def test_status_reflects_queue_depth(client, tmp_path):
    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    _insert_failed(str(tmp_path / "test.db"), node["id"])
    _insert_failed(str(tmp_path / "test.db"), node["id"])

    body = client.get("/api/v1/admin/status").json()
    assert body["failed_jobs"] == 2


def test_status_exposes_cooldown_until(client):
    """When the worker sets a cooldown, the status endpoint surfaces it as ISO."""
    from datetime import UTC, datetime, timedelta

    future = datetime.now(UTC) + timedelta(seconds=42)
    client.app.state.cooldown_until = future
    try:
        body = client.get("/api/v1/admin/status").json()
        assert body["cooldown_until"] is not None
        assert "T" in body["cooldown_until"]  # ISO 8601 sanity
    finally:
        client.app.state.cooldown_until = None


def test_stats_empty_db(client):
    body = client.get("/api/v1/admin/stats").json()
    assert body["nodes_by_type"] == {}
    assert body["edges"] == 0
    assert body["sources"] == 0
    assert body["tags"] == 0
    assert body["inbox"] == 0
    assert body["last_processed_at"] is None


def test_stats_counts_nodes_edges_inbox(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "A", "content": "a"}).json()
    b = client.post("/api/v1/nodes/permanent", json={"title": "B", "content": "b"}).json()
    client.post("/api/v1/nodes/fleeting", json={"title": "F", "content": "f"})
    client.post(
        "/api/v1/edges",
        json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"},
    )

    body = client.get("/api/v1/admin/stats").json()
    assert body["nodes_by_type"]["permanent"] == 2
    assert body["nodes_by_type"]["fleeting"] == 1
    assert body["edges"] == 1
    assert body["inbox"] == 1
