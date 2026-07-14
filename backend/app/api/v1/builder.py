"""Builder Pipeline routes (ADR-078/079) — the production layer's API surface.

- POST  /builder/productions                     → intake: idea → production
- GET   /builder/productions?project_id=         → list productions
- GET   /builder/productions/{id}                → detail (stage runs + docs)
- POST  /builder/productions/{id}/stages/{stage}/run → run/re-run a stage
- GET   /builder/docs/{id}                       → doc detail
- PATCH /builder/docs/{id}                       → user refinement of a doc
- POST  /builder/docs/{id}/promote               → explicit promotion to canon

Unimplemented stages return 501 (the Phase 1 `process` precedent): the
pipeline contract is fixed, the slices land one at a time.
"""

from fastapi import APIRouter, HTTPException

from app.core.deps import DB, EmbedProvider, GenProvider
from app.models import EdgeCreate, PermanentCreate
from app.models.builder import (
    DocKind,
    PipelineStage,
    ProductionCreate,
    ProductionDetail,
    ProductionDocDetail,
    ProductionDocUpdate,
    ProductionSummary,
    PromoteDocResponse,
)
from app.repositories import builder_repo, edge_repo, node_repo, project_repo
from app.services import director_service, embedding_service

router = APIRouter(prefix="/builder", tags=["builder"])

_DOC_KIND_LABELS: dict[DocKind, str] = {
    "brief": "Creative brief",
    "style_bible": "Style bible",
    "outline": "Outline",
    "script": "Script",
}


@router.post("/productions", status_code=201)
async def create_production(data: ProductionCreate, db: DB) -> ProductionDetail:
    """Intake: preserve a raw creative idea verbatim and open a production
    rooted in a project hub."""
    if not await project_repo.is_project_hub(db, data.project_id):
        raise HTTPException(404, "Project hub not found")
    return await director_service.intake(db, data)


@router.get("/productions")
async def list_productions(db: DB, project_id: str | None = None) -> list[ProductionSummary]:
    return await builder_repo.list_productions(db, project_id)


@router.get("/productions/{production_id}")
async def get_production(production_id: str, db: DB) -> ProductionDetail:
    production = await builder_repo.get_production(db, production_id)
    if production is None:
        raise HTTPException(404, "Production not found")
    return production


@router.post("/productions/{production_id}/stages/{stage}/run")
async def run_stage(
    production_id: str, stage: PipelineStage, db: DB, gen: GenProvider
) -> ProductionDetail:
    """Run (or re-run) a pipeline stage. Every invocation is a new attempt;
    outputs are versioned, so re-running is always safe."""
    try:
        return await director_service.run_stage(db, production_id, stage, gen)
    except KeyError:
        raise HTTPException(404, "Production not found") from None
    except director_service.StageNotImplemented as exc:
        raise HTTPException(501, str(exc)) from exc
    except director_service.StageFailed as exc:
        raise HTTPException(502, f"Stage failed: {exc}") from exc


@router.get("/docs/{doc_id}")
async def get_doc(doc_id: str, db: DB) -> ProductionDocDetail:
    doc = await builder_repo.get_doc(db, doc_id)
    if doc is None:
        raise HTTPException(404, "Doc not found")
    return doc


@router.patch("/docs/{doc_id}")
async def update_doc(doc_id: str, data: ProductionDocUpdate, db: DB) -> ProductionDocDetail:
    """User refinement of a stage output before the next stage consumes it."""
    doc = await builder_repo.update_doc(
        db, doc_id, content=data.content, structured_json=data.structured_json
    )
    if doc is None:
        raise HTTPException(404, "Doc not found")
    return doc


@router.post("/docs/{doc_id}/promote", status_code=201)
async def promote_doc(doc_id: str, db: DB, embed: EmbedProvider) -> PromoteDocResponse:
    """Explicitly promote a production doc into the canon graph.

    Creates a permanent node (canon_status=provisional — newly promoted truth
    is not yet settled) with the doc's markdown, embeds it, and links it from
    the project hub via COLLECTS. Generated outputs never become canon
    automatically; this endpoint is the only path in.
    """
    doc = await builder_repo.get_doc(db, doc_id)
    if doc is None:
        raise HTTPException(404, "Doc not found")
    if doc.canon_node_id is not None:
        raise HTTPException(409, "Doc already promoted")

    production = await builder_repo.get_production(db, doc.production_id)
    assert production is not None

    label = _DOC_KIND_LABELS[doc.kind]
    node = await node_repo.create_permanent(
        db,
        PermanentCreate(
            title=f"{production.title} — {label}",
            content=doc.content,
            summary=f"{label} produced by the Builder Pipeline (v{doc.version}).",
            canon_status="provisional",
        ),
    )
    await embedding_service.embed_or_queue(db, node.id, embed)
    edge = await edge_repo.create(
        db,
        EdgeCreate(
            from_id=production.project_id,
            to_id=node.id,
            type="COLLECTS",
            note=(
                f"Promoted from Builder production '{production.title}' "
                f"({doc.kind} v{doc.version})."
            ),
        ),
    )
    await builder_repo.mark_doc_promoted(db, doc_id, node.id)
    return PromoteDocResponse(doc_id=doc_id, canon_node_id=node.id, edge_id=edge.id)
