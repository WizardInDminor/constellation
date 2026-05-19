-- Phase 9 Slice 3: artifact_type / artifact_format columns on nodes.
--
-- The workspace's Mermaid rendering and PNG/Markdown export flows treat
-- some nodes as "artifacts" — rendered outputs (Mermaid diagrams, Gantt
-- charts, documents) with an export path — alongside the existing "note"
-- nodes. These columns are set by future synthesis flows; existing nodes
-- get NULL and behave exactly as before.
--
-- Both columns are nullable with no default. SQLite CHECK only evaluates
-- on non-NULL values, so NULL bypasses the constraint and pre-existing
-- rows pass without backfill.
--
-- Pure column-adds; no CHECK-constraint table-recreate.

ALTER TABLE nodes ADD COLUMN artifact_type TEXT
    CHECK(artifact_type IN ('note', 'artifact'));

ALTER TABLE nodes ADD COLUMN artifact_format TEXT
    CHECK(artifact_format IN ('mermaid', 'gantt', 'document'));
