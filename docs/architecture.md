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

The vocabulary is intentionally lean. Each type earns its place by carrying
semantics no other type can express. Adding a new type requires an ADR.

**Author-stance verbs** (the original Luhmann-shaped vocabulary):

| Type           | Direction & meaning                                       |
|----------------|-----------------------------------------------------------|
| `SUPPORTS`     | A → B: A provides evidence/argument for B                |
| `CONTRADICTS`  | A → B: A is in tension with B                            |
| `ELABORATES`   | A → B: A zooms in on an aspect of B                      |
| `ANALOGOUS_TO` | A ↔ B: structural similarity, often across domains       |
| `QUESTIONS`    | A → B: A raises a problem with or about B                |
| `INSPIRED_BY`  | A → B: looser creative/associative link                   |

**Structural verbs:**

| Type           | Direction & meaning                                       |
|----------------|-----------------------------------------------------------|
| `COLLECTS`     | A → B: A (structure note) includes B in its map          |
| `CITES`        | A → B: A (synthesis) cites B as a source (ADR-051)       |

**Literature-stance verbs** (ADR-052):

| Type           | Direction & meaning                                       |
|----------------|-----------------------------------------------------------|
| `BUILDS_ON`    | A → B: A builds further argument or system on B          |
| `APPLIES_TO`   | A → B: A applies the idea or method of B to a case       |
| `MEASURES`     | A → B: A operationalises B (defines a test/metric)       |
| `EXTENDS`      | A → B: A extends B's scope or claims                      |
| `REFINES`      | A → B: A refines or sharpens B without overturning it    |

**Evolution / D1 verbs** (ADR-060):

| Type            | Direction & meaning                                       |
|-----------------|-----------------------------------------------------------|
| `SUPERSEDED_BY` | A → B: A is replaced or outdated by B                    |
| `SCOPED_TO`     | A → B: A applies within the scope/boundary of B           |
| `REGIME_OF`     | A → B: A defines the regime/frame under which B holds    |
| `FOLLOWS_FROM`  | A → B: A follows from B (causal/logical/temporal)         |

`RESOLVES` is **intentionally absent** from the vocabulary — resolution is
a property of a specific tension edge, captured by the `resolved_at` /
`resolved_by_node_id` columns on `edges`. See ADR-059.

Every edge has an optional free-text `note` field explaining *why* the edge
exists. This is critical context that is often more valuable than the link
itself six months later.

Tension-bearing edges (`CONTRADICTS`, `QUESTIONS`) additionally carry a
**resolved-edge state** (ADR-059): the user can mark a tension as no longer
active, optionally pointing at a synthesis note that supersedes it. RAG
context assembly annotates resolved edges as `[resolved]` or
`[resolved → Note N]` so the model treats them as historical rather than
active tension.

---

## 2. Database schema

SQLite single-file database. Vector index via `sqlite-vec`. Full-text search
via FTS5. Both are bundled with modern SQLite builds.

```sql
-- ================================================================
-- NODES
-- ================================================================
CREATE TABLE nodes (
    id                  TEXT PRIMARY KEY,            -- UUIDv4
    type                TEXT NOT NULL CHECK(type IN (
                            'fleeting', 'literature',
                            'permanent', 'structure')),
    title               TEXT NOT NULL,
    content             TEXT NOT NULL,
    summary             TEXT,                        -- AI-generated, used for context assembly
    source_id           TEXT REFERENCES sources(id), -- literature notes only
    embedding_model     TEXT,                        -- model used for current vector
    processed_at        TEXT,                        -- NULL for unprocessed fleeting notes
    is_project_hub      INTEGER NOT NULL DEFAULT 0,  -- ADR-063: structure-note-as-project-root flag
    artifact_type       TEXT CHECK(artifact_type IN ('note', 'artifact')),         -- Slice 3
    artifact_format     TEXT CHECK(artifact_format IN ('mermaid','gantt','document')),
    is_story_event      INTEGER NOT NULL DEFAULT 0,  -- ADR-064: narrative-event flag
    story_time          TEXT,                        -- ADR-064: free-text axis position
    prose_status        TEXT CHECK(prose_status IN ('planned','draft','written','revised')),
    manuscript_location TEXT,                        -- ADR-071: opaque external-manuscript pointer
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT                         -- soft delete
);

CREATE INDEX idx_nodes_type         ON nodes(type)           WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_processed    ON nodes(processed_at)   WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_project_hub  ON nodes(is_project_hub) WHERE is_project_hub = 1 AND deleted_at IS NULL;
CREATE INDEX idx_nodes_story_event  ON nodes(is_story_event) WHERE is_story_event = 1 AND deleted_at IS NULL;

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
-- The CHECK clause grew with ADR-051/052 (CITES + literature verbs)
-- and ADR-060 (D1 evolution verbs). RESOLVES is intentionally absent
-- per ADR-059. Two columns added in Phase 8.3 (ADR-059) track the
-- resolved-edge state; classifier_rationale was added in Slice 2 of
-- Bucket A to persist the bridge-classifier's reasoning at apply time.
-- ================================================================
CREATE TABLE edges (
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
                              'EXPLAINS')),                     -- ADR-052 Slice 4 addendum
    note                 TEXT,                       -- why does this edge exist?
    classifier_rationale TEXT,                       -- AI bridge classifier's apply-time reasoning (ADR-049)
    resolved_at          TEXT,                       -- ISO 8601; NULL when edge is active (ADR-059)
    resolved_by_node_id  TEXT REFERENCES nodes(id),  -- optional synthesis-note FK (ADR-059)
    created_at           TEXT NOT NULL,
    UNIQUE(from_id, to_id, type)
);

CREATE INDEX idx_edges_from        ON edges(from_id);
CREATE INDEX idx_edges_to          ON edges(to_id);
CREATE INDEX idx_edges_type        ON edges(type);
CREATE INDEX idx_edges_resolved_at ON edges(resolved_at) WHERE resolved_at IS NOT NULL;

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
    status       TEXT NOT NULL DEFAULT 'user_supplied'      -- ADR-070
                 CHECK(status IN (
                     'suggested', 'confirmed', 'user_supplied')),
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

-- ================================================================
-- PROJECT WORKSPACE (Phase 9 Slice 0 — ADR-063)
--
-- A project is rooted in exactly one structure note (the "hub note");
-- the `is_project_hub` flag above marks it. The tables below carry the
-- persistent workspace configuration and the work-session lifecycle
-- bound to each hub.
-- ================================================================
CREATE TABLE project_scopes (
    hub_node_id     TEXT PRIMARY KEY REFERENCES nodes(id),
    pinned_node_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of node IDs
    tag_ids         TEXT NOT NULL DEFAULT '[]',  -- JSON array of tag IDs
    primary_tag_id  TEXT REFERENCES tags(id),    -- `con --project <name>` anchor (ADR-063)
    briefing_prompt TEXT,                        -- saved Synthesize prompt
    last_visited_at TEXT,
    mode            TEXT NOT NULL DEFAULT 'research'
                    CHECK(mode IN ('research', 'narrative', 'learning')),
    prior_knowledge TEXT,                        -- learning-mode onboarding (ADR-070)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Free-writing pad. One draft per project; the SQLite file is the source
-- of truth for draft state (no localStorage). Cleared on full promotion.
CREATE TABLE drafts (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES nodes(id),
    content    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(project_id)
);

-- Intentional work sessions (philosophy doc §IIIb). Session mode is
-- independent of project mode; `planning` is a fourth value beyond the
-- project-mode enum.
CREATE TABLE work_sessions (
    id                         TEXT PRIMARY KEY,
    project_id                 TEXT NOT NULL REFERENCES nodes(id),
    mode                       TEXT NOT NULL CHECK(mode IN (
                                   'research', 'narrative',
                                   'learning', 'planning')),
    intent                     TEXT NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'active'
                               CHECK(status IN (
                                   'active', 'completed', 'partial',
                                   'blocked', 'abandoned')),
    progress_notes             TEXT,
    blockers                   TEXT,
    closing_notes              TEXT,
    next_session_intent        TEXT,
    intent_assessment          TEXT,
    estimated_duration_minutes INTEGER,
    started_at                 TEXT NOT NULL,
    closed_at                  TEXT,
    duration_seconds           INTEGER,
    created_at                 TEXT NOT NULL
);

CREATE INDEX idx_work_sessions_project ON work_sessions(project_id, started_at DESC);
CREATE INDEX idx_work_sessions_active  ON work_sessions(project_id) WHERE status = 'active';

-- Session attribution joins. `session_tagged` lets users opt a single
-- capture out of attribution without losing the fact that it was created
-- during the session (philosophy doc §IIIb.6).
CREATE TABLE session_nodes (
    session_id     TEXT NOT NULL REFERENCES work_sessions(id),
    node_id        TEXT NOT NULL REFERENCES nodes(id),
    created_at     TEXT NOT NULL,
    session_tagged INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, node_id)
);

CREATE TABLE session_edges (
    session_id     TEXT NOT NULL REFERENCES work_sessions(id),
    edge_id        TEXT NOT NULL REFERENCES edges(id),
    created_at     TEXT NOT NULL,
    session_tagged INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, edge_id)
);

-- Per-project suppression for the corpus-match panel.
CREATE TABLE dismissed_corpus_suggestions (
    project_id   TEXT NOT NULL REFERENCES nodes(id),
    node_id      TEXT NOT NULL REFERENCES nodes(id),
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (project_id, node_id)
);

-- ================================================================
-- NARRATIVE TIMELINE (Phase 9 Slice 4 — ADR-065, ADR-072)
-- ================================================================
-- Per-timeline discourse position for events. Composite PK lets one event
-- appear in multiple timelines (crossover scenes — Slice 5).
CREATE TABLE event_timeline_positions (
    event_node_id      TEXT NOT NULL REFERENCES nodes(id),
    timeline_node_id   TEXT NOT NULL REFERENCES nodes(id),
    discourse_position INTEGER NOT NULL,
    PRIMARY KEY (event_node_id, timeline_node_id)
);
CREATE INDEX idx_etp_timeline ON event_timeline_positions(timeline_node_id, discourse_position);

-- Act spans — separate from event_timeline_positions because acts are
-- spans, not points (ADR-072).
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
GET    /nodes/{id}/arc              # EntityArc: evolution-over-time (ADR-087)
PATCH  /nodes/{id}
DELETE /nodes/{id}                  # soft delete
GET    /nodes                       # paginated list with filters
```

### Edges

```
POST   /edges                       # create edge with type + optional note
PATCH  /edges/{id}                   # edit the relationship note (ADR-088)
DELETE /edges/{id}
POST   /edges/{id}/resolve          # mark tension edge resolved (ADR-059)
DELETE /edges/{id}/resolve          # clear resolved state
GET    /nodes/{id}/neighbors        # all connected nodes
GET    /nodes/{id}/neighbors?type=SUPPORTS  # filtered by edge type
```

The `/resolve` endpoints are restricted to `CONTRADICTS` and `QUESTIONS`
edge types (validated in the route, not the schema). The optional
`resolved_by_node_id` body field points to a synthesis note that
supersedes the tension.

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
POST   /search/semantic             # pure vector similarity; rank-normalised score
POST   /search/fulltext             # FTS5 ranked
POST   /search/hybrid               # RRF fusion of both (default)
POST   /search/dedup                # top-K with raw clamped-cosine similarity (ADR-062)
```

`/search/dedup` is distinct from `/search/semantic` in returning **raw**
clamped-cosine similarity (the same `1 - distance²/2` projection used by
`rag_service` and `discover_service`), not a rank-normalised score. Used
by the capture-modal dedup panel to threshold against absolute "looks like
a duplicate" / "looks related" bars rather than ranking.

### RAG

```
POST   /rag/query                   # full RAG: retrieval + traversal + generation
POST   /rag/suggest-links/{id}      # AI suggests candidate edges for a node
POST   /rag/suggest-permanent/{id}  # AI decomposes fleeting into atomic permanents
```

`POST /rag/query` accepts optional scope filters on `RagRequest` (ADR-061):
- `tag_filter: list[str] | null` — list of tag IDs with OR semantics; restricts
  seed retrieval to notes carrying any listed tag.
- `since: datetime | null` — ISO timestamp; restricts seeds to notes with
  `created_at >= since`.
Both default to NULL (open corpus). Scope applies to seed retrieval only;
graph expansion is unrestricted so typed-edge context can still reach
outside the scope.

### Config

```
GET    /config                      # current provider settings
PATCH  /config                      # update; triggers re-embed if needed
GET    /config/embedding-jobs       # job queue status
```

### Projects (Phase 9 — ADR-063)

```
GET    /projects                              # list project hubs
POST   /projects                              # promote a structure node (or create + promote)
GET    /projects/resolve?name=<name>          # resolve project name → (hub_node_id, primary_tag_id)
GET    /projects/{hub_id}                     # hub node + scope + active session
GET    /projects/{hub_id}/scope               # scope config only
PATCH  /projects/{hub_id}/scope               # update pinned nodes / tags / mode / briefing prompt
GET    /projects/{hub_id}/draft               # current free-writing-pad content (empty when absent)
PUT    /projects/{hub_id}/draft               # upsert draft content
DELETE /projects/{hub_id}/draft               # clear draft (called after promotion)
POST   /projects/{hub_id}/sessions            # start a work session (rejects if one is already active)
GET    /projects/{hub_id}/sessions            # session history, newest first
PATCH  /projects/{hub_id}/sessions/{id}       # progress notes, blockers, or close-session payload
GET    /projects/{hub_id}/sessions/{id}/wrap  # nodes/edges/fleetings created during the session
POST   /projects/{hub_id}/sessions/{id}/attach-node  # idempotent session-attribution row
GET    /projects/{hub_id}/coverage            # per-tag note count + avg edge count (thin-to-dense)
GET    /projects/{hub_id}/threads             # open threads + pending payoffs (ADR-089)
POST   /projects/{hub_id}/learning-map        # ADR-070: phased plan with AI-suggested sources
GET    /projects/{hub_id}/timeline            # ADR-065: lanes (events + act spans); lazy-creates default
POST   /projects/{hub_id}/timelines           # Slice 5: create parallel timeline structure node
POST   /projects/{hub_id}/act-spans           # ADR-072: act span on a timeline
GET    /projects/{hub_id}/scene-context/{id}  # Slice 5 — live graph assembly (no cache)
POST   /nodes/story-event                     # ADR-064/065: event + COLLECTS + auto-FOLLOWS_FROM
PATCH  /nodes/{id}/timeline-position          # ADR-065: intra-lane reorder + FOLLOWS_FROM rewire
POST   /nodes/{id}/timeline-placement         # Slice 5: cross-lane move/crossover (ADR-065)
POST   /rag/narrative-dump                    # Slice 5: extract candidate nodes from prose
```

`PATCH /nodes/{id}` (Slice 5) accepts `story_time`, `prose_status`,
`manuscript_location` in addition to the existing fields; CHECK
violations on `prose_status` are surfaced as 422.

Narrative-role identification (Slice 5) uses reserved tag names rather
than schema flags. The workspace UI auto-attaches these via the
character/lore/location/theme quick-create flows:

- `narrative:character` — character structure nodes
- `narrative:theme` — theme structure nodes
- `narrative:location` — location structure nodes
- `narrative:symbol` — recurring symbol / metaphor structure nodes (ADR-083)
- `narrative:faction` — faction / authority / underground structure nodes (ADR-083)
- `narrative:open-question` — unresolved-thread permanent notes (ADR-083)
- `narrative:lore-world-rule`, `narrative:lore-history`,
  `narrative:lore-power`, `narrative:lore-fabric`,
  `narrative:lore-backstory`, `narrative:lore-secret`,
  `narrative:lore-ability`, `narrative:lore-artifact` — lore categories
  (the last two added in ADR-083)
- `layer:<kind>` — timeline lane classification (ADR-085): `layer:external`,
  `layer:historical`, `layer:dream`, `layer:metaphysical`,
  `layer:character-arc`, `layer:theme-arc` (open set). Applied to a timeline
  structure node; surfaced on `TimelineLane.timeline_tags`.
- `status:{open,developing,resolved}` — generic lifecycle status (ADR-086),
  used by Open Questions (and any node tracking an unresolved→resolved
  trajectory). Relationship-level resolution stays on the `QUESTIONS` edge's
  resolved-state (ADR-059).

`EdgeSummary` denormalises `neighbor_tags` + `neighbor_is_story_event`
(ADR-084) so the Relationship Explorer (`ConnectionsByRole`) can group a node's
connections by role from a single `GET /nodes/{id}` — no per-neighbor fetch.

The Notes list (`GET /nodes`) gains `hide_story_events: bool` (ADR-064)
in addition to the existing B2 filter predicates.

`GET /projects/resolve` is the cross-surface project anchor: it joins
`project_scopes.primary_tag_id` against `tags.name` (case-insensitive) and
returns the matching hub + tag. Consumed by `con --project <name>` and the
workspace Ask scope toggle (ADR-068). Returns 404 when no project has a
primary tag of that name.

`POST /projects` accepts either `{ hub_node_id, mode? }` (promote an existing
structure note) or `{ title, content?, mode? }` (create a new structure note
and promote it in one call). Promotion sets `nodes.is_project_hub = 1` and
inserts a `project_scopes` row keyed by the hub node ID.

A `PATCH /projects/{hub_id}/sessions/{id}` payload with `close: true` sets
`closed_at` and computes `duration_seconds`; status defaults to
`'completed'` on close if not otherwise specified.

### Builder Pipeline (Slice B0 — ADR-078/079/080/081)

The Builder Pipeline turns creative intent into structured production work
(production layer + render layer on top of the canon graph). Full design in
`builder-pipeline-architecture.md`; phased plan in
`builder-pipeline-build-plan.md`. Schema: migration `0013_builder_pipeline.sql`.

```
POST  /builder/productions                          intake: idea → production
GET   /builder/productions?project_id=              list productions
GET   /builder/productions/{id}                     detail (stage runs + docs)
POST  /builder/productions/{id}/stages/{stage}/run  run/re-run a stage (501 if unlanded)
GET   /builder/docs/{id}                            production doc detail
PATCH /builder/docs/{id}                            user refinement of a doc
POST  /builder/docs/{id}/promote                    explicit canon promotion
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
- **Markdown rendering**: All note content is markdown-first. The canonical
  renderer is `<NoteContent>` (`components/NoteContent.tsx`), which wraps
  `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (KaTeX) and
  also handles fenced `mermaid` diagram blocks. Every surface that displays note
  body text must use this component. Inline math: `$...$`. Display math:
  `$$...$$`. Note entry textareas use `<MarkdownTextarea>`, which adds a
  Write/Preview toggle. See ADR-073.
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