# Architecture

This document is the single source of truth for the structural design of
Constellation. Update it when decisions change. For the rationale behind
choices made here, see `decisions.md`.

---

## 1. Conceptual model

Constellation is a **typed, directional knowledge graph** with first-class
AI integration. The core entities are:

- **Nodes** — atomic units of knowledge, polymorphic by `type`.
- **Edges** — typed, directional relationships between nodes.
- **Sources** — external references (datasheets, books, articles) that
  literature notes link to.
- **Tags** — lightweight categorization.

There is no implicit ordering (no Folgezettel). Structure emerges from edges
and Maps of Content (`structure` nodes), not from sequence numbering.

### Node types

| Type         | Purpose                                                       |
|--------------|---------------------------------------------------------------|
| `fleeting`   | Raw capture. Inbox. Unprocessed. The friction-free entry point. |
| `literature` | Notes from external sources. Always link to a `Source`.       |
| `permanent`  | Atomic, fully-processed ideas in the user's own words. The real Zettels. |
| `structure`  | Maps of Content. Curated views into a domain. Entry points.   |

### Edge types

| Type           | Direction & meaning                                       |
|----------------|-----------------------------------------------------------|
| `SUPPORTS`     | A → B: A provides evidence/argument for B                |
| `CONTRADICTS`  | A → B: A is in tension with B                            |
| `ELABORATES`   | A → B: A zooms in on an aspect of B                      |
| `ANALOGOUS_TO` | A ↔ B: structural similarity, often across domains       |
| `QUESTIONS`    | A → B: A raises a problem with or about B                |
| `INSPIRED_BY`  | A → B: looser creative/associative link                   |
| `COLLECTS`     | A → B: A (structure note) includes B in its map          |

Every edge has an optional free-text `note` field explaining *why* the edge
exists. This is critical context that is often more valuable than the link
itself six months later.

---

## 2. Database schema

SQLite single-file database. Vector index via `sqlite-vec`. Full-text search
via FTS5. Both are bundled with modern SQLite builds.

```sql
-- ================================================================
-- NODES
-- ================================================================
CREATE TABLE nodes (
    id              TEXT PRIMARY KEY,            -- UUIDv4
    type            TEXT NOT NULL CHECK(type IN (
                        'fleeting', 'literature',
                        'permanent', 'structure')),
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    summary         TEXT,                        -- AI-generated, used for context assembly
    source_id       TEXT REFERENCES sources(id), -- literature notes only
    embedding_model TEXT,                        -- model used for current vector
    processed_at    TEXT,                        -- NULL for unprocessed fleeting notes
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT                         -- soft delete
);

CREATE INDEX idx_nodes_type ON nodes(type) WHERE deleted_at IS NULL;
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

-- Sync triggers between nodes and nodes_fts
CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, old.content);
END;

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
    note       TEXT,                          -- why does this edge exist?
    created_at TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);
CREATE INDEX idx_edges_type ON edges(type);

-- ================================================================
-- SOURCES
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
-- CONFIG (drives provider selection)
-- ================================================================
CREATE TABLE config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed defaults via migration
INSERT INTO config VALUES
    ('embedding_provider',  'voyage',            CURRENT_TIMESTAMP),
    ('embedding_model',     'voyage-4',          CURRENT_TIMESTAMP),
    ('generation_provider', 'anthropic',         CURRENT_TIMESTAMP),
    ('generation_model',    'claude-sonnet-4-6', CURRENT_TIMESTAMP);

-- ================================================================
-- EMBEDDING JOB QUEUE (for provider switches)
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
```

---

## 3. Project structure (backend)

Feature-based hybrid layout, following the OIP convention.

```
backend/app/
├── main.py                  # FastAPI app, lifespan, router mounting
├── core/
│   ├── config.py            # pydantic-settings, env vars
│   ├── database.py          # aiosqlite connection + sqlite-vec loading
│   └── lifespan.py          # startup: load providers from config table
├── providers/
│   ├── base.py              # EmbeddingProvider, GenerationProvider Protocols
│   ├── voyage.py            # VoyageEmbeddingProvider
│   ├── ollama_embed.py      # OllamaEmbeddingProvider
│   ├── anthropic_gen.py     # AnthropicGenerationProvider
│   └── ollama_gen.py        # OllamaGenerationProvider
├── models/
│   ├── node.py              # NodeRef, NodeSummary, NodeDetail, NodeCreate, ...
│   ├── edge.py
│   ├── source.py
│   ├── tag.py
│   └── config.py
├── repositories/
│   ├── node_repo.py
│   ├── edge_repo.py
│   ├── source_repo.py
│   ├── tag_repo.py
│   └── config_repo.py
├── services/
│   ├── embedding_service.py # wraps active provider, manages vec table writes
│   ├── generation_service.py
│   ├── graph_service.py     # neighbor resolution, traversal
│   ├── ingest_service.py    # fleeting → permanent pipeline
│   └── rag_service.py       # retrieval + generation orchestration
└── api/v1/
    ├── nodes.py
    ├── edges.py
    ├── sources.py
    ├── tags.py
    ├── search.py
    ├── rag.py
    └── config.py
```

---

## 4. Provider abstraction

The provider layer is the seam that lets us swap between Voyage/Anthropic
(API mode) and Ollama (local mode) without touching the rest of the app.

```python
# app/providers/base.py
from typing import Protocol, runtime_checkable

@runtime_checkable
class EmbeddingProvider(Protocol):
    @property
    def model_id(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed(self, text: str) -> list[float]: ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


@runtime_checkable
class GenerationProvider(Protocol):
    @property
    def model_id(self) -> str: ...

    async def complete(
        self,
        messages: list[dict],
        system: str,
        max_tokens: int = 1024,
    ) -> str: ...
```

**All concrete providers must produce 1024-dim embeddings** (or the system
will reject them at startup). See ADR-002.

The active providers are loaded once at app startup from the `config` table
and injected via FastAPI dependencies. Changing providers via the settings
endpoint triggers (a) a config update and (b) a re-embedding job for all
nodes whose `embedding_model` differs from the new active model.

---

## 5. API surface

All routes are under `/api/v1/`. JSON in, JSON out. OpenAPI spec served at
`/openapi.json` for `openapi-typescript` codegen on the frontend.

### Nodes

```
POST   /nodes/fleeting              # quick capture (minimal fields)
GET    /nodes/inbox                 # list unprocessed fleeting notes
POST   /nodes/process/{id}          # AI-assisted fleeting → permanent
POST   /nodes/permanent             # create permanent directly
POST   /nodes/literature            # create literature note (requires source_id)
POST   /nodes/structure             # create MOC / structure note
GET    /nodes/{id}                  # NodeDetail with edges + neighbors
PATCH  /nodes/{id}
DELETE /nodes/{id}                  # soft delete
GET    /nodes                       # paginated list with filters
```

### Edges

```
POST   /edges                       # create edge with type + optional note
DELETE /edges/{id}
GET    /nodes/{id}/neighbors        # all connected nodes
GET    /nodes/{id}/neighbors?type=SUPPORTS  # filtered by edge type
```

### Sources

```
GET    /sources
POST   /sources
GET    /sources/{id}                # source + all linked literature notes
PATCH  /sources/{id}
DELETE /sources/{id}
```

### Search

```
POST   /search/semantic             # pure vector similarity
POST   /search/fulltext             # FTS5 ranked
POST   /search/hybrid               # RRF fusion of both (default)
```

### RAG

```
POST   /rag/query                   # full RAG: retrieval + traversal + generation
POST   /rag/suggest-links/{id}      # AI suggests candidate edges for a node
POST   /rag/suggest-permanent/{id}  # AI decomposes fleeting into atomic permanents
```

### Config

```
GET    /config                      # current provider settings
PATCH  /config                      # update; triggers re-embed if needed
GET    /config/embedding-jobs       # job queue status
```

---

## 6. RAG pipeline

The `/rag/query` endpoint orchestrates the full pipeline:

```
User query
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 1. embedding_service.embed(query)                   │
│    → 1024-dim vector                                │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 2. Hybrid search                                    │
│    - Vector similarity (top K from vec_nodes)       │
│    - FTS5 ranked (top K from nodes_fts)             │
│    - Reciprocal Rank Fusion → top N candidates      │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 3. graph_service.expand(candidates, depth=1)        │
│    - For each candidate, fetch connected neighbors  │
│    - Optionally filter by edge type                 │
│    - Returns a context graph                        │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 4. Context assembly                                 │
│    - Top-ranked nodes: full content                 │
│    - Lower-ranked / neighbors: summary only         │
│    - Edge labels included for relationship context  │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 5. generation_service.complete(messages, system)    │
│    - System prompt instructs grounded synthesis     │
│    - User message contains question + context       │
└─────────────────────────────────────────────────────┘
    │
    ▼
RAG response: {
    answer: str,
    provenance: [NodeRef, ...],     # which nodes were used
    edges_traversed: [EdgeRef, ...] # which edges were walked
}
```

Provenance is non-negotiable. Every RAG response shows which notes contributed
to the answer, and the UI links back to them.

---

## 7. Frontend conventions

- **App Router**, server components by default, client components only when
  interactivity demands it.
- **API types** generated via `pnpm types` from `/openapi.json`. Never
  hand-written. Exception: types missing from the OpenAPI schema (e.g.,
  `BridgeCandidate`) are defined manually in `frontend/src/lib/api.ts` alongside
  a comment explaining why.
- **Form state**: react-hook-form + zod where forms are non-trivial.
- **Graph viz**: `react-force-graph-2d` (canvas, force-directed). See ADR-027.
  Imported via `dynamic(..., { ssr: false })` due to canvas browser-only APIs.
  `cooldownTime={1500}` overrides the default 15 s physics timeout so `onEngineStop`
  / `zoomToFit` fires within ~2 s.
- **Markdown rendering**: `react-markdown` + `remark-gfm`. Used on `/ask`,
  `/synthesize`, and the note detail view (`EditableField` with `markdown` prop).
- **Shared components** (lives in `frontend/src/components/`):
  - `NodePicker` — debounced FTS search input for selecting a note. `exclude` prop
    accepts `string | string[]`. Used on note detail, Discover slide-out,
    and graph `ConnectPanel`.
  - `NotePreviewPopover` — hover popover that lazily fetches `NodeDetail` when
    `visible` becomes true. Renders via `createPortal` to avoid stacking context
    issues. Flips left if right-side viewport space is insufficient. See ADR-039.
  - `CaptureDialog`, `IntentionalCaptureDialog`, `NewMenu` — global capture flows
    mounted once in `AppShell`.

### Graph interaction patterns

The graph page (`/graph`) uses a layered side-panel priority system:

```
selectedNodes.size > 0  →  BatchPanel   (shift-click multi-select + tag assign)
connectTarget !== null  →  ConnectPanel (edge creation form, both nodes fixed)
connectingFrom !== null →  NodePanel    (connecting mode: "click another node")
selectedNode !== null   →  NodePanel    (normal single-select)
selectedEdge !== null   →  EdgePanel
```

Edge creation uses a two-click connecting mode (see ADR-040). Multi-select uses
shift-click with a `selectedNodes: Set<string>` in page state (see ADR-041).

---

## 8. Things explicitly out of scope (v1)

- Multi-user, auth, sharing
- Mobile native app
- Real-time collaboration
- Plugin system
- Export to Obsidian/markdown vault format (nice to have, deferred)
- Image/PDF attachments on notes (deferred)
- Voice capture (deferred — interesting but complex)