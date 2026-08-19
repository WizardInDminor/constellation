"""Builder Pipeline (ADR-078/079/080) — production-layer data contracts.

The Builder turns creative intent into structured production work. Canon-layer
truth stays in the existing graph; these models cover the production layer
(stage runs, docs, scenes, shots) and the render layer (prompt specs, jobs,
assets). Stage outputs are explicit contracts: each stage stores markdown for
the human and `structured_json` (validated by the models below) for the next
stage.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# The full pipeline, in order. A closed vocabulary shared by the schema CHECK
# constraints, the Director's sequencing logic, and the frontend.
PipelineStage = Literal[
    "intake",
    "interpretation",
    "director_planning",
    "script_generation",
    "scene_planning",
    "shot_planning",
    "prompt_compilation",
    "generation",
    "asset_registration",
    "timeline_assembly",
    "export",
]

PIPELINE_STAGES: tuple[PipelineStage, ...] = (
    "intake",
    "interpretation",
    "director_planning",
    "script_generation",
    "scene_planning",
    "shot_planning",
    "prompt_compilation",
    "generation",
    "asset_registration",
    "timeline_assembly",
    "export",
)

ProductionStatus = Literal["active", "completed", "archived"]
StageRunStatus = Literal["running", "complete", "failed"]
DocKind = Literal["brief", "style_bible", "outline", "script"]


# ---------------------------------------------------------------------------
# Creative brief — the interpretation stage's structured output contract
# ---------------------------------------------------------------------------


class BriefCharacter(BaseModel):
    name: str
    role: str | None = None
    description: str | None = None


class BriefLocation(BaseModel):
    name: str
    description: str | None = None


class CreativeBrief(BaseModel):
    """What the Interpreter worker extracts from a raw idea.

    Everything here is a *proposal* — production-layer knowledge the user can
    edit before any of it is promoted to canon.
    """

    title: str
    logline: str
    premise: str
    format: str | None = None  # e.g. "3-minute animated short"
    tone: str | None = None
    themes: list[str] = Field(default_factory=list)
    characters: list[BriefCharacter] = Field(default_factory=list)
    locations: list[BriefLocation] = Field(default_factory=list)
    style_notes: str | None = None
    open_questions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Productions
# ---------------------------------------------------------------------------


class ProductionCreate(BaseModel):
    """Intake: a raw creative idea aimed at a project hub."""

    project_id: str
    idea: str = Field(min_length=1)
    title: str | None = None  # defaults to a truncation of the idea


class StageRun(BaseModel):
    id: str
    production_id: str
    stage: PipelineStage
    status: StageRunStatus
    attempt: int
    worker: str | None = None
    model_id: str | None = None
    detail_json: str | None = None
    error: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class ProductionDocSummary(BaseModel):
    id: str
    production_id: str
    kind: DocKind
    version: int
    canon_node_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ProductionDocDetail(ProductionDocSummary):
    content: str
    structured_json: str | None = None
    stage_run_id: str | None = None


class ProductionDocUpdate(BaseModel):
    """User refinement of a stage output before it feeds the next stage."""

    content: str | None = None
    structured_json: str | None = None


class ProductionSummary(BaseModel):
    id: str
    project_id: str
    title: str
    status: ProductionStatus
    current_stage: PipelineStage
    created_at: datetime
    updated_at: datetime


class ProductionDetail(ProductionSummary):
    idea: str
    stage_runs: list[StageRun] = Field(default_factory=list)
    docs: list[ProductionDocSummary] = Field(default_factory=list)


class PromoteDocResponse(BaseModel):
    """Result of explicitly promoting a production doc into the canon graph."""

    doc_id: str
    canon_node_id: str
    edge_id: str
