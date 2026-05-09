CREATE TABLE pending_ingests (
    id             TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL REFERENCES sources(id),
    candidates_json TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    expires_at     TEXT NOT NULL
);

CREATE INDEX idx_pending_ingests_source  ON pending_ingests(source_id);
CREATE INDEX idx_pending_ingests_expires ON pending_ingests(expires_at);
