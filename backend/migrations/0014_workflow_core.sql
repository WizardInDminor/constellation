-- Track C Phase C1: shared workflow core (ADR-084/085/086; direction pack
-- Phase 1, docs/direction/02_PHASED_BUILD_GUIDE.md).
--
-- One proposal-before-truth lifecycle for the whole product, unifying the
-- pattern that already exists in four ad-hoc flows (pending_ingests, bridge
-- classification, suggest flows, builder doc promotion):
--
--   * provenance_records — who/what created a thing (human, AI client,
--                          system, import) and where it came from.
--   * proposals          — suggested changes awaiting resolution. AI-created
--                          material lands here (or as speculative nodes),
--                          never directly in accepted truth.
--   * proposal_revisions — durable versions of a proposal's mutable content.
--                          Revision 1 is the original; edits append.
--   * decisions          — explicit accepted in-project choices with a
--                          supersession chain. (Software/architecture
--                          decisions stay in docs/decisions.md per direction
--                          pack ADR-006 — the repo remains authoritative for
--                          executable software.)
--   * activity_events    — append-only project event log; the substrate for
--                          get_recent_changes and cross-client visibility.
--
-- All changes are new tables; no existing table is touched.
--
-- Vocabulary note (ADR-084): lifecycle *statuses* are CHECK-constrained (the
-- state machine is fixed by the direction pack), but *type* vocabularies
-- (proposal_type, event_type, object_type, decision_type) are validated in
-- the model layer instead — the edges table needed four full table-recreates
-- to grow its CHECK vocabulary, and type vocabularies are expected to grow.

-- ================================================================
-- PROVENANCE_RECORDS: who created a thing and where it came from
-- ================================================================
CREATE TABLE provenance_records (
    id                       TEXT PRIMARY KEY,
    actor_type               TEXT NOT NULL
                             CHECK(actor_type IN ('human', 'ai_client', 'system', 'import')),
    actor_id                 TEXT,
    client_type              TEXT,   -- 'ui' | 'cli' | 'api' | 'mcp' | ...
    client_name              TEXT,   -- 'Constellation UI', 'ChatGPT', 'Claude Code', ...
    source_session_id        TEXT,
    source_conversation_id   TEXT,
    source_message_reference TEXT,
    request_id               TEXT,
    created_at               TEXT NOT NULL
);

-- ================================================================
-- PROPOSALS: suggested changes awaiting explicit resolution
-- ================================================================
-- `payload` is a JSON object whose contract depends on proposal_type; the
-- proposed related-object links live inside it (`related_objects`) and are
-- materialized as real edges only on acceptance (ADR-084) — the edges table
-- stays 100% accepted truth. `accepted_node_id` mirrors the builder's
-- `canon_node_id` pattern: set only by explicit acceptance.
CREATE TABLE proposals (
    id                         TEXT PRIMARY KEY,
    project_hub_id             TEXT NOT NULL REFERENCES nodes(id),
    proposal_type              TEXT NOT NULL,
    title                      TEXT NOT NULL,
    summary                    TEXT,
    payload                    TEXT,
    status                     TEXT NOT NULL DEFAULT 'proposed'
                               CHECK(status IN ('captured', 'proposed', 'under_review',
                                                'accepted', 'rejected', 'superseded',
                                                'archived')),
    superseded_by_proposal_id  TEXT REFERENCES proposals(id),
    accepted_node_id           TEXT REFERENCES nodes(id),
    resolution_note            TEXT,
    resolved_at                TEXT,
    resolution_provenance_id   TEXT REFERENCES provenance_records(id),
    source_provenance_id       TEXT NOT NULL REFERENCES provenance_records(id),
    created_at                 TEXT NOT NULL,
    updated_at                 TEXT NOT NULL
);

CREATE INDEX idx_proposals_project
    ON proposals(project_hub_id, status, created_at DESC);
CREATE INDEX idx_proposals_status
    ON proposals(status, created_at DESC);

-- ================================================================
-- PROPOSAL_REVISIONS: durable versions of proposal content
-- ================================================================
-- `snapshot_json` captures {title, summary, payload} at that revision.
-- Revision 1 is written at creation; every edit appends the *new* content as
-- the next revision, so both the original and each edited version stay
-- queryable (direction pack AT-032).
CREATE TABLE proposal_revisions (
    id              TEXT PRIMARY KEY,
    proposal_id     TEXT NOT NULL REFERENCES proposals(id),
    revision_number INTEGER NOT NULL,
    snapshot_json   TEXT NOT NULL,
    change_summary  TEXT,
    provenance_id   TEXT REFERENCES provenance_records(id),
    created_at      TEXT NOT NULL,
    UNIQUE(proposal_id, revision_number)
);

CREATE INDEX idx_proposal_revisions_proposal
    ON proposal_revisions(proposal_id, revision_number);

-- ================================================================
-- DECISIONS: explicit accepted in-project choices
-- ================================================================
-- Superseded decisions remain queryable (direction pack invariant 3); the
-- new decision references the old via `supersedes_decision_id` and the old
-- row's status flips to 'superseded' in the same operation (AT-005).
CREATE TABLE decisions (
    id                      TEXT PRIMARY KEY,
    project_hub_id          TEXT NOT NULL REFERENCES nodes(id),
    decision_type           TEXT,
    statement               TEXT NOT NULL,
    rationale               TEXT,
    implications            TEXT,
    status                  TEXT NOT NULL DEFAULT 'accepted'
                            CHECK(status IN ('accepted', 'superseded', 'archived')),
    supersedes_decision_id  TEXT REFERENCES decisions(id),
    proposal_id             TEXT REFERENCES proposals(id),
    provenance_id           TEXT NOT NULL REFERENCES provenance_records(id),
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

CREATE INDEX idx_decisions_project
    ON decisions(project_hub_id, status, created_at DESC);

-- ================================================================
-- ACTIVITY_EVENTS: append-only project event log
-- ================================================================
-- INTEGER PRIMARY KEY (rowid) is a deliberate exception to the UUID house
-- style (ADR-085): the monotonically increasing id doubles as the stable
-- pagination cursor for get_recent_changes — "events after cursor N" is a
-- single indexed comparison with no timestamp-tie ambiguity.
-- `project_hub_id` is NULL for corpus-level events.
CREATE TABLE activity_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_hub_id TEXT REFERENCES nodes(id),
    event_type     TEXT NOT NULL,   -- 'proposal.created', 'edge.resolved', ...
    object_type    TEXT NOT NULL,   -- 'proposal', 'node', 'edge', 'decision', ...
    object_id      TEXT NOT NULL,
    summary        TEXT NOT NULL,
    metadata       TEXT,            -- JSON
    provenance_id  TEXT REFERENCES provenance_records(id),
    created_at     TEXT NOT NULL
);

CREATE INDEX idx_activity_events_project
    ON activity_events(project_hub_id, id);
CREATE INDEX idx_activity_events_object
    ON activity_events(object_type, object_id);
