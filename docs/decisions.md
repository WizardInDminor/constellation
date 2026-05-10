# Decision Log

ADR-style log of significant design decisions. The format for each entry:

- **Status** — Accepted / Superseded / Deprecated
- **Context** — what problem prompted this decision
- **Decision** — what was decided
- **Rationale** — why this option won
- **Consequences** — what this enables and what it constrains

When a decision changes, mark the old one Superseded with a pointer to the
new ADR rather than editing in place. The log is append-only history.

---

## ADR-001 — SQLite + sqlite-vec over Postgres + pgvector

**Status:** Accepted

**Context:** Need a database that stores both relational data (nodes, edges,
sources, config) and vector embeddings, supports full-text search, and is
appropriate for a single-user personal tool.

**Decision:** SQLite as the single database, with `sqlite-vec` for vector
similarity and FTS5 for full-text search.

**Rationale:**

- Single-file portability. The entire knowledge base is one `.db` file.
- Zero server overhead. No daemon, no port, no auth layer.
- Sufficient scale. Tens or hundreds of thousands of notes is well within
  SQLite's comfort zone.
- `sqlite-vec` is mature, fast, and the natural pairing for SQLite-based
  vector workloads.
- FTS5 is bundled and excellent.
- Backup is trivial: copy a file.

**Consequences:**

- Concurrent writers are limited (acceptable for single-user).
- No native row-level locking semantics like Postgres — design accordingly.
- Vector index lives in a virtual table; ORMs don't fit it cleanly. See
  ADR-005.

---

## ADR-002 — Standardize on 1024-dimensional embeddings

**Status:** Accepted

**Context:** The vector index `vec_nodes` has a fixed dimension at table
creation. The two supported embedding providers (Voyage and Ollama) ship
multiple model options at different dimensions.

**Decision:** All embedding providers must produce 1024-dim vectors. The
`vec_nodes` table is created at this dimension.

**Rationale:**

- Voyage `voyage-4` and `voyage-4-large` support 1024 as the default output.
- Ollama `mxbai-embed-large` produces 1024-dim natively.
- Avoids the complexity of per-model vector tables or runtime dimension
  reshaping.
- Quality at 1024 is excellent for both providers.

**Consequences:**

- Cannot use embedding models that don't support 1024-dim output without
  dropping to a lower dimension (which is allowed by both via Matryoshka,
  but degrades quality) or rebuilding the vec table.
- Provider implementations must validate dimension on every embed call and
  fail loud on mismatch.

---

## ADR-003 — Voyage AI for cloud embeddings

**Status:** Accepted

**Context:** Anthropic does not provide an embedding model. The cloud
embedding choice needs to integrate cleanly with Claude-based generation.

**Decision:** Voyage AI is the default cloud embedding provider, using
`voyage-4` as the starting model.

**Rationale:**

- Voyage is explicitly recommended by Anthropic as the embedding pairing for
  Claude workflows.
- Outperforms OpenAI's embedding models on technical and domain-specific
  benchmarks — relevant for the embedded systems and ML notes that will
  populate the graph.
- Native 1024-dim output (see ADR-002).
- Now part of MongoDB but operates as an independent API.

**Consequences:**

- Requires a `VOYAGE_API_KEY` environment variable.
- Adds a billable API dependency to the cloud path.
- If the provider is unreachable or the user wants offline mode, fallback
  is via the local Ollama path (see ADR-004).

---

## ADR-004 — Anthropic Claude for generation, with Ollama as local fallback

**Status:** Accepted

**Context:** The generation layer drives the AI assistance for fleeting →
permanent processing, link suggestion, and RAG response synthesis. Quality
matters significantly for these workflows.

**Decision:** Anthropic Claude (`claude-sonnet-4-5` to start) is the default
generation provider. Ollama with a capable local model is the fallback for
offline / privacy mode.

**Rationale:**

- Claude is the user's preferred model and they hold a Max plan.
- For fleeting decomposition and link suggestion, model quality directly
  shapes the value of the system.
- Local fallback preserves the option to work offline or keep all data on
  device.

**Consequences:**

- API mode incurs token costs.
- Local mode quality will be lower; UI should set expectations and possibly
  flag responses generated in local mode.

---

## ADR-005 — Raw SQL via `aiosqlite` over an ORM

**Status:** Accepted

**Context:** The OIP project pattern is "ORM as default with raw SQL escape
hatch." However, sqlite-vec virtual tables and FTS5 virtual tables don't fit
ORM models cleanly, and Constellation is a smaller-scope personal project.

**Decision:** Use `aiosqlite` directly with raw SQL, organized via a thin
repository pattern. Repositories return Pydantic models, never raw rows.

**Rationale:**

- Virtual tables (`vec_nodes`, `nodes_fts`) are awkward in SQLAlchemy and
  add ceremony for little gain.
- The repository layer already provides the abstraction we need to keep
  routes/services decoupled from the storage representation.
- Smaller dependency tree, faster startup, simpler mental model.
- This is a deliberate departure from the OIP pattern. The OIP pattern is
  better suited to its larger, multi-domain scope.

**Consequences:**

- More SQL to write by hand. Acceptable for the scope.
- Schema migrations are SQL files, not Alembic auto-generated. Consider
  Alembic only if migration complexity grows.
- If the project grows substantially, revisit this decision.

---

## ADR-006 — Pure constellation graph, no Folgezettel

**Status:** Accepted

**Context:** Luhmann's Zettelkasten used numbered sequence IDs (Folgezettel)
to give physical cards a location. Digital systems can model the graph
directly without sequence numbers, but some practitioners value the
discipline that numbered sequences impose.

**Decision:** No Folgezettel. Pure typed graph. Order emerges from edges
and Maps of Content (`structure` nodes), not from sequence IDs.

**Rationale:**

- The user self-identifies as a "constellation thinker" — connections across
  domains rather than chains within a domain.
- Folgezettel adds schema and UI complexity that doesn't pay off for this
  thinking style.
- Structure notes (MOCs) provide the navigational anchor that sequence
  numbers would otherwise provide.

**Consequences:**

- No implicit ordering between sibling notes.
- Navigation is graph-walk and search-driven, not sequence-driven.
- If the user later wants chain-style argument development, it can be
  modeled with `FOLLOWS_FROM` edges added to the schema.

---

## ADR-007 — Typed, directional edges with optional context notes

**Status:** Accepted

**Context:** Most note-taking systems treat links as untyped boolean
references. The premise of this project is that AI-assisted retrieval gets
significantly better when the edges carry semantic meaning.

**Decision:** Edges have a fixed enumerated `type` (SUPPORTS, CONTRADICTS,
ELABORATES, ANALOGOUS_TO, QUESTIONS, INSPIRED_BY, COLLECTS) and an optional
free-text `note` field explaining why the edge exists.

**Rationale:**

- Typed edges enable graph-aware retrieval — e.g., walk only `SUPPORTS`
  edges to assemble an argument, walk `CONTRADICTS` to surface tensions.
- The "why this edge exists" note is often more valuable than the link
  itself when revisited later.
- Fixed enumeration (not user-defined types) prevents proliferation and
  keeps the AI prompts well-scoped.

**Consequences:**

- The edge type vocabulary is a design artifact that needs to be stable.
  Adding a new type is a deliberate decision (extend this ADR or add a
  new one).
- UI must surface edge type clearly and make creation friction-low.

---

## ADR-008 — AI-first v1 over discipline-first v1

**Status:** Accepted

**Context:** Two viable paths for v1: build the manual zettelkasten
discipline first and add AI later, or wire AI in from the start. They imply
different UI emphases and different technical priorities.

**Decision:** AI-first. The provider layer and embedding-on-write pipeline
land in Phase 2 before the capture UI is fully built.

**Rationale:**

- The user's stated goal is to build a system that scales with AI as the
  technology matures. Architecting around AI from day one realizes that.
- The fleeting → permanent decomposition is one of the highest-value AI
  applications in the system, and gating it behind a future "Phase N"
  removes the early dopamine that sustains the habit.
- The graph schema becomes more valuable, not less, as AI improves. Building
  it now is a forward-compatible bet.

**Consequences:**

- Token costs from the first day of use.
- Provider abstraction must be in place before the UX feels complete.
- Local-only operation is not the v1 critical path; it lands in Phase 7.

---

## ADR-009 — Soft delete, not hard delete

**Status:** Accepted

**Context:** Knowledge graphs grow over time and contain valuable historical
context. Accidental deletion of a hub note could destroy meaningful structure.

**Decision:** All node deletions are soft. The `nodes.deleted_at` column is
set; rows are not removed. Edges to a soft-deleted node remain in the DB but
are filtered out at the query layer.

**Rationale:**

- Recovery from mistakes is trivial (set `deleted_at = NULL`).
- Edges retain their context even if a node is temporarily hidden.
- A future hard-delete sweep can be implemented as a separate, deliberate
  maintenance operation.

**Consequences:**

- Repository methods must filter `WHERE deleted_at IS NULL` consistently.
- DB grows over time; consider a maintenance command to permanently purge
  rows soft-deleted longer than N months.

---

## ADR-010 — Track embedding model per node, re-embed on provider switch

**Status:** Accepted

**Context:** Embeddings from different models live in different vector
spaces and are not interchangeable. When the user switches embedding
providers, every existing vector is invalidated.

**Decision:** Each node carries an `embedding_model` column recording which
model produced its current vector. Switching providers triggers an
`embedding_jobs` queue entry for every node whose `embedding_model` differs
from the new active model. A background worker drains the queue.

**Rationale:**

- Makes the provider switch a real, tractable operation rather than a
  catastrophic data loss event.
- Allows partial-state operation: new writes use the new model immediately;
  old nodes are searchable (but only via FTS5) until they're re-embedded.
- Per-node tracking enables future scenarios like running an experiment
  with a new model on a subset of the graph.

**Consequences:**

- Re-embedding a large graph takes time and tokens.
- Queries during a re-embedding run may have inconsistent retrieval quality.
  Acceptable; surface this in the UI as a progress indicator.

---

## ADR-011 — Provider switch is a deliberate setting, not a hot toggle

**Status:** Accepted

**Context:** A natural UI temptation would be to allow per-query toggling
between API and local modes ("just answer this one without sending it to
Anthropic"). This conflicts with the embedding state model.

**Decision:** Provider selection is a settings-level operation, not a
session-level toggle. Changing it triggers re-embedding (see ADR-010) and
takes effect across the whole app.

**Rationale:**

- A hot toggle would either require keeping two parallel vector indexes (cost,
  complexity) or accepting incoherent retrieval mid-session (worse).
- The realistic use cases for switching (privacy, offline travel, cost
  control) are session-level intentions, not query-level intentions.

**Consequences:**

- Users wanting offline mode for one query must change the setting and
  accept a re-embed window. This is fine — they shouldn't be making that
  choice casually.

---

## ADR-012 — Startup-time migrations via FastAPI lifespan

**Status:** Accepted

**Context:** The project needs a migration runner. The options were: (a) a
separate CLI command (`uv run migrate` or `alembic upgrade head`) that must be
run before starting the server, or (b) running migrations automatically inside
FastAPI's lifespan `asynccontextmanager` on every startup.

**Decision:** Migrations run inside the FastAPI lifespan. On every `uvicorn`
start, the runner checks `schema_migrations` and applies any unapplied
`backend/migrations/*.sql` files before the app begins accepting requests.

**Rationale:**

- Single-user personal tool with infrequent deployments. The risk of
  auto-migration causing unexpected state changes is low.
- Eliminates an entire class of "forgot to migrate" errors. The app is always
  ready to use after `uvicorn` starts — no separate step.
- The `schema_migrations` tracking table ensures idempotency; already-applied
  files are skipped.
- For a SQLite-based tool where the DB is a local file, migration failures
  surface immediately as startup errors — fast feedback.

**Consequences:**

- App startup fails if a migration fails. This is intentional: a broken
  migration should not silently produce a partially-migrated DB.
- Cannot run migrations independently of starting the server (acceptable for
  v1; a standalone CLI runner can be extracted later if needed).
- If a migration is destructive, there is no pre-flight dry-run step. Mitigate
  with careful migration authoring and backups.

---

## ADR-013 — Starlette TestClient over httpx.AsyncClient for route tests

**Status:** Accepted

**Context:** FastAPI route tests need to trigger the ASGI lifespan
(startup/shutdown) so the database is initialized before assertions run.
The previously standard approach — `httpx.AsyncClient(lifespan="auto")` — was
removed in httpx 0.27+. The installed version is 0.28.x.

**Decision:** Use Starlette's synchronous `TestClient` for all route-level
tests. `TestClient` handles the ASGI lifespan protocol correctly without
requiring the `lifespan` parameter.

**Rationale:**

- `TestClient` is part of Starlette, already a transitive dependency via
  FastAPI — no new packages required.
- The alternative (`asgi-lifespan` + `AsyncClient`) adds a dependency for
  behavior that `TestClient` provides for free.
- Phase 0 and Phase 1 tests are simple CRUD and smoke assertions; there is no
  correctness reason to require async HTTP in the test layer.
- Async tests (`pytest-asyncio`) remain available for testing service and
  repository code directly, without the HTTP layer, where async is meaningful.

**Consequences:**

- Route tests are synchronous. This is a minor mismatch with the async
  application code but has no practical impact on test correctness.
- If a future test genuinely needs to exercise concurrent async HTTP behavior
  (e.g., testing streaming responses), revisit this decision and evaluate
  `httpx.AsyncClient` with a manual lifespan wrapper at that point.

---

## ADR-014 — Embedding worker polls every 10 seconds

**Status:** Accepted

**Context:** The background embedding worker must drain the `embedding_jobs` queue
periodically. The choice of interval balances responsiveness (jobs processed quickly)
against unnecessary CPU and DB overhead.

**Decision:** The worker sleeps 10 seconds between drain cycles, processing up to
10 jobs per cycle.

**Rationale:**

- The inline embed path (`embed_or_queue`) succeeds in the vast majority of cases.
  The worker is a fallback for transient API failures and the provider-switch re-embed
  flow, not the primary embedding path.
- At personal tool scale, 10-second latency before a failed-then-queued embed is
  retried is unnoticeable.
- A tighter interval (1–3 s) would spin needlessly against an empty queue.

**Consequences:**

- In the rare event of an inline embed failure, the vector is available approximately
  10 seconds after the job was queued, not immediately.
- The re-embed flow after `PATCH /config` takes up to 10 seconds per batch of 10
  nodes; large collections will take proportionally longer.

---

## ADR-015 — Inline embed failure returns HTTP 201, not 202

**Status:** Accepted

**Context:** When a `permanent`, `literature`, or `structure` node is created and the
inline embed attempt fails (e.g., transient Voyage API error), two HTTP status codes
are plausible: `201 Created` (the node exists and is fully usable) or `202 Accepted`
(created but not yet fully indexed).

**Decision:** Always return `201 Created`. The embedding failure is recorded as a
`pending` job and retried by the background worker.

**Rationale:**

- The node is immediately usable: it has an ID, content, edges can be added, and it
  appears in all list/detail views.
- The only thing missing is vector-based retrieval, which is eventually consistent.
  This mirrors how other eventually-consistent writes work in the system.
- `202 Accepted` would require the frontend to understand and communicate a
  "not yet indexed" state, adding UI complexity for a scenario that rarely occurs in
  practice.

**Consequences:**

- The API caller cannot distinguish "embedded successfully" from "queued for embed"
  solely from the status code. The `embedding_model` field on the response node is
  `null` in the queued case and non-null when embedded — this is the observable
  signal if the caller needs it.

---

## ADR-016 — Process workflow auto-calls suggestion on page load

**Status:** Accepted

**Context:** The process workflow page (`/inbox/process/[id]`) needs Claude's candidate
suggestions to be available for the user. Two UX options: (a) auto-call
`POST /rag/suggest-permanent/{id}` immediately when the page loads, or (b) show a
"Generate suggestions" button the user must click first.

**Decision:** Auto-call on page load. Show a spinner while the AI is working.

**Rationale:**

- The user already committed to processing the note by navigating to the page. An
  extra click adds friction without adding information.
- The inline embed path (Phase 2) established the precedent of doing AI work eagerly
  rather than lazily.
- For a personal tool used daily, the latency of the AI call is the UX — surfacing it
  immediately and showing progress is better than deferring it behind another interaction.

**Consequences:**

- Every page load triggers an API call to Claude, even if the user immediately discards
  all suggestions. Acceptable at personal tool scale (one user, infrequent use).
- If the backend is unreachable, the page shows an error state rather than a blank
  "press generate" prompt.

---

## ADR-017 — Terminal CLI capture tool design

**Status:** Accepted

**Context:** Phase 3.5 adds a terminal CLI (`con`) so the user can capture fleeting notes
without opening the browser. Several design choices were needed: how to install the command,
how to reach the backend, what to do when the user provides no arguments, and what the
interactive fallback looks like.

**Decision:**

- Entry point defined as a `[project.scripts]` in `pyproject.toml`:
  `con = "app.cli.capture:main"`. Installed via `uv sync` into the virtual environment;
  no separate package needed.
- Backend URL read from `CONSTELLATION_API_URL` env var, defaulting to
  `http://localhost:8000`. This matches how `.env` is already used in the project and
  avoids hard-coding a localhost assumption.
- Three invocation modes in priority order:
  1. `-t` / `-c` flags — explicit title and content.
  2. Positional argument — first argument becomes the title (no content).
  3. No arguments — interactive: prompt for title, then content (blank line to end).
- HTTP calls use `httpx` (already a project dependency) in synchronous mode. The CLI
  is a thin shell tool that doesn't need the async machinery of the application.
- On connection error or timeout, print a clear message to stderr and exit non-zero.
  On HTTP error, print the status code and body to stderr.
- On success, print `<title>  [<id>]` to stdout — enough to confirm capture and copy the
  ID if needed.

**Rationale:**

- `[project.scripts]` is the idiomatic Python entry point pattern — `uv sync` installs
  it automatically and the user gets a real PATH binary.
- `CONSTELLATION_API_URL` as the env var name is explicit and scoped to this project,
  consistent with other env vars already in `.env.example`.
- Interactive fallback (no args) makes the tool useful from a keybinding launcher
  (e.g., rofi, dmenu) where you can't easily type flags.
- Synchronous `httpx` is appropriate: CLI tools are sequential by nature, and the
  async startup overhead would be visible on every invocation.

**Consequences:**

- `con` requires the backend to be running. If offline, it prints a clear error rather
  than queuing locally. A local queue could be added later but is deferred.
- The binary is only available inside the venv; users who want it globally need to add
  the venv `bin/` directory to their PATH or use `uv run con`.

---

## ADR-018 — Node picker uses FTS5, not vector search

**Status:** Accepted

**Context:** The edge creation UI needs a node picker: the user types text and sees a
list of matching notes to connect to. Two options existed: (a) use the vector similarity
search infrastructure already in place, or (b) use FTS5 full-text search.

**Decision:** FTS5 with prefix matching (`word*`) via a new `GET /nodes/search?q=` route.
Returns `list[NodeRef]`, excludes fleeting nodes, limited to 50 results.

**Rationale:**

- The full search suite (`/search/semantic`, `/search/hybrid`) belongs to Phase 5 and
  carries more infrastructure (embedding on the fly, RRF fusion, pagination) than a
  picker needs.
- A picker's primary job is label matching — the user typed "SPI" and wants notes whose
  title contains "SPI". FTS5 excels at this; vector search would return thematically
  related notes regardless of the typed string, which is wrong UX for a picker.
- Adding a lightweight FTS5 endpoint keeps Phase 4 self-contained without pulling Phase 5
  work forward.

**Consequences:**

- The node picker does not find semantically related notes the user can't partially spell.
  That is acceptable: the AI link suggestion (`suggest-links`) fills the "find connections
  I didn't think of" role; the picker fills the "I know what I want to connect to" role.
- The `/nodes/search` route is intentionally narrow (no pagination, NodeRef only). If it
  needs to grow, the Phase 5 search suite supersedes it.

---

## ADR-019 — Fleeting notes excluded from link targets

**Status:** Accepted

**Context:** When creating edges or using the node picker, should fleeting notes appear
as valid targets?

**Decision:** No. `GET /nodes/search` filters `type != 'fleeting'`, and `POST /rag/suggest-links`
returns 422 for fleeting source nodes.

**Rationale:**

- Fleeting notes are transient inbox items. They may be decomposed into multiple permanent
  notes, discarded entirely, or significantly rewritten during processing.
- A permanent note linked to a fleeting note would point to a moving target — the link
  becomes meaningless or misleading once the fleeting note is processed.
- The value of the graph comes from stable, atomic permanent nodes. Allowing links to
  fleeting notes would pollute the graph with provisional structure.

**Consequences:**

- Users cannot manually link two permanent notes to a common fleeting note before
  processing it. This edge case is acceptable — the workflow is: process first, then link.
- If a user wants to track that a permanent note originated from a specific fleeting note,
  they can navigate to the fleeting note from the inbox and accept the process workflow.

---

## ADR-020 — Suggest-links results not persisted client-side

**Status:** Accepted

**Context:** The process page (`/inbox/process/[id]`) persists AI candidate suggestions to
`sessionStorage` because the suggestions take several seconds to generate and navigating
away would discard them. The same question arose for suggest-links suggestions on the
node detail page.

**Decision:** Suggest-links results are not persisted. Navigating away from the node detail
page discards the suggestion list.

**Rationale:**

- `suggest-links` is triggered on-demand by a button click, not auto-called on page load.
  The user explicitly requested it and is actively reviewing it — they're unlikely to
  navigate away mid-review.
- Regenerating link suggestions is fast relative to process suggestions: it's a single
  API call with no blocking upstream steps. A 3–5 second re-run is not meaningfully
  disruptive.
- The process page draft state exists to protect work in a multi-step form flow (edit
  title, edit content, accept/reject) that takes several minutes. The suggest-links UI
  is a simple accept/dismiss list with no editing — there is less to lose.
- `sessionStorage` per node ID would accumulate stale entries as the user browses.
  The cost of regenerating outweighs the storage management overhead.

**Consequences:**

- Navigating away and back will trigger a new API call if the user clicks "Suggest
  connections" again. Acceptable at personal tool scale.

---

## ADR-021 — RRF fusion parameters: k=60, N=10 per source, top-8 into context

**Status:** Accepted

**Context:** The hybrid search endpoint and RAG pipeline both need a Reciprocal Rank Fusion
implementation. Three values needed decisions: the RRF constant k, the number of candidates
fetched from each retrieval source, and how many candidates flow into the RAG context assembler.

**Decision:**
- k = 60 (standard RRF constant from Cormack & Clarke 2009)
- N = 10 results fetched from each of semantic and fulltext paths before fusion
- Top 8 merged candidates pass into RAG context as "seed" nodes (full content)
- Up to 12 additional graph-expanded neighbors pass in as "neighbor" nodes (summary only)

**Rationale:**
- k=60 is empirically well-validated across many IR benchmarks; no domain-specific reason to deviate.
- N=10 per source gives RRF enough signal to reward nodes that rank well in both channels without
  over-fetching.
- 8 seeds × ~200 words + 12 neighbors × ~50 words ≈ 2200 words ≈ 2800 tokens — well inside
  claude-sonnet-4-6's 200K context window even at personal tool scale.

**Consequences:**
- RRF is a pure function of rank position (`rrf_merge` in `search_service.py`) — easy to unit-test
  without DB.
- If retrieval quality demands it, k can be tuned independently of N or context limits.

---

## ADR-022 — Context assembly: seeds get full content, neighbors get summary-or-excerpt

**Status:** Accepted

**Context:** The RAG context window contains two tiers of nodes: seed candidates (direct search
hits) and graph-expanded neighbors. Both tiers require different depth of content to be useful
to the model.

**Decision:** Seed nodes receive their full `content` field. Neighbor nodes receive their `summary`
field if populated, else the first 200 characters of `content` followed by `…`. Edge annotations
(type + note) between nodes that both appear in context are appended to the source node's block.

**Rationale:**
- Seeds are the nodes the query directly matched — full content is warranted.
- Neighbors provide topological context ("this note connects to that one") not primary retrieval.
  Summary-or-excerpt conveys enough for the model to mention them in provenance without blowing
  the context budget.
- Edge annotations ("→ SUPPORTS Note 3") give the model relationship information without requiring
  it to infer connectivity from content alone.

**Consequences:**
- Nodes without a `summary` fall back to a 200-char excerpt; this is fine until the embedding
  pipeline populates summaries more consistently.
- Context quality improves as users fill in node summaries over time.

---

## ADR-023 — Non-streaming RAG response

**Status:** Accepted

**Context:** `POST /rag/query` calls `gen_provider.complete()` and returns the full answer at once.
Streaming (SSE or chunked transfer) would reduce perceived latency for long answers.

**Decision:** Non-streaming for Phase 5. The response is returned in one piece after generation
completes.

**Rationale:**
- ADR-013 established that `TestClient` (the test harness) does not handle streaming responses
  cleanly. Adding streaming would require revisiting the test infrastructure.
- For a personal tool with short atomic notes, answers are typically 100–300 words — latency
  is acceptable.
- Streaming adds frontend complexity (SSE reader, partial-state rendering) that is not warranted
  until latency becomes a user pain point.

**Consequences:**
- Revisit in Phase 7 (or when model response times warrant it). The `GenerationProvider` protocol's
  `complete()` method can be augmented with a `stream()` variant at that point.

---

## ADR-024 — xdg-open via asyncio.create_subprocess_exec, stderr logged, fire-and-forget

**Status:** Accepted

**Context:** `GET /sources/{id}/open` needs to launch the user's default application for a URL
or `file://` path. The backend must not block indefinitely waiting for the application to close.

**Decision:** Use `asyncio.create_subprocess_exec("xdg-open", url)` with a 5-second
`wait_for` on `communicate()` to capture stderr. The HTTP response returns 200 as soon as
xdg-open exits (it exits immediately after spawning the target app). stderr is logged at
WARNING level. `FileNotFoundError` (xdg-open absent from PATH) returns HTTP 500.

The `_open_url(url)` helper is extracted as a module-level coroutine so tests can monkeypatch it
without subprocess involvement.

**Rationale:**
- `xdg-open` is the standard Linux launcher — consistent with the systemd service already in use.
- A 5-second wait is generous for xdg-open itself (not the target app) and prevents silent hangs.
- Logging stderr surfaces issues like "no application associated with this file type" without
  failing the HTTP call — the file still exists, the user can copy the path.
- The monkeypatching seam keeps tests fast and hermetic.

**Consequences:**
- Only works on Linux with xdg-open in PATH. Acceptable — this is a Linux-only tool.
- The HTTP 200 response does not confirm the target application launched successfully, only that
  xdg-open was invoked. The WARNING log is the observable signal for failures.

---

## ADR-025 — Source creation inline in IntentionalCaptureDialog

**Status:** Accepted

**Context:** When creating a literature note in IntentionalCaptureDialog, the user must associate
a source. If no matching source exists, they need a way to create one without losing the in-progress
capture dialog state.

**Decision:** A "New source" collapsible section lives inside IntentionalCaptureDialog. When
expanded, it shows an inline mini-form (title, type, url). On submit, `POST /sources` is called,
the new source is added to the picker list, and auto-selected. The full source form (author,
published_at) is available on the `/sources` page.

**Rationale:**
- Navigating to `/sources/new` would discard the capture dialog state (title, content, tags
  already filled in). Inline creation avoids this entirely.
- The mini-form covers the fields needed at capture time (title, type, url). Author and
  publication date are optional enrichments that can be added later from the sources list.
- A collapsible section keeps the dialog compact by default.

**Consequences:**
- The dialog's source picker must refresh its list after inline creation.
- The mini-form intentionally omits author and published_at — users who want those fields
  immediately must use `/sources` directly.

---

## ADR-026 — Citation format: [Note N] notation with frontend-side ID substitution

**Status:** Accepted

**Context:** RAG answers need inline citations that link back to source nodes. Two options:
(a) the backend parses the AI response and returns structured citation objects, or (b) the
backend returns the raw answer text and a provenance array; the frontend does the substitution.

**Decision:** The system prompt instructs the model to cite as `[Note N]`, where N matches
the numbered notes in the context block. The backend returns the raw answer string plus an
ordered `provenance` array. The frontend regex-replaces `[Note N]` with a markdown link
`[Note N](/nodes/{provenance[N-1].node_id})` before passing the string to `react-markdown`.

**Rationale:**
- Backend parsing of AI-generated citation text is fragile — the model may vary its citation
  format. Delegating substitution to the frontend means a regex at render time, not a parse
  at generation time.
- The provenance array is independently useful (the "Sources used" panel) regardless of whether
  the model cited every note. Decoupling provenance from inline citations means the panel is
  always complete even if the model omitted some `[Note N]` markers.
- A regex pre-pass on the markdown string before `react-markdown` is simpler than a custom
  remark plugin.

**Consequences:**
- If the model uses `[Note 2]` in the text but provenance has only 1 entry, the regex produces
  a broken link. This is acceptable — it signals a model formatting issue, not data loss.
- No custom remark plugin needed; `react-markdown` is used as-is.

---

## ADR-027 — Graph visualization: react-force-graph-2d, client-side filtering, dynamic import

**Status:** Accepted

**Context:** Phase 6 requires a graph visualization. Three design questions needed resolution: (1) library choice between `react-force-graph-2d` and `cytoscape.js`, (2) whether filtering happens server-side or client-side, and (3) how to handle SSR with a canvas-based component in Next.js.

**Decision:**

- Library: `react-force-graph-2d` (canvas, force-directed, React-native API).
- Filtering: all interactive filters (node type, edge type, tag, hide isolated, search highlight) are applied client-side against a single full-graph fetch. The only server-side filter is `include_fleeting` (default `false`), which `GET /graph/data` supports as a query param. The `/graph` page always fetches `include_fleeting=true` and filters fleeting nodes client-side so toggling them is instant.
- SSR: `GraphCanvas.tsx` is imported via `dynamic(() => import(...), { ssr: false })` because canvas APIs are browser-only. The initial page shell (filter bar, loading state) renders server-side; the canvas hydrates client-side.
- Auto-fit: `onEngineStop` calls `zoomToFit(400, 20)` once per data change (tracked via a `useRef` flag), not on mount. This ensures the graph is fitted after the force simulation has settled, not before.
- Ref cast: `ForceGraphMethods<{}, {}>` (the default generic) is not assignable to the inferred `ForceGraphMethods<NodeObject<GraphNodeRef>, ...>` due to TypeScript's covariant constraint propagation. A targeted `as any` cast on the `ref` prop resolves this; the runtime behavior is correct.

**Rationale:**

- `react-force-graph-2d` is purpose-built for force-directed layouts. `cytoscape.js` is a general graph toolkit — more powerful for complex layouts but heavier and less React-idiomatic. For a knowledge graph with force-directed layout, node/edge coloring, and click handlers, `react-force-graph-2d` covers all requirements with less ceremony.
- Client-side filtering: at personal tool scale, the full graph (hundreds of nodes) loads in a single small payload (~75–100KB JSON). Instant filter response without round trips is better UX than server round trips for each checkbox toggle.
- `include_fleeting=false` as the server default prevents the API from returning inbox clutter to any caller that doesn't explicitly opt in. The graph page opts in (`include_fleeting=true`) and hides them by default via `initialFilterState()`.
- `onEngineStop` for auto-fit avoids the jarring zoom to an unsettled graph layout that `zoomToFit` on mount would produce.

**Consequences:**

- The `fittedRef.current = false` reset in the `useEffect([nodes, edges])` hook means every filter change re-fits the viewport after the simulation re-settles. This is intentional: a major filter change significantly reshapes the graph.
- The `as any` ref cast is isolated to a single line in `GraphCanvas.tsx`. It does not affect the exported API or callers.
- `react-force-graph-2d` mutates the node objects it receives (adds `x`, `y`, `vx`, `vy`). Nodes are spread (`.map(n => ({ ...n }))`) before passing to `graphData` to prevent mutation of the original `GraphData` state.

---

## ADR-028 — Hand-rolled markdown chunker, no library

**Status:** Accepted

**Context:** The document import pipeline needs to split markdown files by heading boundaries
(H2/H3) with a character-count fallback for oversized sections. Library options include
`langchain` (text splitters), `mistletoe` (AST-based markdown parser), and `tiktoken`
(accurate tokenization). All would satisfy the functional requirement.

**Decision:** Hand-rolled regex split on `^#{2,3} `, with `len(text) // 4` as the token
estimate. No new runtime dependency. Lives in `app/services/doc_chunker.py` as a pure
synchronous function.

**Rationale:**
- The splitting requirements are narrow and well-specified: H2/H3 boundaries, paragraph
  fallback for oversized chunks. A library's generality adds no value here.
- `len(text) // 4` is a well-established rough approximation. Exactness is not required
  for a splitting heuristic — we are not billing by token.
- Keeping it pure and dependency-free makes unit testing trivial and startup instantaneous.

**Consequences:**
- If splitting requirements grow (e.g., H4 support, table-aware splitting), the function
  must be extended by hand. That is the correct tradeoff at this scale.
- The chars/4 estimate will over-split slightly for code-heavy content (where tokens ≈ chars)
  and under-split for natural language. Acceptable; the 2400-char limit is a heuristic.

---

## ADR-029 — Source record written at ingest time, candidates written at accept time

**Status:** Accepted

**Context:** `POST /api/v1/ingest/document` accepts either an existing `source_id` or
source metadata to create a new source. A design question arises: should the new source
record be written immediately (during the ingest call), or deferred until the user accepts
at least one candidate?

**Decision:** The source record is created during `POST /ingest/document` when `source`
metadata is provided. Candidate notes are only written when the user clicks "Accept selected"
in the UI (via individual `POST /nodes/literature` calls). An orphaned source — one with
no linked literature notes — is an acceptable outcome.

**Rationale:**
- The source is stable metadata (title, type, url, author). It is not AI-generated output
  and is not provisional.
- Deferring source creation to the accept step would require threading the source metadata
  through the pending_ingests record and re-validating it at accept time — added complexity
  for no user-visible benefit.
- Orphaned sources are visible and recoverable from the `/sources` page. The user can
  delete them if they accept zero candidates.

**Consequences:**
- A user who runs `con import` and never opens the review UI will have an orphaned source
  record in the DB.
- Source cleanup remains a manual operation (or can be automated later as a maintenance
  sweep).

---

## ADR-030 — Per-chunk generation failure isolation

**Status:** Accepted

**Context:** `POST /ingest/document` processes N chunks sequentially, calling the generation
provider for each. If one chunk's generation call fails or returns unparseable JSON, two
options exist: abort the whole request, or continue and mark the failed chunk.

**Decision:** Continue on per-chunk failure. A failed chunk is returned as
`ChunkResult(candidates=[], error="<message>")`. The overall HTTP response is 200 as long
as the source resolved and at least one chunk was attempted. The request only returns a
non-200 if source resolution fails (404/400/422).

**Rationale:**
- Large documents are expensive to re-ingest. Aborting a 25-chunk request because chunk 3
  produced garbled JSON would discard all the work done on the other 24 chunks.
- The user can see which chunks errored in the review UI and decide whether to retry (by
  pasting the section manually or re-running the import).
- This mirrors how the RAG pipeline handles empty retrieval results — it returns a valid
  response rather than aborting.

**Consequences:**
- A request where all chunks error returns HTTP 200 with `total_candidates=0`. The caller
  (CLI or UI) should surface this as a warning, not a success.
- The `error` field on `ChunkResult` is the observable signal for per-chunk failures.

---

## ADR-031 — `con import` as subcommand of `con`, not a separate binary

**Status:** Accepted

**Context:** The import feature could ship as a new `con-import` binary (a separate
`[project.scripts]` entry point) or as a `con import` subcommand via a dispatcher in the
existing `capture.py` entry point.

**Decision:** Subcommand dispatcher. Before the existing argparse setup, `main()` checks
`sys.argv[1] == "import"` and dispatches to `_import_main()`. The existing capture
behavior is unchanged when no subcommand is detected.

**Rationale:**
- A single named tool (`con`) is more memorable and consistent than two (`con` + `con-import`).
- The dispatch check is five lines and adds no complexity to the capture path.
- Backwards compatible: `con "quick thought"` continues to work.

**Consequences:**
- If a future subcommand is added (e.g., `con review`, `con search`), the dispatch
  pattern should be formalized into an argparse `add_subparsers()` call at that point.
  For now, the `if sys.argv[1] == "import"` check is sufficient.

---

## ADR-032 — /ingest: single-page wizard, candidates in React state only

**Status:** Accepted

**Context:** The two-step ingest UI (upload form → candidate review) could route to
`/ingest/review/[source_id]` with candidates persisted in sessionStorage (like the
process page), or stay at `/ingest` with step managed by `useState` and candidates
in memory only.

**Decision:** Single `/ingest` route. Step state is `useState<"upload" | "review">`.
Candidate data lives in React state. No sessionStorage, no cross-page navigation.

**Rationale:**
- The ingest review is a deliberate, uninterrupted session. The user launched it
  intentionally (either through the UI or via `con import`). They are not in the
  middle of an inbox sweep where interruptions are expected.
- Candidates are large (potentially dozens of notes across many chunks). sessionStorage
  is bounded; for a large datasheet import this could approach or exceed limits.
- If the user navigates away, the ingest is not lost — the `pending_ingests` record
  persists, so they can re-open the review URL and the backend will re-serve the candidates.

**Consequences:**
- A browser refresh on `/ingest?source_id=X` re-fetches candidates from `pending_ingests`
  rather than restoring from memory. This requires the frontend to check for `source_id`
  in the query string and load from the API if present.
- No in-memory edit state is preserved on refresh. Acceptable — the review session is
  short and deliberate.

---

## ADR-033 — Candidate persistence via `pending_ingests` table with lazy expiry

**Status:** Accepted

**Context:** `POST /ingest/document` generates candidate literature notes but does not write
them to `nodes`. For the CLI → UI review handoff to work, candidates must be persisted
somewhere so the frontend can display them at `/ingest?source_id=X` without re-processing
the document.

**Decision:** A new `pending_ingests` table stores the full candidates payload as a JSON
blob, keyed by `source_id` with a TTL of 7 days (`expires_at = created_at + 7 days`).
Lazy expiry: at the start of each `POST /ingest/document` request, delete all rows where
`expires_at < datetime('now')`. No background job is needed. After the user accepts
candidates, the pending record is deleted by the accept endpoint.

**Rationale:**
- The candidates JSON blob is small (a few KB even for large documents). SQLite stores
  it trivially.
- Lazy expiry keeps the table perpetually small without adding a background worker or a
  cron job. At personal tool scale, one ingest call per session means at most a handful
  of rows exist at any time.
- Keying by `source_id` makes the frontend's lookup trivial: `GET /ingest/pending/{source_id}`.
- 7-day TTL gives the user a full work week to return to a pending review without it
  expiring mid-week.

**Consequences:**
- If a user re-ingests the same source (same `source_id`), the old pending record is
  replaced. This is correct behavior — the new ingest supersedes the old one.
- The `expires_at` column is indexed; the lazy delete is O(small) in practice.
- If a user never opens the review UI, the record expires silently after 7 days with no
  user-visible cleanup.

---

## ADR-034 — Bridge candidates: per-node scan over the 200 most-recent nodes

**Status:** Accepted

**Context:** The `/discover` page surfaces "bridge candidates" — pairs of notes with
high embedding similarity but no edge between them. sqlite-vec's `vec0` virtual table
supports query-vector-against-corpus KNN but no native pairwise-similarity operator,
so we need a strategy to surface these pairs.

Three options were considered:

1. **Per-node scan with cap**: iterate the most-recently-updated N nodes, run the existing
   `find_similar_to_node` (k=8) for each, collect the union, dedupe pair-wise, filter out
   pairs that already have an edge, sort by similarity.
2. **Precomputed bridges table**: a background job runs the per-node scan and writes
   results to a `bridge_candidates` table, refreshed on a schedule.
3. **Full corpus scan on demand**: every node × every node, computed in Python from
   stored vectors at request time.

**Decision:** Option 1. The scan is bounded by `_BRIDGE_SCAN_LIMIT = 200` (most-recently-updated
non-fleeting nodes). Each iteration is a single sqlite-vec KNN query — fast and indexed.
Pair dedup is done by canonical-ordering the IDs. No new schema, no background worker.

**Rationale:**
- A personal zettelkasten at v1 scale has hundreds, not millions, of notes. 200 KNN
  queries against an indexed virtual table complete in well under a second.
- The "what's new and adjacent" framing is closer to the user's mental model than
  "the global top-N most similar pairs ever." Recently-updated notes are likeliest to
  be in working memory.
- A precomputed table introduces staleness (last refresh ≠ now) and a background worker;
  not worth the complexity at this scale.
- A full N² scan in Python is wasteful when sqlite-vec already indexes vectors.

**Consequences:**
- A bridge between two old, untouched notes will not surface — by design. The user can
  bump either node's `updated_at` (e.g., editing summary) to bring the pair into scope.
  This trade-off is acceptable for v1; revisit if a "scan full corpus" affordance is
  requested.
- The 200 cap and `_BRIDGE_NEIGHBORS_PER_NODE = 8` are constants in `discover_service.py`,
  not config. Tune via code change if corpus characteristics shift.
- Similarity is reported in [0, 1] via `1 - dist²/2` (cosine equivalent for unit vectors).
  Voyage and mxbai embeddings ship L2-normalized so this is defensible. If a non-normalized
  provider is added, this conversion needs revisiting.

---

## ADR-035 — Scoped RAG: no retrieval, no graph expansion (depth=0)

**Status:** Accepted

**Context:** The `/synthesize` workflow lets the user pick an explicit set of notes
and ask the LLM a guided question against just those. The natural question is
whether `query_scoped()` should still expand to neighbors via graph traversal
(as the corpus-wide `/rag/query` does at depth=1), or treat the user's selection
as the complete context.

**Decision:** No retrieval, no graph expansion. The user-supplied `node_ids` are the
exhaustive context. The system prompt is augmented with a "scoped instruction"
clarifying to the model that the provided notes are intentionally the entire scope.

**Rationale:**
- The user is making an explicit "these are the relevant notes" claim. Pulling in
  neighbors would silently expand that scope and dilute the synthesis with material
  the user didn't intend to include.
- Keeps the contract simple: the artifact's `provenance` exactly matches the input
  `node_ids` (minus any that fail to resolve). One-to-one mapping is easy to reason
  about.
- The workflow that wants graph expansion already exists: `/ask` with the regular
  `/rag/query` endpoint.

**Consequences:**
- Forgetting to add a relevant note to the scope means it's truly absent from the
  answer — there's no "the system found a related note for me" rescue. This is the
  intended trade-off; the user can iterate.
- A future `expand_to_neighbors: bool = false` flag could be added if a use case
  emerges, without breaking the current default.
- `RagResponse.edges_traversed` is always `[]` for scoped responses. The frontend
  treats this as "no connections to display."

---

## ADR-036 — Saved syntheses link to sources via `COLLECTS`

**Status:** Accepted

**Context:** When a RAG answer is saved as a permanent note via `POST /rag/save-answer`,
the new note should record which existing notes it was synthesized from. The edge
type matters for downstream graph queries and visual styling.

Two candidates were considered:

- `COLLECTS` — semantically "this note gathers these other notes" (already used by
  structure notes / MOCs to assemble references).
- `ELABORATES` — "this note zooms in on aspects of these others."

**Decision:** `COLLECTS`, from the synthesis note → each cited source.

**Rationale:**
- A synthesis IS a collection by construction: it bundles N source notes' content
  into one distilled artifact. The edge type's existing semantics fit.
- `ELABORATES` implies the synthesis deepens one specific source — wrong shape
  for an N-to-1 aggregation.
- Re-using an existing edge type avoids schema churn (the `CHECK(type IN ...)` constraint).
- Visualizes consistently in the graph: synthesis nodes show as hubs with many
  outgoing `COLLECTS` edges, mirroring how MOCs render.

**Consequences:**
- Filtering the graph by `COLLECTS` will mix structure-note collections with
  synthesis-note collections. Acceptable — they're conceptually similar.
- If a future feature distinguishes "human-curated MOC" from "AI-synthesized brief,"
  a separate edge type (e.g., `SYNTHESIZES`) could be introduced. Schema migration
  would update the CHECK constraint and a backfill could classify existing edges
  by inspecting the `from_id` node's metadata.

---

## ADR-037 — Markdown rendering on the node detail view, raw textarea on edit

**Status:** Accepted

**Context:** Saved syntheses (and any user-authored note) often contain markdown:
headings, lists, bold, code blocks, links. Until now `/nodes/[id]` rendered
content as plain text in a `whitespace-pre-wrap` div. The save-as-note workflow
makes a markdown renderer essentially required for the artifacts to be readable.

**Decision:** View mode uses `react-markdown` + `remark-gfm` (already a dep,
already used on `/ask`). Edit mode keeps the raw `<textarea>`. The mode toggle
is the existing click-to-edit / blur-to-save flow on `EditableField` — no new
WYSIWYG, no preview-while-editing.

**Rationale:**
- Reuses the same renderer already vetted on `/ask` — no new dependency, no styling
  drift between answer rendering and note rendering.
- Click-to-edit reveals the raw markdown source, which is the most predictable UX
  for someone who wrote the markdown by hand.
- A WYSIWYG editor is a much larger surface (CodeMirror, Lexical, Tiptap) for
  marginal benefit on a personal tool.

**Consequences:**
- `EditableField` gains a `markdown?: boolean` prop. View mode renders inside a
  `prose` container; edit mode is unchanged.
- Tables, code blocks, and links in note content now render visually rather than
  as raw text. Existing notes are unaffected at the data layer (content is stored
  as-is — markdown rendering is purely a view concern).
- If the user pastes content with HTML or a markdown construct that `remark-gfm`
  doesn't handle, it falls back to verbatim text, which is the safe default.
## ADR-034 — Virtual source nodes in the graph visualization

**Status:** Accepted

**Context:** Sources should appear in the graph so that imported document clusters are
visibly connected to a hub node. However, the `edges` table has FK constraints to the
`nodes` table, making it impossible to insert edges whose `to_id` points to a source ID
without schema changes. Inserting sources into `nodes` would conflate two distinct entity
types, pollute the `NodeType` enum, break the embedding pipeline (sources are metadata,
not content), and require a migration.

**Decision:** Source records and synthetic `CITES` edges are materialized in
`GET /graph/data` by querying the `sources` table and the `nodes.source_id` FK.
Sources appear in `GraphData.nodes` with `type="source"`. CITES edges appear in
`GraphData.edges` with synthetic IDs (`cites-{node_id}`). No schema changes to the
`nodes`, `edges`, or `sources` tables.

The graph layer defines its own Literals (`GraphNodeType`, `GraphEdgeType`) that are
strict supersets of the DB-level `NodeType`/`EdgeType`. This keeps TypeScript types tight
while allowing the graph view to model computed entities that don't exist in the DB schema.

**Rationale:**

- Sources are metadata (title, author, URL), not knowledge-graph content. Keeping them
  in a separate table preserves the conceptual distinction.
- The graph endpoint is the correct abstraction boundary for computed views — it already
  returns refs, not full records.
- No new migration needed. No change to the embedding pipeline.
- Virtual CITES edges are scoped to the graph visualization; they don't need persistence,
  user-written notes, or edge-type-filter semantics beyond the graph view.

**Consequences:**

- CITES edges don't persist in the `edges` table and can't carry a user-written `note`.
- Source nodes can't be targeted by manual edge creation from the note detail UI
  (the node picker uses `/nodes/search` which only returns `nodes` table records).
- If a literature note is soft-deleted, its CITES edge disappears from the graph
  because the repo query filters `deleted_at IS NULL`.
- Clicking a source node in the graph navigates to `/sources/{id}` (in-app) rather than
  opening the source's file/URL directly — consistent with the "Open note →" pattern.

---

## ADR-035 — Auto-tag and auto-hub note on import acceptance are frontend-only, non-atomic

**Status:** Accepted

**Context:** The ingest review page ("Accept selected") gains two optional additions:
auto-tagging all accepted notes with a user-supplied tag, and creating a hub structure
note that COLLECTS all accepted notes. These could be implemented as a new server-side
batch endpoint (`POST /ingest/accept-batch`) or as sequential frontend API calls.

**Decision:** Both features are implemented entirely in the frontend as sequential API
calls within the existing `handleAccept` function. The auto-tag call resolves/creates the
tag before the literature note loop and passes `tag_ids` to each `createLiteratureNode`.
The hub note and its COLLECTS edges are created after all literature notes succeed, using
existing `POST /nodes/structure` and `POST /edges` routes. Edge failures are non-fatal:
the hub note persists, and the user can create missing edges manually.

**Rationale:**

- A server-side batch endpoint would require a new route, new service logic, a migration
  to thread tag IDs through the accept flow, and new tests — significant scope for an
  improvement to a single-user personal tool.
- The failure modes (network blip mid-accept) are rare and manually recoverable.
- The existing routes (`POST /nodes/structure`, `POST /edges`) already do exactly what
  is needed; reuse is better than duplication.

**Consequences:**

- If the browser closes mid-accept (between literature note creation and hub note
  creation), the hub note won't exist. The literature notes and tag are already saved.
  Acceptable at personal tool scale.
- If a COLLECTS edge fails for a specific note, the hub note exists but is missing that
  connection. The user can add it from the hub note detail view.

---

## How to add a new ADR

1. Append a new section at the bottom with the next ADR number.
2. Fill in all five fields (Status, Context, Decision, Rationale, Consequences).
3. If superseding an existing decision, update the old ADR's Status to
   `Superseded by ADR-NNN` and link forward.
4. Reference relevant ADRs from `architecture.md` § decisions where applicable.