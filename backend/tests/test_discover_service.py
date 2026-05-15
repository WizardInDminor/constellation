import json
import struct

import pytest
from starlette.testclient import TestClient

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


async def _attach_tag(db, node_id: str, tag_id: str) -> None:
    await db.execute(
        "INSERT INTO node_tags(node_id, tag_id) VALUES (?, ?)", (node_id, tag_id)
    )
    await db.commit()


async def test_bridges_cross_tag_drops_pairs_with_shared_tag(db):
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)
    # Both tagged "shared" — the cross-tag filter should drop the pair
    await db.execute("INSERT INTO tags(id, name, color) VALUES ('t1', 'shared', NULL)")
    await db.commit()
    await _attach_tag(db, a.id, "t1")
    await _attach_tag(db, b.id, "t1")

    # Sanity: default behaviour surfaces the pair
    default = await discover_service.find_bridges(db, limit=10, min_similarity=0.0)
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in default}
    assert tuple(sorted([a.id, b.id])) in pair_ids

    # With cross_tag=True the pair is filtered out
    filtered = await discover_service.find_bridges(
        db, limit=10, min_similarity=0.0, cross_tag=True
    )
    filtered_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in filtered}
    assert tuple(sorted([a.id, b.id])) not in filtered_ids


async def test_bridges_cross_tag_keeps_disjoint_tag_pairs(db):
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)
    await db.execute("INSERT INTO tags(id, name, color) VALUES ('t1', 'one', NULL)")
    await db.execute("INSERT INTO tags(id, name, color) VALUES ('t2', 'two', NULL)")
    await db.commit()
    await _attach_tag(db, a.id, "t1")
    await _attach_tag(db, b.id, "t2")

    filtered = await discover_service.find_bridges(
        db, limit=10, min_similarity=0.0, cross_tag=True
    )
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in filtered}
    assert tuple(sorted([a.id, b.id])) in pair_ids


async def test_bridges_cross_tag_keeps_untagged_pairs(db):
    """An untagged pair trivially shares no tags — cross_tag must keep it."""
    a = await _insert_node_with_vec(db, "A", seed=0)
    b = await _insert_node_with_vec(db, "B", seed=1)

    filtered = await discover_service.find_bridges(
        db, limit=10, min_similarity=0.0, cross_tag=True
    )
    pair_ids = {tuple(sorted([br.node_a.id, br.node_b.id])) for br in filtered}
    assert tuple(sorted([a.id, b.id])) in pair_ids


# ---------------------------------------------------------------------------
# Triangle completion (Bucket B — B4, ADR-056)
# ---------------------------------------------------------------------------


async def test_triangles_surfaces_pair_with_shared_neighbours(db):
    """A-C-B and A-D-B → (A,B) candidate with intermediates {C,D}.

    Note: the graph A↔C, A↔D, B↔C, B↔D is symmetric — (C,D) is also a valid
    candidate (shares {A,B}). The query correctly surfaces both pairs.
    """
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="z"))
    d = await node_repo.create_permanent(db, PermanentCreate(title="D", content="w"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=c.id, type="SUPPORTS"))
    await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=c.id, type="SUPPORTS"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=d.id, type="SUPPORTS"))
    await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=d.id, type="SUPPORTS"))

    triangles = await discover_service.find_triangles(db, limit=10, min_intermediates=2)
    pair_keys = {tuple(sorted([t.node_a.id, t.node_b.id])) for t in triangles}
    assert tuple(sorted([a.id, b.id])) in pair_keys
    # And the symmetric (C,D) pair shares {A,B} too
    assert tuple(sorted([c.id, d.id])) in pair_keys

    # The (A,B) candidate carries C and D as intermediates
    ab = next(
        t for t in triangles if {t.node_a.id, t.node_b.id} == {a.id, b.id}
    )
    assert {n.id for n in ab.intermediates} == {c.id, d.id}
    assert ab.intermediate_count == 2


async def test_triangles_respects_min_intermediates(db):
    """Pair with only 1 shared neighbour is dropped at default threshold."""
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="z"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=c.id, type="SUPPORTS"))
    await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=c.id, type="SUPPORTS"))

    default = await discover_service.find_triangles(db, limit=10)
    assert default == []

    # Lowering the threshold surfaces it
    lowered = await discover_service.find_triangles(db, limit=10, min_intermediates=1)
    assert any({t.node_a.id, t.node_b.id} == {a.id, b.id} for t in lowered)


async def test_triangles_excludes_pairs_with_direct_edge(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="z"))
    d = await node_repo.create_permanent(db, PermanentCreate(title="D", content="w"))
    for cn in (c, d):
        await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=cn.id, type="SUPPORTS"))
        await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=cn.id, type="SUPPORTS"))
    # Now add the direct edge A→B — pair must drop out
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="ANALOGOUS_TO"))

    triangles = await discover_service.find_triangles(db, limit=10, min_intermediates=2)
    pair_ids = {tuple(sorted([t.node_a.id, t.node_b.id])) for t in triangles}
    assert tuple(sorted([a.id, b.id])) not in pair_ids


async def test_triangles_direct_edge_either_direction_excludes(db):
    """Reverse-direction direct edge B→A also excludes."""
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="z"))
    d = await node_repo.create_permanent(db, PermanentCreate(title="D", content="w"))
    for cn in (c, d):
        await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=cn.id, type="SUPPORTS"))
        await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=cn.id, type="SUPPORTS"))
    # Direct edge in the OPPOSITE direction
    await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=a.id, type="ELABORATES"))

    triangles = await discover_service.find_triangles(db, limit=10, min_intermediates=2)
    pair_ids = {tuple(sorted([t.node_a.id, t.node_b.id])) for t in triangles}
    assert tuple(sorted([a.id, b.id])) not in pair_ids


async def test_triangles_excludes_fleeting_from_all_roles(db):
    """Fleeting cannot be an endpoint or an intermediate."""
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    fleeting = await node_repo.create_fleeting(db, FleetingCreate(title="F", content="z"))
    perm_c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="w"))
    # Both A and B link to fleeting and to perm_c
    for cn in (fleeting, perm_c):
        await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=cn.id, type="SUPPORTS"))
        await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=cn.id, type="SUPPORTS"))

    triangles = await discover_service.find_triangles(db, limit=10, min_intermediates=2)
    # The fleeting node is excluded from intermediates — count drops to 1, which
    # is below the threshold, so the pair drops entirely.
    pair_ids = {tuple(sorted([t.node_a.id, t.node_b.id])) for t in triangles}
    assert tuple(sorted([a.id, b.id])) not in pair_ids


async def test_triangles_endpoint_returns_canonical_pair_ordering(db):
    """Each surfaced pair has node_a.id < node_b.id (canonical sort)."""
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    c = await node_repo.create_permanent(db, PermanentCreate(title="C", content="z"))
    d = await node_repo.create_permanent(db, PermanentCreate(title="D", content="w"))
    for cn in (c, d):
        await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=cn.id, type="SUPPORTS"))
        await edge_repo.create(db, EdgeCreate(from_id=b.id, to_id=cn.id, type="SUPPORTS"))

    triangles = await discover_service.find_triangles(db, limit=10, min_intermediates=2)
    for t in triangles:
        assert t.node_a.id < t.node_b.id
    # No pair appears twice
    pair_keys = [tuple(sorted([t.node_a.id, t.node_b.id])) for t in triangles]
    assert len(pair_keys) == len(set(pair_keys))


def test_triangles_route_smoke(client):
    r = client.get("/api/v1/discover/triangles")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_triangles_route_validates_limit(client):
    assert client.get("/api/v1/discover/triangles?limit=0").status_code == 422
    assert client.get("/api/v1/discover/triangles?limit=101").status_code == 422


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


# ---------------------------------------------------------------------------
# Bridge classification — _parse_classification unit tests
# ---------------------------------------------------------------------------


_PAIR = {"a-id", "b-id"}


def test_parse_classification_happy_path():
    raw = json.dumps(
        {
            "no_connection": False,
            "edge_type": "ANALOGOUS_TO",
            "from_id": "a-id",
            "to_id": "b-id",
            "rationale": "Both describe feedback loops in different domains.",
        }
    )
    result = discover_service._parse_classification(raw, allowed_ids=_PAIR)
    assert result.no_connection is False
    assert result.edge_type == "ANALOGOUS_TO"
    assert result.from_id == "a-id"
    assert result.to_id == "b-id"
    assert "feedback loops" in result.rationale


def test_parse_classification_no_connection():
    raw = json.dumps(
        {"no_connection": True, "rationale": "Surface vocabulary overlap, no real link."}
    )
    result = discover_service._parse_classification(raw, allowed_ids=_PAIR)
    assert result.no_connection is True
    assert result.edge_type is None
    assert result.from_id is None
    assert result.to_id is None


def test_parse_classification_strips_markdown_fences():
    payload = json.dumps(
        {
            "no_connection": False,
            "edge_type": "SUPPORTS",
            "from_id": "a-id",
            "to_id": "b-id",
            "rationale": "x",
        }
    )
    raw = f"```json\n{payload}\n```"
    result = discover_service._parse_classification(raw, allowed_ids=_PAIR)
    assert result.edge_type == "SUPPORTS"


def test_parse_classification_rejects_unknown_edge_type():
    raw = json.dumps(
        {
            "no_connection": False,
            "edge_type": "NOT_A_TYPE",
            "from_id": "a-id",
            "to_id": "b-id",
            "rationale": "x",
        }
    )
    with pytest.raises(ValueError, match="Unknown edge_type"):
        discover_service._parse_classification(raw, allowed_ids=_PAIR)


def test_parse_classification_rejects_hallucinated_ids():
    raw = json.dumps(
        {
            "no_connection": False,
            "edge_type": "SUPPORTS",
            "from_id": "ghost-id",
            "to_id": "b-id",
            "rationale": "x",
        }
    )
    with pytest.raises(ValueError, match="not in the supplied pair"):
        discover_service._parse_classification(raw, allowed_ids=_PAIR)


def test_parse_classification_rejects_self_loop():
    raw = json.dumps(
        {
            "no_connection": False,
            "edge_type": "SUPPORTS",
            "from_id": "a-id",
            "to_id": "a-id",
            "rationale": "x",
        }
    )
    with pytest.raises(ValueError, match="must differ"):
        discover_service._parse_classification(raw, allowed_ids=_PAIR)


def test_parse_classification_raises_on_bad_json():
    with pytest.raises(ValueError, match="decode JSON"):
        discover_service._parse_classification("this is not json", allowed_ids=_PAIR)


# ---------------------------------------------------------------------------
# classify_pair — service-level integration with a stub provider
# ---------------------------------------------------------------------------


class _StubGen:
    """Captures the system prompt and user message; returns a canned response."""

    def __init__(self, response: str):
        self._response = response
        self.captured_system: str | None = None
        self.captured_user: str | None = None

    async def complete(self, messages, system, max_tokens=1024):
        self.captured_system = system
        self.captured_user = messages[0]["content"]
        return self._response


async def test_classify_pair_returns_parsed_classification(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="alpha"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="beta"))
    stub = _StubGen(
        json.dumps(
            {
                "no_connection": False,
                "edge_type": "ANALOGOUS_TO",
                "from_id": a.id,
                "to_id": b.id,
                "rationale": "Both about iteration toward equilibrium.",
            }
        )
    )
    result = await discover_service.classify_pair(db, stub, node_a_id=a.id, node_b_id=b.id)
    assert result.no_connection is False
    assert result.edge_type == "ANALOGOUS_TO"
    assert result.from_id == a.id
    assert result.to_id == b.id
    # Prompt assembly sanity-check
    assert "NOTE A:" in stub.captured_user
    assert "NOTE B:" in stub.captured_user
    assert a.title in stub.captured_user
    assert b.title in stub.captured_user


async def test_classify_pair_raises_lookup_when_node_missing(db):
    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    stub = _StubGen("{}")
    with pytest.raises(LookupError):
        await discover_service.classify_pair(db, stub, node_a_id=a.id, node_b_id="ghost")


# ---------------------------------------------------------------------------
# POST /discover/bridges/classify — route-level tests
# ---------------------------------------------------------------------------


def _classify_client(tmp_path, monkeypatch, gen_response: str):
    """Build a TestClient whose generation provider returns `gen_response`."""
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
            return gen_response

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    return TestClient(fastapi_app)


def test_classify_route_happy_path(tmp_path, monkeypatch):
    # We need the IDs to exist before the canned response references them; so
    # spin up one client, create the pair, then point a second client at the
    # same db file with a response that names those IDs.
    db_path = tmp_path / "test.db"
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(db_path))
    cfg.get_settings.cache_clear()

    # Phase 1: create the pair with the default fake gen (returns "fake response")
    import app.core.lifespan as lsp

    class _FakeEmbed:
        model_id = "fake-embed"
        dimensions = 1024

        async def embed(self, text):
            return [0.0] * 1024

        async def embed_batch(self, texts):
            return [[0.0] * 1024 for _ in texts]

    captured: dict[str, str] = {}

    class _FakeGenA:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024):
            return captured.get("response", "fake response")

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGenA()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        a = c.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
        b = c.post("/api/v1/nodes/permanent", json={"title": "B", "content": "y"}).json()
        captured["response"] = json.dumps(
            {
                "no_connection": False,
                "edge_type": "ANALOGOUS_TO",
                "from_id": a["id"],
                "to_id": b["id"],
                "rationale": "Shared structural pattern.",
            }
        )
        r = c.post(
            "/api/v1/discover/bridges/classify",
            json={"node_a_id": a["id"], "node_b_id": b["id"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["no_connection"] is False
        assert body["edge_type"] == "ANALOGOUS_TO"
        assert body["from_id"] == a["id"]
        assert body["to_id"] == b["id"]
    cfg.get_settings.cache_clear()


def test_classify_route_no_connection(tmp_path, monkeypatch):
    response = json.dumps({"no_connection": True, "rationale": "Coincidental overlap only."})
    with _classify_client(tmp_path, monkeypatch, response) as c:
        a = c.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
        b = c.post("/api/v1/nodes/permanent", json={"title": "B", "content": "y"}).json()
        r = c.post(
            "/api/v1/discover/bridges/classify",
            json={"node_a_id": a["id"], "node_b_id": b["id"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["no_connection"] is True
        assert body["edge_type"] is None
    import app.core.config as cfg

    cfg.get_settings.cache_clear()


def test_classify_route_bad_json_500(tmp_path, monkeypatch):
    with _classify_client(tmp_path, monkeypatch, "definitely not json") as c:
        a = c.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
        b = c.post("/api/v1/nodes/permanent", json={"title": "B", "content": "y"}).json()
        r = c.post(
            "/api/v1/discover/bridges/classify",
            json={"node_a_id": a["id"], "node_b_id": b["id"]},
        )
        assert r.status_code == 500
    import app.core.config as cfg

    cfg.get_settings.cache_clear()


def test_classify_route_missing_node_404(tmp_path, monkeypatch):
    with _classify_client(tmp_path, monkeypatch, "{}") as c:
        a = c.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
        r = c.post(
            "/api/v1/discover/bridges/classify",
            json={"node_a_id": a["id"], "node_b_id": "ghost"},
        )
        assert r.status_code == 404
    import app.core.config as cfg

    cfg.get_settings.cache_clear()


def test_classify_route_same_id_422(tmp_path, monkeypatch):
    with _classify_client(tmp_path, monkeypatch, "{}") as c:
        a = c.post("/api/v1/nodes/permanent", json={"title": "A", "content": "x"}).json()
        r = c.post(
            "/api/v1/discover/bridges/classify",
            json={"node_a_id": a["id"], "node_b_id": a["id"]},
        )
        assert r.status_code == 422
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
