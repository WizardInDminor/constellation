-- Phase 9 Slice 4: narrative timeline foundation.
--
-- Adds the schema that lets the workspace render a single-lane story-time
-- timeline canvas (Slice 4 single-lane; Slice 5 parallel lanes use the same
-- tables). Five pieces:
--
-- 1. `nodes` gains four nullable narrative-event columns (ADR-064, ADR-071):
--      is_story_event       — boolean flag specialising a permanent node
--      story_time           — free-text axis position ("Day 14", "Act 2")
--      prose_status         — writing-pipeline state (CHECK enum)
--      manuscript_location  — opaque pointer to external manuscript
--
-- 2. `event_timeline_positions` — per-timeline discourse position for events
--    (ADR-065). Composite PK lets one event appear in multiple timelines.
--
-- 3. `act_spans` — span events (acts as background regions on the canvas).
--    Separate from `event_timeline_positions` because acts are spans,
--    not points (ADR-072).
--
-- 4. `edges.type` CHECK constraint adds `EXPLAINS` (ADR-052 Slice 4
--    addendum). SQLite cannot ALTER a CHECK in place; the table is
--    recreated. Pattern mirrors `0004_expanded_edge_types.sql` and
--    `0006_resolved_edges.sql`.
--
-- 5. Indexes for the new tables + index on `is_story_event = 1` to keep
--    the "hide story events" Notes filter fast.
--
-- No FK to `edges` from any other table, so `foreign_keys=OFF` is not
-- needed for the table-recreate.

-- ================================================================
-- NODES: narrative-event columns (ADR-064, ADR-071)
-- ================================================================
ALTER TABLE nodes ADD COLUMN is_story_event INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN story_time TEXT;
ALTER TABLE nodes ADD COLUMN prose_status TEXT
    CHECK(prose_status IN ('planned', 'draft', 'written', 'revised'));
ALTER TABLE nodes ADD COLUMN manuscript_location TEXT;

-- Partial index keeps the Slice 4 "hide story events" Notes-filter query
-- a single indexed scan even when the project has hundreds of scenes.
CREATE INDEX idx_nodes_story_event
    ON nodes(is_story_event)
    WHERE is_story_event = 1 AND deleted_at IS NULL;

-- ================================================================
-- EVENT_TIMELINE_POSITIONS (ADR-065)
-- ================================================================
-- Discourse position is scoped per timeline. Composite PK on (event,
-- timeline) allows a crossover scene to appear in multiple timelines
-- with different positions — Slice 5 territory but the schema supports
-- it from Slice 4.
CREATE TABLE event_timeline_positions (
    event_node_id      TEXT NOT NULL REFERENCES nodes(id),
    timeline_node_id   TEXT NOT NULL REFERENCES nodes(id),
    discourse_position INTEGER NOT NULL,
    PRIMARY KEY (event_node_id, timeline_node_id)
);

CREATE INDEX idx_etp_timeline
    ON event_timeline_positions(timeline_node_id, discourse_position);

-- ================================================================
-- ACT_SPANS (ADR-072)
-- ================================================================
-- Spans are kept separate from `event_timeline_positions` because acts
-- aren't points; they don't carry the same fields and don't connect via
-- FOLLOWS_FROM. start_position/end_position live on the same discourse-
-- position axis as event_timeline_positions.discourse_position.
CREATE TABLE act_spans (
    id                TEXT PRIMARY KEY,
    timeline_node_id  TEXT NOT NULL REFERENCES nodes(id),
    label             TEXT NOT NULL,
    start_position    INTEGER NOT NULL,
    end_position      INTEGER NOT NULL,
    color             TEXT,
    created_at        TEXT NOT NULL
);

CREATE INDEX idx_act_spans_timeline ON act_spans(timeline_node_id);

-- ================================================================
-- EDGES: add EXPLAINS to the type CHECK (ADR-052 Slice 4 addendum)
-- ================================================================
-- Mirror of 0004 / 0006: recreate with the widened constraint, copy all
-- existing columns (resolved_at, resolved_by_node_id, classifier_rationale
-- now exist on the source table — copy them through), rebuild indexes.
CREATE TABLE edges_new (
    id                   TEXT PRIMARY KEY,
    from_id              TEXT NOT NULL REFERENCES nodes(id),
    to_id                TEXT NOT NULL REFERENCES nodes(id),
    type                 TEXT NOT NULL CHECK(type IN (
                              'SUPPORTS', 'CONTRADICTS', 'ELABORATES',
                              'ANALOGOUS_TO', 'QUESTIONS',
                              'INSPIRED_BY', 'COLLECTS',
                              'CITES',
                              'BUILDS_ON', 'APPLIES_TO', 'MEASURES',
                              'EXTENDS', 'REFINES',
                              'SUPERSEDED_BY', 'SCOPED_TO',
                              'REGIME_OF', 'FOLLOWS_FROM',
                              'EXPLAINS')),
    note                 TEXT,
    classifier_rationale TEXT,
    resolved_at          TEXT,
    resolved_by_node_id  TEXT REFERENCES nodes(id),
    created_at           TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

INSERT INTO edges_new (
    id, from_id, to_id, type, note, classifier_rationale,
    resolved_at, resolved_by_node_id, created_at
)
SELECT
    id, from_id, to_id, type, note, classifier_rationale,
    resolved_at, resolved_by_node_id, created_at
FROM edges;

DROP TABLE edges;
ALTER TABLE edges_new RENAME TO edges;

CREATE INDEX idx_edges_from        ON edges(from_id);
CREATE INDEX idx_edges_to          ON edges(to_id);
CREATE INDEX idx_edges_type        ON edges(type);
CREATE INDEX idx_edges_resolved_at ON edges(resolved_at) WHERE resolved_at IS NOT NULL;
