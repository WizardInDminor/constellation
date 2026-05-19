-- Phase 9 Slice 0: Project Workspace foundation.
--
-- ADR-063: A project is rooted in exactly one structure note (the "hub
-- note"). The flag `is_project_hub` on `nodes` marks the hub; a sidecar
-- `project_scopes` table keyed by `hub_node_id` stores persistent workspace
-- configuration (pinned nodes, tags, briefing prompt, mode, etc).
--
-- This migration adds:
--   * `is_project_hub` flag + partial index on `nodes`
--   * `project_scopes` sidecar
--   * `drafts` (free-writing-pad storage, one per project)
--   * `work_sessions`, `session_nodes`, `session_edges` (intentional work
--     sessions per philosophy doc §IIIb)
--   * `dismissed_corpus_suggestions` (per-project suppression for the
--     corpus-match panel)
--
-- No CHECK-constraint table-recreate ceremony is required: all changes are
-- pure additions (new columns with defaults on `nodes`; new tables).

-- ================================================================
-- NODES: project-hub flag
-- ================================================================
ALTER TABLE nodes ADD COLUMN is_project_hub INTEGER NOT NULL DEFAULT 0;

-- Partial index: project hubs are inherently a small subset of nodes, so
-- the index stays tiny. Excluding soft-deleted hubs keeps `GET /projects`
-- a single indexed scan.
CREATE INDEX idx_nodes_project_hub
    ON nodes(is_project_hub)
    WHERE is_project_hub = 1 AND deleted_at IS NULL;

-- ================================================================
-- PROJECT_SCOPES: persistent workspace configuration sidecar
-- ================================================================
CREATE TABLE project_scopes (
    hub_node_id     TEXT PRIMARY KEY REFERENCES nodes(id),
    pinned_node_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of node IDs
    tag_ids         TEXT NOT NULL DEFAULT '[]',  -- JSON array of tag IDs
    primary_tag_id  TEXT REFERENCES tags(id),    -- `con --project <name>` anchor
    briefing_prompt TEXT,                        -- saved Synthesize prompt for resume-briefing
    last_visited_at TEXT,
    mode            TEXT NOT NULL DEFAULT 'research'
                    CHECK(mode IN ('research', 'narrative', 'learning')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- ================================================================
-- DRAFTS: free-writing pad content, one per project
-- ================================================================
CREATE TABLE drafts (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES nodes(id),
    content    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(project_id)
);

CREATE INDEX idx_drafts_project ON drafts(project_id);

-- ================================================================
-- WORK_SESSIONS: intentional work-session records (philosophy doc §IIIb)
-- ================================================================
-- Session mode is independent of project mode: a narrative project can
-- have research sessions. `planning` is a fourth value beyond the
-- project-mode enum for structure / roadmap / scope work.
CREATE TABLE work_sessions (
    id                         TEXT PRIMARY KEY,
    project_id                 TEXT NOT NULL REFERENCES nodes(id),
    mode                       TEXT NOT NULL
                               CHECK(mode IN (
                                   'research', 'narrative',
                                   'learning', 'planning')),
    intent                     TEXT NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'active'
                               CHECK(status IN (
                                   'active', 'completed', 'partial',
                                   'blocked', 'abandoned')),
    progress_notes             TEXT,
    blockers                   TEXT,
    closing_notes              TEXT,
    next_session_intent        TEXT,
    intent_assessment          TEXT,
    estimated_duration_minutes INTEGER,
    started_at                 TEXT NOT NULL,
    closed_at                  TEXT,
    duration_seconds           INTEGER,
    created_at                 TEXT NOT NULL
);

CREATE INDEX idx_work_sessions_project
    ON work_sessions(project_id, started_at DESC);
CREATE INDEX idx_work_sessions_active
    ON work_sessions(project_id)
    WHERE status = 'active';

-- ================================================================
-- SESSION_NODES / SESSION_EDGES: session attribution joins
-- ================================================================
-- The `session_tagged` column lets users opt a single capture out of
-- session attribution without losing the fact that it was created
-- during that session (philosophy doc §IIIb.6). Row absence would
-- silently drop that information; the column makes the opt-out an
-- explicit, queryable decision.
CREATE TABLE session_nodes (
    session_id     TEXT NOT NULL REFERENCES work_sessions(id),
    node_id        TEXT NOT NULL REFERENCES nodes(id),
    created_at     TEXT NOT NULL,
    session_tagged INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, node_id)
);

CREATE INDEX idx_session_nodes_session
    ON session_nodes(session_id, created_at);
CREATE INDEX idx_session_nodes_node
    ON session_nodes(node_id);

CREATE TABLE session_edges (
    session_id     TEXT NOT NULL REFERENCES work_sessions(id),
    edge_id        TEXT NOT NULL REFERENCES edges(id),
    created_at     TEXT NOT NULL,
    session_tagged INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, edge_id)
);

CREATE INDEX idx_session_edges_session
    ON session_edges(session_id, created_at);

-- ================================================================
-- DISMISSED_CORPUS_SUGGESTIONS: per-project suppression list
-- ================================================================
-- Tracks corpus-match panel rows the user has dismissed so the same
-- note doesn't re-surface across sessions (philosophy doc §5.7).
CREATE TABLE dismissed_corpus_suggestions (
    project_id    TEXT NOT NULL REFERENCES nodes(id),
    node_id       TEXT NOT NULL REFERENCES nodes(id),
    dismissed_at  TEXT NOT NULL,
    PRIMARY KEY (project_id, node_id)
);
