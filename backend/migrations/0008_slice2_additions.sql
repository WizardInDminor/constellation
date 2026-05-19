-- Phase 9 Slice 2: source status (ADR-070) + prior-knowledge entry on project_scopes.
--
-- ADR-070 adds a `status` column to `sources` so the learning-map flow can
-- distinguish AI-suggested resources from user-supplied / confirmed ones.
-- Existing rows are backfilled to 'user_supplied' since they couldn't have
-- been AI-suggested.
--
-- `prior_knowledge` lives on `project_scopes` to support the Session-1-only
-- "quick corrections" left-panel surface (philosophy doc §5.4, build plan
-- Slice 2 deliverables). The text captured at project-creation onboarding
-- is the source the AI uses to derive quick corrections.
--
-- Both additions are pure column-adds with defaults; no CHECK-constraint
-- table-recreate is required.

-- ================================================================
-- SOURCES: status column for learning-map suggestions (ADR-070)
-- ================================================================
-- Default is 'user_supplied' for backward compatibility — every source
-- created before this migration was user-supplied by definition. The
-- learning-map flow inserts new rows with status='suggested' explicitly.
ALTER TABLE sources ADD COLUMN status TEXT NOT NULL DEFAULT 'user_supplied'
    CHECK(status IN ('suggested', 'confirmed', 'user_supplied'));

-- ================================================================
-- PROJECT_SCOPES: prior_knowledge for the learning-mode quick-corrections panel
-- ================================================================
ALTER TABLE project_scopes ADD COLUMN prior_knowledge TEXT;
