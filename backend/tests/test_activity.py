"""Tests for the /activity endpoint and supporting repo queries (Bucket B — B1, ADR-054)."""

from datetime import UTC, datetime, timedelta

from app.models import EdgeCreate, FleetingCreate, PermanentCreate
from app.repositories import edge_repo, node_repo


# ---------------------------------------------------------------------------
# Repo-level windowing tests (db fixture — direct backdating via UPDATE)
# ---------------------------------------------------------------------------


def _iso_days_ago(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).isoformat()


async def _backdate(db, node_id: str, *, created: str, updated: str | None = None) -> None:
    await db.execute(
        "UPDATE nodes SET created_at = ?, updated_at = ? WHERE id = ?",
        (created, updated or created, node_id),
    )
    await db.commit()


async def test_list_recently_captured_includes_fresh_fleeting(db):
    fresh = await node_repo.create_fleeting(db, FleetingCreate(title="fresh", content="x"))
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7))
    assert fresh.id in [n.id for n in out]


async def test_list_recently_captured_excludes_pre_window(db):
    old = await node_repo.create_fleeting(db, FleetingCreate(title="old", content="x"))
    await _backdate(db, old.id, created=_iso_days_ago(14))
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7))
    assert old.id not in [n.id for n in out]
    # Wider window pulls it back in
    wide = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(30))
    assert old.id in [n.id for n in wide]


async def test_list_recently_captured_excludes_non_fleeting(db):
    perm = await node_repo.create_permanent(db, PermanentCreate(title="P", content="x"))
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7))
    assert perm.id not in [n.id for n in out]


async def test_list_recently_captured_excludes_soft_deleted(db):
    note = await node_repo.create_fleeting(db, FleetingCreate(title="doomed", content="x"))
    await node_repo.soft_delete(db, note.id)
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7))
    assert note.id not in [n.id for n in out]


async def test_list_recently_captured_orders_newest_first(db):
    first = await node_repo.create_fleeting(db, FleetingCreate(title="first", content="x"))
    second = await node_repo.create_fleeting(db, FleetingCreate(title="second", content="x"))
    # Force the timestamps explicitly to remove any ambiguity
    await _backdate(db, first.id, created=_iso_days_ago(2))
    await _backdate(db, second.id, created=_iso_days_ago(1))
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7))
    ids = [n.id for n in out]
    assert ids.index(second.id) < ids.index(first.id)


async def test_list_recently_captured_caps_at_limit(db):
    for i in range(12):
        await node_repo.create_fleeting(db, FleetingCreate(title=f"n{i}", content="x"))
    out = await node_repo.list_recently_captured(db, since_iso=_iso_days_ago(7), limit=10)
    assert len(out) == 10


async def test_list_recently_edited_excludes_just_born(db):
    """The strict updated_at > created_at filter keeps births out of 'edited'."""
    fresh = await node_repo.create_permanent(db, PermanentCreate(title="P", content="x"))
    out = await node_repo.list_recently_edited(db, since_iso=_iso_days_ago(7))
    assert fresh.id not in [n.id for n in out]


async def test_list_recently_edited_includes_real_edit(db):
    note = await node_repo.create_permanent(db, PermanentCreate(title="old", content="x"))
    # Real edit — updated_at jumps forward; created_at unchanged
    await _backdate(
        db, note.id, created=_iso_days_ago(2), updated=_iso_days_ago(0)
    )
    out = await node_repo.list_recently_edited(db, since_iso=_iso_days_ago(7))
    assert note.id in [n.id for n in out]


async def test_list_recently_edited_excludes_fleeting(db):
    note = await node_repo.create_fleeting(db, FleetingCreate(title="f", content="x"))
    await _backdate(db, note.id, created=_iso_days_ago(2), updated=_iso_days_ago(0))
    out = await node_repo.list_recently_edited(db, since_iso=_iso_days_ago(7))
    assert note.id not in [n.id for n in out]


async def test_list_recent_edges_returns_endpoint_titles(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    out = await edge_repo.list_recent(db, since_iso=_iso_days_ago(7))
    rec = next(e for e in out if e.id == edge.id)
    assert rec.from_node.title == "A"
    assert rec.to_node.title == "B"
    assert rec.type == "SUPPORTS"


async def test_list_recent_edges_excludes_edges_to_deleted_nodes(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    await node_repo.soft_delete(db, b.id)
    out = await edge_repo.list_recent(db, since_iso=_iso_days_ago(7))
    assert edge.id not in [e.id for e in out]


# ---------------------------------------------------------------------------
# Route-level smoke (client fixture — verifies wiring + window_days echo)
# ---------------------------------------------------------------------------


def test_activity_default_window_is_seven(client):
    body = client.get("/api/v1/activity").json()
    assert body["window_days"] == 7
    assert "captured" in body
    assert "edited" in body
    assert "edges" in body


def test_activity_days_param_clamped(client):
    assert client.get("/api/v1/activity?days=0").status_code == 422
    assert client.get("/api/v1/activity?days=91").status_code == 422


def test_activity_route_returns_fresh_capture(client):
    fresh = client.post(
        "/api/v1/nodes/fleeting", json={"title": "fresh", "content": "x"}
    ).json()
    body = client.get("/api/v1/activity").json()
    assert fresh["id"] in [n["id"] for n in body["captured"]]


def test_activity_route_does_not_count_birth_as_edit(client):
    """End-to-end check that embedding_service no longer bumps updated_at on creation."""
    fresh = client.post(
        "/api/v1/nodes/permanent", json={"title": "born", "content": "x"}
    ).json()
    body = client.get("/api/v1/activity").json()
    assert fresh["id"] not in [n["id"] for n in body["edited"]]


def test_activity_route_returns_edges_with_titles(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
    b = client.post("/api/v1/nodes/permanent", json={"title": "B", "content": "y"}).json()
    edge = client.post(
        "/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"}
    ).json()
    body = client.get("/api/v1/activity").json()
    rec = next(e for e in body["edges"] if e["id"] == edge["id"])
    assert rec["from_node"]["title"] == "A"
    assert rec["to_node"]["title"] == "B"
    assert rec["type"] == "SUPPORTS"
