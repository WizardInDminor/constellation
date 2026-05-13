"""Route tests for the embedding-jobs endpoints (list / retry / retry-all-failed)."""

import sqlite3


def _force_job_to_failed(db_path: str, node_id: str) -> str:
    """Insert a failed job directly into the DB for retry-route testing."""
    import uuid

    job_id = str(uuid.uuid4())
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO embedding_jobs(id, node_id, status, target_model, error, attempt_count, "
        "created_at) VALUES (?, ?, 'failed', 'voyage-4', 'rate limit', 1, datetime('now'))",
        (job_id, node_id),
    )
    conn.commit()
    conn.close()
    return job_id


def _get_db_path(monkeypatch_env: dict) -> str:
    return monkeypatch_env["DB_PATH"]


def test_list_returns_typed_envelope(client, tmp_path):
    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    # Bring in a failed job to populate counts
    job_id = _force_job_to_failed(str(tmp_path / "test.db"), node["id"])

    body = client.get("/api/v1/config/embedding-jobs").json()
    assert "items" in body and "counts" in body
    assert any(j["id"] == job_id for j in body["items"])
    assert body["counts"]["failed"] >= 1


def test_list_filters_by_status(client, tmp_path):
    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    _force_job_to_failed(str(tmp_path / "test.db"), node["id"])

    body = client.get("/api/v1/config/embedding-jobs?status=failed").json()
    assert len(body["items"]) >= 1
    assert all(j["status"] == "failed" for j in body["items"])

    body = client.get("/api/v1/config/embedding-jobs?status=pending").json()
    assert all(j["status"] == "pending" for j in body["items"])


def test_retry_happy_path(client, tmp_path):
    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    job_id = _force_job_to_failed(str(tmp_path / "test.db"), node["id"])

    r = client.post(f"/api/v1/config/embedding-jobs/{job_id}/retry")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == job_id
    assert body["status"] == "pending"
    assert body["error"] is None
    assert body["attempt_count"] == 2  # was 1, bumped


def test_retry_missing_returns_404(client):
    r = client.post("/api/v1/config/embedding-jobs/ghost-id/retry")
    assert r.status_code == 404


def test_retry_wrong_status_returns_409(client, tmp_path):
    # Created via the normal pipeline, so the job (if any) is 'complete', not 'failed'.
    # Insert a pending job manually for clarity.
    import sqlite3 as _sql
    import uuid as _u

    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    job_id = str(_u.uuid4())
    conn = _sql.connect(str(tmp_path / "test.db"))
    conn.execute(
        "INSERT INTO embedding_jobs(id, node_id, status, target_model, attempt_count, created_at)"
        " VALUES (?, ?, 'pending', 'voyage-4', 0, datetime('now'))",
        (job_id, node["id"]),
    )
    conn.commit()
    conn.close()

    r = client.post(f"/api/v1/config/embedding-jobs/{job_id}/retry")
    assert r.status_code == 409


def test_retry_all_failed_returns_count(client, tmp_path):
    node = client.post("/api/v1/nodes/permanent", json={"title": "N", "content": "c"}).json()
    _force_job_to_failed(str(tmp_path / "test.db"), node["id"])
    _force_job_to_failed(str(tmp_path / "test.db"), node["id"])

    r = client.post("/api/v1/config/embedding-jobs/retry-all-failed")
    assert r.status_code == 200
    assert r.json() == {"retried": 2}

    body = client.get("/api/v1/config/embedding-jobs?status=failed").json()
    assert body["items"] == []
