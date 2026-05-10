import struct

from app.models import (
    EdgeCreate,
    FleetingCreate,
    PermanentCreate,
    StructureCreate,
)
from app.repositories import edge_repo, node_repo
from app.services import discover_service

# ---------------------------------------------------------------------------
# Orphans
# ---------------------------------------------------------------------------


async def test_orphans_returns_unlinked_permanent_notes(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))

    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="alone"))

    orphans = await discover_service.find_orphans(db)
    ids = {o.id for o in orphans}
    assert c.id in ids
    assert a.id not in ids
    assert b.id not in ids


async def test_orphans_excludes_fleeting_by_default(db):
    fleeting = await node_repo.create_fleeting(db, FleetingCreate(title="F", content="c"))
    orphans = await discover_service.find_orphans(db)
    assert fleeting.id not in {o.id for o in orphans}


async def test_orphans_includes_when_explicitly_requested(db):
    fleeting = await node_repo.create_fleeting(db, FleetingCreate(title="F", content="c"))
    orphans = await discover_service.find_orphans(db, node_type="fleeting")
    assert fleeting.id in {o.id for o in orphans}


async def test_orphans_treats_incoming_edge_as_linked(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    # B has only an incoming edge — still not an orphan
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="ELABORATES"))
    orphans = await discover_service.find_orphans(db)
    ids = {o.id for o in orphans}
    assert b.id not in ids


# ---------------------------------------------------------------------------
# Stale
# ---------------------------------------------------------------------------


async def test_stale_orders_oldest_updated_first(db):
    older = await node_repo.create_permanent(db, PermanentCreate(title="Old", content="c"))
    newer = await node_repo.create_permanent(db, PermanentCreate(title="New", content="c"))
    # Force older node to have an older updated_at
    await db.execute(
        "UPDATE nodes SET updated_at = '2020-01-01T00:00:00+00:00' WHERE id = ?",
        (older.id,),
    )
    await db.commit()

    stale = await discover_service.find_stale(db, limit=10)
    ids_in_order = [s.id for s in stale]
    assert ids_in_order.index(older.id) < ids_in_order.index(newer.id)


async def test_stale_excludes_fleeting_by_default(db):
    fleeting = await node_repo.create_fleeting(db, FleetingCreate(title="F", content="c"))
    perm = await node_repo.create_permanent(db, PermanentCreate(title="P", content="c"))
    stale = await discover_service.find_stale(db)
    ids = {s.id for s in stale}
    assert fleeting.id not in ids
    assert perm.id in ids


async def test_stale_filters_by_type(db):
    perm = await node_repo.create_permanent(db, PermanentCreate(title="P", content="c"))
    struct_ = await node_repo.create_structure(db, StructureCreate(title="S", content="c"))
    stale = await discover_service.find_stale(db, node_type="structure")
    ids = {s.id for s in stale}
    assert struct_.id in ids
    assert perm.id not in ids


# ---------------------------------------------------------------------------
# Bridges — manually-inserted embeddings give us deterministic distances
# ---------------------------------------------------------------------------


def _pack(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _unit_vec(seed: int, dim: int = 1024) -> list[float]:
    """Deterministic unit vector — seeded sparse pattern, normalized."""
    v = [0.0] * dim
    # Place a small ramp around `seed` so vectors differ but overlap on neighbors
    for i in range(8):
        idx = (seed + i) % dim
        v[idx] = 1.0 / (i + 1)
    # Normalize to unit length
    norm = sum(x * x for x in v) ** 0.5
    return [x / norm for x in v]


async def _insert_node_with_vec(db, title: str, seed: int):
    node = await node_repo.create_permanent(
        db, PermanentCreate(title=title, content=f"body {title}")
    )
    await db.execute(
        "INSERT INTO vec_nodes(node_id, embedding) VALUES (?, ?)",
        (node.id, _pack(_unit_vec(seed))),
    )
    await db.commit()
    return node


async def test_bridges_returns_similar_unlinked_pairs(db):
    # Two nearly-identical vectors → high similarity, no edge → must surface
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)  # overlaps with A by 7/8 indices

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in bridges}
    assert tuple(sorted([a.id, b.id])) in pair_ids


async def test_bridges_skips_pairs_with_existing_edge(db):
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in bridges}
    assert tuple(sorted([a.id, b.id])) not in pair_ids


async def test_bridges_skips_pairs_with_reverse_edge(db):
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)
    # Edge in B → A direction; bridges should still consider this "linked"
    await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=a.id, type="SUPPORTS"))

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in bridges}
    assert tuple(sorted([a.id, b.id])) not in pair_ids


async def test_bridges_filters_by_min_similarity(db):
    # Two very different vectors → low similarity
    await _insert_node_with_vec(db, "A", seed=0)
    await _insert_node_with_vec(db, "B", seed=500)  # far apart

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.99)
    assert bridges == []


async def test_bridges_dedupes_pair_order(db):
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    # Each unordered pair should appear at most once
    pair_ids = [tuple(sorted([br.node_a.id, br.node_b.id])) for br in bridges]
    target = tuple(sorted([a.id, b.id]))
    assert pair_ids.count(target) <= 1


async def test_bridges_returns_similarity_in_unit_range(db):
    await _insert_node_with_vec(db, "A", seed=0)
    await _insert_node_with_vec(db, "B", seed=1)

    bridges = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    for br in bridges:
        assert 0.0 <= br.similarity <= 1.0


# ---------------------------------------------------------------------------
# HTTP route smoke tests
# ---------------------------------------------------------------------------


def test_discover_orphans_route(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
    b = client.post("/api/v1/nodes/permanent", json={"title": "B", "content": "y"}).json()
    client.post("/api/v1/edges", json={"from_id": a["id"], "to_id": b["id"], "type": "SUPPORTS"})
    client.post("/api/v1/nodes/permanent", json={"title": "Lonely", "content": "z"})

    r = client.get("/api/v1/discover/orphans")
    assert r.status_code == 200
    titles = {n["title"] for n in r.json()}
    assert "Lonely" in titles
    assert "A" not in titles


def test_discover_stale_route(client):
    client.post("/api/v1/nodes/permanent", json={"title": "P", "content": "x"})
    r = client.get("/api/v1/discover/stale")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_discover_bridges_route_empty_corpus(client):
    r = client.get("/api/v1/discover/bridges")
    assert r.status_code == 200
    assert r.json() == []


def test_discover_orphans_paginates(client):
    for i in range(3):
        client.post("/api/v1/nodes/permanent", json={"title": f"N{i}", "content": "c"})
    r = client.get("/api/v1/discover/orphans?limit=2&offset=0")
    assert r.status_code == 200
    assert len(r.json()) == 2
