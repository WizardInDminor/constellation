-- Builder Pipeline Slice B0: Production + Render layer foundation (ADR-078/079/080).
--
-- The Builder Pipeline turns creative intent into structured production work
-- across three layers:
--   * Canon layer      — persistent creative truth. This is the EXISTING graph
--                        (nodes, edges, tags, canon_status metadata, project
--                        hubs). No new canon storage is added here.
--   * Production layer — episode/scene/shot planning. New tables below.
--   * Render layer     — generated media assets. New tables below.
--
-- Generated outputs never become canon automatically: production docs and
-- assets carry a nullable `canon_node_id` that is set only by an explicit
-- promote action, which creates a real node in the graph.
--
-- Following the Phase 9 Slice 0 precedent (0007), the full production/render
-- schema lands in one migration so the data contracts are fixed before the
-- stage implementations arrive slice by slice. Timeline-assembly tables are
-- deliberately deferred (ADR-078 § deferred) — their shape depends on the
-- assembler chosen in Slice B4.
--
-- All changes are new tables; no existing table is touched.

-- ================================================================
-- PRODUCTIONS: one Builder run rooted in a project hub
-- ================================================================
-- `idea` preserves the original creative intent verbatim — the intake stage's
-- durable output. `current_stage` is a convenience pointer; the authoritative
-- history is production_stage_runs.
CREATE TABLE productions (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES nodes(id),
    title         TEXT NOT NULL,
    idea          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active', 'completed', 'archived')),
    current_stage TEXT NOT NULL DEFAULT 'intake'
                  CHECK(current_stage IN (
                      'intake', 'interpretation', 'director_planning',
                      'script_generation', 'scene_planning', 'shot_planning',
                      'prompt_compilation', 'generation', 'asset_registration',
                      'timeline_assembly', 'export')),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX idx_productions_project
    ON productions(project_id, created_at DESC);

-- ================================================================
-- PRODUCTION_STAGE_RUNS: restartable stage execution records
-- ================================================================
-- Every stage execution — including re-runs — gets a row. `attempt` increments
-- per (production, stage). `detail_json` records what the worker actually did
-- (model id, token counts, prompt hash…) so runs are auditable and
-- reproducible. A failed run is re-run by creating a new attempt, never by
-- mutating the failed row.
CREATE TABLE production_stage_runs (
    id            TEXT PRIMARY KEY,
    production_id TEXT NOT NULL REFERENCES productions(id),
    stage         TEXT NOT NULL
                  CHECK(stage IN (
                      'intake', 'interpretation', 'director_planning',
                      'script_generation', 'scene_planning', 'shot_planning',
                      'prompt_compilation', 'generation', 'asset_registration',
                      'timeline_assembly', 'export')),
    status        TEXT NOT NULL DEFAULT 'running'
                  CHECK(status IN ('running', 'complete', 'failed')),
    attempt       INTEGER NOT NULL DEFAULT 1,
    worker        TEXT,
    model_id      TEXT,
    detail_json   TEXT,
    error         TEXT,
    started_at    TEXT NOT NULL,
    completed_at  TEXT
);

CREATE INDEX idx_stage_runs_production
    ON production_stage_runs(production_id, stage, attempt DESC);

-- ================================================================
-- PRODUCTION_DOCS: durable structured stage outputs
-- ================================================================
-- Creative brief, style bible, outline, script. Each doc stores both a
-- human-readable markdown `content` and the machine-readable
-- `structured_json` contract the next stage consumes. Re-running a stage
-- writes a new version rather than overwriting (reproducibility + history).
-- `canon_node_id` is set only by the explicit promote endpoint.
CREATE TABLE production_docs (
    id              TEXT PRIMARY KEY,
    production_id   TEXT NOT NULL REFERENCES productions(id),
    kind            TEXT NOT NULL
                    CHECK(kind IN ('brief', 'style_bible', 'outline', 'script')),
    version         INTEGER NOT NULL DEFAULT 1,
    content         TEXT NOT NULL,
    structured_json TEXT,
    stage_run_id    TEXT REFERENCES production_stage_runs(id),
    canon_node_id   TEXT REFERENCES nodes(id),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_production_docs_production
    ON production_docs(production_id, kind, version DESC);

-- ================================================================
-- PRODUCTION_SCENES / PRODUCTION_SHOTS: planning units
-- ================================================================
-- Production scenes are planning objects, distinct from canon story events
-- (`is_story_event` nodes). `canon_event_node_id` links a production scene to
-- the story event it realizes, when one exists — the bridge between the
-- production layer and the canon timeline.
CREATE TABLE production_scenes (
    id                  TEXT PRIMARY KEY,
    production_id       TEXT NOT NULL REFERENCES productions(id),
    seq                 INTEGER NOT NULL,
    title               TEXT NOT NULL,
    summary             TEXT,
    script_text         TEXT,
    canon_event_node_id TEXT REFERENCES nodes(id),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE INDEX idx_production_scenes_production
    ON production_scenes(production_id, seq);

CREATE TABLE production_shots (
    id               TEXT PRIMARY KEY,
    scene_id         TEXT NOT NULL REFERENCES production_scenes(id),
    seq              INTEGER NOT NULL,
    shot_type        TEXT,
    description      TEXT NOT NULL,
    duration_seconds REAL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE INDEX idx_production_shots_scene
    ON production_shots(scene_id, seq);

-- ================================================================
-- PROMPT_SPECS: compiled prompts, frozen at compilation time
-- ================================================================
-- Prompts are compiled from structured objects (shot + scene + canon context),
-- never handwritten into a job. The compiled text and the exact structured
-- inputs used (`context_json`) are frozen here so every generation job is
-- reproducible even after the canon evolves.
CREATE TABLE prompt_specs (
    id              TEXT PRIMARY KEY,
    production_id   TEXT NOT NULL REFERENCES productions(id),
    target_kind     TEXT NOT NULL
                    CHECK(target_kind IN ('shot', 'scene', 'production')),
    target_id       TEXT NOT NULL,
    worker_kind     TEXT NOT NULL
                    CHECK(worker_kind IN ('image', 'video', 'voice', 'music')),
    compiled_prompt TEXT NOT NULL,
    context_json    TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_prompt_specs_production
    ON prompt_specs(production_id);
CREATE INDEX idx_prompt_specs_target
    ON prompt_specs(target_kind, target_id);

-- ================================================================
-- GENERATION_JOBS: media generation work items
-- ================================================================
-- Mirrors the embedding_jobs queue pattern (0001/0003): status enum,
-- attempt_count, error text. A job references the frozen prompt_spec that
-- fully determines it — provider + model + params + spec = reproducible run.
CREATE TABLE generation_jobs (
    id             TEXT PRIMARY KEY,
    prompt_spec_id TEXT NOT NULL REFERENCES prompt_specs(id),
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending', 'running', 'complete',
                                    'failed', 'canceled')),
    provider       TEXT,
    model_id       TEXT,
    params_json    TEXT,
    error          TEXT,
    attempt_count  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    started_at     TEXT,
    completed_at   TEXT
);

CREATE INDEX idx_generation_jobs_status
    ON generation_jobs(status);
CREATE INDEX idx_generation_jobs_spec
    ON generation_jobs(prompt_spec_id);

-- ================================================================
-- ASSETS: render-layer outputs (and imported reference media)
-- ================================================================
-- Every generated asset is traceable back through generation_job_id →
-- prompt_spec → target shot/scene → production → project hub. Imported
-- reference assets have origin='imported' and no job. `canon_node_id` is set
-- only by explicit promotion.
CREATE TABLE assets (
    id                TEXT PRIMARY KEY,
    production_id     TEXT NOT NULL REFERENCES productions(id),
    kind              TEXT NOT NULL
                      CHECK(kind IN ('image', 'video', 'audio', 'other')),
    origin            TEXT NOT NULL
                      CHECK(origin IN ('generated', 'imported')),
    file_path         TEXT NOT NULL,
    mime_type         TEXT,
    metadata_json     TEXT,
    generation_job_id TEXT REFERENCES generation_jobs(id),
    canon_node_id     TEXT REFERENCES nodes(id),
    created_at        TEXT NOT NULL
);

CREATE INDEX idx_assets_production
    ON assets(production_id, created_at DESC);
CREATE INDEX idx_assets_job
    ON assets(generation_job_id)
    WHERE generation_job_id IS NOT NULL;
