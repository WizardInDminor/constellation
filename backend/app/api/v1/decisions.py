"""In-project decision routes (Phase C1, ADR-084).

- POST /decisions        → record an accepted decision (201); creating with
                           `supersedes_decision_id` supersedes the old one
- GET  /decisions        → list (filter by project, status)
- GET  /decisions/{id}   → detail
"""

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.core.errors import ObjectNotFound, ProjectNotFound, ValidationFailed
from app.models.decision import DecisionCreate, DecisionRecord, DecisionStatus
from app.repositories import decision_repo, project_repo, provenance_repo
from app.services import activity_service

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.post("", status_code=201)
async def record_decision(data: DecisionCreate, db: DB) -> DecisionRecord:
    """Record an explicit accepted decision. Superseded decisions remain
    queryable; the new decision references the old (AT-005)."""
    if not await project_repo.is_project_hub(db, data.project_hub_id):
        raise ProjectNotFound(
            "Project hub not found", details={"project_hub_id": data.project_hub_id}
        )
    if data.supersedes_decision_id is not None:
        old = await decision_repo.get_by_id(db, data.supersedes_decision_id)
        if old is None:
            raise ValidationFailed(
                "supersedes_decision_id does not reference an existing decision",
                details={"supersedes_decision_id": data.supersedes_decision_id},
            )

    provenance = await provenance_repo.create(db, data.provenance)
    decision = await decision_repo.create(db, data, provenance.id)
    await activity_service.emit(
        db,
        event_type="decision.recorded",
        object_type="decision",
        object_id=decision.id,
        summary=f"Decision recorded: {decision.statement[:120]}",
        project_hub_id=decision.project_hub_id,
        metadata=(
            {"supersedes_decision_id": data.supersedes_decision_id}
            if data.supersedes_decision_id
            else None
        ),
        provenance_id=provenance.id,
    )
    return decision


@router.get("")
async def list_decisions(
    db: DB,
    project_hub_id: str | None = None,
    status: list[DecisionStatus] | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[DecisionRecord]:
    return await decision_repo.list_decisions(
        db, project_hub_id=project_hub_id, statuses=status, limit=limit
    )


@router.get("/{decision_id}")
async def get_decision(decision_id: str, db: DB) -> DecisionRecord:
    decision = await decision_repo.get_by_id(db, decision_id)
    if decision is None:
        raise ObjectNotFound("Decision not found", details={"object_type": "decision"})
    return decision
