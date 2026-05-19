"""Project workspace routes — Phase 9 Slice 0.

Endpoints:
    GET    /projects
    POST   /projects
    GET    /projects/{hub_id}
    GET    /projects/{hub_id}/scope
    PATCH  /projects/{hub_id}/scope
    GET    /projects/{hub_id}/draft
    PUT    /projects/{hub_id}/draft
    DELETE /projects/{hub_id}/draft
    POST   /projects/{hub_id}/sessions
    GET    /projects/{hub_id}/sessions
    PATCH  /projects/{hub_id}/sessions/{session_id}

See ADR-063 for the data model and design rationale.
"""

from sqlite3 import IntegrityError

from fastapi import APIRouter, HTTPException

from app.core.deps import DB, EmbedProvider
from app.models import (
    Draft,
    DraftUpdate,
    ProjectCreate,
    ProjectDetail,
    ProjectScope,
    ProjectScopeUpdate,
    ProjectSummary,
    StructureCreate,
    WorkSession,
    WorkSessionCreate,
    WorkSessionUpdate,
)
from app.repositories import node_repo, project_repo
from app.services import embedding_service

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# List + create
# ---------------------------------------------------------------------------


@router.get("")
async def list_projects(db: DB) -> list[ProjectSummary]:
    return await project_repo.list_projects(db)


@router.post("", status_code=201)
async def create_project(data: ProjectCreate, db: DB, provider: EmbedProvider) -> ProjectDetail:
    """Promote an existing structure node, or create one and promote in one
    call.

    - With `hub_node_id`: the referenced node must exist, be type 'structure',
      and not already be a project hub.
    - Without `hub_node_id`: `title` is required; a new structure note is
      created with the provided `title` / `content` and promoted.
    """
    if data.hub_node_id is not None and data.title is not None:
        raise HTTPException(422, "Provide either hub_node_id or title, not both")
    if data.hub_node_id is None and data.title is None:
        raise HTTPException(
            422,
            "Provide either hub_node_id (to promote an existing structure node) "
            "or title (to create a new one)",
        )

    if data.hub_node_id is not None:
        node = await node_repo.get_by_id(db, data.hub_node_id)
        if node is None:
            raise HTTPException(404, "Node not found")
        if node.type != "structure":
            raise HTTPException(
                422,
                f"Only structure notes can be promoted to projects; node is type '{node.type}'",
            )
        if await project_repo.is_project_hub(db, data.hub_node_id):
            raise HTTPException(409, "Node is already a project hub")
        hub_id = data.hub_node_id
    else:
        assert data.title is not None
        new_node = await node_repo.create_structure(
            db,
            StructureCreate(title=data.title, content=data.content),
        )
        await embedding_service.embed_or_queue(db, new_node.id, provider)
        hub_id = new_node.id

    try:
        await project_repo.create_scope(db, hub_node_id=hub_id, mode=data.mode)
    except IntegrityError as exc:
        raise HTTPException(409, "Scope already exists for this hub") from exc

    return await _build_project_detail(db, hub_id)


# ---------------------------------------------------------------------------
# Project detail
# ---------------------------------------------------------------------------


async def _build_project_detail(db, hub_id: str) -> ProjectDetail:
    hub = await node_repo.get_by_id(db, hub_id)
    if hub is None:
        raise HTTPException(404, "Project hub not found")
    scope = await project_repo.get_scope(db, hub_id)
    if scope is None:
        raise HTTPException(404, "Project scope not found")
    active_session = await project_repo.get_active_session(db, hub_id)
    return ProjectDetail(hub=hub, scope=scope, active_session=active_session)


async def _require_project(db, hub_id: str) -> None:
    if not await project_repo.is_project_hub(db, hub_id):
        raise HTTPException(404, "Project hub not found")


@router.get("/{hub_id}")
async def get_project(hub_id: str, db: DB) -> ProjectDetail:
    await _require_project(db, hub_id)
    return await _build_project_detail(db, hub_id)


# ---------------------------------------------------------------------------
# Scope
# ---------------------------------------------------------------------------


@router.get("/{hub_id}/scope")
async def get_scope(hub_id: str, db: DB) -> ProjectScope:
    await _require_project(db, hub_id)
    scope = await project_repo.get_scope(db, hub_id)
    if scope is None:
        raise HTTPException(404, "Project scope not found")
    return scope


@router.patch("/{hub_id}/scope")
async def patch_scope(hub_id: str, data: ProjectScopeUpdate, db: DB) -> ProjectScope:
    await _require_project(db, hub_id)
    scope = await project_repo.update_scope(db, hub_id, data)
    if scope is None:
        raise HTTPException(404, "Project scope not found")
    return scope


# ---------------------------------------------------------------------------
# Draft (free-writing pad)
# ---------------------------------------------------------------------------


@router.get("/{hub_id}/draft")
async def get_draft(hub_id: str, db: DB) -> Draft:
    await _require_project(db, hub_id)
    draft = await project_repo.get_draft(db, hub_id)
    if draft is None:
        # Empty-draft response — frontend treats this as the starting state.
        from datetime import UTC, datetime

        return Draft(project_id=hub_id, content="", updated_at=datetime.now(UTC))
    return draft


@router.put("/{hub_id}/draft")
async def put_draft(hub_id: str, data: DraftUpdate, db: DB) -> Draft:
    await _require_project(db, hub_id)
    return await project_repo.upsert_draft(db, hub_id, data)


@router.delete("/{hub_id}/draft", status_code=204)
async def delete_draft(hub_id: str, db: DB) -> None:
    await _require_project(db, hub_id)
    await project_repo.delete_draft(db, hub_id)


# ---------------------------------------------------------------------------
# Work sessions
# ---------------------------------------------------------------------------


@router.post("/{hub_id}/sessions", status_code=201)
async def start_session(hub_id: str, data: WorkSessionCreate, db: DB) -> WorkSession:
    await _require_project(db, hub_id)
    existing = await project_repo.get_active_session(db, hub_id)
    if existing is not None:
        raise HTTPException(
            409,
            f"A session is already active for this project (id={existing.id}); "
            "close it before starting a new one",
        )
    return await project_repo.create_session(db, hub_id, data)


@router.get("/{hub_id}/sessions")
async def list_sessions(hub_id: str, db: DB) -> list[WorkSession]:
    await _require_project(db, hub_id)
    return await project_repo.list_sessions(db, hub_id)


@router.patch("/{hub_id}/sessions/{session_id}")
async def patch_session(
    hub_id: str, session_id: str, data: WorkSessionUpdate, db: DB
) -> WorkSession:
    await _require_project(db, hub_id)
    existing = await project_repo.get_session(db, session_id)
    if existing is None or existing.project_id != hub_id:
        raise HTTPException(404, "Session not found")
    updated = await project_repo.update_session(db, session_id, data)
    assert updated is not None
    return updated
