-- ================================================================
-- SOURCES (defined before nodes — nodes has a FK to sources)
-- ================================================================
CREATE TABLE sources (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    author       TEXT,
    url          TEXT,
    type         TEXT NOT NULL CHECK(type IN (
                     'datasheet', 'manual', 'book',
                     'article', 'video', 'podcast', 'other')),
    published_at TEXT,
    created_at   TEXT NOT NULL
);

-- ================================================================
-- NODES
-- ================================================================
CREATE TABLE nodes (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL CHECK(type IN (
                        'fleeting', 'literature',
                        'permanent', 'structure')),
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    summary         TEXT,
    source_id       TEXT REFERENCES sources(id),
    embedding_model TEXT,
    processed_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT
);

CREATE INDEX idx_nodes_type      ON nodes(type)         WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_processed ON nodes(processed_at) WHERE deleted_at IS NULL;

-- ================================================================
-- VECTOR INDEX (sqlite-vec)
-- 1024 dimensions: matches voyage-4 and mxbai-embed-large
-- ================================================================
CREATE VIRTUAL TABLE vec_nodes USING vec0(
    node_id   TEXT PRIMARY KEY,
    embedding FLOAT[1024]
);

-- ================================================================
-- FULL TEXT SEARCH (FTS5)
-- ================================================================
CREATE VIRTUAL TABLE nodes_fts USING fts5(
    title,
    content,
    content=nodes,
    content_rowid=rowid
);

CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, old.content);
END;

-- Soft-deleted nodes are removed from the FTS index at delete time.
CREATE TRIGGER nodes_fts_update AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, old.content);
    INSERT INTO nodes_fts(rowid, title, content)
    SELECT new.rowid, new.title, new.content
    WHERE new.deleted_at IS NULL;
END;

-- ================================================================
-- EDGES
-- ================================================================
CREATE TABLE edges (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL REFERENCES nodes(id),
    to_id      TEXT NOT NULL REFERENCES nodes(id),
    type       TEXT NOT NULL CHECK(type IN (
                   'SUPPORTS', 'CONTRADICTS', 'ELABORATES',
                   'ANALOGOUS_TO', 'QUESTIONS',
                   'INSPIRED_BY', 'COLLECTS')),
    note       TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to   ON edges(to_id);
CREATE INDEX idx_edges_type ON edges(type);

-- ================================================================
-- TAGS
-- ================================================================
CREATE TABLE tags (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE node_tags (
    node_id TEXT NOT NULL REFERENCES nodes(id),
    tag_id  TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (node_id, tag_id)
);

-- ================================================================
-- CONFIG (drives provider selection; seeded with defaults)
-- ================================================================
CREATE TABLE config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO config VALUES
    ('embedding_provider',  'voyage',            datetime('now')),
    ('embedding_model',     'voyage-4',          datetime('now')),
    ('generation_provider', 'anthropic',         datetime('now')),
    ('generation_model',    'claude-sonnet-4-6', datetime('now'));

-- ================================================================
-- EMBEDDING JOB QUEUE (for provider switches — worker lands in Phase 2)
-- ================================================================
CREATE TABLE embedding_jobs (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL REFERENCES nodes(id),
    status       TEXT NOT NULL CHECK(status IN (
                     'pending', 'processing', 'complete', 'failed')),
    target_model TEXT NOT NULL,
    error        TEXT,
    created_at   TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX idx_jobs_status ON embedding_jobs(status);
