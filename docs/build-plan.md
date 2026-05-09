# Build Plan

A phased plan for building Constellation. Each phase has a clear goal, a
defined set of deliverables, and a "definition of done" — past which we
move on rather than gold-plating.

This document is the right place to start any new coding session. Find the
current phase, read its scope, work within it.

---

## Plan philosophy

- **Vertical slices over horizontal layers.** Where possible, each phase
  delivers a thin end-to-end capability rather than just a backend or
  frontend chunk.
- **AI-first from Phase 2 onward.** The provider layer and embedding-on-write
  pipeline land before the UI is fully wired, so retrieval is real from day one.
- **Capture before linking before search.** The system has to be usable for
  the daily habit before we invest in fancy retrieval. The Phase 3 deliverable
  is the moment you'd actually start using it.
- **Local provider path is deferred to Phase 7.** API mode is the default;
  local mode is real but not the v1 critical path.

---

## Phase 0 — Foundation

**Status:** ✅ Complete (2026-05-08)

**Goal:** A repo skeleton that runs end-to-end with no real features yet.

**Deliverables:**

- Repo initialized with the structure documented in `architecture.md` § 3.
- Backend: FastAPI app boots, returns `200 OK` from `/health`.
- Backend: SQLite + sqlite-vec loadable extension wired in `core/database.py`.
- Backend: Migration system (simple SQL files run in order, or Alembic if
  preferred).
- Backend: Initial migration applies the full schema from `architecture.md` § 2.
- Backend: `pyproject.toml` with `ruff`, `pytest`, `aiosqlite`, `sqlite-vec`,
  `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`, `httpx`, `anthropic`,
  `voyageai`.
- Frontend: Next.js app with App Router, Tailwind, TypeScript strict.
- Frontend: `pnpm types` script wired to pull from `http://localhost:8000/openapi.json`.
- `.env.example` with all required keys documented.
- README with quick-start instructions.

**Definition of done:** Both servers start, the frontend can call `/health` and
display the response, the DB file is created with all tables present.

---

## Phase 1 — Core CRUD

**Status:** ✅ Complete (2026-05-08)

**Goal:** Full data layer with no AI involvement yet. Establish the repository
and Pydantic model patterns that everything else builds on.

**Deliverables:**

- Pydantic models for all entities: stratified into `Ref` / `Summary` / `Detail`
  variants where useful, plus `Create` / `Update` request models.
- Repositories: `node_repo`, `edge_repo`, `source_repo`, `tag_repo`, `config_repo`.
- API routes:
  - All `/nodes/*` routes (no AI processing yet — `process` returns 501)
  - All `/edges/*` routes
  - All `/sources/*` routes
  - All `/tags/*` routes
  - All `/config/*` GET routes
- Soft-delete behavior on nodes.
- Pytest coverage: at least one test per repository method, route smoke tests.

**Definition of done:** Every CRUD operation works via curl/HTTP and is covered
by at least one passing test. Schema constraints (FKs, CHECKs) are exercised.

---

## Phase 2 — Provider abstraction & embedding pipeline

**Status:** ✅ Complete (2026-05-08)

**Goal:** AI infrastructure is in place. New nodes get embedded automatically.

**Deliverables:**

- `providers/base.py`: `EmbeddingProvider` and `GenerationProvider` Protocols.
- `providers/voyage.py`: `VoyageEmbeddingProvider` using `voyageai` SDK.
- `providers/anthropic_gen.py`: `AnthropicGenerationProvider` using `anthropic`
  SDK.
- `services/embedding_service.py`:
  - Wraps the active embedding provider.
  - Writes vectors to `vec_nodes` and updates `nodes.embedding_model`.
  - Validates 1024 dimensions on every write (fail loud).
  - Exposes `embed_node(node_id)` and `embed_query(text)` methods.
- `services/generation_service.py`: thin wrapper around active generation
  provider.
- Lifespan: load active providers from `config` table on startup, inject via
  FastAPI dependencies.
- Auto-embed hook: when a `permanent`, `literature`, or `structure` node is
  created or its content is updated, kick off embedding (synchronous in v1
  is fine; async background later if needed).
- `embedding_jobs` table operational with a simple worker (a single
  background task that drains `pending` jobs).
- `PATCH /config` triggers re-embed jobs for affected nodes.

**Definition of done:** Create a permanent note via API → verify a row appears
in `vec_nodes` with a 1024-dim vector and the right `embedding_model`. Change
the active model via `PATCH /config` → verify jobs are queued and processed.

---

## Phase 3 — Capture & process workflow (the heart of v1)

**Status:** ✅ Complete (2026-05-08)

**Goal:** The system is usable for daily knowledge capture. This is the phase
where you actually start using it.

**Deliverables:**

- Frontend: fleeting capture UI. Single text field, Cmd+Enter to submit, no
  ceremony. Available from a global keyboard shortcut.
- Frontend: inbox view listing unprocessed fleeting notes, oldest first.
- Backend: `POST /rag/suggest-permanent/{id}` — sends the fleeting note to
  Claude with a system prompt for atomic decomposition. Returns 1–3 candidate
  permanent notes with suggested titles, content, and tags. Does not write
  anything to the DB yet.
- Frontend: process workflow UI. Shows the fleeting note alongside Claude's
  suggested permanents. User can edit, accept some/all, reject the rest. On
  accept: creates permanent nodes, marks the fleeting note `processed_at`.
- Frontend: permanent note view (read + edit).
- Frontend: structure note creation (manual, no AI yet).

**Definition of done:** You can capture a thought from anywhere, process it
into one or more permanent notes with AI assistance, and see it indexed. You
use this for one full week of capture before moving on.

---

## Phase 3.5 — Capture tooling & process page resilience

**Status:** ✅ Complete (2026-05-09)

**Goal:** Small quality-of-life additions before Phase 4: a terminal capture tool,
a systemd service so the backend starts automatically, and draft-state persistence
on the process page so navigating away doesn't lose work.

**Deliverables:**

- `con` CLI tool (`backend/app/cli/capture.py`) — posts fleeting notes from the
  terminal. Three modes: quick positional arg, explicit `-t`/`-c` flags, interactive
  prompt. Installed as a `[project.scripts]` entry point. See ADR-017.
- `backend/constellation.service` — systemd user unit that starts uvicorn on login.
  `cp constellation.service ~/.config/systemd/user/ && systemctl --user enable --now constellation`.
- Process page (`/inbox/process/[id]`) persists AI candidate suggestions to
  `sessionStorage` keyed by node ID. On mount, restores draft if present instead of
  calling the API again. Cleared on successful acceptance or explicit "Re-generate".

**Definition of done:** `con "test thought"` captures a fleeting note from the
terminal; the backend starts automatically on login; navigating away from the process
page and back restores the previous suggestions.

---

## Phase 4 — Linking (the constellation grows)

**Status:** ✅ Complete (2026-05-09)

**Goal:** The graph develops typed structure. AI suggests links you didn't
think of.

**Deliverables:**

- Frontend: edge creation UI. Pick target node (semantic search picker), pick
  edge type, optionally write the "why this edge exists" note.
- Frontend: node detail view shows incoming and outgoing edges grouped by type.
- Backend: `POST /rag/suggest-links/{id}` — finds top-N semantically similar
  nodes, asks Claude to evaluate each candidate and suggest an edge type with
  reasoning. Returns ranked list with confidence.
- Frontend: link suggestion UI. Triggered after writing a permanent note, or
  on-demand from the node view. User accepts/rejects each suggestion.
- Backend: `GET /nodes/{id}/neighbors` with optional type filter.
- Frontend: neighbor browsing — click an edge to walk to the connected node.

**Definition of done:** After writing a permanent note, the system surfaces
non-obvious connections to existing notes. The graph has emergent clusters
visible by neighbor browsing.

---

## Phase 5 — Search & RAG queries

**Status:** Pending

**Goal:** Ask the graph questions and get grounded answers.

**Deliverables:**

- Backend: `POST /search/semantic` — vector similarity, paginated.
- Backend: `POST /search/fulltext` — FTS5 ranked search.
- Backend: `POST /search/hybrid` — Reciprocal Rank Fusion of both.
- Backend: `POST /rag/query` — full pipeline per `architecture.md` § 6.
  Returns answer + provenance.
- `services/graph_service.py`: neighbor expansion logic. Configurable depth
  (default 1).
- `services/rag_service.py`: orchestrates retrieval, graph expansion, context
  assembly, generation. System prompt template lives in this service.
- Frontend: search UI with type-toggle (semantic / fulltext / hybrid).
- Frontend: RAG query UI. Question input → answer with inline citations to
  source nodes. Click a citation to open the node.

**Definition of done:** You ask "how do I bring up SPI on the STM32 to talk
to the MCP4922?" and get a grounded answer drawing from your own notes, with
clickable provenance.

---

## Phase 6 — Visualization

**Status:** ✅ Complete (2026-05-09)

**Goal:** See the constellation. The graph view changes how you think about
what you've built.

**Deliverables:**

- Frontend: graph view route. Force-directed layout (likely `react-force-graph`).
- Node colors by type (fleeting/literature/permanent/structure).
- Edge colors by type.
- Click a node → side panel with detail + jump-to-note button.
- Filters: by tag, by edge type, by date range, hide fleeting.
- Mini-map / zoom controls.
- Backend: `GET /graph/data` — paginated or filtered graph payload optimized
  for visualization (refs only, not full content).

**Definition of done:** You can navigate your knowledge graph visually,
discover clusters by sight, and click through to read individual notes.

---

## Phase 7 — Local provider path (optional v1.5)

**Status:** Pending

**Goal:** Privacy / offline mode. Switchable between API and local providers.

**Deliverables:**

- `providers/ollama_embed.py`: `OllamaEmbeddingProvider` using `mxbai-embed-large`.
- `providers/ollama_gen.py`: `OllamaGenerationProvider` using `llama3.2` (or
  whichever local model performs well).
- Frontend: settings page. Provider selection per layer (embedding / generation).
  On change → confirm dialog → call `PATCH /config` → show re-embed job progress.
- Frontend: connection check on settings page (does the Ollama daemon respond?).
- Backend: graceful failure when a configured provider is unreachable.

**Definition of done:** Toggle to local mode in settings, watch re-embed job
complete, run a RAG query that uses zero external APIs.

---

## What is explicitly NOT in v1

These ideas are valid but defer to v2 or beyond:

- Multi-user / auth / sharing
- Mobile native app (PWA might be enough)
- Real-time collaboration
- Plugin system / extensibility
- Obsidian export / markdown vault sync
- Image / PDF attachments
- Voice capture
- Folgezettel sequences (decided against in design — see ADR-006)
- Reranker layer (Voyage offers one; defer until retrieval quality demands it)
- Multi-hop graph reasoning beyond depth=1 (defer until reasoning models warrant)

---

## Working with this plan

When starting a session with Claude Code:

1. Identify the current phase.
2. Identify the specific deliverable being worked on.
3. Reference `architecture.md` for any structural questions.
4. Reference `decisions.md` if a design choice comes up.
5. Add new decisions to `decisions.md` as they're made — don't let the design
   drift silently.