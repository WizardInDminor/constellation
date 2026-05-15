-- Expanded EdgeType vocabulary: add CITES (ADR-051) and the five
-- literature-stance verbs (ADR-052). SQLite cannot ALTER a CHECK
-- constraint in place; the table is recreated, rows are copied, and
-- indexes are rebuilt. No table references `edges` by FK, so no
-- foreign_keys=OFF dance is required.

CREATE TABLE edges_new (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL REFERENCES nodes(id),
    to_id      TEXT NOT NULL REFERENCES nodes(id),
    type       TEXT NOT NULL CHECK(type IN (
                   'SUPPORTS', 'CONTRADICTS', 'ELABORATES',
                   'ANALOGOUS_TO', 'QUESTIONS',
                   'INSPIRED_BY', 'COLLECTS',
                   'CITES',
                   'BUILDS_ON', 'APPLIES_TO', 'MEASURES',
                   'EXTENDS', 'REFINES')),
    note       TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

INSERT INTO edges_new (id, from_id, to_id, type, note, created_at)
SELECT id, from_id, to_id, type, note, created_at FROM edges;

DROP TABLE edges;
ALTER TABLE edges_new RENAME TO edges;

CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to   ON edges(to_id);
CREATE INDEX idx_edges_type ON edges(type);
