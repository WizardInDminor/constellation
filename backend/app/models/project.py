"""Project workspace models — Phase 9 Slice 0.

A project is rooted in exactly one structure note (the "hub note"). The
`project_scopes` sidecar holds persistent workspace configuration. See
ADR-063.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.node import NodeDetail, NodeRef

ProjectMode = Literal["research", "narrative", "learning"]
SessionMode = Literal["research", "narrative", "learning", "planning"]
SessionStatus = Literal["active", "completed", "partial", "blocked", "abandoned"]


# ---------------------------------------------------------------------------
# Project scope (sidecar)
# ---------------------------------------------------------------------------


class ProjectScope(BaseModel):
    """The persistent workspace configuration for a project hub.

    `pinned_node_ids` and `tag_ids` are stored as JSON arrays in SQLite; the
    repository (de)serializes them.
    """

    hub_node_id: str
    pinned_node_ids: list[str] = []
    tag_ids: list[str] = []
    primary_tag_id: str | None = None
    briefing_prompt: str | None = None
    last_visited_at: datetime | None = None
    mode: ProjectMode = "research"
    created_at: datetime
    updated_at: datetime


class ProjectScopeUpdate(BaseModel):
    """Patch payload for `PATCH /projects/{hub_id}/scope`. All fields optional;
    only those present in the request are updated.
    """

    pinned_node_ids: list[str] | None = None
    tag_ids: list[str] | None = None
    primary_tag_id: str | None = None
    briefing_prompt: str | None = None
    mode: ProjectMode | None = None


# ---------------------------------------------------------------------------
# Project create / detail
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    """Promote an existing structure node to a project hub, or create a new
    structure note and promote it in one call.

    Provide `hub_node_id` to promote an existing structure node. Provide
    `title` (and optional `content`) to create a fresh structure note and
    promote it.
    """

    hub_node_id: str | None = None
    title: str | None = None
    content: str = ""
    mode: ProjectMode = "research"


class ProjectSummary(BaseModel):
    """One row for the `/projects` list page."""

    hub: NodeRef
    mode: ProjectMode
    last_visited_at: datetime | None = None
    note_count: int
    has_active_session: bool


class ProjectDetail(BaseModel):
    """The full project view: hub node, scope config, active session if any."""

    hub: NodeDetail
    scope: ProjectScope
    active_session: "WorkSession | None" = None


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------


class Draft(BaseModel):
    project_id: str
    content: str
    updated_at: datetime


class DraftUpdate(BaseModel):
    content: str


# ---------------------------------------------------------------------------
# Work sessions
# ---------------------------------------------------------------------------


class WorkSession(BaseModel):
    id: str
    project_id: str
    mode: SessionMode
    intent: str
    status: SessionStatus = "active"
    progress_notes: str | None = None
    blockers: str | None = None
    closing_notes: str | None = None
    next_session_intent: str | None = None
    intent_assessment: str | None = None
    estimated_duration_minutes: int | None = None
    started_at: datetime
    closed_at: datetime | None = None
    duration_seconds: int | None = None
    created_at: datetime


class WorkSessionCreate(BaseModel):
    mode: SessionMode
    intent: str = Field(min_length=1)
    estimated_duration_minutes: int | None = None


class WorkSessionUpdate(BaseModel):
    """Patch a work session — progress notes mid-session, or closing fields
    when the user clicks `End session`. All fields optional; only those
    present are written.
    """

    progress_notes: str | None = None
    blockers: str | None = None
    closing_notes: str | None = None
    next_session_intent: str | None = None
    intent_assessment: str | None = None
    status: SessionStatus | None = None
    close: bool = False  # if True, sets closed_at + duration_seconds


# NOTE: `ProjectDetail.model_rebuild()` is called from `app/models/__init__.py`
# after `NodeDetail.model_rebuild()` resolves its own forward references.
