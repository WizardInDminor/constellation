"""Versioned AI-ready context envelopes (Phase C2, ADR-087).

Context builders own the AI-facing data shape (direction pack ADR-004):
every envelope declares `context_type` + `context_version` and strictly
separates accepted truth from development material and unresolved proposals
(AT-010). The same envelopes serve HTTP routes, the workspace UI, and — from
Phase C4 — MCP tools; no consumer assembles domain context independently.

Reference shapes: docs/direction/12_EXAMPLE_DATA_CONTRACTS.md.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.activity import ActivityEvent
from app.models.canon import OpenThreadEdge
from app.models.decision import DecisionRecord
from app.models.edge import EdgeType
from app.models.node import NodeDetail, NodeRef
from app.models.proposal import ProposalSummary
from app.models.timeline import SceneContextResponse

CONTEXT_VERSION = "1.0"


class DossierRelationship(BaseModel):
    """One edge as seen from the dossier subject."""

    edge_id: str
    edge_type: EdgeType
    direction: Literal["outgoing", "incoming"]
    other: NodeRef
    note: str | None = None
    resolved: bool = False


class SceneAppearance(BaseModel):
    event: NodeRef
    story_time: str | None = None
    prose_status: str | None = None
    edge_type: EdgeType
    edge_note: str | None = None


class CharacterDossierAccepted(BaseModel):
    relationships: list[DossierRelationship] = Field(default_factory=list)
    scene_appearances: list[SceneAppearance] = Field(default_factory=list)
    themes: list[DossierRelationship] = Field(default_factory=list)
    locations: list[DossierRelationship] = Field(default_factory=list)
    lore: list[DossierRelationship] = Field(default_factory=list)
    decisions: list[DecisionRecord] = Field(default_factory=list)


class CharacterDossierDevelopment(BaseModel):
    notes: list[DossierRelationship] = Field(default_factory=list)
    open_threads: list[OpenThreadEdge] = Field(default_factory=list)


class CharacterDossierProposed(BaseModel):
    proposals: list[ProposalSummary] = Field(default_factory=list)


class CharacterDossier(BaseModel):
    context_type: Literal["character_dossier"] = "character_dossier"
    context_version: str = CONTEXT_VERSION
    project_hub_id: str
    character: NodeDetail
    accepted: CharacterDossierAccepted
    development: CharacterDossierDevelopment
    proposed: CharacterDossierProposed
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime


class RoleRoster(BaseModel):
    characters: list[NodeRef] = Field(default_factory=list)
    themes: list[NodeRef] = Field(default_factory=list)
    locations: list[NodeRef] = Field(default_factory=list)


class StoryProjectContext(BaseModel):
    context_type: Literal["story_project_context"] = "story_project_context"
    context_version: str = CONTEXT_VERSION
    project_hub_id: str
    project_mode: str
    hub: NodeDetail
    briefing_prompt: str | None = None
    roster: RoleRoster
    active_decisions: list[DecisionRecord] = Field(default_factory=list)
    open_threads: list[OpenThreadEdge] = Field(default_factory=list)
    open_proposals: list[ProposalSummary] = Field(default_factory=list)
    recent_changes: list[ActivityEvent] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime


class SceneContextEnvelope(BaseModel):
    """The live Scene Context assembly (never cached — philosophy §6.8)
    wrapped in the versioned envelope, with unresolved proposals that
    reference the scene appended."""

    context_type: Literal["scene_context"] = "scene_context"
    context_version: str = CONTEXT_VERSION
    project_hub_id: str
    scene: SceneContextResponse
    proposed: CharacterDossierProposed
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime


class RecentChangesContext(BaseModel):
    context_type: Literal["recent_changes"] = "recent_changes"
    context_version: str = CONTEXT_VERSION
    project_hub_id: str
    events: list[ActivityEvent] = Field(default_factory=list)
    next_cursor: int | None = None
    generated_at: datetime
