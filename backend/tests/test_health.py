import sqlite3


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_schema_tables_created(client, tmp_path):  # noqa: ARG001
    db_path = str(tmp_path / "test.db")
    with sqlite3.connect(db_path) as db:
        cursor = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = {row[0] for row in cursor.fetchall()}

    expected = {
        "nodes", "edges", "sources", "tags", "node_tags",
        "config", "embedding_jobs", "schema_migrations",
    }
    assert expected.issubset(tables)
