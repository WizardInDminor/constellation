"""Canon readiness Phase 3/4 (ADR-076): uncertainty AI-visibility + saved views.

Covers the context-assembly Status line, the deterministic /canon/views and
/canon/open-threads endpoints, and the /canon/ask narration path (fake gen).
"""

from app.models import PermanentCreate
from app.repositories import node_repo
from app.services import rag_service

# ── context assembly surfaces uncertainty (Phase 3) ──────────────────────────


async def test_build_context_includes_status_line(db):
    node = await node_repo.create_permanent(
        db,
        PermanentCreate(
            title="Cathedral",
            content="An image.",
            canon_status="image_only",
            charge="goosebump",
            do_not_name_yet=True,
        ),
    )
    detail = await node_repo.get_by_id(db, node.id)
    context, _ = rag_service._build_context([detail], [], [])
    assert "Status:" in context
    assert "canon_status=image_only" in context
    assert "charge=goosebump" in context
    assert "do_not_name_yet=yes" in context


async def test_build_context_no_status_line_for_plain_node(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="Plain", content="body"))
    detail = await node_repo.get_by_id(db, node.id)
    context, _ = rag_service._build_context([detail], [], [])
    assert "Status:" not in context


# ── deterministic views (Phase 4 backend) ────────────────────────────────────


async def test_canon_view_do_not_name_yet(client):
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Mystery", "content": "c", "do_not_name_yet": True},
    )
    client.post("/api/v1/nodes/permanent", json={"title": "Plain", "content": "c"})

    resp = client.get("/api/v1/canon/views/do_not_name_yet")
    assert resp.status_code == 200
    body = resp.json()
    assert body["view"] == "do_not_name_yet"
    titles = [n["title"] for n in body["nodes"]]
    assert titles == ["Mystery"]


async def test_canon_view_images_carrying_charge(client):
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Cathedral", "content": "c", "charge": "goosebump"},
    )
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Clearing", "content": "c", "charge": "high"},
    )
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Low", "content": "c", "charge": "low"},
    )

    resp = client.get("/api/v1/canon/views/images_carrying_charge")
    assert resp.status_code == 200
    titles = {n["title"] for n in resp.json()["nodes"]}
    assert titles == {"Cathedral", "Clearing"}


async def test_canon_view_emerging_truths_merges_emerging_and_provisional(client):
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Emerging", "content": "c", "node_status": "emerging"},
    )
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Provisional", "content": "c", "canon_status": "provisional"},
    )
    client.post("/api/v1/nodes/permanent", json={"title": "Plain", "content": "c"})

    resp = client.get("/api/v1/canon/views/emerging_truths")
    titles = {n["title"] for n in resp.json()["nodes"]}
    assert titles == {"Emerging", "Provisional"}


def test_canon_view_rejects_unknown_view(client):
    assert client.get("/api/v1/canon/views/not-a-view").status_code == 422


# ── open threads ─────────────────────────────────────────────────────────────


def test_open_threads_lists_unresolved_tensions(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "A", "content": "c"}).json()
    b = client.post("/api/v1/nodes/permanent", json={"title": "B", "content": "c"}).json()
    client.post(
        "/api/v1/edges",
        json={"from_id": a["id"], "to_id": b["id"], "type": "CONTRADICTS", "note": "tension"},
    )
    # An unresolved node too.
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Knot", "content": "c", "node_status": "unresolved"},
    )

    resp = client.get("/api/v1/canon/open-threads")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["tensions"]) == 1
    assert body["tensions"][0]["type"] == "CONTRADICTS"
    assert body["tensions"][0]["note"] == "tension"
    assert {n["title"] for n in body["unresolved_nodes"]} == {"Knot"}


def test_open_threads_excludes_resolved(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "A", "content": "c"}).json()
    b = client.post("/api/v1/nodes/permanent", json={"title": "B", "content": "c"}).json()
    edge = client.post(
        "/api/v1/edges",
        json={"from_id": a["id"], "to_id": b["id"], "type": "QUESTIONS"},
    ).json()
    client.post(f"/api/v1/edges/{edge['id']}/resolve", json={})

    resp = client.get("/api/v1/canon/open-threads")
    assert resp.json()["tensions"] == []


# ── AI narration (fake gen provider) ─────────────────────────────────────────


def test_canon_ask_narrates_deterministic_set(client):
    client.post(
        "/api/v1/nodes/permanent",
        json={"title": "Mystery", "content": "load-bearing", "do_not_name_yet": True},
    )
    resp = client.post("/api/v1/canon/ask", json={"view": "do_not_name_yet"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["view"] == "do_not_name_yet"
    assert body["answer"]  # fake gen returns a non-empty string
    assert [n["title"] for n in body["nodes"]] == ["Mystery"]
    # Provenance is grounded in the deterministic node set.
    assert [p["title"] for p in body["provenance"]] == ["Mystery"]


def test_canon_ask_empty_view(client):
    resp = client.post("/api/v1/canon/ask", json={"view": "speculative"})
    assert resp.status_code == 200
    assert resp.json()["answer"] == "No nodes currently match this view."
