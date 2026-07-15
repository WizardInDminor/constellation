"""The Director — Builder Pipeline orchestration (ADR-079).

The Director plans and sequences production. It decides which stage runs,
records every attempt as a stage run (restartability: re-running a stage opens
a new attempt and writes a new doc version — nothing is mutated), and
delegates the actual content work to replaceable workers. It never generates
media itself.

Slice B0 implements intake and interpretation; later stages raise
StageNotImplemented until their slices land (build plan B1–B5).
"""

import json
import logging

import aiosqlite

from app.models.builder import (
    PIPELINE_STAGES,
    CreativeBrief,
    PipelineStage,
    ProductionCreate,
    ProductionDetail,
)
from app.providers.base import GenerationProvider
from app.repositories import builder_repo
from app.workers.base import WorkerError
from app.workers.interpreter import LLMInterpreter

logger = logging.getLogger(__name__)


class StageNotImplemented(Exception):
    """The requested stage exists in the pipeline contract but its slice
    hasn't landed yet."""


class StageFailed(Exception):
    """A worker failed; the failure is recorded on the stage run."""


async def intake(db: aiosqlite.Connection, data: ProductionCreate) -> ProductionDetail:
    """Stage 1 — preserve the raw creative intent verbatim and open the
    production. No AI: the idea itself is the durable output."""
    production = await builder_repo.create_production(db, data)
    run = await builder_repo.start_stage_run(db, production.id, "intake", worker="director")
    await builder_repo.complete_stage_run(db, run.id)
    refreshed = await builder_repo.get_production(db, production.id)
    assert refreshed is not None
    return refreshed


async def run_stage(
    db: aiosqlite.Connection,
    production_id: str,
    stage: PipelineStage,
    gen_provider: GenerationProvider,
) -> ProductionDetail:
    """Run (or re-run) a pipeline stage. Every invocation opens a new attempt;
    outputs are versioned, so re-runs are always safe."""
    production = await builder_repo.get_production(db, production_id)
    if production is None:
        raise KeyError(production_id)

    if stage == "intake":
        raise StageNotImplemented(
            "intake runs once at production creation; re-run by creating a new production"
        )
    if stage == "interpretation":
        await _run_interpretation(db, production, gen_provider)
    else:
        raise StageNotImplemented(f"Stage '{stage}' is not implemented yet (builder build plan)")

    refreshed = await builder_repo.get_production(db, production_id)
    assert refreshed is not None
    return refreshed


async def _run_interpretation(
    db: aiosqlite.Connection,
    production: ProductionDetail,
    gen_provider: GenerationProvider,
) -> None:
    """Stage 2 — the Interpreter worker turns the idea into a CreativeBrief,
    stored as a versioned production doc (markdown + structured JSON)."""
    worker = LLMInterpreter(gen_provider)
    run = await builder_repo.start_stage_run(
        db, production.id, "interpretation", worker=worker.name, model_id=worker.model_id
    )
    try:
        brief = await worker.interpret(production.idea)
    except WorkerError as exc:
        await builder_repo.fail_stage_run(db, run.id, str(exc))
        logger.error("Interpretation failed for production %s: %s", production.id, exc)
        raise StageFailed(str(exc)) from exc

    await builder_repo.create_doc(
        db,
        production.id,
        "brief",
        content=render_brief_markdown(brief),
        structured_json=brief.model_dump_json(),
        stage_run_id=run.id,
    )
    await builder_repo.complete_stage_run(
        db, run.id, detail_json=json.dumps({"characters": len(brief.characters)})
    )
    await _advance_current_stage(db, production, "interpretation")


async def _advance_current_stage(
    db: aiosqlite.Connection, production: ProductionDetail, completed: PipelineStage
) -> None:
    """Move the convenience pointer forward, never backward (re-running an
    earlier stage refines its output without resetting pipeline position)."""
    if PIPELINE_STAGES.index(completed) >= PIPELINE_STAGES.index(production.current_stage):
        next_index = min(PIPELINE_STAGES.index(completed) + 1, len(PIPELINE_STAGES) - 1)
        await builder_repo.set_current_stage(db, production.id, PIPELINE_STAGES[next_index])


def render_brief_markdown(brief: CreativeBrief) -> str:
    """Human-readable view of the brief. The structured JSON stays the
    machine contract; this rendering is for reading and canon promotion."""
    lines = [f"# {brief.title}", "", f"**Logline:** {brief.logline}", "", brief.premise, ""]
    if brief.format:
        lines.append(f"- **Format:** {brief.format}")
    if brief.tone:
        lines.append(f"- **Tone:** {brief.tone}")
    if brief.themes:
        lines.append(f"- **Themes:** {', '.join(brief.themes)}")
    if brief.style_notes:
        lines += ["", "## Style notes", "", brief.style_notes]
    if brief.characters:
        lines += ["", "## Characters", ""]
        for c in brief.characters:
            role = f" ({c.role})" if c.role else ""
            desc = f" — {c.description}" if c.description else ""
            lines.append(f"- **{c.name}**{role}{desc}")
    if brief.locations:
        lines += ["", "## Locations", ""]
        for loc in brief.locations:
            desc = f" — {loc.description}" if loc.description else ""
            lines.append(f"- **{loc.name}**{desc}")
    if brief.open_questions:
        lines += ["", "## Open questions", ""]
        lines += [f"- {q}" for q in brief.open_questions]
    return "\n".join(lines) + "\n"
