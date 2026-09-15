"""Task-shaped context builders (Phase C2, ADR-087; direction pack Phase 2).

The builders own the AI-ready data shape (pack ADR-004): HTTP routes, the
workspace UI, and MCP tools all consume these — never their own queries.

Two standing guarantees:

* **Live assembly** ("the order of creation is invisible"): every builder
  walks current graph state on every call. Nothing here is cached.
* **Separation** (AT-010): accepted truth, development material, and
  unresolved proposals are distinct envelope sections; proposed links never
  appear as accepted relationships.
"""

from datetime import UTC, datetime

import aiosqlite

from app.core.errors import ObjectNotFound, ProjectNotFound
from app.models.canon import OpenThreadEdge
from app.models.context import (
    CharacterDossier,
    CharacterDossierAccepted,
    CharacterDossierDevelopment,
    CharacterDossierProposed,
    DossierRelationship,
    RecentChangesContext,
    RoleRoster,
    SceneAppearance,
    SceneContextEnvelope,
    StoryProjectContext,
)
from app.models.narrative import (
    NARRATIVE_TAG_CHARACTER,
    NARRATIVE_TAG_LOCATION,
    NARRATIVE_TAG_LORE_PREFIX,
    NARRATIVE_TAG_THEME,
)
from app.models.node import NodeRef
from app.models.proposal import ProposalStatus, ProposalSummary
from app.repositories import (
    decision_repo,
    edge_repo,
    node_repo,
    project_repo,
    proposal_repo,
    tag_repo,
    timeline_repo,
)
from app.services import activity_service

_OPEN_STATUSES: list[ProposalStatus] = ["captured", "proposed", "under_review"]
_TENSION_TYPES = {"CONTRADICTS", "QUESTIONS"}
_ROSTER_LIMIT = 50
_DECISION_LIMIT = 20
_RECENT_EVENT_LIMIT = 20
_OPEN_THREAD_LIMIT = 10


def _now() -> datetime:
    return datetime.now(UTC)


async def _require_hub(db: aiosqlite.Connection, hub_id: str) -> None:
    if not await project_repo.is_project_hub(db, hub_id):
        raise ProjectNotFound("Project hub not found", details={"project_hub_id": hub_id})


async def _proposals_referencing(
    db: aiosqlite.Connection, hub_id: str, node_id: str
) -> list[ProposalSummary]:
    """Open proposals whose proposed links reference the node. Filtered in
    Python: related_objects live inside the payload JSON and open-proposal
    counts are small at personal scale."""
    open_props = await proposal_repo.list_proposals(
        db, project_hub_id=hub_id, statuses=_OPEN_STATUSES
    )
    matching: list[ProposalSummary] = []
    for summary in open_props:
        detail = await proposal_repo.get_by_id(db, summary.id)
        if detail is None:
            continue
        if any(ref.object_id == node_id for ref in detail.related_objects):
            matching.append(summary)
    return matching


async def _roster_for_tag(db: aiosqlite.Connection, tag_name: str) -> list[NodeRef]:
    tag = await tag_repo.get_by_name(db, tag_name)
    if tag is None:
        return []
    node_ids = await tag_repo.list_node_ids_for_tag(db, tag.id, limit=_ROSTER_LIMIT)
    refs: list[NodeRef] = []
    for node_id in node_ids:
        node = await node_repo.get_by_id(db, node_id)
        if node is not None:
            refs.append(NodeRef(id=node.id, title=node.title, type=node.type))
    return refs


# ---------------------------------------------------------------------------
# Character dossier
# ---------------------------------------------------------------------------


async def build_character_dossier(
    db: aiosqlite.Connection, hub_id: str, character_id: str
) -> CharacterDossier:
    """Everything the project knows about one character, assembled live and
    split accepted / development / proposed (AT-010)."""
    await _require_hub(db, hub_id)
    character = await node_repo.get_by_id(db, character_id)
    if character is None:
        raise ObjectNotFound("Character node not found", details={"object_type": "node"})

    warnings: list[str] = []
    char_tags = {t.name for t in character.tags}
    if NARRATIVE_TAG_CHARACTER not in char_tags:
        warnings.append(
            f"Node is not tagged {NARRATIVE_TAG_CHARACTER!r}; dossier built anyway."
        )

    accepted = CharacterDossierAccepted()
    development = CharacterDossierDevelopment()

    for neighbor in await edge_repo.get_neighbors(db, character_id):
        rel = DossierRelationship(
            edge_id=neighbor.edge_id,
            edge_type=neighbor.edge_type,
            direction=neighbor.direction,
            other=neighbor.node,
            note=neighbor.edge_note,
            resolved=neighbor.edge_resolved_at is not None,
        )
        detail = await node_repo.get_by_id(db, neighbor.node.id)
        if detail is None:
            continue
        neighbor_tags = {t.name for t in detail.tags}

        if neighbor.edge_type in _TENSION_TYPES and neighbor.edge_resolved_at is None:
            char_ref = NodeRef(id=character.id, title=character.title, type=character.type)
            from_node, to_node = (
                (char_ref, neighbor.node)
                if neighbor.direction == "outgoing"
                else (neighbor.node, char_ref)
            )
            edge = await edge_repo.get_by_id(db, neighbor.edge_id)
            development.open_threads.append(
                OpenThreadEdge(
                    id=neighbor.edge_id,
                    type=neighbor.edge_type,
                    note=neighbor.edge_note,
                    from_node=from_node,
                    to_node=to_node,
                    created_at=edge.created_at if edge is not None else _now(),
                )
            )
            continue
        if detail.is_story_event:
            accepted.scene_appearances.append(
                SceneAppearance(
                    event=neighbor.node,
                    story_time=detail.story_time,
                    prose_status=detail.prose_status,
                    edge_type=neighbor.edge_type,
                    edge_note=neighbor.edge_note,
                )
            )
        elif NARRATIVE_TAG_THEME in neighbor_tags:
            accepted.themes.append(rel)
        elif NARRATIVE_TAG_LOCATION in neighbor_tags:
            accepted.locations.append(rel)
        elif any(t.startswith(NARRATIVE_TAG_LORE_PREFIX) for t in neighbor_tags):
            accepted.lore.append(rel)
        elif detail.type == "fleeting" or detail.canon_status in ("speculative", "discarded"):
            development.notes.append(rel)
        else:
            accepted.relationships.append(rel)

    accepted.decisions = await decision_repo.list_decisions(
        db, project_hub_id=hub_id, statuses=["accepted"], limit=_DECISION_LIMIT
    )

    return CharacterDossier(
        project_hub_id=hub_id,
        character=character,
        accepted=accepted,
        development=development,
        proposed=CharacterDossierProposed(
            proposals=await _proposals_referencing(db, hub_id, character_id)
        ),
        warnings=warnings,
        generated_at=_now(),
    )


# ---------------------------------------------------------------------------
# Story project context
# ---------------------------------------------------------------------------


async def build_story_project_context(
    db: aiosqlite.Connection, hub_id: str
) -> StoryProjectContext:
    await _require_hub(db, hub_id)
    hub = await node_repo.get_by_id(db, hub_id)
    assert hub is not None
    scope = await project_repo.get_scope(db, hub_id)
    assert scope is not None

    warnings = [
        "open_threads are corpus-wide in v1; project-scoped tension filtering "
        "arrives with the workbench workflows (Phase C6)."
    ]

    return StoryProjectContext(
        project_hub_id=hub_id,
        project_mode=scope.mode,
        hub=hub,
        briefing_prompt=scope.briefing_prompt,
        roster=RoleRoster(
            characters=await _roster_for_tag(db, NARRATIVE_TAG_CHARACTER),
            themes=await _roster_for_tag(db, NARRATIVE_TAG_THEME),
            locations=await _roster_for_tag(db, NARRATIVE_TAG_LOCATION),
        ),
        active_decisions=await decision_repo.list_decisions(
            db, project_hub_id=hub_id, statuses=["accepted"], limit=_DECISION_LIMIT
        ),
        open_threads=await edge_repo.list_open_tensions(db, limit=_OPEN_THREAD_LIMIT),
        open_proposals=await proposal_repo.list_proposals(
            db, project_hub_id=hub_id, statuses=_OPEN_STATUSES
        ),
        recent_changes=await activity_service.recent_feed(
            db, project_hub_id=hub_id, limit=_RECENT_EVENT_LIMIT
        ),
        warnings=warnings,
        generated_at=_now(),
    )


# ---------------------------------------------------------------------------
# Scene context (wraps the Phase 9 live assembler — never reimplements it)
# ---------------------------------------------------------------------------


async def build_scene_context(
    db: aiosqlite.Connection, hub_id: str, event_id: str
) -> SceneContextEnvelope:
    await _require_hub(db, hub_id)
    try:
        scene = await timeline_repo.assemble_scene_context(
            db, event_id=event_id, project_hub_id=hub_id
        )
    except ValueError as exc:
        raise ObjectNotFound(str(exc), details={"object_type": "story_event"}) from exc

    return SceneContextEnvelope(
        project_hub_id=hub_id,
        scene=scene,
        proposed=CharacterDossierProposed(
            proposals=await _proposals_referencing(db, hub_id, event_id)
        ),
        generated_at=_now(),
    )


# ---------------------------------------------------------------------------
# Recent changes
# ---------------------------------------------------------------------------


async def build_recent_changes_context(
    db: aiosqlite.Connection, hub_id: str, *, after: int = 0, limit: int = 50
) -> RecentChangesContext:
    await _require_hub(db, hub_id)
    changes = await activity_service.recent_changes(
        db, after=after, project_hub_id=hub_id, limit=limit
    )
    return RecentChangesContext(
        project_hub_id=hub_id,
        events=changes.events,
        next_cursor=changes.next_cursor,
        generated_at=_now(),
    )
