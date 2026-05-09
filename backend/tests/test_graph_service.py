"""Direct service-layer tests for graph_service.expand()."""

import uuid
from datetime import datetime, timezone

import pytest

from app.services.graph_service import expand


async def _node(db, title="Node"):
    nid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO nodes(id, type, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        (nid, "permanent", title, "content", now, now),
    )
    await db.commit()
    return nid


async def _edge(db, from_id, to_id, etype="SUPPORTS"):
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO edges(id, from_id, to_id, type, created_at) VALUES (?,?,?,?,?)",
        (eid, from_id, to_id, etype, now),
    )
    await db.commit()
    return eid


# ---------------------------------------------------------------------------
# Tests — use the shared `db` fixture from conftest.py
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expand_empty_seeds(db):
    neighbors, edges = await expand(db, [])
    assert neighbors == []
    assert edges == []


@pytest.mark.asyncio
async def test_expand_depth_zero(db):
    a = await _node(db, "A")
    b = await _node(db, "B")
    await _edge(db, a, b)
    neighbors, edges = await expand(db, [a], depth=0)
    assert neighbors == []
    assert edges == []


@pytest.mark.asyncio
async def test_expand_one_hop(db):
    a = await _node(db, "A")
    b = await _node(db, "B")
    c = await _node(db, "C")
    ab = await _edge(db, a, b)
    ac = await _edge(db, a, c)

    neighbors, edge_ids = await expand(db, [a], depth=1)
    assert set(neighbors) == {b, c}
    assert set(edge_ids) == {ab, ac}
    assert a not in neighbors  # seed excluded from neighbors


@pytest.mark.asyncio
async def test_expand_follows_incoming_edges(db):
    """Expansion is undirected — edges pointing INTO the seed are also followed."""
    a = await _node(db, "A")
    b = await _node(db, "B")
    ba = await _edge(db, b, a)  # B → A, seed is A

    neighbors, edge_ids = await expand(db, [a], depth=1)
    assert b in neighbors
    assert ba in edge_ids


@pytest.mark.asyncio
async def test_expand_two_hops(db):
    a = await _node(db, "A")
    b = await _node(db, "B")
    c = await _node(db, "C")
    await _edge(db, a, b)
    await _edge(db, b, c)

    neighbors, _ = await expand(db, [a], depth=2)
    assert b in neighbors
    assert c in neighbors


@pytest.mark.asyncio
async def test_expand_cycle_safe(db):
    """A → B → A cycle must not cause infinite traversal."""
    a = await _node(db, "A")
    b = await _node(db, "B")
    await _edge(db, a, b)
    await _edge(db, b, a)

    neighbors, edge_ids = await expand(db, [a], depth=5)
    assert set(neighbors) == {b}
    assert len(edge_ids) == 2  # both edges seen, each exactly once


@pytest.mark.asyncio
async def test_expand_no_deleted_nodes(db):
    """Edges to soft-deleted nodes are not returned."""
    a = await _node(db, "A")
    b = await _node(db, "B")
    await _edge(db, a, b)
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("UPDATE nodes SET deleted_at = ? WHERE id = ?", (now, b))
    await db.commit()

    neighbors, edge_ids = await expand(db, [a], depth=1)
    assert b not in neighbors
    assert edge_ids == []


@pytest.mark.asyncio
async def test_expand_no_duplicate_edges(db):
    """An edge incident to two seeds must appear only once."""
    a = await _node(db, "A")
    b = await _node(db, "B")
    c = await _node(db, "C")
    ab = await _edge(db, a, b)
    bc = await _edge(db, b, c)

    # Seed both A and B — edge A→B is incident to both
    neighbors, edge_ids = await expand(db, [a, b], depth=1)
    assert edge_ids.count(ab) == 1
    assert bc in edge_ids
    assert a not in neighbors
    assert b not in neighbors
    assert c in neighbors
