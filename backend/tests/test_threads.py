"""Open Threads & Pending Payoffs dashboard (ADR-089)."""

from app.models import EdgeCreate, PermanentCreate, StructureCreate, TagCreate
from app.repositories import edge_repo, node_repo, project_repo, tag_repo, timeline_repo


def _structure(title):
    return StructureCreate(title=title, content="")


async def _project(db, tag_name="proj:canon"):
    """Create a project hub scoped to a single tag; return (hub, tag)."""
    hub = await node_repo.create_structure(db, _structure("Canon"))
    await project_repo.create_scope(db, hub_node_id=hub.id)
    tag = await tag_repo.create(db, TagCreate(name=tag_name))
    scope = await project_repo.get_scope(db, hub.id)
    scope.tag_ids = [tag.id]
    return hub, tag, scope


async def _tag_node(db, node_id, tag_id):
    await db.execute("INSERT INTO node_tags(node_id, tag_id) VALUES (?, ?)", (node_id, tag_id))


async def test_threads_empty_when_no_members(db):
    hub = await node_repo.create_structure(db, _structure("Empty"))
    await project_repo.create_scope(db, hub_node_id=hub.id)
    scope = await project_repo.get_scope(db, hub.id)
    threads = await project_repo.assemble_threads(db, hub.id, scope)
    assert threads.open_questions == []
    assert threads.pending_payoffs == []
    assert threads.unresolved_tensions == []


async def test_open_questions_surface_status_tagged_members(db):
    hub, tag, scope = await _project(db)
    status_open = await tag_repo.create(db, TagCreate(name="status:open"))
    q = await node_repo.create_permanent(db, PermanentCreate(title="Why fire?", content=""))
    await _tag_node(db, q.id, tag.id)  # project membership
    await _tag_node(db, q.id, status_open.id)  # lifecycle status
    # A status:open node NOT in the project must not appear.
    other = await node_repo.create_permanent(db, PermanentCreate(title="Unrelated", content=""))
    await _tag_node(db, other.id, status_open.id)

    threads = await project_repo.assemble_threads(db, hub.id, scope)
    assert [t.node.title for t in threads.open_questions] == ["Why fire?"]
    assert threads.open_questions[0].status == "open"


async def test_pending_payoffs_are_planned_events_on_project_timeline(db):
    hub, tag, scope = await _project(db)
    timeline = await node_repo.create_structure(db, _structure("Timeline"))
    await edge_repo.create(db, EdgeCreate(from_id=hub.id, to_id=timeline.id, type="COLLECTS"))
    planned = await node_repo.create_story_event(
        db, title="The reveal", content="", prose_status="planned"
    )
    written = await node_repo.create_story_event(
        db, title="Already done", content="", prose_status="written"
    )
    for ev in (planned, written):
        await timeline_repo.place_event(
            db, event_node_id=ev.id, timeline_node_id=timeline.id, discourse_position=10
        )

    threads = await project_repo.assemble_threads(db, hub.id, scope)
    assert [t.node.title for t in threads.pending_payoffs] == ["The reveal"]


async def test_unresolved_tensions_surface_for_project_members(db):
    hub, tag, scope = await _project(db)
    a = await node_repo.create_permanent(db, PermanentCreate(title="Claim", content=""))
    b = await node_repo.create_permanent(db, PermanentCreate(title="Counter", content=""))
    await _tag_node(db, a.id, tag.id)
    edge = await edge_repo.create(
        db, EdgeCreate(from_id=a.id, to_id=b.id, type="CONTRADICTS", note="clash")
    )

    threads = await project_repo.assemble_threads(db, hub.id, scope)
    assert len(threads.unresolved_tensions) == 1
    assert threads.unresolved_tensions[0].type == "CONTRADICTS"

    # Once resolved, it drops off the dashboard.
    await edge_repo.resolve(db, edge.id, resolved_by_node_id=None)
    threads = await project_repo.assemble_threads(db, hub.id, scope)
    assert threads.unresolved_tensions == []
