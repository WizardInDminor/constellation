"""Entity Arc assembly + ordering (ADR-087)."""

from app.models import EdgeCreate, PermanentCreate
from app.repositories import arc_repo, edge_repo, node_repo, timeline_repo


def test_ordering_basis_pure():
    assert arc_repo.ordering_basis([]) == "chronological"
    assert arc_repo.ordering_basis([True, True]) == "timeline"
    assert arc_repo.ordering_basis([False, False]) == "chronological"
    assert arc_repo.ordering_basis([True, False]) == "mixed"


def test_sort_appearance_rows_pure():
    rows = [
        {"is_story_event": 0, "discourse_position": None, "created_at": "2026-03-01"},
        {"is_story_event": 1, "discourse_position": 300, "created_at": "2026-01-01"},
        {"is_story_event": 1, "discourse_position": 100, "created_at": "2026-02-01"},
        {"is_story_event": 0, "discourse_position": None, "created_at": "2026-01-15"},
    ]
    ordered = arc_repo.sort_appearance_rows(rows)
    # Story events first, by discourse_position; then non-events by created_at.
    assert [r["discourse_position"] for r in ordered[:2]] == [100, 300]
    assert [r["created_at"] for r in ordered[2:]] == ["2026-01-15", "2026-03-01"]


async def test_assemble_missing_returns_none(db):
    assert await arc_repo.assemble(db, "ghost") is None


async def _timeline_for(db, hub_id):
    """Create a timeline structure node COLLECTS-linked from a project hub."""
    tl = await node_repo.create_structure(db, _structure("Main timeline"))
    await edge_repo.create(db, EdgeCreate(from_id=hub_id, to_id=tl.id, type="COLLECTS"))
    return tl


def _structure(title):
    from app.models import StructureCreate

    return StructureCreate(title=title, content="")


async def test_arc_orders_scene_appearances_by_discourse_position(db):
    """ACCEPTANCE: an entity (symbol) appearing across a timeline is shown
    chronologically, with edge notes surfaced as the meaning at each point."""
    symbol = await node_repo.create_permanent(
        db, PermanentCreate(title="Fire", content="recurring symbol")
    )
    hub = await node_repo.create_structure(db, _structure("Project"))
    timeline = await _timeline_for(db, hub.id)

    # Two scenes at different timeline positions, created out of order.
    later = await node_repo.create_story_event(db, title="Final Transmission", content="")
    earlier = await node_repo.create_story_event(db, title="Lion Dream", content="")
    await timeline_repo.place_event(
        db, event_node_id=later.id, timeline_node_id=timeline.id, discourse_position=500
    )
    await timeline_repo.place_event(
        db, event_node_id=earlier.id, timeline_node_id=timeline.id, discourse_position=100
    )

    # Link the symbol to each scene with a per-appearance meaning (edge note).
    await edge_repo.create(
        db,
        EdgeCreate(from_id=symbol.id, to_id=later.id, type="ELABORATES", note="Transformation"),
    )
    await edge_repo.create(
        db,
        EdgeCreate(from_id=symbol.id, to_id=earlier.id, type="ELABORATES", note="Potential"),
    )

    arc = await arc_repo.assemble(db, symbol.id)
    assert arc is not None
    assert arc.ordering_basis == "timeline"
    titles = [a.node.title for a in arc.appearances]
    assert titles == ["Lion Dream", "Final Transmission"]  # by discourse position
    meanings = [a.meaning for a in arc.appearances]
    assert meanings == ["Potential", "Transformation"]


async def test_arc_marks_planned_scenes_as_pending_payoff(db):
    symbol = await node_repo.create_permanent(db, PermanentCreate(title="Glass", content=""))
    hub = await node_repo.create_structure(db, _structure("P2"))
    timeline = await _timeline_for(db, hub.id)
    planned = await node_repo.create_story_event(
        db, title="Shattering", content="", prose_status="planned"
    )
    await timeline_repo.place_event(
        db, event_node_id=planned.id, timeline_node_id=timeline.id, discourse_position=10
    )
    await edge_repo.create(db, EdgeCreate(from_id=symbol.id, to_id=planned.id, type="ELABORATES"))

    arc = await arc_repo.assemble(db, symbol.id)
    assert arc is not None
    assert arc.pending_count == 1
    assert arc.appearances[0].is_pending is True


async def test_arc_research_concept_orders_by_created_at(db):
    """A research concept with no story events orders chronologically."""
    concept = await node_repo.create_permanent(
        db, PermanentCreate(title="Backpropagation", content="")
    )
    a = await node_repo.create_permanent(db, PermanentCreate(title="Note A", content=""))
    b = await node_repo.create_permanent(db, PermanentCreate(title="Note B", content=""))
    await edge_repo.create(db, EdgeCreate(from_id=concept.id, to_id=a.id, type="ELABORATES"))
    await edge_repo.create(db, EdgeCreate(from_id=concept.id, to_id=b.id, type="ELABORATES"))

    arc = await arc_repo.assemble(db, concept.id)
    assert arc is not None
    assert arc.ordering_basis == "chronological"
    assert {ap.node.title for ap in arc.appearances} == {"Note A", "Note B"}
