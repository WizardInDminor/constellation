"""Phase C2 — context builder tests (AT-010, AT-011, live assembly).

Runs against the shared `story_project` fixture (the direction pack's
development fixture, built in conftest.py).
"""

import pytest

from app.core.errors import ObjectNotFound, ProjectNotFound
from app.models import ProposalTransitionRequest
from app.repositories import edge_repo
from app.services import context_builder_service, proposal_service
from tests.conftest import FakeEmbeddingProvider

# ---------------------------------------------------------------------------
# Character dossier
# ---------------------------------------------------------------------------


async def test_dossier_stable_ids_and_separation(db, story_project):
    """AT-010: stable identifiers, accepted vs proposed clearly separated,
    context version present."""
    dossier = await context_builder_service.build_character_dossier(
        db, story_project["hub"], story_project["michael"]
    )
    assert dossier.context_type == "character_dossier"
    assert dossier.context_version == "1.0"
    assert dossier.character.id == story_project["michael"]

    appearance_ids = {a.event.id for a in dossier.accepted.scene_appearances}
    assert appearance_ids == {story_project["scene1"], story_project["scene2"]}

    # The unresolved CONTRADICTS edge is development material, not accepted.
    thread_ids = {t.id for t in dossier.development.open_threads}
    assert story_project["open_thread_edge"] in thread_ids
    accepted_edge_ids = {r.edge_id for r in dossier.accepted.relationships}
    assert story_project["open_thread_edge"] not in accepted_edge_ids

    # The proposed scene references Michael — it appears under proposed,
    # and nowhere in accepted.
    proposed_ids = {p.id for p in dossier.proposed.proposals}
    assert story_project["proposed_scene"] in proposed_ids

    # Project decision rides along as accepted context.
    assert any(d.id == story_project["decision"] for d in dossier.accepted.decisions)


async def test_dossier_is_assembled_live(db, story_project):
    """'The order of creation is invisible': deleting an edge between two
    calls MUST change the dossier."""
    before = await context_builder_service.build_character_dossier(
        db, story_project["hub"], story_project["vincent"]
    )
    assert any(
        a.event.id == story_project["scene2"] for a in before.accepted.scene_appearances
    )

    # Find and delete Vincent's COLLECTS edge to scene2.
    neighbors = await edge_repo.get_neighbors(db, story_project["vincent"])
    collects = next(
        n for n in neighbors if n.edge_type == "COLLECTS" and n.node.id == story_project["scene2"]
    )
    await edge_repo.delete(db, collects.edge_id)

    after = await context_builder_service.build_character_dossier(
        db, story_project["hub"], story_project["vincent"]
    )
    assert not any(
        a.event.id == story_project["scene2"] for a in after.accepted.scene_appearances
    )


async def test_dossier_untagged_node_warns(db, story_project):
    dossier = await context_builder_service.build_character_dossier(
        db, story_project["hub"], story_project["scene1"]
    )
    assert dossier.warnings  # not tagged narrative:character


async def test_dossier_accepted_proposal_moves_out_of_proposed(db, story_project):
    """Once the proposed scene is accepted, it leaves the proposed section
    and its materialized links appear as accepted scene appearances."""
    result = await proposal_service.transition(
        db,
        story_project["proposed_scene"],
        ProposalTransitionRequest(to_status="accepted"),
        FakeEmbeddingProvider(),
    )
    assert result.created_node_id is not None

    dossier = await context_builder_service.build_character_dossier(
        db, story_project["hub"], story_project["michael"]
    )
    assert story_project["proposed_scene"] not in {
        p.id for p in dossier.proposed.proposals
    }
    assert result.created_node_id in {
        a.event.id for a in dossier.accepted.scene_appearances
    }


# ---------------------------------------------------------------------------
# Story project context
# ---------------------------------------------------------------------------


async def test_project_context_rosters_and_sections(db, story_project):
    ctx = await context_builder_service.build_story_project_context(
        db, story_project["hub"]
    )
    assert ctx.context_type == "story_project_context"
    assert ctx.project_mode == "narrative"
    assert {c.id for c in ctx.roster.characters} == {
        story_project["michael"],
        story_project["vincent"],
    }
    assert [t.id for t in ctx.roster.themes] == [story_project["theme"]]
    assert [loc.id for loc in ctx.roster.locations] == [story_project["chapel"]]
    assert [d.id for d in ctx.active_decisions] == [story_project["decision"]]
    assert story_project["open_thread_edge"] in {t.id for t in ctx.open_threads}
    assert story_project["proposed_scene"] in {p.id for p in ctx.open_proposals}
    assert any(e.event_type == "proposal.created" for e in ctx.recent_changes)


# ---------------------------------------------------------------------------
# Scene context envelope
# ---------------------------------------------------------------------------


async def test_scene_envelope_wraps_live_assembly(db, story_project):
    """AT-011: timeline neighborhood present; envelope adds version + proposed."""
    env = await context_builder_service.build_scene_context(
        db, story_project["hub"], story_project["scene2"]
    )
    assert env.context_type == "scene_context"
    assert env.scene.event.id == story_project["scene2"]
    assert env.scene.preceding_event is not None
    assert env.scene.preceding_event.id == story_project["scene1"]
    roles = {(i.role, i.node.id) for i in env.scene.items}
    assert ("character", story_project["michael"]) in roles
    assert ("character", story_project["vincent"]) in roles
    assert ("theme", story_project["theme"]) in roles


async def test_scene_envelope_missing_event_is_object_not_found(db, story_project):
    with pytest.raises(ObjectNotFound):
        await context_builder_service.build_scene_context(
            db, story_project["hub"], "ghost"
        )


# ---------------------------------------------------------------------------
# Recent changes envelope + hub validation
# ---------------------------------------------------------------------------


async def test_recent_changes_context_cursor(db, story_project):
    first = await context_builder_service.build_recent_changes_context(
        db, story_project["hub"]
    )
    assert first.events and first.next_cursor is not None
    second = await context_builder_service.build_recent_changes_context(
        db, story_project["hub"], after=first.next_cursor
    )
    assert second.events == []


async def test_builders_require_project_hub(db, story_project):
    with pytest.raises(ProjectNotFound):
        await context_builder_service.build_story_project_context(
            db, story_project["michael"]  # a character, not a hub
        )
