import pytest

from app.models import EdgeCreate, FleetingCreate, PermanentCreate, TagCreate
from app.repositories import edge_repo, node_repo, tag_repo


async def _two_nodes(db):
    a = await node_repo.create_fleeting(db, FleetingCreate(title="A", content="body a"))
    b = await node_repo.create_fleeting(db, FleetingCreate(title="B", content="body b"))
    return a, b


async def test_create_and_get(db):
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    assert edge.id
    assert edge.from_id == a.id
    assert edge.to_id == b.id
    assert edge.type == "SUPPORTS"

    fetched = await edge_repo.get_by_id(db, edge.id)
    assert fetched is not None
    assert fetched.id == edge.id


async def test_get_missing_returns_none(db):
    assert await edge_repo.get_by_id(db, "ghost") is None


async def test_delete(db):
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="ELABORATES"))
    assert await edge_repo.delete(db, edge.id) is True
    assert await edge_repo.get_by_id(db, edge.id) is None


async def test_delete_missing_returns_false(db):
    assert await edge_repo.delete(db, "ghost") is False


async def test_get_neighbors(db):
    a, b = await _two_nodes(db)
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS", note="why"))
    neighbors = await edge_repo.get_neighbors(db, a.id)
    assert len(neighbors) == 1
    assert neighbors[0].node.id == b.id
    assert neighbors[0].direction == "outgoing"
    assert neighbors[0].edge_note == "why"


async def test_get_neighbors_incoming(db):
    a, b = await _two_nodes(db)
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    neighbors = await edge_repo.get_neighbors(db, b.id)
    assert len(neighbors) == 1
    assert neighbors[0].direction == "incoming"


async def test_get_neighbors_filtered_by_type(db):
    a, b = await _two_nodes(db)
    c = await node_repo.create_fleeting(db, FleetingCreate(title="C", content="c"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=c.id, type="CONTRADICTS"))
    neighbors = await edge_repo.get_neighbors(db, a.id, edge_type="SUPPORTS")
    assert len(neighbors) == 1
    assert neighbors[0].node.id == b.id


async def test_duplicate_edge_raises(db):
    from sqlite3 import IntegrityError

    a, b = await _two_nodes(db)
    await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    with pytest.raises(IntegrityError):
        await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))


async def test_invalid_type_raises(db):
    from sqlite3 import IntegrityError

    a, b = await _two_nodes(db)
    # model_construct bypasses Pydantic validation so the DB CHECK constraint is exercised
    bad = EdgeCreate.model_construct(from_id=a.id, to_id=b.id, type="INVALID")
    with pytest.raises(IntegrityError):
        await edge_repo.create(db, bad)


@pytest.mark.parametrize(
    "edge_type",
    ["CITES", "BUILDS_ON", "APPLIES_TO", "MEASURES", "EXTENDS", "REFINES"],
)
async def test_expanded_edge_types_accepted(db, edge_type):
    """ADR-051 + ADR-052: the new edge vocabulary is persistable end-to-end."""
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type=edge_type))
    assert edge.type == edge_type
    fetched = await edge_repo.get_by_id(db, edge.id)
    assert fetched is not None
    assert fetched.type == edge_type


async def test_classifier_rationale_persists_and_is_distinct_from_note(db):
    """Bridge-classifier rationale survives create→get and stays separate from note."""
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(
        db,
        EdgeCreate(
            from_id=a.id,
            to_id=b.id,
            type="ANALOGOUS_TO",
            note="my own framing",
            classifier_rationale="Both notes describe a feedback loop.",
        ),
    )
    assert edge.note == "my own framing"
    assert edge.classifier_rationale == "Both notes describe a feedback loop."

    fetched = await edge_repo.get_by_id(db, edge.id)
    assert fetched is not None
    assert fetched.note == "my own framing"
    assert fetched.classifier_rationale == "Both notes describe a feedback loop."


async def test_classifier_rationale_defaults_to_none(db):
    """Hand-authored edges have no rationale."""
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    assert edge.classifier_rationale is None


async def test_classifier_rationale_appears_in_neighbor_and_summary_views(db):
    """Rationale rides along on get_neighbors / get_outgoing / get_incoming."""
    a, b = await _two_nodes(db)
    rationale = "Shared structural mechanism, not surface vocabulary."
    await edge_repo.create(
        db,
        EdgeCreate(
            from_id=a.id,
            to_id=b.id,
            type="ANALOGOUS_TO",
            classifier_rationale=rationale,
        ),
    )

    neighbors = await edge_repo.get_neighbors(db, a.id)
    assert len(neighbors) == 1
    assert neighbors[0].edge_classifier_rationale == rationale

    outgoing = await edge_repo.get_outgoing(db, a.id)
    assert len(outgoing) == 1
    assert outgoing[0].classifier_rationale == rationale

    incoming = await edge_repo.get_incoming(db, b.id)
    assert len(incoming) == 1
    assert incoming[0].classifier_rationale == rationale


async def test_update_note_edits_and_clears(db):
    """ADR-082: the edge-note authoring loop can set and clear a note."""
    a, b = await _two_nodes(db)
    edge = await edge_repo.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))
    assert edge.note is None

    updated = await edge_repo.update_note(db, edge.id, "evidence from the 1943 log")
    assert updated is not None
    assert updated.note == "evidence from the 1943 log"

    cleared = await edge_repo.update_note(db, edge.id, None)
    assert cleared is not None
    assert cleared.note is None


async def test_update_note_missing_returns_none(db):
    assert await edge_repo.update_note(db, "ghost", "x") is None


async def test_edge_summary_carries_neighbor_tags_and_story_flag(db):
    """ADR-078: EdgeSummary denormalises neighbor tags + is_story_event so the
    Relationship Explorer can group connections by role without N+1 fetches."""
    # A symbol-tagged structure node connected to a story-event scene.
    symbol = await node_repo.create_permanent(
        db, PermanentCreate(title="Fire", content="recurring symbol")
    )
    scene = await node_repo.create_story_event(
        db, title="Cathedral Dream", content="fire fills the nave"
    )
    tag = await tag_repo.create(db, TagCreate(name="narrative:symbol"))
    await db.execute("INSERT INTO node_tags(node_id, tag_id) VALUES (?, ?)", (symbol.id, tag.id))
    await edge_repo.create(db, EdgeCreate(from_id=symbol.id, to_id=scene.id, type="ELABORATES"))

    # From the symbol's side, the scene neighbor reports the story-event flag.
    outgoing = await edge_repo.get_outgoing(db, symbol.id)
    assert len(outgoing) == 1
    assert outgoing[0].neighbor.id == scene.id
    assert outgoing[0].neighbor_is_story_event is True
    assert outgoing[0].neighbor_tags == []

    # From the scene's side, the symbol neighbor reports its narrative:symbol tag.
    incoming = await edge_repo.get_incoming(db, scene.id)
    assert len(incoming) == 1
    assert incoming[0].neighbor.id == symbol.id
    assert incoming[0].neighbor_is_story_event is False
    assert [t.name for t in incoming[0].neighbor_tags] == ["narrative:symbol"]
