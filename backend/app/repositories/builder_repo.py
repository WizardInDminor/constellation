"""Builder Pipeline repository — the production aggregate root (ADR-078).

Covers productions, stage runs, and production docs. Scenes/shots and the
render-layer tables (prompt_specs, generation_jobs, assets) get their own
repositories when their slices land (see builder build plan B1–B3).
"""

import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models.builder import (
    DocKind,
    PipelineStage,
    ProductionCreate,
    ProductionDetail,
    ProductionDocDetail,
    ProductionDocSummary,
    ProductionSummary,
    StageRun,
)

_TITLE_TRUNCATION = 80


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------------------
# Productions
# ---------------------------------------------------------------------------


def _production_summary(row: aiosqlite.Row) -> ProductionSummary:
    return ProductionSummary(
        id=row["id"],
        project_id=row["project_id"],
        title=row["title"],
        status=row["status"],
        current_stage=row["current_stage"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def create_production(db: aiosqlite.Connection, data: ProductionCreate) -> ProductionDetail:
    """Intake: persist the raw idea verbatim and open the production."""
    production_id = str(uuid.uuid4())
    now = _now()
    title = data.title or data.idea.strip().splitlines()[0][:_TITLE_TRUNCATION]
    await db.execute(
        """INSERT INTO productions(id, project_id, title, idea, status, current_stage,
                                   created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 'intake', ?, ?)""",
        (production_id, data.project_id, title, data.idea, now, now),
    )
    await db.commit()
    detail = await get_production(db, production_id)
    assert detail is not None
    return detail


async def get_production(db: aiosqlite.Connection, production_id: str) -> ProductionDetail | None:
    cursor = await db.execute(
        """SELECT id, project_id, title, idea, status, current_stage, created_at, updated_at
           FROM productions WHERE id = ?""",
        (production_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ProductionDetail(
        id=row["id"],
        project_id=row["project_id"],
        title=row["title"],
        idea=row["idea"],
        status=row["status"],
        current_stage=row["current_stage"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        stage_runs=await list_stage_runs(db, production_id),
        docs=await list_docs(db, production_id),
    )


async def list_productions(
    db: aiosqlite.Connection, project_id: str | None = None
) -> list[ProductionSummary]:
    sql = (
        "SELECT id, project_id, title, status, current_stage, created_at, updated_at "
        "FROM productions"
    )
    params: tuple = ()
    if project_id is not None:
        sql += " WHERE project_id = ?"
        params = (project_id,)
    sql += " ORDER BY created_at DESC"
    cursor = await db.execute(sql, params)
    rows = await cursor.fetchall()
    return [_production_summary(r) for r in rows]


async def set_current_stage(
    db: aiosqlite.Connection, production_id: str, stage: PipelineStage
) -> None:
    await db.execute(
        "UPDATE productions SET current_stage = ?, updated_at = ? WHERE id = ?",
        (stage, _now(), production_id),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Stage runs
# ---------------------------------------------------------------------------


def _stage_run(row: aiosqlite.Row) -> StageRun:
    return StageRun(
        id=row["id"],
        production_id=row["production_id"],
        stage=row["stage"],
        status=row["status"],
        attempt=row["attempt"],
        worker=row["worker"],
        model_id=row["model_id"],
        detail_json=row["detail_json"],
        error=row["error"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


async def start_stage_run(
    db: aiosqlite.Connection,
    production_id: str,
    stage: PipelineStage,
    *,
    worker: str | None = None,
    model_id: str | None = None,
) -> StageRun:
    """Open a new attempt for (production, stage). Re-runs never mutate prior rows."""
    cursor = await db.execute(
        "SELECT COALESCE(MAX(attempt), 0) AS max_attempt FROM production_stage_runs "
        "WHERE production_id = ? AND stage = ?",
        (production_id, stage),
    )
    row = await cursor.fetchone()
    attempt = row["max_attempt"] + 1
    run_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO production_stage_runs(id, production_id, stage, status, attempt,
                                             worker, model_id, started_at)
           VALUES (?, ?, ?, 'running', ?, ?, ?, ?)""",
        (run_id, production_id, stage, attempt, worker, model_id, _now()),
    )
    await db.commit()
    run = await get_stage_run(db, run_id)
    assert run is not None
    return run


async def complete_stage_run(
    db: aiosqlite.Connection,
    run_id: str,
    *,
    detail_json: str | None = None,
    model_id: str | None = None,
) -> None:
    await db.execute(
        """UPDATE production_stage_runs
           SET status = 'complete', detail_json = COALESCE(?, detail_json),
               model_id = COALESCE(?, model_id), completed_at = ?
           WHERE id = ?""",
        (detail_json, model_id, _now(), run_id),
    )
    await db.commit()


async def fail_stage_run(db: aiosqlite.Connection, run_id: str, error: str) -> None:
    await db.execute(
        """UPDATE production_stage_runs
           SET status = 'failed', error = ?, completed_at = ?
           WHERE id = ?""",
        (error, _now(), run_id),
    )
    await db.commit()


async def get_stage_run(db: aiosqlite.Connection, run_id: str) -> StageRun | None:
    cursor = await db.execute(
        """SELECT id, production_id, stage, status, attempt, worker, model_id,
                  detail_json, error, started_at, completed_at
           FROM production_stage_runs WHERE id = ?""",
        (run_id,),
    )
    row = await cursor.fetchone()
    return _stage_run(row) if row is not None else None


async def list_stage_runs(db: aiosqlite.Connection, production_id: str) -> list[StageRun]:
    cursor = await db.execute(
        """SELECT id, production_id, stage, status, attempt, worker, model_id,
                  detail_json, error, started_at, completed_at
           FROM production_stage_runs WHERE production_id = ?
           ORDER BY started_at, attempt""",
        (production_id,),
    )
    rows = await cursor.fetchall()
    return [_stage_run(r) for r in rows]


# ---------------------------------------------------------------------------
# Production docs
# ---------------------------------------------------------------------------


def _doc_detail(row: aiosqlite.Row) -> ProductionDocDetail:
    return ProductionDocDetail(
        id=row["id"],
        production_id=row["production_id"],
        kind=row["kind"],
        version=row["version"],
        content=row["content"],
        structured_json=row["structured_json"],
        stage_run_id=row["stage_run_id"],
        canon_node_id=row["canon_node_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def create_doc(
    db: aiosqlite.Connection,
    production_id: str,
    kind: DocKind,
    *,
    content: str,
    structured_json: str | None = None,
    stage_run_id: str | None = None,
) -> ProductionDocDetail:
    """Write a new doc version. Re-runs append versions, never overwrite."""
    cursor = await db.execute(
        "SELECT COALESCE(MAX(version), 0) AS max_version FROM production_docs "
        "WHERE production_id = ? AND kind = ?",
        (production_id, kind),
    )
    row = await cursor.fetchone()
    version = row["max_version"] + 1
    doc_id = str(uuid.uuid4())
    now = _now()
    await db.execute(
        """INSERT INTO production_docs(id, production_id, kind, version, content,
                                       structured_json, stage_run_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (doc_id, production_id, kind, version, content, structured_json, stage_run_id, now, now),
    )
    await db.commit()
    doc = await get_doc(db, doc_id)
    assert doc is not None
    return doc


async def get_doc(db: aiosqlite.Connection, doc_id: str) -> ProductionDocDetail | None:
    cursor = await db.execute(
        """SELECT id, production_id, kind, version, content, structured_json,
                  stage_run_id, canon_node_id, created_at, updated_at
           FROM production_docs WHERE id = ?""",
        (doc_id,),
    )
    row = await cursor.fetchone()
    return _doc_detail(row) if row is not None else None


async def latest_doc(
    db: aiosqlite.Connection, production_id: str, kind: DocKind
) -> ProductionDocDetail | None:
    cursor = await db.execute(
        """SELECT id, production_id, kind, version, content, structured_json,
                  stage_run_id, canon_node_id, created_at, updated_at
           FROM production_docs WHERE production_id = ? AND kind = ?
           ORDER BY version DESC LIMIT 1""",
        (production_id, kind),
    )
    row = await cursor.fetchone()
    return _doc_detail(row) if row is not None else None


async def list_docs(db: aiosqlite.Connection, production_id: str) -> list[ProductionDocSummary]:
    cursor = await db.execute(
        """SELECT id, production_id, kind, version, canon_node_id, created_at, updated_at
           FROM production_docs WHERE production_id = ?
           ORDER BY kind, version DESC""",
        (production_id,),
    )
    rows = await cursor.fetchall()
    return [
        ProductionDocSummary(
            id=r["id"],
            production_id=r["production_id"],
            kind=r["kind"],
            version=r["version"],
            canon_node_id=r["canon_node_id"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


async def update_doc(
    db: aiosqlite.Connection,
    doc_id: str,
    *,
    content: str | None = None,
    structured_json: str | None = None,
) -> ProductionDocDetail | None:
    """User refinement of a doc in place (same version — the user is editing,
    not re-running the stage)."""
    doc = await get_doc(db, doc_id)
    if doc is None:
        return None
    await db.execute(
        """UPDATE production_docs
           SET content = COALESCE(?, content),
               structured_json = COALESCE(?, structured_json),
               updated_at = ?
           WHERE id = ?""",
        (content, structured_json, _now(), doc_id),
    )
    await db.commit()
    return await get_doc(db, doc_id)


async def mark_doc_promoted(db: aiosqlite.Connection, doc_id: str, canon_node_id: str) -> None:
    await db.execute(
        "UPDATE production_docs SET canon_node_id = ?, updated_at = ? WHERE id = ?",
        (canon_node_id, _now(), doc_id),
    )
    await db.commit()
