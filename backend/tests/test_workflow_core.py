"""Phase C1 workflow core — repository- and service-level tests.

Covers the direction pack's domain-test layer
(docs/direction/07_REPOSITORY_INTEGRATION_PLAN.md § Testing layers):
lifecycle transitions, provenance requirements, supersession behavior,
revision history, and the activity event cursor.
"""

import pytest

from app.core.errors import (
    Conflict,
    InvalidStatusTransition,
    ObjectNotFound,
    ProjectNotFound,
    ValidationFailed,
)
from app.models import (
    ALLOWED_TRANSITIONS,
    DecisionCreate,
    ProposalCreate,
    ProposalTransitionRequest,
    ProposalUpdate,
    ProvenanceCreate,
    StructureCreate,
)
from app.models.proposal import RelatedObjectRef
from app.repositories import (
    activity_repo,
    decision_repo,
    node_repo,
    project_repo,
    proposal_repo,
    provenance_repo,
)
from app.services import activity_service, proposal_service
from tests.conftest import FakeEmbeddingProvider

AI_PROVENANCE = ProvenanceCreate(
    actor_type="ai_client",
    client_type="mcp",
    client_name="TestClient",
    source_conversation_id="conv-1",
)


async def _make_hub(db) -> str:
    node = await node_repo.create_structure(db, StructureCreate(title="Hub", content=""))
    await project_repo.create_scope(db, hub_node_id=node.id, mode="narrative")
    return node.id


async def _make_proposal(db, hub_id: str, **overrides) -> str:
    data = ProposalCreate(
        project_hub_id=hub_id,
        proposal_type=overrides.pop("proposal_type", "development_note"),
        title=overrides.pop("title", "A proposed idea"),
        summary="Summary",
        provenance=AI_PROVENANCE,
        **overrides,
    )
    proposal = await proposal_service.create(db, data)
    return proposal.id


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------


async def test_provenance_roundtrip(db):
    record = await provenance_repo.create(db, AI_PROVENANCE)
    fetched = await provenance_repo.get_by_id(db, record.id)
    assert fetched is not None
    assert fetched.actor_type == "ai_client"
    assert fetched.client_name == "TestClient"
    assert fetched.source_conversation_id == "conv-1"


async def test_proposal_requires_existing_hub(db):
    with pytest.raises(ProjectNotFound):
        await proposal_service.create(
            db,
            ProposalCreate(
                project_hub_id="nope",
                proposal_type="general",
                title="x",
                provenance=AI_PROVENANCE,
            ),
        )


# ---------------------------------------------------------------------------
# Creation + revisions
# ---------------------------------------------------------------------------


async def test_create_records_provenance_and_revision_one(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(db, hub)
    detail = await proposal_repo.get_by_id(db, pid)
    assert detail is not None
    assert detail.status == "proposed"
    assert detail.source_provenance.client_name == "TestClient"
    assert len(detail.revisions) == 1
    assert detail.revisions[0].revision_number == 1
    assert detail.revisions[0].title == "A proposed idea"


async def test_edit_appends_revision_and_keeps_original(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(db, hub)
    await proposal_service.update(
        db, pid, ProposalUpdate(title="Edited title", change_summary="tightened")
    )
    detail = await proposal_repo.get_by_id(db, pid)
    assert detail is not None
    assert detail.title == "Edited title"
    assert [r.revision_number for r in detail.revisions] == [1, 2]
    assert detail.revisions[0].title == "A proposed idea"  # original queryable (AT-032)
    assert detail.revisions[1].title == "Edited title"
    assert detail.revisions[1].change_summary == "tightened"


async def test_edit_rejected_proposal_conflicts(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(db, hub)
    await proposal_service.transition(
        db, pid, ProposalTransitionRequest(to_status="rejected"), FakeEmbeddingProvider()
    )
    with pytest.raises(Conflict):
        await proposal_service.update(db, pid, ProposalUpdate(title="too late"))


# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------


async def test_all_disallowed_transitions_raise(db):
    """Every (from, to) pair not in the pack's table must be rejected."""
    hub = await _make_hub(db)
    statuses = [
        "captured",
        "proposed",
        "under_review",
        "accepted",
        "rejected",
        "superseded",
        "archived",
    ]
    fake = FakeEmbeddingProvider()
    for current in statuses:
        for target in statuses:
            if current == target:
                continue
            # The service auto-hops proposed->under_review on accept; that
            # compound path is allowed by construction.
            if (current, target) == ("proposed", "accepted"):
                continue
            pid = await _make_proposal(db, hub)
            if current != "proposed":
                # Force the starting status directly; we're testing the guard.
                await db.execute(
                    "UPDATE proposals SET status = ? WHERE id = ?", (current, pid)
                )
                await db.commit()
            request = ProposalTransitionRequest(to_status=target)
            if (current, target) in ALLOWED_TRANSITIONS:
                await proposal_service.transition(db, pid, request, fake)
            else:
                with pytest.raises(InvalidStatusTransition):
                    await proposal_service.transition(db, pid, request, fake)


async def test_rejected_cannot_become_accepted(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(db, hub)
    await proposal_service.transition(
        db, pid, ProposalTransitionRequest(to_status="rejected"), FakeEmbeddingProvider()
    )
    with pytest.raises(InvalidStatusTransition):
        await proposal_service.transition(
            db, pid, ProposalTransitionRequest(to_status="accepted"), FakeEmbeddingProvider()
        )


async def test_reject_leaves_no_accepted_object(db):
    """AT-004: rejection changes nothing in accepted truth and stays queryable."""
    hub = await _make_hub(db)
    before = await node_repo.count_by_type(db)
    pid = await _make_proposal(db, hub)
    result = await proposal_service.transition(
        db, pid, ProposalTransitionRequest(to_status="rejected", resolution_note="not now"),
        FakeEmbeddingProvider(),
    )
    assert result.proposal.status == "rejected"
    assert result.created_node_id is None
    assert await node_repo.count_by_type(db) == before
    detail = await proposal_repo.get_by_id(db, pid)
    assert detail is not None and detail.resolution_note == "not now"


# ---------------------------------------------------------------------------
# Acceptance materialization
# ---------------------------------------------------------------------------


async def test_accept_creates_provisional_node_and_edges(db):
    """AT-003: acceptance materializes the node, links, revision, and event."""
    hub = await _make_hub(db)
    target = await node_repo.create_structure(db, StructureCreate(title="Existing", content=""))
    pid = await _make_proposal(
        db,
        hub,
        proposal_type="character",
        title="Vincent",
        payload={"content": "A sincere believer in controlled narrative."},
        related_objects=[
            RelatedObjectRef(object_id=target.id, relationship_type="ELABORATES")
        ],
    )
    result = await proposal_service.transition(
        db, pid, ProposalTransitionRequest(to_status="accepted"), FakeEmbeddingProvider()
    )
    assert result.proposal.status == "accepted"
    assert result.created_node_id is not None
    node = await node_repo.get_by_id(db, result.created_node_id)
    assert node is not None
    assert node.canon_status == "provisional"  # never straight to canon
    assert any(t.name == "narrative:character" for t in node.tags)
    assert len(result.created_edge_ids) == 1


async def test_accept_scene_creates_story_event(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(
        db,
        hub,
        proposal_type="scene",
        title="The confrontation",
        payload={"content": "Michael confronts Vincent.", "story_time": "Year 3"},
    )
    result = await proposal_service.transition(
        db, pid, ProposalTransitionRequest(to_status="accepted"), FakeEmbeddingProvider()
    )
    assert result.created_node_id is not None
    node = await node_repo.get_by_id(db, result.created_node_id)
    assert node is not None
    assert node.is_story_event is True
    assert node.story_time == "Year 3"
    assert node.canon_status == "provisional"


async def test_proposed_links_do_not_exist_before_acceptance(db):
    """AT-002: proposed relationships are not accepted canonical links."""
    from app.repositories import edge_repo

    hub = await _make_hub(db)
    target = await node_repo.create_structure(db, StructureCreate(title="T", content=""))
    edge_count_before = await edge_repo.count(db)
    await _make_proposal(
        db,
        hub,
        related_objects=[
            RelatedObjectRef(object_id=target.id, relationship_type="SUPPORTS")
        ],
    )
    assert await edge_repo.count(db) == edge_count_before


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


async def test_decision_supersession_chain(db):
    """AT-005: old decision stays queryable, new references old, current
    filter returns only the new one."""
    hub = await _make_hub(db)
    prov = ProvenanceCreate(actor_type="human")
    first = await decision_repo.create(
        db,
        DecisionCreate(project_hub_id=hub, statement="Vincent is sincere", provenance=prov),
        (await provenance_repo.create(db, prov)).id,
    )
    second = await decision_repo.create(
        db,
        DecisionCreate(
            project_hub_id=hub,
            statement="Vincent is sincere but self-deceived",
            supersedes_decision_id=first.id,
            provenance=prov,
        ),
        (await provenance_repo.create(db, prov)).id,
    )
    old = await decision_repo.get_by_id(db, first.id)
    assert old is not None and old.status == "superseded"
    assert old.superseded_by_decision_id == second.id
    assert second.supersedes_decision_id == first.id
    current = await decision_repo.list_decisions(db, project_hub_id=hub, statuses=["accepted"])
    assert [d.id for d in current] == [second.id]


# ---------------------------------------------------------------------------
# Activity events + cursor
# ---------------------------------------------------------------------------


async def test_recent_changes_cursor_sees_events_exactly_once(db):
    """AT-024: a cursor from before creation yields the created event; the
    returned next_cursor excludes it on the following call."""
    hub = await _make_hub(db)
    baseline = await activity_service.recent_changes(db, project_hub_id=hub)
    cursor = baseline.next_cursor or 0

    pid = await _make_proposal(db, hub)
    first = await activity_service.recent_changes(db, after=cursor, project_hub_id=hub)
    assert any(
        e.event_type == "proposal.created" and e.object_id == pid for e in first.events
    )
    assert first.next_cursor is not None
    second = await activity_service.recent_changes(
        db, after=first.next_cursor, project_hub_id=hub
    )
    assert second.events == []
    assert second.next_cursor is None


async def test_events_carry_provenance(db):
    hub = await _make_hub(db)
    pid = await _make_proposal(db, hub)
    events = await activity_repo.list_after(db, project_hub_id=hub)
    created = next(e for e in events if e.object_id == pid)
    assert created.provenance is not None
    assert created.provenance.client_name == "TestClient"


async def test_transition_on_missing_proposal_raises(db):
    with pytest.raises(ObjectNotFound):
        await proposal_service.transition(
            db, "missing", ProposalTransitionRequest(to_status="rejected"),
            FakeEmbeddingProvider(),
        )


async def test_related_object_must_exist(db):
    hub = await _make_hub(db)
    with pytest.raises(ValidationFailed):
        await proposal_service.create(
            db,
            ProposalCreate(
                project_hub_id=hub,
                proposal_type="general",
                title="x",
                related_objects=[
                    RelatedObjectRef(object_id="ghost", relationship_type="SUPPORTS")
                ],
                provenance=AI_PROVENANCE,
            ),
        )
