"""Project workspace routes — Phase 9.

Endpoints:
    GET    /projects
    POST   /projects
    GET    /projects/resolve
    GET    /projects/{hub_id}
    GET    /projects/{hub_id}/scope
    PATCH  /projects/{hub_id}/scope
    GET    /projects/{hub_id}/draft
    PUT    /projects/{hub_id}/draft
    DELETE /projects/{hub_id}/draft
    POST   /projects/{hub_id}/sessions
    GET    /projects/{hub_id}/sessions
    PATCH  /projects/{hub_id}/sessions/{session_id}
    POST   /projects/{hub_id}/learning-map   (Slice 2 — ADR-070)

See ADR-063 / ADR-068 / ADR-069 / ADR-070 for the data model and design
rationale.
"""

import json
import re
from sqlite3 import IntegrityError
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.deps import DB, EmbedProvider, GenProvider
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
from app.repositories import node_repo, project_repo, source_repo
from app.services import embedding_service, generation_service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectResolveResponse(BaseModel):
    """Result of `GET /projects/resolve?name=<name>`.

    Returned when a project's `primary_tag_id` matches a tag whose name equals
    the given value (case-insensitive). The CLI's `con --project <name>`
    consumes this to attach the right tag at capture time. See ADR-063.
    """

    hub_node_id: str
    primary_tag_id: str


# ---------------------------------------------------------------------------
# List + create + resolve
# ---------------------------------------------------------------------------


@router.get("")
async def list_projects(db: DB) -> list[ProjectSummary]:
    return await project_repo.list_projects(db)


# NOTE: registered before `/{hub_id}` parameterised routes so FastAPI matches
# the literal path first. Resolution is the cross-surface project anchor used
# by the CLI (`con --project <name>`) and the workspace Ask scope toggle.
@router.get("/resolve")
async def resolve_project(
    db: DB,
    name: Annotated[str, Query(min_length=1, description="Project name (tag name)")],
) -> ProjectResolveResponse:
    result = await project_repo.resolve_by_name(db, name)
    if result is None:
        raise HTTPException(
            404,
            f"No project found whose primary tag is named '{name}'. "
            "Either the project doesn't exist or it hasn't been given a primary tag yet.",
        )
    hub_id, tag_id = result
    return ProjectResolveResponse(hub_node_id=hub_id, primary_tag_id=tag_id)


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
        await project_repo.create_scope(
            db,
            hub_node_id=hub_id,
            mode=data.mode,
            prior_knowledge=data.prior_knowledge,
        )
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


# ---------------------------------------------------------------------------
# Learning map (ADR-070)
# ---------------------------------------------------------------------------


_LEARNING_MAP_SYSTEM = """\
You are a learning-plan architect. The user is starting a project to learn a \
topic. Your job is to research the topic via web search, then return a phased \
learning plan with specific source recommendations for each phase.

Plan structure:
- 3 to 6 phases, ordered from foundational to advanced
- Each phase has a short name, 2-5 concrete goals, and 2-5 source recommendations
- Source recommendations include direct URLs to free resources where they exist
- Source types: 'article', 'video', 'book', 'manual', 'datasheet', 'podcast', 'other'

Use web search liberally to find the best free resources. Prefer canonical \
references (official docs, well-known textbooks, frequently-cited tutorials) \
over random blog posts. Note that you cannot verify paywalls; treat any source \
you can't confirm is free as 'other' and note "may require purchase" in the \
reasoning.

Return ONLY valid JSON in this exact shape, no markdown, no commentary:
{
  "phases": [
    {
      "name": "Phase name",
      "goals": ["First goal", "Second goal"],
      "sources": [
        {
          "title": "Source title",
          "url": "https://...",
          "type": "article",
          "reasoning": "Why this source fits this phase"
        }
      ]
    }
  ]
}
"""


class LearningMapRequest(BaseModel):
    topic: str = Field(min_length=1)
    prior_knowledge: str | None = None
    goals: list[str] = []


class LearningMapPhaseSource(BaseModel):
    source_id: str
    title: str
    url: str | None = None
    type: str
    reasoning: str


class LearningMapPhase(BaseModel):
    name: str
    goals: list[str]
    sources: list[LearningMapPhaseSource]


class LearningMapResponse(BaseModel):
    phases: list[LearningMapPhase]
    warnings: list[str] = []


@router.post("/{hub_id}/learning-map")
async def generate_learning_map(
    hub_id: str,
    body: LearningMapRequest,
    db: DB,
    gen_provider: GenProvider,
) -> LearningMapResponse:
    """Generate a phased learning map with AI-suggested free sources.

    Per ADR-070: invokes generation with the Anthropic web_search tool to
    research the topic, returns structured phases + sources, and persists
    each suggested source with `status='suggested'`.
    """
    await _require_project(db, hub_id)

    user_msg_parts = [f"Topic: {body.topic.strip()}"]
    if body.prior_knowledge and body.prior_knowledge.strip():
        user_msg_parts.append(f"What the learner already knows:\n{body.prior_knowledge.strip()}")
    if body.goals:
        bulleted = "\n".join(f"- {g}" for g in body.goals if g.strip())
        if bulleted:
            user_msg_parts.append(f"Stated goals:\n{bulleted}")
    user_msg = "\n\n".join(user_msg_parts)

    warnings: list[str] = []
    try:
        raw = await generation_service.complete(
            gen_provider,
            [{"role": "user", "content": user_msg}],
            _LEARNING_MAP_SYSTEM,
            max_tokens=4096,
            enable_web_search=True,
        )
    except NotImplementedError:
        # Ollama path — fall back to no-web-search generation. Quality will
        # be lower (no live research) but the endpoint still produces a plan.
        warnings.append(
            "Local generation does not support web search; sources reflect "
            "model knowledge only and may be stale."
        )
        raw = await generation_service.complete(
            gen_provider,
            [{"role": "user", "content": user_msg}],
            _LEARNING_MAP_SYSTEM,
            max_tokens=4096,
        )

    # Parse JSON, stripping markdown fences just in case the model added them.
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        cleaned = match.group()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            500, f"Learning map generation returned unparseable JSON: {exc}"
        ) from exc

    raw_phases = data.get("phases", [])
    if not isinstance(raw_phases, list) or not raw_phases:
        raise HTTPException(500, "Learning map response had no phases")

    from app.models.source import SourceCreate

    out_phases: list[LearningMapPhase] = []
    for raw_phase in raw_phases:
        sources: list[LearningMapPhaseSource] = []
        for raw_src in raw_phase.get("sources", []) or []:
            title = (raw_src.get("title") or "").strip()
            if not title:
                continue
            src_type = raw_src.get("type", "article")
            if src_type not in (
                "datasheet",
                "manual",
                "book",
                "article",
                "video",
                "podcast",
                "other",
            ):
                src_type = "other"
            url = raw_src.get("url") or None
            source_detail = await source_repo.create(
                db,
                SourceCreate(
                    title=title,
                    type=src_type,
                    url=url,
                    status="suggested",
                ),
            )
            sources.append(
                LearningMapPhaseSource(
                    source_id=source_detail.id,
                    title=title,
                    url=url,
                    type=src_type,
                    reasoning=(raw_src.get("reasoning") or "").strip(),
                )
            )
        out_phases.append(
            LearningMapPhase(
                name=(raw_phase.get("name") or "Phase").strip(),
                goals=[g for g in raw_phase.get("goals", []) if isinstance(g, str)],
                sources=sources,
            )
        )

    return LearningMapResponse(phases=out_phases, warnings=warnings)


# ---------------------------------------------------------------------------
# Coverage stats (Slice 2)
# ---------------------------------------------------------------------------


class CoverageTag(BaseModel):
    tag_id: str
    tag_name: str
    note_count: int
    avg_edges: float


class CoverageResponse(BaseModel):
    """Per-tag coverage for the workspace left panel.

    Items are ordered thin-to-dense (lowest avg edges first), so "sub-topics
    that need attention" surface at the top.
    """

    tags: list[CoverageTag]


@router.get("/{hub_id}/coverage")
async def get_coverage(hub_id: str, db: DB) -> CoverageResponse:
    await _require_project(db, hub_id)
    scope = await project_repo.get_scope(db, hub_id)
    if scope is None:
        raise HTTPException(404, "Project scope not found")
    raw = await project_repo.coverage_per_tag(db, scope.tag_ids)
    return CoverageResponse(
        tags=[
            CoverageTag(
                tag_id=r["tag_id"],
                tag_name=r["tag_name"],
                note_count=r["note_count"],
                avg_edges=r["avg_edges"],
            )
            for r in raw
        ]
    )


# ---------------------------------------------------------------------------
# Session wrap counts (Slice 2 — supports the session-close summary)
# ---------------------------------------------------------------------------


class SessionWrapCounts(BaseModel):
    nodes_created: int
    fleetings_created: int
    edges_created: int


@router.get("/{hub_id}/sessions/{session_id}/wrap")
async def get_session_wrap(hub_id: str, session_id: str, db: DB) -> SessionWrapCounts:
    await _require_project(db, hub_id)
    existing = await project_repo.get_session(db, session_id)
    if existing is None or existing.project_id != hub_id:
        raise HTTPException(404, "Session not found")
    counts = await project_repo.session_wrap_counts(db, session_id)
    return SessionWrapCounts(**counts)


# ---------------------------------------------------------------------------
# Session attribution — POST /sessions/{id}/attach (Slice 2)
# ---------------------------------------------------------------------------


class SessionAttachRequest(BaseModel):
    node_id: str
    session_tagged: bool = True


@router.post("/{hub_id}/sessions/{session_id}/attach-node", status_code=201)
async def attach_node_to_session(
    hub_id: str, session_id: str, body: SessionAttachRequest, db: DB
) -> dict:
    """Best-effort: associate an existing node with a session.

    The frontend calls this after creating a node within an active session
    so the session_nodes join row exists for the wrap summary and for
    `include_session_fleetings` (ADR-069). Idempotent.
    """
    await _require_project(db, hub_id)
    existing = await project_repo.get_session(db, session_id)
    if existing is None or existing.project_id != hub_id:
        raise HTTPException(404, "Session not found")
    node = await node_repo.get_by_id(db, body.node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    await project_repo.attach_node_to_session(
        db,
        session_id=session_id,
        node_id=body.node_id,
        session_tagged=body.session_tagged,
    )
    return {"attached": True}
