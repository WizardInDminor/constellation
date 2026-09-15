"""Versioned context-envelope routes (Phase C2, ADR-087).

- GET /projects/{hub_id}/context                       → story project context
- GET /projects/{hub_id}/context/character/{node_id}   → character dossier
- GET /projects/{hub_id}/context/scene/{event_id}      → scene context envelope
- GET /projects/{hub_id}/context/changes               → recent changes envelope

Thin adapters over `context_builder_service` — the same builders the
workspace UI and (from Phase C4) the MCP tools consume. Errors use the
structured envelope from core/errors.py.
"""

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.models.context import (
    CharacterDossier,
    RecentChangesContext,
    SceneContextEnvelope,
    StoryProjectContext,
)
from app.services import context_builder_service

router = APIRouter(prefix="/projects", tags=["context"])


@router.get("/{hub_id}/context")
async def get_story_project_context(hub_id: str, db: DB) -> StoryProjectContext:
    """Project-level AI-ready context: mode, rosters, active decisions, open
    threads, open proposals, recent changes."""
    return await context_builder_service.build_story_project_context(db, hub_id)


@router.get("/{hub_id}/context/character/{node_id}")
async def get_character_dossier(hub_id: str, node_id: str, db: DB) -> CharacterDossier:
    """Live character dossier with accepted / development / proposed strictly
    separated (AT-010)."""
    return await context_builder_service.build_character_dossier(db, hub_id, node_id)


@router.get("/{hub_id}/context/scene/{event_id}")
async def get_scene_context_envelope(
    hub_id: str, event_id: str, db: DB
) -> SceneContextEnvelope:
    """The Phase 9 live scene-context assembly wrapped in the versioned
    envelope, plus unresolved proposals referencing the scene."""
    return await context_builder_service.build_scene_context(db, hub_id, event_id)


@router.get("/{hub_id}/context/changes")
async def get_recent_changes_context(
    hub_id: str,
    db: DB,
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> RecentChangesContext:
    return await context_builder_service.build_recent_changes_context(
        db, hub_id, after=after, limit=limit
    )
