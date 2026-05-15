-- Phase 8.3: resolved-edge state + D1 evolution edge types.
--
-- ADR-059: adds `resolved_at` and `resolved_by_node_id` columns to `edges` so
-- the user can mark a tension (CONTRADICTS / QUESTIONS) as no longer active,
-- optionally pointing at a synthesis note that supersedes it. RAG context
-- assembly annotates resolved edges as `[resolved]` or `[resolved → Note N]`
-- so the model treats them as historical rather than active tension.
--
-- ADR-060: expands EdgeType with the D1 evolution vocabulary —
-- SUPERSEDED_BY, SCOPED_TO, REGIME_OF, FOLLOWS_FROM. RESOLVES is intentionally
-- absent (see ADR-059): resolution is a property of a specific tension edge,
-- carried by the new column; a generic RESOLVES edge type would be
-- semantically underspecified. FOLLOWS_FROM is included for Phase 9's
-- narrative-timeline discourse-order chaining, folded in here so the
-- CHECK-constraint table-recreate ceremony is only paid once.
--
-- SQLite cannot ALTER a CHECK constraint in place; the table is recreated.
-- No FK references `edges` so no foreign_keys=OFF dance is required.

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
                              'REGIME_OF', 'FOLLOWS_FROM')),
    note                 TEXT,
    classifier_rationale TEXT,
    resolved_at          TEXT,
    resolved_by_node_id  TEXT REFERENCES nodes(id),
    created_at           TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

INSERT INTO edges_new (
    id, from_id, to_id, type, note, classifier_rationale, created_at
)
SELECT
    id, from_id, to_id, type, note, classifier_rationale, created_at
FROM edges;

DROP TABLE edges;
ALTER TABLE edges_new RENAME TO edges;

CREATE INDEX idx_edges_from        ON edges(from_id);
CREATE INDEX idx_edges_to          ON edges(to_id);
CREATE INDEX idx_edges_type        ON edges(type);
CREATE INDEX idx_edges_resolved_at ON edges(resolved_at) WHERE resolved_at IS NOT NULL;
