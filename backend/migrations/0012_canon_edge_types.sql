-- Canon readiness Phase 2: symbolic / resonance edge vocabulary (ADR-074).
--
-- ADR-007 fixed the edge vocabulary and reserved extension for cases where
-- typed filtering earns its keep. ADR-074 records the decision that
-- narrative/worldbuilding projects (Canon) qualify: a filterable "show me every
-- FORESHADOWS edge" or "everything that HOLDS_OPEN this moment" is exactly the
-- symbolic web such projects are made of. Nuance still lives in the edge `note`
-- (unchanged) — these verbs only add typed, queryable structure on top.
--
-- Thirteen high-value verbs are added; the long tail of possible relations
-- stays as edge notes on a generic type rather than bloating the enum.
--
-- SQLite cannot ALTER a CHECK constraint in place; the table is recreated,
-- rows copied, indexes rebuilt. Pattern mirrors 0004 / 0006 / 0010. All
-- existing edge columns (note, classifier_rationale, resolved_at,
-- resolved_by_node_id) are carried through. No FK references `edges` so no
-- foreign_keys=OFF dance is required.

CREATE TABLE edges_new (
    id                   TEXT PRIMARY KEY,
    from_id              TEXT NOT NULL REFERENCES nodes(id),
    to_id                TEXT NOT NULL REFERENCES nodes(id),
    type                 TEXT NOT NULL CHECK(type IN (
                              -- Author-stance verbs (0001).
                              'SUPPORTS', 'CONTRADICTS', 'ELABORATES',
                              'ANALOGOUS_TO', 'QUESTIONS', 'INSPIRED_BY',
                              -- Structural verbs (0001, 0004).
                              'COLLECTS', 'CITES',
                              -- Literature-stance verbs (0004).
                              'BUILDS_ON', 'APPLIES_TO', 'MEASURES',
                              'EXTENDS', 'REFINES',
                              -- Evolution / D1 (0006).
                              'SUPERSEDED_BY', 'SCOPED_TO',
                              'REGIME_OF', 'FOLLOWS_FROM',
                              -- Narrative lore (0010).
                              'EXPLAINS',
                              -- Canon symbolic / resonance (ADR-074).
                              'HOLDS_OPEN', 'REFUSES_TO_NAME', 'CARRIES_CHARGE_FOR',
                              'FORESHADOWS', 'MIRRORS', 'INVERSION_OF',
                              'PROTOTYPE_OF', 'AMPLIFIES', 'CORRUPTS',
                              'DESTABILIZES', 'STABILIZES', 'PROTECTS',
                              'THREATENS')),
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
