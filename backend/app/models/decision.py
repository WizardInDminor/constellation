"""In-project decision contracts (Track C Phase C1, ADR-084).

An explicit accepted choice inside a project (story decisions, creative
direction). Software/architecture decisions stay in docs/decisions.md — the
repository remains authoritative for executable software (direction pack
ADR-006).

Superseding is done at creation time: a new decision created with
`supersedes_decision_id` flips the old row to 'superseded' in the same
operation, so the current-decision query is always a simple status filter and
history stays queryable (AT-005).
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.provenance import ProvenanceCreate, ProvenanceRecord

DecisionStatus = Literal["accepted", "superseded", "archived"]


class DecisionCreate(BaseModel):
    project_hub_id: str
    statement: str = Field(min_length=1)
    decision_type: str | None = None
    rationale: str | None = None
    implications: str | None = None
    supersedes_decision_id: str | None = None
    proposal_id: str | None = None
    provenance: ProvenanceCreate


class DecisionRecord(BaseModel):
    id: str
    project_hub_id: str
    statement: str
    decision_type: str | None = None
    rationale: str | None = None
    implications: str | None = None
    status: DecisionStatus
    supersedes_decision_id: str | None = None
    superseded_by_decision_id: str | None = None  # derived: who superseded me
    proposal_id: str | None = None
    provenance: ProvenanceRecord | None = None
    created_at: datetime
    updated_at: datetime
