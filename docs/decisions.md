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

**2026-05-14 amendment (see ADR-047):** `_open_url` now returns any captured
stderr text rather than only logging it, and the route includes it as
`{"opened": url, "warning": <msg>}`. HTTP status remains 200 in all
post-launch outcomes; this is a strict superset of the original contract.

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

**Status:** Superseded by [ADR-051](#adr-051--saved-syntheses-use-cites-not-collects-supersedes-adr-036)

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

**Status:** Superseded by ADR-073

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

## ADR-038 — Client-side filtering with page_size=100 on Notes page

**Status:** Accepted

**Context:** The Notes page needs interactive filtering by node type and tag. Two
approaches are possible: (1) add `tag` and `type` query parameters to `GET /nodes` for
server-side filtering, or (2) fetch a larger page of results and filter in the browser.

**Decision:** Client-side filtering with `page_size=100` per type (`permanent`,
`structure`, `literature`), consistent with the graph page's approach (ADR-027). No
new backend query parameters added. The `listNodes` API helper was updated to accept
an optional `pageSize` argument (default 50).

**Rationale:**

- At personal tool scale (typical note count < 500), returning up to 300 notes (100 per
  type) is fast and imposes negligible memory pressure.
- Adding server-side tag filtering requires a new migration or a JOIN with the `node_tags`
  table and a new query parameter — meaningful backend scope for a read-only UX filter.
- Client-side filtering is instantaneous (no round trips) and consistent with how the
  graph view handles all interactive filters (ADR-027).
- If the corpus grows beyond 1 000 notes, a backend `tag` parameter can be added without
  breaking any existing callers.

**Consequences:**

- Notes page fetches all 3 types in parallel on mount. At page_size=100 per type, the
  worst case is 300 notes in memory — acceptable.
- Users with > 100 notes of a single type will see their tag filter working only on the
  first 100 notes returned. If this becomes a problem, raise page_size or add backend
  filtering in a later phase.

---

## ADR-039 — Lazy NodeDetail fetch in hover popovers and slide-out panels

**Status:** Accepted

**Context:** The `NotePreviewPopover` component and the Discover slide-out panel both
display note content in contexts where only a `NodeSummary` or `NodeRef` is available
from the parent list fetch. Two options existed: (1) show only the summary field (already
present on `NodeSummary`), or (2) fetch the full `NodeDetail` on demand when the panel
becomes visible.

**Decision:** Fetch `GET /nodes/{id}` lazily when the panel first becomes visible. The
popover shows a skeleton (3 animated pulse lines) while loading, then renders
`detail.content` once it resolves. Falls back to `node.summary` for the skeleton interim
display if already available. The fetch is cancelled if the panel closes before it resolves.

**Rationale:**

- `NodeSummary.summary` is an AI-generated distillation, not the author's actual writing.
  Showing only the summary in edge-creation contexts (bridge candidates, connecting from
  graph) gives the user a paraphrase to decide from, not the note itself. That is
  insufficient context for consequential decisions like creating permanent edges.
- The popover is shown after a 300ms hover delay — the fetch begins at that moment, so
  the round trip (typically < 100ms localhost) completes before or shortly after the
  skeleton appears. The latency penalty is negligible.
- Cancelling the fetch on close avoids setting state on unmounted/invisible components
  and wastes no bandwidth if the user moved the cursor.

**Consequences:**

- Every hover that persists 300ms issues a `GET /nodes/{id}` request. At personal tool
  scale, with a warm SQLite file, this is fast and the server overhead is trivial.
- The `NotePreviewPopover` component requires `node.id` (available on both `NodeSummary`
  and `NodeRef`) rather than just `node.summary`. Callers with `NodeRef`-only data can
  still use it.
- If the backend is unavailable, the popover renders the skeleton indefinitely (no error
  state shown). Acceptable for a personal single-user tool where backend availability is
  assumed.

---

## ADR-040 — Graph edge creation via two-click connecting mode

**Status:** Accepted

**Context:** Users need a way to create edges directly from the graph visualization
without navigating to a node detail page. The key design question is the interaction
model for selecting both endpoints of the edge.

**Decision:** A two-step "connecting mode" state machine in `graph/page.tsx`:

1. User selects a node (normal single-click) → `NodePanel` appears with a "Connect to…"
   button (and keyboard shortcut `E`).
2. Pressing `E` or clicking the button sets `connectingFrom = selectedNode` — the canvas
   overlays an indigo banner "Click a node to connect — Esc to cancel."
3. Clicking any other node sets `connectTarget` → `ConnectPanel` appears with pre-populated
   from/to node headers, an edge type dropdown, optional note textarea, and Create/Cancel.
4. On `POST /edges` success: graph data refreshes (full re-fetch), connecting state clears.
5. `Escape` at any stage clears all connecting state.

The `ConnectPanel` is a separate component (`graph/components/ConnectPanel.tsx`) that
mirrors the edge creation form on `nodes/[id]/page.tsx`. A 409 response renders
"Already connected with this edge type." inline without closing the panel.

**Rationale:**

- Two-click is the natural model for directed edges: pick source, pick target. A drag-to-
  connect approach would require hit-testing on a canvas and is significantly more complex.
- The modal banner and `Escape` escape hatch make connecting mode clearly communicated and
  always dismissable without navigating away.
- Reusing `POST /edges` unchanged means no new API surface; the graph view becomes another
  edge-creation entry point.
- The `E` shortcut mirrors common graph editor conventions and is discoverable via the
  button label hint.

**Consequences:**

- Clicking a source node (type="source") while in connecting mode does nothing — source
  nodes are graph-only virtual entities and not valid edge targets in the DB.
- After a successful edge creation, the full `GET /graph/data` is re-fetched to show the
  new edge. This is consistent with the existing refresh pattern for filter changes.
- `selectedNodes` (multi-select) and `connectingFrom` are mutually exclusive — entering
  connecting mode clears multi-select, and shift-clicking clears single-select.

---

## ADR-041 — Graph multi-select and batch tag assignment via shift-click

**Status:** Accepted

**Context:** Users need to assign the same tag to multiple notes simultaneously from the
graph view, particularly after importing a batch of related literature notes that share
a topic.

**Decision:** Shift-clicking a node toggles it in a `selectedNodes: Set<string>` set
(separate from single-select state). When `selectedNodes.size > 0`, a `BatchPanel` replaces
the normal side panel showing: selected count, all available tags as chip buttons, and an
"Apply N tags" button.

Tag application: for each selected node ID, `GET /nodes/{id}` (to get current `tag_ids`),
merge with `pendingTagIds`, then `PATCH /nodes/{id}` with the merged set. All node
updates run in `Promise.all`. On completion, graph data refreshes and `selectedNodes` clears.

Tags are loaded from `GET /tags` once on initial graph load alongside `GET /graph/data`.

**Rationale:**

- `Promise.all` for the batch PATCH is safe at personal tool scale (tens of selected nodes).
  A sequential loop would be noticeably slower and unnecessary given SQLite's single-writer
  model already serializes writes.
- The read-modify-write pattern (get current tags → merge → patch) preserves existing tags
  rather than replacing them, which is the always-correct behavior for a "add tag" operation.
- Loading all tags on initial graph load adds one small API call at mount time; it avoids
  a blocking fetch when the user first shift-clicks.
- `BatchPanel` occupies the same panel slot as `NodePanel`/`ConnectPanel` — no extra screen
  real estate is consumed.

**Consequences:**

- If a node is updated externally between the `GET` and `PATCH` in the batch, the
  optimistic merge may overwrite an intermediate change. Acceptable for a single-user tool
  with no concurrent writers.
- The node graph re-fetch after batch apply (with updated tag colors) is a full re-fetch.
  This is consistent with all other refresh patterns in the graph view.
- Shift-clicking a source node adds its ID to `selectedNodes`, but the batch PATCH will
  fail for it (source IDs are not in the `nodes` table). This is a known edge-case; the
  error is non-fatal and the other nodes still update. Future fix: filter source nodes out
  of `selectedNodes` at click time.

---

## ADR-042 — Embedding jobs observability via /admin dashboard

**Status:** Accepted

**Context:** The embedding pipeline silently absorbs failures. `embed_or_queue`
queues a job on inline failure; the worker tries once and marks the job
`failed` on error. Failed jobs are never retried automatically and there is
no UI for the user to see them. A rate-limit incident (e.g., Voyage free
tier) can leave dozens of notes without vectors with no indication anything
went wrong until search returns degraded results.

**Decision:** Add a minimal operability dashboard at `/admin` backed by four
backend endpoints:

1. `GET /config/embedding-jobs` — extended with status filter, typed
   response, node titles joined in, summary counts in the envelope.
2. `POST /config/embedding-jobs/{id}/retry` — flips the existing row from
   `failed` back to `pending`, increments `attempt_count`, clears `error`.
3. `POST /config/embedding-jobs/retry-all-failed` — bulk version of (2).
4. `GET /admin/status` — worker health (last drain timestamp, drain count,
   queue depth). Module-state only; resets on restart.

Schema change: add `attempt_count INTEGER NOT NULL DEFAULT 0` to
`embedding_jobs`. Incremented by both inline-failure path in `embed_or_queue`
and worker-failure path in `drain_jobs`, and by explicit retry. New jobs
queued by `embed_or_queue` start at `attempt_count = 1` (the failed inline
attempt is counted).

**Rationale:**

- **Flip-in-place over audit-row-per-attempt:** simpler schema, simpler
  worker pickup query (`WHERE status = 'pending'` already works), and
  `attempt_count` preserves enough audit information to identify silent
  problem nodes without an additional table.
- **`attempt_count` from day one:** the alternative is adding it later
  during an incident, which requires a migration *and* code change at the
  worst possible moment. Adding it now is one extra integer column.
- **Starting at 1 when queued from inline failure:** the inline attempt
  failed — that's why the job exists. Counting it preserves the honest
  "total attempts to date" semantic and makes `attempt_count` directly
  useful for spotting problem nodes ("why is this at 5?").
- **No exponential backoff:** the existing 10-second poll plus natural API
  rate-limit windows (e.g., 60-second reset on the Voyage free tier)
  provide sufficient throttling for a single-user tool. Backoff adds
  complexity (per-row scheduled retry time, eligibility query, jitter)
  that is unjustified until real-world data shows it is needed.
  *(Revisited 2026-05-13 — this rationale was wrong because a 429 isn't a
  no-op; it kicks the row out of `pending` into `failed`. See
  [ADR-044](#adr-044--retriable-vs-terminal-embedding-errors).)*
- **Module-state worker health, not a database table:** acceptable to lose
  this on restart. The information is operational ("is the worker
  running?"), not historical. A `worker_heartbeats` table would be
  overengineering for a single-process app.
- **Manual retry over auto-retry:** auto-retry hides ongoing problems. The
  user wants to know *why* something failed before deciding whether to
  retry it (rate limit? Provider down? Bad content?). A button is the
  right control surface.

**Consequences:**

- New migration `0003_attempt_count.sql`. Existing jobs backfill to 0;
  history of past failures is not reconstructed.
- The dashboard polls every 5s while open. Trivial load on the local
  SQLite — measured separately if it ever proves otherwise.
- A note that consistently fails (e.g., content exceeds provider token
  limit) can be retried indefinitely. `attempt_count` is purely
  informational in v1; no UI alert or automatic dead-lettering. If
  attempt counts climb visibly, that signals a future ADR to add either
  alerting or a `dead` terminal status.
- Worker health lost on restart. Acceptable: a restart is itself a known
  event, and the worker re-engages on the next cycle (10s).
- `attempt_count` is incremented on *every* failure path, including the
  initial inline `embed_or_queue` attempt. This means a freshly queued
  job already shows `attempt_count = 1` before the worker has touched it.

---

## ADR-043 — Frontend choices for the /admin operability dashboard

**Status:** Accepted

**Context:** Phase 6.5 added four backend endpoints (`GET
/config/embedding-jobs`, retry, retry-all-failed, `GET /admin/status`) and
needed a frontend surface for them. Several small tradeoffs came up while
building the page that are individually too small for their own ADR but
worth recording together so future work can stay consistent.

**Decision:**

1. **Polling cadence.** `/admin` polls every 5 s; the nav-bar badge in
   `AppShell` polls `/admin/status` every 30 s. Both pause when
   `document.visibilityState === "hidden"` via a shared
   `usePollWhileVisible` hook backed by a pure `createVisibilityPoller`
   state machine (so it is testable without DOM).
2. **Relative timestamps.** Plain text — `"4s ago"`, `"3m ago"`, `"2h
   ago"`, `"2d ago"`. `null` renders as `"never"` (used for
   `last_drain_at` before the worker has run). No tooltip with the exact
   timestamp in v1; the dashboard re-renders every poll so absolute
   precision is rarely useful.
3. **Failed-jobs section is conditional.** Only renders when
   `failed_jobs > 0`. The dashboard's resting state for a healthy system
   is "Pending (0)" with no red anywhere. Same logic drives the nav
   badge — absent when zero, otherwise a small red pill with the count.
4. **Recent completions collapsed by default.** They're not actionable;
   they confirm the worker is doing work. The header row shows the
   total complete count so the user can tell at a glance.
5. **Slide-over drawer for "Open note".** A new
   `NodeDetailDrawer` component fetches `NodeDetail` on demand and
   renders as a right-anchored panel over the dashboard. The user
   stays on `/admin` while triaging — navigating to `/nodes/{id}`
   would lose the polled state and force a back-button trip. The
   drawer also offers a final "Open full note →" link for users who
   want the editor view.
6. **Optimistic retry.** Clicking Retry flips the row's local status
   to `pending` before the API call returns, then a full refresh
   reconciles. The optimistic step is in `applyOptimisticRetry`,
   exported from the page module so it can be unit-tested without
   mounting the component (React Testing Library is not in the
   dependency set and adding it for one component would be
   disproportionate).
7. **No toast / notification system.** Errors render inline (red text
   under the StatusBar for a failed refresh; the failed table itself
   surfaces job-level errors). A toast library would be the first of
   its kind in the project and the dashboard is already self-refreshing,
   so transient failures self-heal on the next poll.

**Rationale:**

- **Same polling primitive everywhere** keeps the visibility-pause
  behavior in one place. Otherwise it's easy to ship a feature that
  hammers the API while the tab is hidden.
- **Drawer over route navigation** matches the user's stated goal of
  "stay on the dashboard." A modal would be equally fine; a right-anchored
  drawer reads as "auxiliary detail" rather than "blocking task,"
  which fits the triage flow.
- **Optimistic-then-refresh** rather than full optimistic state machine
  keeps the page code small. The worker picks up the row within ~10 s
  anyway, so the next poll will reconcile to ground truth.
- **No React Testing Library** because the testable logic is already
  pure functions (`applyOptimisticRetry`, `relativeTime`,
  `createVisibilityPoller`). Adding `@testing-library/react` would
  pull in DOM-mount machinery the project does not otherwise use.

**Consequences:**

- A future feature that needs to mount a React component in a test
  (e.g., a hook test that depends on real `useEffect` timing) will
  have to add `@testing-library/react`. The pure-function pattern
  used here will not stretch to all cases.
- Relative timestamps re-render at the polling cadence; a job that
  completes 4 s ago will read "4s ago" until the next poll. Acceptable
  drift for a 5 s loop.
- The nav badge poll runs even on routes that don't care (e.g., the
  reader pages). 30 s × one `GET` is trivial load on a local SQLite,
  but if the project ever grows other always-on indicators, they
  should share a single polling root in `AppShell` rather than each
  adding their own.

---

## ADR-044 — Retriable vs terminal embedding errors

**Status:** Accepted (revisits the "No exponential backoff" bullet of
[ADR-042](#adr-042--embedding-jobs-observability-via-admin-dashboard))

**Context:** Once the Phase 6.5 `/admin` dashboard shipped, the user
saw ~190 of ~200 embedding jobs in `failed` — not because the notes
were bad but because the worker's 10 s drain cadence guaranteed that
~7 of every 10 API calls per minute hit the Voyage free tier's 3 RPM
ceiling. The worker caught the `RateLimitError` as a generic
`Exception`, bumped `attempt_count`, marked the job `failed`, and
stored the rate-limit message verbatim. ADR-042 explicitly assumed
"natural rate-limit windows provide sufficient throttling." That
assumption was wrong: a 429 is destructive in this stack because it
moves the row out of `pending`. One `retry-all-failed` click would
re-queue the rows, the same race would play out, and most would land
back in `failed` — requiring repeated manual intervention.

**Decision:**

1. **Classify provider exceptions** in a new
   `app/services/embedding_errors.py`:
   `RateLimitError | TryAgain | Timeout | APIConnectionError |
   ServiceUnavailableError` (all from `voyageai.error`) → retriable.
   Everything else → terminal (existing behavior).
2. **Retriable hit ≠ failure.** On retriable, the worker reverts the
   row from `processing` back to `pending`, does **not** bump
   `attempt_count`, and does **not** store an error string. The
   `attempt_count` column is reserved for "things actually wrong with
   this job," not "we backed off."
3. **Single in-memory cooldown.** When `drain_jobs` hits a retriable
   error it returns a `DrainResult(processed, cooldown_seconds)`.
   The worker sets `app.state.cooldown_until = now + cooldown_seconds`
   and skips its next cycle (or cycles) while that time is in the
   future. The cooldown value is the Voyage `Retry-After` header if
   present, otherwise `settings.embedding_rate_limit_cooldown_seconds`
   (default 60).
4. **Tighter cadence, smaller per-cycle bound.** Worker sleep is now
   `settings.embedding_worker_interval_seconds` (default 22),
   `drain_jobs` picks up at most
   `settings.embedding_drain_batch_size` (default 1) rows per cycle.
   At those values the steady-state rate is ~2.7 RPM — under the 3 RPM
   ceiling with buffer — so 429s should be rare under normal use; the
   cooldown is the safety net for bursts or unexpected throttling.
5. **Surface cooldown in the UI.** `AdminStatus.cooldown_until` is a
   nullable ISO timestamp. The `/admin` page renders an amber banner
   ("Rate-limited — next attempt in Xs") whenever the value is in the
   future, computed via a tiny `secondsUntil` helper.

**Rationale:**

- **Reuse the SDK's typed exceptions** rather than parse error
  strings — Voyage already raises a `RateLimitError` subclass; we
  just have to look at it instead of swallowing it as `Exception`.
- **No `scheduled_for` column.** ADR-042 chose module state for
  worker health for the same reason it's right here: this is
  operational, not historical. A per-row scheduled-retry-time
  column would also need its own pickup query, jitter, and migration
  — overkill when one timestamp at the worker level does the job.
- **`attempt_count` semantics preserved.** Existing callers and tests
  treat `attempt_count` as "things have gone wrong with this row."
  Bumping it on rate-limits would inflate the number without
  conveying anything actionable; users would see `attempt_count: 5`
  on a healthy job and worry.
- **Cadence + batch size are config-driven** (`.env`) so the user
  can tighten if they upgrade their Voyage tier or loosen for
  debugging without code changes.
- **The retriable list is conservative.** `InvalidRequestError`
  (bad input) and `AuthenticationError` (bad key) stay terminal —
  retrying those is wasted load and obscures real problems. `Timeout`
  and `APIConnectionError` are included because both are usually
  transient infrastructure; if they're persistent the user will see
  the same job re-enter `pending` repeatedly and can intervene.

**Consequences:**

- The 192 stale failed rows from the originating incident drain on
  their own once `retry-all-failed` is clicked once — no further
  manual retries needed. Drain time at default settings is ~70 min
  for that backlog (3 RPM ceiling). Throughput is *not* fixed by this
  ADR; predictability is.
- The inline `embed_or_queue` path is unchanged. Inline failures
  still queue at `attempt_count = 1`; if that failure was rate-limit
  related, the worker will pick the job up and the second attempt
  will be the one that actually counts toward the cooldown logic.
  This is a minor inconsistency we are accepting (cleaning it up
  would require either threading worker state into the request path
  or duplicating the cooldown mechanism inline; neither is worth it).
- The cooldown is process-local. A backend restart loses it; the
  worker will probably hit one 429 immediately, then cool down.
  Acceptable: identical to ADR-042's stance on `drain_count`
  resetting on restart.
- Future tier changes (e.g., paid Voyage) are a `.env` edit:
  `EMBEDDING_WORKER_INTERVAL_SECONDS=5`,
  `EMBEDDING_DRAIN_BATCH_SIZE=10`. No code change.
- If `RateLimitError` ever turns out to be a misclassification (e.g.,
  Voyage starts raising it for unrecoverable per-key suspensions),
  we'd see the same row re-enter `pending` on every cycle. That
  pattern would be visible in `/admin` (a perpetually-cycling
  `pending` count) and is recoverable via a manual intervention; no
  silent corruption risk.

---

## ADR-045 — Sources are attachable to non-fleeting nodes after creation

**Status:** Accepted

**Context:** The original design constrained source attachment to creation
time via `LiteratureCreate.source_id`, with the implicit assumption that
"having a source" and "being a literature note" were the same statement.
Real-world use surfaced a counterexample: notes captured directly from a
fleeting thought (e.g., a song lyric typed in raw, processed into atomic
permanents) are conceptually grounded in a source that the user wants to
attach *after* the notes exist. The schema already permitted `source_id`
on every node type (the column is nullable on `nodes`, with no
`CHECK(type='literature')`), but no API surface existed to set it after
creation. Three options were considered:

1. Allow `source_id` to be patched on any non-fleeting node, leaving node
   type alone.
2. "Convert" the note's type to `literature` when a source is attached
   (and back to `permanent` when detached).
3. Build a separate, weaker association table for "soft" source links
   that don't imply a literature note.

**Decision:** Option 1. `NodeUpdate` gains a `source_id: str | None`
field with `model_fields_set` semantics distinguishing "not provided"
from "explicit null" (detach). `PATCH /nodes/{id}` validates that
(a) the node is not fleeting and (b) any non-null `source_id` resolves
to an existing row in `sources`, returning 422 otherwise. Node `type`
is never changed by this operation.

**Rationale:**

- The schema already supports this — the `source_id` column has been
  nullable on every node type since Phase 0. No migration is needed.
- Node type is a creation-time invariant in this codebase (it gates
  embedding, drives UI affordances, and shapes RAG context). Flipping
  it on source attachment would ripple through the embedding pipeline
  (literature notes auto-embed at creation; we'd need to re-evaluate),
  the inbox filter, and the graph view. None of that complexity buys
  anything the column-on-permanent doesn't already provide.
- ADR-029 already accepts orphan sources (sources with no linked
  literature note). Letting a permanent note *have* a source is the
  symmetric case — a source with a non-literature-typed note — and is
  similarly innocuous.
- The conceptual distinction from the 2026-05-09 design clarification
  is preserved: "source = provenance, frozen" vs. "structure note =
  organization, evolves." A permanent note about an idea in a song
  can point at the lyric file (provenance) without becoming a
  literature note (which the design treats as "notes about an
  external work" — a slightly different framing than "ideas inspired
  by an external work").

**Consequences:**

- `nodes.source_id` is no longer a literature-only column in practice.
  Code that filters by `type='literature'` to find "notes with a
  source" must instead filter by `source_id IS NOT NULL`. Audit
  existing callers if they relied on the old assumption.
- The virtual `CITES` edge synthesis in `GET /graph/data` (ADR-034)
  joins on `nodes.source_id`; it already operates on all rows
  regardless of type, so non-literature notes with attached sources
  will surface as `CITES`-connected to their source nodes in the
  graph. This is desired behaviour for the lyric workflow.
- `source_repo.delete` already blocks deletion when linked notes
  exist (using `COUNT(*) FROM nodes WHERE source_id = ?`); that
  guard correctly extends to non-literature attachments without
  changes.
- The frontend `Source` panel on `/nodes/[id]` is shown for all
  non-fleeting node types. Users can attach a source from
  permanent or structure notes, not just literature, which
  matches the new server contract.

---

## ADR-046 — Shared `edgeTypes` module with type metadata

**Status:** Accepted

**Context:** The `EDGE_TYPES` enum array was duplicated across three
frontend files (`/nodes/[id]/page.tsx`, `/graph/components/ConnectPanel.tsx`,
`/discover/page.tsx`), and `EDGE_COLORS` was duplicated as well. Edge types
rendered as bare uppercase tokens (`SUPPORTS`, `ELABORATES`) with no help
text, and edge direction was conveyed only by section headings
("Referenced by") rather than per-row indicators. Real-user feedback on
2026-05-10: "Direction of connections, and the differences between when to
use some (supports vs elaborates) are a little vague to the user right now."

**Decision:** Introduce `frontend/src/lib/edgeTypes.ts` as the single source
of truth, exporting:

- `EDGE_TYPES: EdgeType[]` — canonical ordering.
- `EDGE_COLORS: Record<EdgeType, string>` — Tailwind class strings for badges
  (the hex map in `graph/colors.ts` stays put — different consumer / value
  shape).
- `EDGE_TYPE_META: Record<EdgeType, { label, directional, description, example }>`
  with the prose copy below.
- `directionGlyph(t): "→" | "↔"` for inline direction rendering.

The three duplicated arrays now import from this module. Edge type pickers
render `EDGE_TYPE_META[t].label` (title-case) with the description as small
grey text below the select. Edge rows render `→` for outgoing and `←` for
incoming directional types; `↔` for `ANALOGOUS_TO` (the only symmetric
type). Edge-type badges use `title={description}` for hover tooltips
(deliberately a native browser tooltip rather than a custom popover — the
testing note asked for "without being annoying about it for users who have
the workflow down").

**Prose copy** (mirrored in `EDGE_TYPE_META`):

| Type | Description |
|---|---|
| `SUPPORTS` | A provides evidence or argument for B. |
| `CONTRADICTS` | A is in tension with B. |
| `ELABORATES` | A zooms in on an aspect of B. |
| `ANALOGOUS_TO` | A and B share structural similarity, often across domains. (symmetric) |
| `QUESTIONS` | A raises a problem with or about B. |
| `INSPIRED_BY` | A is a looser creative or associative link from B. |
| `COLLECTS` | A (a structure note) includes B in its map. |

**Rationale:**
- One module, one update point. Future edge types or copy edits land in
  exactly one place.
- Direction is now visible inline without forcing the user to learn which
  section ("Connections" vs "Referenced by") implies which direction.
- `title` attributes for the badge tooltip cost nothing in screen real
  estate and degrade gracefully without JavaScript.

**Consequences:**
- The `EDGE_TYPES` and `EDGE_COLORS` constants in the three files are
  removed and re-imported from `@/lib/edgeTypes`. `discover/page.tsx`
  also picks up the description copy.
- Display labels change from `SUPPORTS` to `Supports`. The enum values
  sent to the backend are unchanged.

---

## ADR-047 — File path normalization for `file://` source URLs

**Status:** Accepted

**Context:** Sources can have a `url` of any form. For local files, users
type things like `~/Documents/x.pdf` or `$HOME/notes/y.pdf` because that's
how they think about their filesystem. Previously, `_open_url` passed the
raw URL straight to `xdg-open`, which does not expand `~` or environment
variables. The result was confusing failures even though the file
existed. A separate consideration was URL-encoded characters in `file://`
paths (e.g., `%20` for spaces).

A symmetric design question was whether to normalize at write time
(store-expanded) or read time (store-as-typed, expand-on-open). The two
have different trade-offs:

1. **Store-expanded.** The DB always holds canonical absolute paths.
   Reads are cheap and obvious. But the user's intent is lost on display
   — they typed `~/...`, the panel shows `/home/them/...`.
2. **Store-as-typed.** Display preserves user intent. Open performs the
   expansion. Slightly more code at the call site, but only one site
   needs it (`/sources/{id}/open`).

**Decision:** Store-as-typed; expand on open via a helper
`_normalize_file_url(url)` in `backend/app/api/v1/sources.py`:

1. If scheme is not `file`, pass through unchanged.
2. Otherwise, `urlparse` the URL, `unquote` the path (decoding percent
   escapes), apply `os.path.expanduser` then `os.path.expandvars`, and
   `urlunparse` back to `file://...`.
3. `file://~/foo` (where `~` lands in `netloc`) is handled as a
   special case by prepending netloc to path before expansion.

`$HOME` resolves to the server process's `HOME` env var (single-user
local-first tool — this is fine; called out in the consequences).

**Rationale:**
- Preserves the user's typing on display, which matches expectations.
- One normalization point — the open endpoint — keeps changes contained.
- Tests can drive the helper directly via `monkeypatch.setenv("HOME", ...)`.

**Consequences:**
- The DB may contain non-canonical paths (`~/...`, `$HOME/...`). Code
  that wants the absolute filesystem path must call `_normalize_file_url`.
- Cross-user paths (`~someuser/...`) work because `expanduser` handles
  them — but only if the server process has access to that user's home.
- The duplicate-URL warning on the create form (frontend) does
  case-insensitive raw-string comparison; users who paste the same path
  in two different forms (`~/x.pdf` vs `$HOME/x.pdf`) won't get a
  warning. Acceptable — the warning is best-effort.

**Note on ADR-024:** The open endpoint now returns
`{"opened": url, "warning": "<stderr>"}` when xdg-open emits stderr,
instead of swallowing stderr into log-only. HTTP status remains 200 in
all post-launch outcomes (ADR-024's central intent — fire-and-forget — is
preserved). Stderr is still logged for server-side observability. This
is a strict superset of the ADR-024 contract: existing clients that read
only `opened` continue to work; new clients can surface the warning.

**2026-05-14 amendment — bare paths, existence check, exit codes:** Users
were typing source URLs like `~/notes/foo.md` or `/home/matt/foo.md` with
no `file://` scheme. The original `_normalize_file_url` only acted on
`file://` URLs, so bare paths were passed verbatim to xdg-open. Tilde
forms failed silently (xdg-open does not shell-expand), and missing
files produced no stderr — the user saw nothing.

Three additions:

1. `_normalize_file_url` now coerces a bare string starting with `/`,
   `~`, or `$` into a `file:///abs/path` URL after `expanduser` /
   `expandvars`. Strings that don't look like paths (e.g. `example.com`,
   `git@host:repo.git`) pass through unchanged so we don't break opaque
   identifiers.
2. The route validates `os.path.exists(parsed.path)` for `file://`
   targets and returns **HTTP 404** with `File not found: <path>` when
   the file is missing. This is a behavior change: previously the call
   would return 200 with no warning. The 404 gives the user immediate,
   actionable feedback.
3. `_open_url` now treats a non-zero exit code from xdg-open as a
   warning even when stderr is empty (e.g., `"xdg-open exited with code
   4"`). It also passes `start_new_session=True` so a `uvicorn --reload`
   restart cannot kill the GUI app xdg-open just spawned.

The frontend SourcePanel on `/nodes/[id]` was also updated to display
warnings (it previously only handled errors), bringing it in line with
the `/sources` modal.

---

## ADR-048 — Home page dashboard: stats-only, no AI thematic analysis

**Status:** Accepted

**Context:** The placeholder home page ("Press Ctrl+K…") was an empty
shell. The 2026-05-10 testing note proposed two directions: "basic
graph stats" or "some llm thematic analysis option as well."

Thematic analysis would require a new RAG endpoint, latency on home
page load, and an opinion about what "themes" means before any real use
has revealed which framing matters. The testing notes elsewhere
(`Deferred Features Tracker`) explicitly note for processing modes:
"Wait for real use to reveal which modes are actually needed. Don't
design speculatively." That same logic applies here.

**Decision:** Replace the home page with a stats-only dashboard.
Backed by `GET /admin/stats` returning a new `CorpusStats` model:
counts per node type, total edges, sources, tags, inbox size,
`last_processed_at`. Fetched once on mount; no polling. Tiles link to
the relevant list views (`/notes?type=`, `/graph`, `/sources`,
`/inbox`).

The endpoint lives on the `admin` router alongside `/admin/status` but
as a separate path because the two return different shapes for
different audiences (`/status` = ops health; `/stats` = corpus
snapshot).

**Rationale:**
- Zero AI cost on home page load. Renders instantly.
- Tiles double as nav — the inbox tile turns amber when non-zero, which
  is a useful gentle signal to "go process some notes."
- Future thematic analysis can land as a separate `/admin/themes`
  endpoint and a new section on the dashboard; this ADR doesn't
  preclude it.

**Consequences:**
- Counts come from cheap aggregate queries (`GROUP BY type`, `COUNT(*)`).
  No new indexes needed.
- The `count_by_type`, `count_inbox`, `last_processed_at` helpers live in
  `node_repo`. `edge_repo.count`, `source_repo.count`, `tag_repo.count`
  are simple `COUNT(*)` wrappers. Routes stay thin.

---

## ADR-049 — AI-classified bridges: on-demand, per-pair, NO_CONNECTION as a first-class result

**Status:** Accepted

**Context:** The `/discover` Bridges tab surfaces pairs of notes with high
embedding similarity but no edge — pure cosine-equivalent retrieval, no
LLM. Two limitations of that signal showed up once the corpus had real
breadth (per the lyrics-workflow exercise of 2026-05-14):

1. Some pairs are surface coincidences — notes that share vocabulary or
   domain but no real conceptual link.
2. Even genuine pairs require the user to manually pick an edge type
   from a seven-option vocabulary and decide on direction, which slows
   the per-bridge triage loop.

A natural fix: pass each pair through Claude with the typed edge
vocabulary and ask for a recommended type + direction + rationale, plus
an option to reject the pair as coincidence. The design questions were
(a) when to fire the call, (b) where the prompt lives, (c) how to model
"no real link" cleanly.

**Decision:**

1. **Per-pair on-demand classification, not batch.** A new endpoint
   `POST /discover/bridges/classify` takes `{node_a_id, node_b_id}` and
   returns a `BridgeClassification`. The frontend exposes it as an
   explicit "Ask Claude to classify this pair" button inside the bridge
   slide-out; the bridge list itself stays unclassified.
2. **Prompt skeleton reused from `_SUGGEST_LINKS_SYSTEM`.** The
   classifier prompt (`_CLASSIFY_BRIDGE_SYSTEM` in
   `app/services/discover_service.py`) reuses the same edge-type
   vocabulary block, with a different framing: two notes, one edge,
   plus an explicit `NO_CONNECTION` escape and a direction requirement
   (which `from_id`/`to_id`).
3. **`NO_CONNECTION` is a first-class result.** `BridgeClassification`
   exposes `no_connection: bool`; when true,
   `edge_type`/`from_id`/`to_id` are null. The UI renders this as an
   amber banner ("Claude doesn't see a meaningful link") with the
   rationale, not as an error.
4. **Hallucinated IDs rejected at parse time.** `_parse_classification`
   takes an `allowed_ids: set[str]` (the two node IDs the user
   supplied) and rejects any `from_id`/`to_id` outside that set, plus
   self-loops. Unparseable output raises `ValueError`, which the route
   translates to HTTP 500 — consistent with `/rag/suggest-links` and
   `/rag/suggest-permanent`.
5. **Frontend applies the suggestion via a separate "Apply" click.**
   The classifier does not auto-fill the edge form. A dedicated "Apply
   suggestion" button copies the recommended `edge_type`, direction
   (from/to), and rationale (as the edge note) into the existing
   `EdgeForm`. The user can still edit each field before submission. A
   `prefillKey` timestamp scopes `EdgeForm`'s `useEffect` so re-renders
   that don't change the suggestion don't clobber the user's
   in-progress edits.

**Rationale:**

- **On-demand over batch.** Pre-classifying all 30 bridges on every
  list refresh would cost ~30 LLM calls each time the user opens the
  tab. Aligned with the rate-conscious posture of
  [ADR-044](#adr-044--retriable-vs-terminal-embedding-errors): the
  classifier is opt-in, paid for only when the user is actually
  triaging a specific pair. A future "auto-classify all" toggle is a
  pure addition; the on-demand path is the right default.
- **Same prompt skeleton.** The edge-type vocabulary already shipped
  once in `_SUGGEST_LINKS_SYSTEM` and changes there would need to
  propagate anyway. The bridge prompt is its own string constant
  rather than a shared helper because the framing ("two notes" vs
  "source + N candidates") differs enough that a shared abstraction
  would obscure the difference more than it would save.
- **NO_CONNECTION as a result, not an error.** A "this is a
  coincidence" verdict is information the user wants — it justifies
  dismissing the pair without creating an edge. Treating it as an
  HTTP error would force the frontend into special-case handling for
  the not-error case, and would lose Claude's rationale (which is the
  most useful part of a rejection).
- **ID validation guards against hallucination.** Voyage-similar
  pairs can be very close in embedding space; the `allowed_ids` check
  is cheap insurance against the model returning an ID it inferred
  rather than echoed.
- **Manual "Apply" button.** Auto-applying would surprise the user
  when their selected edge type or note text gets wiped. The two-step
  flow (classify → review banner → apply) keeps the user in control;
  the banner alone is often enough information without applying.

**Consequences:**

- Each bridge classification is a small Claude call (~512 tokens
  out). At default settings (30 bridges per refresh, classify on
  click), per-session cost remains in single-digit-cents range for a
  personal user.
- The classifier endpoint uses the same generation provider as the
  rest of the app via `GenProvider` dependency injection — no
  separate model selection. If `generation_model` is later set to a
  faster/cheaper model just for classification, that would be a
  config-level change ([ADR-011](#adr-011--provider-switch-is-a-deliberate-setting-not-a-hot-toggle))
  with no code impact.
- `BridgeClassification` is a separate model from `LinkSuggestion`
  even though both are AI edge-type recommendations. The shapes
  diverge meaningfully (suggest-links returns N suggestions vs. one
  classification, and only the classifier has `no_connection`).
  Merging them would require optional fields on both sides; the cost
  of the duplication is small.
- Edge direction in the response: for the symmetric `ANALOGOUS_TO`
  type, the model's choice of `from_id`/`to_id` is arbitrary. The
  prompt explicitly tells it to pick either. The user can still flip
  the direction by editing the form before submission, or by
  ignoring the "Apply" button entirely.
- A future feature could pre-classify bridges in batch (e.g., a
  "classify all visible" button at the top of the tab). The per-pair
  endpoint composes into that without refactoring — a `Promise.all`
  at the call site.

---

## ADR-050 — Mobile capture via Tailscale + iOS Shortcuts

**Status:** Accepted

**Context:** Every capture surface up to this point — the `Ctrl+K`
browser dialog, the `Shift+Ctrl+K` intentional capture, the `con` CLI,
`con import` — requires being at the laptop. Thoughts that arrive
while walking, driving, reading on the phone, or otherwise away from
the desk had no path into Constellation. They ended up in a separate
inbox (the iOS Notes app, paper, lossy memory) and rarely made it
back, which breaks both the daily-capture habit and the graph: a note
that never lands in the system can't be linked, can't be searched,
can't contribute to RAG answers.

The constraint set on the solution:

1. Notes captured on mobile must land in the same inbox as desktop
   captures and go through the same embedding pipeline. A second
   inbox would just relocate the triage problem.
2. No new cloud dependencies. Constellation is local-first by design;
   adding a Supabase, Firestore, or similar staging layer would
   contradict that and introduce a new failure mode and a new auth
   surface.
3. No new auth layer in the backend. The system is single-user and
   has no auth today; adding one just for mobile would be
   disproportionate.
4. The existing `POST /api/v1/nodes/fleeting` endpoint is already the
   right interface — it accepts title + content and returns a 201.
   Anything that can speak HTTP can capture.

**Decision:**

1. **Tailscale + iOS Shortcuts as the mobile capture layer.** The
   phone and the laptop join a private Tailscale mesh. iOS Shortcuts
   POST directly to `http://<laptop-tailscale-ip>:8000/api/v1/nodes/fleeting`.
2. **The only backend change is binding uvicorn to `0.0.0.0`** instead
   of `127.0.0.1`, applied in `backend/constellation.service`. No new
   routes, no auth middleware, no schema changes.
3. **Three Shortcuts cover the use cases naturally:** "Capture Note"
   (manual two-prompt, Siri phrase), "Capture from Text" (Share
   Sheet, first-line title extraction, optional reaction), "Capture
   Idea" (Dictate Text only, Siri phrase, hands-free). Each starts
   with a `Text` action holding the Tailscale base URL stored into a
   `TailscaleBase` variable, so an IP change is one edit per
   Shortcut.
4. **No offline queue.** If the laptop is asleep or off the network,
   the Shortcut surfaces a visible failure rather than buffering
   locally on the phone. Mitigation lives outside Constellation:
   `pmset -b sleep 0`, `caffeinate -i`, or a launchd agent.

**Alternatives considered:**

- **Email-to-inbox.** Run an IMAP poller or SMTP receiver that turns
  inbound mail into fleeting notes. Pros: works while the laptop is
  asleep (the mail server stages it). Cons: a new daemon, a new
  attack surface, an auth/spam problem, and a new failure mode
  decoupled from the rest of the system.
- **Cloud staging table (Supabase / Firestore / etc.).** Phone writes
  to a serverless table; the laptop polls. Pros: works offline on the
  laptop side. Cons: a new cloud dependency, a new schema, sync
  edge-cases, and an auth surface — explicit violation of the
  local-first posture in `architecture.md`.
- **iCloud Drive file watcher.** Phone writes a file to a synced
  folder; the laptop has a `watchdog` process that picks it up and
  POSTs. Pros: zero new infra. Cons: iCloud sync latency is minutes
  in practice, the user gets no feedback on whether the note made
  it, and a synced-folder race condition is its own bug surface.
- **SMS gateway via Twilio.** Inbound SMS → webhook on the laptop →
  fleeting note. Pros: works without Tailscale. Cons: paid service,
  external dependency, awkward content modeling (length limits,
  multimedia), and the auth/webhook story is non-trivial.

**Rationale:**

- **Zero new infrastructure or cloud dependencies.** Mobile capture
  reuses the existing API, the existing embedding pipeline, the
  existing inbox. The only new thing on the laptop is a `0.0.0.0`
  bind. Aligned with the local-first decision in
  [ADR-001](#adr-001--sqlite-not-postgres) and the
  no-new-cloud-dependencies posture across the project.
- **Tailscale is the access control layer.** The mesh network is
  private; only authenticated devices in the Tailscale tailnet can
  reach the `0.0.0.0:8000` endpoint. This is the right place to
  enforce access for a single-user tool — moving it into the app
  layer (Bearer tokens, etc.) would duplicate what Tailscale already
  does well.
- **Three Shortcuts, not one.** The capture *moment* differs across
  contexts. Typing a thought, reacting to selected text, and
  capturing while driving have different ergonomics; a single
  Shortcut trying to handle all three would either overprompt the
  voice case or underspecify the share-sheet case. The cost of
  building three is small (~10 actions each); the ergonomic win is
  large.
- **Failure is visible.** The Shortcut surfaces a notification on
  non-201 responses. The user knows immediately that the laptop
  isn't reachable, so they can fall back to the iOS Notes app and
  paste it in later rather than discovering a silent loss after the
  fact.
- **Same endpoint, same pipeline.** A fleeting note captured from
  the phone is indistinguishable from one captured via `con` or
  `Ctrl+K`. The inbox triage flow, the AI-assisted decomposition,
  the embedding-on-write — none of it knows or cares which surface
  produced the note. That's the right level of coupling.

**Consequences:**

- **Laptop must be awake and on the network.** macOS sleep prevention
  (`pmset`, `caffeinate`, or a launchd agent) becomes part of the
  user setup. The mobile-capture doc explains the tradeoffs of each
  approach; the project does not prescribe one.
- **Tailscale must be active on both devices.** A new user
  prerequisite. Tailscale itself is free at this scale.
- **No tag assignment from mobile.** `POST /api/v1/nodes/fleeting`
  doesn't accept tags by design (fleeting notes are raw input); tag
  assignment happens during inbox processing on the desktop, same as
  every other fleeting-note path. This is a deliberate symmetry, not
  a gap.
- **Base URL is duplicated across the three Shortcuts.** Each
  Shortcut holds the Tailscale base URL in its own `TailscaleBase`
  variable. If the IP changes (rare — Tailscale IPs are stable
  across reboots and re-registration is uncommon), the user edits
  three Text actions. An iCloud Sharing-folder-shared-Shortcut
  approach was considered for a single source of truth, but the
  added build complexity wasn't justified for an IP that changes
  on the order of years.
- **`--host 0.0.0.0` is safe only because Tailscale is the boundary.**
  This is documented in `docs-site/user-guide/mobile-capture.md` and
  the `README.md` systemd note. If Constellation is ever run on a
  publicly addressable host, the bind must revert to `127.0.0.1` and
  an auth layer must precede mobile capture — a future-ADR concern,
  not a v1 one.
- **No PWA, no native mobile app, no mobile inbox view.** Inbox
  triage on mobile (swipe-to-discard, lightweight read view) is a
  valid follow-on, and the same Tailscale-reachable backend supports
  it without further changes. It is deliberately not in scope for
  this ADR.

---

## ADR-051 — Saved syntheses use `CITES`, not `COLLECTS` (supersedes ADR-036)

**Status:** Accepted (supersedes [ADR-036](#adr-036--saved-syntheses-link-to-sources-via-collects))

**Context:** [ADR-036](#adr-036--saved-syntheses-link-to-sources-via-collects)
chose `COLLECTS` for the auto-edges created by `POST /rag/save-answer`
(`backend/app/api/v1/rag.py:268-279`), reasoning that "a synthesis IS a
collection by construction." The walkthrough of 2026-05-14 (Sc 4,
finding #12) and the consolidated cross-cutting findings (2026-05-15)
revisited this and surfaced two problems:

1. Filtering the graph by `COLLECTS` mixes structure-note collections
   (user-curated MOCs) with synthesis-note collections (AI-generated
   answer provenance). ADR-036 acknowledged this as "acceptable" but
   graph-as-maintenance-tool work (Sc 7) shows the conflation is
   costly when the same filter is used to find orphan MOCs.
2. `CITES` more accurately names the semantic relationship: a synthesis
   cites its sources rather than collecting them; the auto-edge is
   closer to a footnote than a curated inclusion.

**Decision:** `POST /rag/save-answer` writes `CITES` edges from the
synthesis note to each cited source. `CITES` is added to the EdgeType
enum (Python `Literal` in `backend/app/models/edge.py`, SQL CHECK
constraint via migration `0004_expanded_edge_types.sql` — shared with
[ADR-052](#adr-052--expanded-edgetype-vocabulary-literature-stance)).

**Rationale:**

- **Semantic precision.** A synthesis note's relationship to its sources
  is "cites" — it references them for support, not "collects" them as a
  curated set. The distinction matters when both kinds of edges coexist
  in the graph.
- **Filter cleanliness.** Graph queries for `COLLECTS` now reliably
  return MOC-style structure-note collections; queries for `CITES`
  return synthesis provenance. The two readings stay separate.
- **Frontend already half-aware.** `frontend/src/app/graph/filterGraph.ts`
  and `frontend/src/app/graph/colors.ts` already reference `CITES`
  because the graph-data endpoint uses it as a virtual edge type for
  source → literature relationships (per
  [ADR-034](#adr-034--virtual-source-nodes-in-the-graph-visualization)).
  Adopting `CITES` as a real edge type aligns the model with what the
  graph viz was already implying.
- **Migration cost amortized with ADR-052.** `CITES` and the five
  literature-stance verbs (`BUILDS_ON`, `APPLIES_TO`, `MEASURES`,
  `EXTENDS`, `REFINES`) share migration `0004`. The SQLite CHECK-constraint
  update is one table-recreate operation rather than two.

**Consequences:**

- Existing `COLLECTS` edges created by past `save-answer` calls remain
  `COLLECTS`. A one-time backfill migration could rewrite them, but at
  personal-tool scale (~20 such edges expected per quarter) the
  backfill cost outweighs the consistency benefit. The decision is to
  leave history alone; new syntheses use `CITES` going forward. Graph
  filters that want both reads can union the two types.
- `CITES` is now a first-class EdgeType in the backend, not just a
  virtual graph-viz label. Any future code that consumes `EdgeType`
  (e.g., edge-type chip metadata in `frontend/src/lib/edgeTypes.ts`)
  must include `CITES`.
- Suggest-links and bridge-classifier prompts (`_SUGGEST_LINKS_SYSTEM`
  in `rag.py`, `_CLASSIFY_BRIDGE_SYSTEM` in `discover_service.py`) gain
  `CITES` as an option. The prompts need to teach the model when to
  pick `CITES` vs. `COLLECTS` vs. `SUPPORTS`; the difference is
  intentional but subtle (citation = specific reference, collection =
  curated bundle, support = evidential).

---

## ADR-052 — Expanded EdgeType vocabulary (literature stance)

**Status:** Accepted (extended by Slice 4 narrative work — see "Slice 4
addendum" at the bottom of this ADR for the `EXPLAINS` addition)

**Context:** The walkthrough's finding #11 (2026-05-14, sharpened across
Sc 4, Sc 9, Sc 12) names the EdgeType vocabulary as one-dimensional: it
covers author-stance verbs (`SUPPORTS`, `CONTRADICTS`, `QUESTIONS`,
`ANALOGOUS_TO`, `ELABORATES`, `INSPIRED_BY`) plus the structural verb
`COLLECTS`, but misses literature-stance verbs that describe how a note
BUILDS on, APPLIES, or MEASURES the ideas in another note. The gap
shows up most in literature-review workflows (Sc 4): the natural verb
for "this Razavi note builds on Gardner's earlier work" is `BUILDS_ON`,
not `SUPPORTS`.

The walkthrough also names evolution-stance verbs (`SUPERSEDED_BY`,
`SCOPED_TO`, `REGIME_OF`, `RESOLVES`) as missing. Those are the subject
of a separate decision (D1, scheduled for Phase 8.3 — see
`docs/ux-build-plan.md`); they are gated on the resolved-edge state
work and don't ship in Bucket A.

**Decision:** Add five literature-stance verbs to the EdgeType enum:

- `BUILDS_ON` — A → B: A advances or extends B's framework.
- `APPLIES_TO` — A → B: A applies B's idea to a new domain or instance.
- `MEASURES` — A → B: A is an empirical measurement of B's claim or
  quantity.
- `EXTENDS` — A → B: A adds scope or generality to B (less commonly
  used than `BUILDS_ON`; useful when the extension is dimension-ward
  rather than depth-ward).
- `REFINES` — A → B: A sharpens or specializes B without contradicting
  it.

These ship together with `CITES`
([ADR-051](#adr-051--saved-syntheses-use-cites-not-collects-supersedes-adr-036))
in migration `0004_expanded_edge_types.sql`. The frontend `edgeTypes.ts`
module gains color + label + description metadata for each.

**Rationale:**

- **Cover the literature-review use case.** Sc 4's PLL sprint surfaced
  ~20 edges where neither `SUPPORTS` nor `ELABORATES` was quite right;
  `BUILDS_ON` or `APPLIES_TO` would have fit. A vocabulary gap that
  misroutes 20+ edges in a single domain is worth a schema add.
- **Five verbs, not three or seven.** Pilot-tested against Sc 4's PLL
  notes: `BUILDS_ON` and `APPLIES_TO` cover the bulk; `MEASURES` is
  rare but specific; `EXTENDS` and `REFINES` cover the residual cases.
  Fewer than five leaves common gaps; more than five becomes a
  vocabulary the user has to memorize.
- **Same migration as `CITES`.** SQLite CHECK constraint changes
  require table-recreate; doing it once for six new edge types is
  sixfold cheaper than six separate migrations. This is the first such
  migration in the project; Phase 8.3 will reuse the pattern for
  evolution verbs and resolved-edge state.
- **Defer evolution verbs to Phase 8.** They're meaningless without
  resolved-edge state and edge-aware retrieval. The walkthrough
  explicitly notes (calibration §7) that shipping evolution verbs
  alone is decorative. Phase 8.3 ships them with backing infrastructure.

**Consequences:**

- The `_SUGGEST_LINKS_SYSTEM` prompt (`rag.py:83-103`) and
  `_CLASSIFY_BRIDGE_SYSTEM` prompt (`discover_service.py`) must be
  updated to teach the model about the five new types. Prompt
  expansion grows by ~5 lines.
- Frontend `edgeTypes.ts` must include color + label + description for
  each. The visual vocabulary on graph viz gains five colors (aim for
  a coherent "literature" palette — earth tones — distinct from the
  author-stance palette).
- `EdgeForm`'s type picker grows from 7 options to 13 (the six new
  types plus the existing seven). Once evolution verbs land in Phase
  8.3 it grows to 17. Consider grouping in the picker UI (author-stance
  / literature-stance / evolution-stance / structural).
- Existing edges are unaffected. Migration only adds permitted values
  to the CHECK constraint; no data backfill.
- AI suggest-links and AI bridge-classifier outputs will start
  surfacing the new types once the prompts are updated. The bridge
  classifier ([ADR-049](#adr-049--ai-classified-bridges-on-demand-per-pair-no_connection-as-a-first-class-result))
  returns `NO_CONNECTION` for pairs where no type fits — this remains
  a first-class result; the broader vocabulary doesn't force a type
  onto every pair.

### Slice 4 addendum — `EXPLAINS` edge type (2026-05-19)

Phase 9 Slice 4 adds one more edge type:

- `EXPLAINS` — A → B: A (typically a lore note) explains a property,
  history, or backdrop of B (typically a character, location, or
  event).

The narrative-mode use case is the one that earns its place: a lore
note ("the underground started as a grief support network") connects
via `EXPLAINS` to a location node (a basement bar) and via `EXPLAINS`
to a character node (a regular at that bar). Scene Context View
(Slice 5) walks `EXPLAINS` edges from a scene's characters and
locations to surface relevant lore automatically.

`EXPLAINS` does not fit any of the existing types: it's not author-
stance (`ELABORATES` zooms in on the same idea, while `EXPLAINS`
provides causal/contextual backdrop), not literature-stance, not
evolution, not structural. It is genuinely a new shape.

**The CHECK constraint is updated via `0010_narrative_timeline.sql`**,
which already pays the table-recreate ceremony for `EXPLAINS` alongside
the narrative-timeline schema additions. The full set of edge types
after this migration:

`SUPPORTS`, `CONTRADICTS`, `ELABORATES`, `ANALOGOUS_TO`, `QUESTIONS`,
`INSPIRED_BY`, `COLLECTS`, `CITES`, `BUILDS_ON`, `APPLIES_TO`,
`MEASURES`, `EXTENDS`, `REFINES`, `SUPERSEDED_BY`, `SCOPED_TO`,
`REGIME_OF`, `FOLLOWS_FROM`, **`EXPLAINS`**.

This addendum is recorded under ADR-052 (rather than as a new ADR)
because the structural decision — "add a verb when no existing one
fits" — is the same decision ADR-052 made; this is a narrative-
specific extension of the same vocabulary policy, not a new policy.

---

## ADR-053 — Ask supports `mode={default,brief,critic}`

**Status:** Accepted; shipped 2026-05-15 (A9 + A10 in the same PR).

**Context:** The walkthrough's Sc 12 (advocacy queries) and finding #30
surfaced that `POST /rag/query` has a fixed system prompt instructing
balanced summary with explicit "don't speculate" framing
(`rag_service.py:17-26`). When the user explicitly wants a one-sided
brief — "argue the case for X" — the prompt resists the instruction
and continues introducing counterarguments. Sc 12's Path 1 verified
this: explicit "don't be balanced; argue this position" instructions
in the query body are partially honored by the model but the system
prompt dominates.

A simple fix: branch the system prompt based on a request-level `mode`
flag.

**Decision:** Add an optional
`mode: Literal["default", "brief", "critic"] | None = None` field to
`RagRequest`. `rag_service.query()` dispatches the system prompt via
`_system_prompt_for(mode)`:

- `default` (or `None`) → existing balanced prompt.
- `brief` → advocacy-mode prompt: "The user has explicitly asked for a
  one-sided brief in support of their position. Do not introduce
  counterarguments unless the user asks. Cite notes inline as [Note N].
  Be concise and committed."
- `critic` → "You are a careful, skeptical reader of the user's
  zettelkasten. Enumerate the specific questions a careful reader would
  ask about the input. Numbered list, 3 to 6 items, each specific to
  the input (claim, definition, assumption, scope)."

UI: `/ask` page gains a segmented control (`Balanced` / `Brief` /
`Critic`) defaulting to "default." A10 ships a `CriticPanel` on
`/nodes/[id]` that fires `mode=critic` with the note's title + content
as the query, rendering the reader-questions list inline next to
SuggestLinksPanel.

**Rationale:**

- **Smallest viable surface for advocacy.** Sc 12 showed that user
  instructions in the query body get partially overridden by the
  system prompt. A request-level flag is the right place to make the
  prompt swap; it's a contract, not a hint.
- **Doesn't break existing behavior.** Default mode is unchanged. The
  flag is opt-in; existing API consumers see no change.
- **Composable with Phase 8.** Phase 8 will likely add more retrieval
  modes (scoped, edge-aware). Standardizing on a `mode` enum now keeps
  that axis clean.
- **Critic mode (A10) reuses the pattern.** A future `mode="critic"`
  for "what reader questions does this provoke?" follows the same
  shape. Building the mode-selector UI once amortizes across A9 and A10.

**Consequences:**

- The brief-mode prompt may produce overconfident output if the corpus
  is thin. Mitigation: B5's negative-finding framing applies regardless
  of mode; brief mode still hedges when retrieval confidence is low.
  The hedge becomes "Your notes don't directly cover X; here is the
  case for your position based on the closest related notes…"
- If Phase 8 introduces edge-aware prompts, the brief-mode prompt may
  need to be re-derived (e.g., should brief mode still elevate
  CONTRADICTS-linked neighbors? Probably no — that's the whole point
  of brief mode). The Phase 8 ADR (ADR-058) will revisit this.
- `mode` becomes part of the saved-answer metadata. Future feature: a
  brief-mode flag on the saved synthesis so a reader can tell "this
  was generated as an argument, not a summary."
- Critic mode (A10) shipped in the same PR as A9. The request-model,
  selector, default+brief prompts, and the critic prompt + per-note
  panel all landed together; no follow-up ADR is required.

---

## ADR-054 — "Recent activity" windowing semantics

**Status:** Accepted; shipped 2026-05-15 (Bucket B — B1).

**Context:** B1 puts three "recently …" sections on Home — captured,
edited, edges created. The question is which time window to use. Three
options surfaced during planning:

1. Rolling N-day window (e.g., "last 7 days").
2. Since-last-visit tracking (per-session state).
3. Calendar week / day (e.g., "this week, starting Monday").

Option 2 requires either client-side storage (localStorage), a
server-side last_visit_at column, or both. Option 3 has unintuitive
behavior near boundaries — Monday morning shows an empty list because
the new week just started.

**Decision:** Rolling N-day window. Default 7 days, configurable via a
`?days=N` query param on the activity endpoint (clamped to 1–90).
**No last-visit tracking.**

API shape: a single `GET /activity?days=N` endpoint returns
`{captured, edited, edges}` — Home wants all three at once, so a single
roundtrip is cheaper than three. Each list is capped at 10 items
(hardcoded; this is a "what have I been up to?" hint, not a paginated
feed).

Section semantics:

- **captured** — fleeting notes with `created_at` in window, ordered
  by `created_at DESC`. Regardless of `processed_at` (a processed
  fleeting still represents recent capture activity).
- **edited** — non-fleeting notes with `updated_at` in window **and**
  `updated_at > created_at` (i.e., touched after birth — excludes
  newly-processed permanent notes whose `updated_at == created_at`).
- **edges** — edges with `created_at` in window. Returned as
  `RecentEdge { id, type, created_at, from_node: NodeRef, to_node:
  NodeRef }` so the frontend can render "A → ELABORATES → B" without
  N extra lookups.

All three exclude soft-deleted nodes (`deleted_at IS NOT NULL`).

**Rationale:**

- **Stateless beats stateful.** Single-user app, daily-revisit pattern.
  "Last 7 days" maps to user intuition without any session/cookie/DB
  machinery. Adding state would require migrations, a settings UI, or
  cookie management — all cost, no commensurate UX win.
- **One endpoint, not three.** The frontend wants the whole picture at
  once; the three queries share the window parameter and are cheap
  individually. Splitting would buy nothing.
- **Excluding born-not-edited from "edited".** A user processes their
  inbox and 6 new permanent notes appear. Without the
  `updated_at > created_at` filter, all 6 land in "Edited", which is
  misleading — they weren't edited, they were born. The
  `updated_at > created_at` strict-inequality test is robust because
  `_create_node` writes the same timestamp to both fields, and `update`
  only writes `updated_at`. Lex-sort on ISO 8601 strings agrees with
  chronological order.
- **`days` cap of 90.** Past that the activity feed stops being
  "recent" and becomes "everything"; the Notes/Graph pages handle
  full browsing. Cap prevents accidental full-corpus scans.

**Consequences:**

- The user can't see "what changed since I last looked" — only "what
  changed in the last 7 days." If a session-aware diff turns out to be
  important, a follow-up ADR adds last_visit tracking; until then,
  YAGNI.
- The 10-item cap means very active days truncate. Acceptable for a
  Home hint; a future "see all" link could route to a filtered Notes
  page (B2's schema filters will support this naturally).
- The `updated_at > created_at` filter on "edited" means a newly-born
  permanent note doesn't show up there until the user actually edits
  it. That's correct semantically but may surprise users wondering
  where their just-processed notes went. They appear in `captured`
  (via the fleeting parent) until it's discarded, and in `/notes`
  immediately — the Home "edited" section is for actual edits.
- The `days` query param is opt-in; the default value lives only on
  the server and the frontend. If a future client wants a different
  default, they pass `?days=N` — no breaking change.

---

## ADR-055 — Notes-filter API contract

**Status:** Accepted; shipped 2026-05-15 (Bucket B — B2).

**Context:** B2 puts schema-level filter chips on `/notes` — "no
summary," "no outgoing edges," "no edges either," "summary length < N."
The filters need to compose with the existing `type` param (and, in
the future, `tag` / age windows). Two questions to settle:

1. **Where do the new predicates live?** Add to the existing
   `GET /api/v1/nodes` route, or introduce a richer `/nodes/search`
   endpoint?
2. **How do filters compose?** AND vs OR within a category; AND vs OR
   across categories.

**Decision:**

- **Filters are optional query params on `GET /api/v1/nodes`.** This
  round adds `no_summary`, `no_outgoing`, `no_edges`, and
  `summary_max_length`. Each is independently nullable; absent params
  preserve the current behaviour. No new endpoint.
- **Composition is AND across all predicates** (including the existing
  `type` filter). Adding a chip narrows the result set; never widens
  it. There is no "OR" mode in this contract — if users want union
  semantics in the future, that becomes a separate ADR.
- **The list is parameterised SQL with conditional `WHERE` clauses.**
  Each filter appends one clause and zero-or-one bound parameter. The
  query stays one `SELECT` against `nodes` with subqueries for the
  edge predicates; no joins.
- **`summary_max_length` matches non-null short summaries only.**
  Notes with `summary IS NULL` are not pulled in by this predicate;
  the user requests those explicitly via `no_summary=true`. Combining
  both flags is supported (and produces "null OR shorter than N").
- **`no_edges` is strictly stronger than `no_outgoing`.** Specifying
  both is redundant but legal — the AND-composition collapses to
  `no_edges` semantically.

The Pydantic model `NodeListFilters` lives in the route module (not
exposed via a request body — these are query params); the repo
function takes the same fields as keyword args.

**Rationale:**

- **AND across categories matches user intuition.** Chips are funnel
  controls. The user picking "no summary" + "no edges" expects "notes
  that are both — i.e. abandoned." A union would surface "notes that
  are one or the other," which is a different, less common ask.
- **No new endpoint.** `/api/v1/nodes` already returns paginated
  `NodeSummary`; the predicates are additive. A separate
  `/nodes/search` would force the frontend to choose at call time and
  duplicate the pagination contract.
- **Predicates are explicit boolean flags rather than a single string
  query.** A query DSL (e.g., `?filter=no_summary,no_edges`) saves a
  few URL bytes but loses type safety and introspectability via
  OpenAPI. Each flag generates a clean parameter in the spec.
- **Subqueries, not joins.** SQLite handles the
  `id NOT IN (SELECT from_id FROM edges …)` shape fine at our scale.
  A LEFT JOIN approach would require GROUP BY or DISTINCT and
  complicates the COUNT(*) for pagination total. Subqueries keep the
  shape simple.
- **No server-side tag filter in this round.** The `/notes` page
  already filters tags client-side after fetching by type; performance
  is fine at single-user corpus size. Adding server-side tag filtering
  would require touching the request shape on a surface that doesn't
  need it yet. **Not** a refusal — it's a future increment when a
  page like Synthesize wants server-side composition.

**Consequences:**

- The filter contract is now part of the public API surface. Adding a
  new predicate is one query param + one WHERE clause + one chip.
  Removing or renaming a predicate is a breaking change (the
  TypeScript types regen would flag it, but external scripts using
  the URL contract would break silently).
- B3's batch-suggest-links endpoint can reuse the same predicates
  for its `node_filter` argument shape — that's the explicit
  next-step composition the sequencing plan called out.
- The `summary_max_length` predicate exposes a concrete bias: notes
  with weak summaries are a finding worth surfacing. If/when a
  better summary-quality signal lands (LLM-rated coherence, etc.),
  the predicate can be deprecated in favour of that signal without
  contract changes — the chip just stops appearing.
- Pagination math (`has_next`) still works because the `total` count
  uses the same WHERE clauses as the page query.

---

## ADR-056 — Triangle-completion ranking semantics

**Status:** Accepted; shipped 2026-05-15 (Bucket B — B4).

**Context:** B4 adds a "Triangles" tab to Discover, surfacing pairs
(A, B) that share two or more graph neighbours but have no direct
edge between them. The ranking question: how do we order candidates?
Three options surfaced during planning:

1. **Pure structural count** — number of shared intermediates.
2. **Similarity-weighted** — combine structural count with vector
   similarity from `vec_nodes`.
3. **Recency-weighted** — bias toward pairs where at least one
   endpoint was recently touched.

Option 2 effectively re-implements the Bridges tab (which is
similarity-only with structural emptiness). Triangles should be the
**structural counterpart** to bridges, not a hybrid.

**Decision:**

- **Primary rank: structural count (descending)** — pairs with more
  shared neighbours rank higher.
- **Tiebreak: max recency across either endpoint (descending)** —
  among pairs with the same intermediate count, prefer the one where
  either A or B was touched more recently. Implemented in SQL via a
  correlated subquery in `ORDER BY`.
- **Default minimum: 2 shared intermediates** — single-neighbour
  triangles produce too much noise; two-plus is the actually
  interesting signal. Configurable per request via
  `min_intermediates`.
- **Fleeting and soft-deleted notes are excluded** from both
  endpoint and intermediate roles. Triangles are a permanent-graph
  feature; inbox notes don't participate.
- **Pairs are canonical (sorted IDs)** so symmetric (A,B)/(B,A) does
  not surface twice.
- **Existing-edge pairs are excluded.** If A↔B already has an edge in
  either direction, we don't surface them as a triangle candidate.
- **Default result cap: 30, with `limit` query param up to 100.**
  Matches the bridges tab cap.

**Rationale:**

- **Structural count is interpretable.** "You've connected this pair
  indirectly through 4 notes" reads as a clear signal of latent
  conceptual proximity. Mixing in similarity or recency makes the
  ranking opaque and harder to debug.
- **Structural counterpart to Bridges.** Bridges surfaces semantic
  proximity without structure. Triangles surfaces structural
  proximity without semantics. Both signals are independent inputs to
  the user's link-creation decision; conflating them via a hybrid
  score collapses the affordance.
- **Recency tiebreak is cheap and matches user intuition.** Among
  equally-strong structural candidates, the user is more likely to
  act on pairs they've been thinking about recently. The signal costs
  nothing — `updated_at` is already indexed via the
  `idx_nodes_updated_at` or computed on the fly at our scale.
- **Min intermediates = 2 not 1.** With single-intermediate triangles
  every loosely-connected note pair appears. Two-plus prunes
  aggressively while preserving the signal users actually want.
- **Why not similarity-weighted?** Reserved for Phase 8 if needed.
  ADR-058 might revisit (e.g., "show me semantically-different pairs
  with high structural connection — i.e., bridges that don't share
  vocabulary"), but that's a different feature, not a tweak to this
  ranking.

**Consequences:**

- The default `min_intermediates=2` may yield empty results on small
  corpora. Frontend renders an empty-state explanation noting the
  threshold and that lowering it (or growing the corpus) widens the
  search.
- The recency tiebreak uses `updated_at` which now reflects only
  user-content edits (post-B1 fix to `embedding_service`). A pair
  containing a newly-processed permanent note ranks no higher than
  one containing an old, unmodified note — that's the intended
  semantic ("recently thought about," not "recently created").
- Adding similarity-weighting later is non-breaking: the request
  model can grow a `weight: Literal["structural", "hybrid"]` field
  with `structural` as default.
- The "intermediates" payload (up to N per pair) is comma-joined via
  `GROUP_CONCAT` in SQL, then resolved to `NodeRef` server-side; the
  full set of intermediates is returned so the UI can render
  "A → [C1, C2, C3] → B" without follow-up queries.

---

## ADR-057 — Low-confidence retrieval threshold for Ask

**Status:** Accepted; shipped 2026-05-15 (Bucket B — B5).

**Context:** Today the default `/ask` system prompt instructs the model
to say "the notes don't contain enough information" when retrieval is
weak — but it relies on the model to recognise weakness from the
provided context. In practice, the model often draws on its own
training rather than admitting the corpus doesn't cover the question,
producing training-grade prose that looks like a personal-knowledge-base
answer but isn't.

The retrieval pipeline knows when seeds are weak: vec0 returns L2
distances which we already convert to cosine similarity in
`discover_service._distance_to_similarity`. We just discard the
numbers in `embedding_service.search_similar`. Plumbing them through
to `rag_service.query` lets the route prepend an explicit hedge when
the top seed's similarity is low, taking the recognition off the
model.

**Decision:**

- **Metric:** max cosine similarity over the top-K (= 10) raw semantic
  seeds returned from the vec0 lookup, derived from
  `1 - distance^2 / 2` and clamped to [0, 1] (the same projection
  bridges already uses).
- **Threshold:** `_LOW_CONFIDENCE_THRESHOLD = 0.55`. Below this the
  retrieval is too weak to honestly anchor an answer; above is "at
  least plausibly relevant."
- **Hedge text:** prepended to the user content as a leading note,
  before the retrieved context. The hedge is data, not system prompt:
  "Note: the knowledge base doesn't directly cover this question;
  here are the closest related notes, but the answer should lead by
  saying so plainly."
- **Mode gating:** the hedge only fires when `mode` is unset or
  `"default"`. `brief` mode already handles "notes don't cover this"
  in its own prompt (ADR-053). `critic` mode operates on the input,
  not the corpus, so the metric is irrelevant.
- **No-seed special case:** when the search returns zero seeds at
  all, the existing "(No relevant notes found in the knowledge
  base.)" sentinel still applies. The hedge is only useful when
  seeds exist but are weak.
- **Threshold is hardcoded, not env-driven.** A future "tune by
  data" pass can revisit; right now we have one user and one
  embedding model.

The plumbing surface is a new
`embedding_service.search_similar_with_distances` helper returning
`list[tuple[str, float]]`. Existing callers of `search_similar` keep
their ID-only contract.

**Rationale:**

- **Move the recognition out of the model.** The system prompt told
  the model "don't speculate if notes are thin," but the model
  underweights that against the natural "be helpful" prior. A
  retrieval-side hedge is a contract, not a hint — like the mode
  flag in ADR-053.
- **0.55, not 0.7.** Bridges uses 0.7 as the "plausibly the same
  concept" threshold for *pairs of notes*. Query-vs-note matches at
  0.5–0.7 are commonly genuine soft-relevance — they shouldn't
  trigger the strong hedge. 0.55 is the lower edge where retrieval
  becomes mostly noise.
- **Prepend to user content, not modify system prompt.** This keeps
  the system prompt a constant and lets the per-request data carry
  the per-request signal. Mode dispatch lives in
  `_system_prompt_for(mode)`; confidence dispatch lives in
  the user content builder. Two orthogonal axes, two orthogonal
  surfaces.
- **Mode gating reflects the existing semantic split.** Brief mode
  already commits to an answer; critic mode doesn't care about
  retrieval strength. Adding a third "low-confidence" mode would
  conflate the response style with the retrieval signal — wrong
  abstraction.

**Consequences:**

- The hedge phrasing is data-tuned: too aggressive and users see
  it on queries they consider well-covered; too soft and the model
  ignores it. The 0.55 threshold and the prepended sentence are
  both reasonable starting points but expected to be revisited
  after live use.
- The metric depends on `embedding_service.search_similar_with_distances`
  returning seeds in distance-ascending order (smallest distance =
  highest similarity), which matches the vec0 contract.
- Phase 8.1 (prompt-side edge semantics) may want to factor the
  same confidence signal into its edge-aware prompt
  ("CONTRADICTS-linked context but low confidence in the seed"
  reads differently). ADR-058 should explicitly reference this
  threshold and consider whether to share it across prompts.
- Voyage and Ollama mxbai-embed-large are both L2-normalized, so
  the projection is correct for both providers. If a future
  provider returns non-normalized vectors, the projection breaks
  silently — fix would be a per-provider similarity mode.

---

## ADR-058 — Edge semantics in RAG context assembly

**Status:** Accepted; shipped 2026-05-15 (Phase 8.1 — prompt-side edge
semantics). Phase 8.2 (retrieval-side) conditionally deferred per the
reactivation criterion below.

**Context:** The UX walkthrough's finding #21 identified that typed edges
are stored on every retrieved note but the RAG pipeline does not use
their semantics — Sc 9 verified that soft-deleting an edge does not
change Ask output. Code inspection
(`backend/app/services/rag_service.py:_build_context`, lines 129–132)
showed edge type *and* the user-authored edge `note` field are already
assembled into the prompt context as a `Connections:` line per note,
formatted `→ TYPE Note N (note)`. The default system prompt at lines
17–26 says nothing about how to interpret these annotations.

Phase 8 was framed as "make typed edges semantically load-bearing in
RAG," with the prototype gate intended to demonstrate that an
edge-aware prompt materially changes Ask output. The gate was run
twice and the framing was revised in between:

- **v0 (heavy rewrite, ~500-word edge-vocabulary rubric)** produced
  output substantively equivalent to the default across all three
  fixtures. The default prompt was already citing edge labels verbatim
  when seen in context — the model reads the `Connections:` line
  without being told to.
- **v1 (minimal-additive, ~5-line block instructing on edge-type
  reasoning shapes)** shows a different, narrower effect: the model
  becomes more disciplined about respecting the user's encoded
  structure rather than inventing parallel structure.

The retrieval-side hypothesis was tested separately by the no-LLM
probe `evals/phase8_prototype/probe_retrieval.py`. On the current
corpus the neighbour-cap (`_MAX_NEIGHBOR_NODES = 12` in
`rag_service.py`) only binds on F1; the dropped neighbours are
dominated by COLLECTS, and every CONTRADICTS/SUPPORTS edge in
retrieved context has endpoint cosine similarity ≥ 0.66 — well above
the 0.6 threshold below which retrieval-side edge ranking would
plausibly help. Retrieval-side is therefore deferred, not cancelled.

**Decision:**

- **Phase 8.1 ships the v1 candidate prompt by promoting it into
  `rag_service._DEFAULT_PROMPT`.** A tight ~5-line block, inserted
  between the opening "You are a zettelkasten assistant…" sentence
  and the rules list, instructs the model on the `Connections:`
  annotations it is already seeing — naming the reasoning shape for
  CONTRADICTS / QUESTIONS, SUPPORTS-family (SUPPORTS / BUILDS_ON /
  EXTENDS / REFINES / APPLIES_TO), ANALOGOUS_TO, and COLLECTS, and
  flagging that the parenthesised edge `note` is the user's own
  rationale and is often more load-bearing than the type alone.
- **Scope is limited to `_DEFAULT_PROMPT` (Ask default mode + the
  Synthesize flow, since `query_scoped` reuses `_SYSTEM_PROMPT` =
  `_DEFAULT_PROMPT`).** Brief and critic modes are intentionally left
  unchanged: brief mode (ADR-053) is one-sided by contract and the
  CONTRADICTS-handling instruction would actively conflict with it;
  critic mode operates on the input, not the retrieved corpus, so
  edge-type reasoning over neighbours is not the primary signal. If
  a future need surfaces, those prompts get their own ADR.
- **Phase 8.2 (retrieval-side edge expansion) is conditionally
  deferred** with a concrete, probe-detectable reactivation criterion
  (see below).

**Phase 8.2 reactivation criterion (concrete):**

> Phase 8.2 reactivates when `evals/phase8_prototype/probe_retrieval.py`
> shows the neighbour cap binding on `CONTRADICTS` or `SUPPORTS` edges
> on **at least two fixtures** where the connected notes have
> **cosine similarity below 0.6** (the same L2-to-cosine projection
> `rag_service._distance_to_similarity` uses).

This is the signal that cross-domain typed-edge relationships exist
whose endpoints are not similarity-discoverable, which is the case
retrieval-side ranking would help. The probe is the standing
diagnostic; re-run it after material corpus growth or after Phase 9's
narrative timeline introduces cross-domain edges between thematic,
character, and event nodes.

**Rationale:**

- **F3 (ANALOGOUS_TO, looper / hands-free timing capture) is the
  primary evidence the gate passes.** The default prompt identified
  *three* "patterns" in the user's looper notes by inventing a third
  pattern (an external clock port) that the user had not encoded as
  analogous to anything. The v1 candidate stayed disciplined to the
  *two* patterns the user actually marked `ANALOGOUS_TO`, named the
  explicit/implicit axis the user had written into the edge note,
  and treated the third hardware-spec note as a coexisting input
  rather than as a parallel pattern. This is the load-bearing
  behavioural claim Phase 8.1 makes: **the edge-aware prompt causes
  the model to respect the user's encoded structure rather than
  inventing its own.** F1 (CONTRADICTS) and F2 (SUPPORTS) corroborate
  more subtly — F1 gains "load-bearing" meta-framing of the encoded
  tension; F2 marginally aggregates SUPPORTS-chain citations.
- **Soft-delete on F1 confirms the edge is doing structural work.**
  With the single CONTRADICTS edge filtered from the edges list, the
  v1 candidate still names the tension (the content makes it
  inferrable), but loses the meta-level framing that referenced the
  user's deliberate authorial choice. The presence or absence of the
  edge label measurably shapes the output.
- **Why "minimal-additive" rather than "heavy rewrite."** v0
  demonstrated that the model already understands edge-type
  semantics — what it lacks is a discipline to defer to the user's
  encoding. A short, targeted instruction does that work; an
  elaborate rubric does not. The Phase 8.1 prompt is roughly 90 words
  longer than the previous default, not 500.
- **Brief and critic intentionally not extended.** ADR-053's
  consequences anticipated that "if Phase 8 introduces edge-aware
  prompts, the brief-mode prompt may need to be re-derived." The
  derivation is: brief mode doesn't want the CONTRADICTS-naming
  behaviour, so the block doesn't fit. Critic mode operates on the
  input rather than the retrieved corpus, so the edge instructions
  apply weakly at best. Keep both modes as-is.
- **Retrieval-side deferred-not-cancelled because the diagnostic is
  legible.** The probe encodes the exact corpus condition under
  which the original Phase 8.2 design would pay off; it removes the
  open-ended "when is it time to reconsider?" question and replaces
  it with a script that returns a boolean.

**Consequences:**

- **Regression target.** The F3 fixture is the canonical
  "model should not invent ANALOGOUS_TO patterns" check. If a future
  prompt change reintroduces the three-pattern invention behaviour on
  F3, the regression is detectable by re-running
  `evals/phase8_prototype/run.py`. A lightweight structural unit test
  (`tests/test_rag.py`) verifies the edge-aware block tokens remain
  in `_DEFAULT_PROMPT`; the eval harness is the behaviour-level
  check, re-runnable on demand.
- **ADR-053's "Phase 8 may revisit brief mode" note is closed.**
  This ADR decides brief and critic do *not* get the edge-aware
  block; if that changes, a new ADR captures the choice.
- **Token cost grows modestly.** The new block adds ~90 words to
  every default-mode `/ask` and every Synthesize call. At Sonnet 4.6
  this is negligible per request but worth noting if a future audit
  looks at system-prompt cost.
- **Phase 8.2 reactivation is now an event the user can trigger
  intentionally** (or detect via periodic probe runs in CI / a
  scheduled job). The probe script is the contract — if its output
  semantics drift, a new ADR is required.
- **The mode-prompt symmetry is broken.** Default has the edge block,
  brief and critic do not. The asymmetry is intentional but worth
  noting: any new mode added in the future has to make this
  decision explicitly.
- **The brief-mode hedging interaction with edge semantics is
  untouched.** ADR-057's low-confidence hedge fires on default mode
  only; ADR-053's brief mode is a separate axis. Phase 8.1 does not
  affect either.

---

## ADR-059 — Resolved-edge state

**Status:** Accepted; shipped 2026-05-15 (Phase 8.3 — backend + RAG annotation).
Companion to ADR-060 (D1 evolution edge types).

**Context:** A typed edge captures a relationship between two notes at the
time it was created, but the relationship may evolve. The most acute case is
`CONTRADICTS`: the user writes a synthesis note that supersedes the tension,
or simply moves past it intellectually, and the active tension annotation
becomes historical noise. ADR-058 (Phase 8.1) made typed edges semantically
load-bearing in RAG context assembly — which means historical tension is now
*more* visible to the model than before, and an "active vs. historical"
distinction is needed.

Two related questions surface together:

1. **State.** Should "resolved" be a separate edge type, a flag on the edge,
   or a graph relationship encoded as a new edge to a third node?
2. **Vocabulary.** Phase 8.3's planned D1 set originally included a
   `RESOLVES` edge type. With a resolved-edge state column, the type
   becomes redundant.

**Decision:**

- Add two nullable columns to `edges`:
  - `resolved_at TEXT` — ISO 8601 timestamp; NULL when the edge is active.
  - `resolved_by_node_id TEXT REFERENCES nodes(id)` — optional FK to a
    synthesis note that supersedes the tension.
- Resolution is **scoped to tension-bearing edge types in the API** —
  `RESOLVABLE_EDGE_TYPES = {"CONTRADICTS", "QUESTIONS"}`. The schema does
  not enforce this restriction (the column is generic across types) so a
  future re-scoping does not require another CHECK-constraint
  table-recreate; the restriction lives in `app/api/v1/edges.py` and is
  testable.
- `resolved_by_node_id` is **optional**. Sometimes a tension becomes
  dormant without a specific synthesis note; the user can mark it resolved
  without pointing at anything. When present, the FK must reference a
  non-deleted node (validated in the route handler).
- Two endpoints carry resolution:
  - `POST /edges/{id}/resolve` — body `{ "resolved_by_node_id": ... | null }`.
    Idempotent on re-call; new values overwrite. 422 on non-resolvable edge
    type or unknown resolver node.
  - `DELETE /edges/{id}/resolve` — clears both columns. 200 with the
    updated edge body; 404 if the edge does not exist.
- **RAG context assembly annotates resolved edges**, per ADR-058's prompt
  scaffolding. The annotation format is positional and explicit:
  - `→ CONTRADICTS [resolved] Note N (note text)` — when `resolved_at` is
    set but `resolved_by_node_id` is NULL or the resolving node is not in
    the current context window.
  - `→ CONTRADICTS [resolved → Note M] Note N (note text)` — when the
    resolving node is in the context window. The `Note M` reference points
    the model at the superseding note directly.
- `_DEFAULT_PROMPT` gains one sentence: "An edge annotated `[resolved]`
  (or `[resolved → Note N]`) is historical: the user has marked this
  tension as no longer active, optionally because Note N supersedes it.
  Treat the original tension as background context, not as an active
  position the user holds today; when present, the resolving note
  describes the current view." Brief and critic prompts continue to omit
  edge instructions per ADR-058.
- **`RESOLVES` is intentionally absent from the EdgeType vocabulary** —
  see ADR-060 for the full count-of-four (SUPERSEDED_BY, SCOPED_TO,
  REGIME_OF, FOLLOWS_FROM). Resolution is a property of a *specific
  tension edge*, scoped to the relationship, not a generic relationship
  between two notes. The column captures the scope; an edge type would not.

**Rationale:**

- **Why a column, not a soft-delete flag.** `deleted_at`-style soft delete
  hides the edge from views. Resolved state keeps the edge visible
  (intellectual history matters) and annotates the model's reading of it.
  These are different operations with different consequences; a single
  flag would conflate them.
- **Why optional `resolved_by_node_id`.** The required-FK variant forces
  every resolution to point at a synthesis note, which would be the
  zettelkasten-disciplined choice — but the user reported that tensions
  often just become dormant without producing a synthesis, and forcing a
  pointer turns "mark resolved" into "draft a new note." Optional FK
  preserves the disciplined path (pick or create a synthesis) while
  permitting the lightweight path.
- **Why annotate rather than omit.** Omitting a resolved CONTRADICTS edge
  would silently erase intellectual history that is often the most
  valuable content — "this tension existed, and here's how it resolved"
  is frequently more useful than either side of the tension in isolation.
  The `[resolved]` annotation preserves the history while telling the
  model the tension is not load-bearing for current reasoning.
- **Why `[resolved → Note M]` when the resolver is in context.** Without
  the pointer, the model would have to scan the context window for a
  note that looks like a resolution, which is unreliable. The explicit
  reference removes the inference: the model can attend to Note M as
  "the current view" directly.
- **Why scope the action to CONTRADICTS / QUESTIONS in the API.**
  Resolution semantics make sense only for tension-bearing relationships.
  "Marking a SUPPORTS edge resolved" has no clear meaning; the user
  testimony in Phase 8.3 planning made this explicit. Locking the action
  at the route boundary is light, easy to relax later if a real use case
  surfaces.
- **Why drop `RESOLVES` from EdgeType.** The companion ADR-060 covers
  this in detail. Short version: a `RESOLVES` edge would be
  underspecified ("A RESOLVES B" — about which aspect? in what context?
  resolving which tension?). The column scopes resolution to a specific
  tension edge, which is what carries the answers to those questions.

**Consequences:**

- **Frontend:** EdgePanel grows a "mark resolved" action visible only on
  CONTRADICTS / QUESTIONS edges; the action takes an optional
  NodePicker for the resolving synthesis note. Resolved edges render
  with visual differentiation. (Phase 8.3 frontend work — separate
  commit.)
- **Migration:** `0006_resolved_edges.sql` is a table-recreate
  (CHECK-constraint expansion for D1 is paid in the same trip). Two new
  indexes: `idx_edges_resolved_at` (partial index on non-NULL) for any
  future "show me my open tensions" view.
- **Graph viz:** resolved edges may want visual differentiation in
  `/graph` (greyed line, dashed stroke). Deferred to the Phase 8.3
  frontend pass; not in scope of this ADR.
- **Discover:** the bridges/triangles tabs probably should hide resolved
  CONTRADICTS pairs by default (they're no longer active tension). Not
  in scope of this ADR; will be picked up when the Discover surface is
  next revised.
- **Re-resolution.** `POST /edges/{id}/resolve` is idempotent: re-calling
  overwrites the resolver. This allows the user to update the
  resolving-note pointer if the synthesis evolves. The original
  `resolved_at` is overwritten by the new call's timestamp — if a
  history of resolution events becomes desirable, an audit table is the
  right shape, but not in v1.
- **Tests:** unit tests on `_build_context` pin the annotation format;
  route tests cover resolve / unresolve / 404 / 422 / non-resolvable type
  / unknown resolver. The default-prompt regression test extended to
  verify the `[resolved]` instruction is present.
- **No interaction with ADR-057 hedging.** The low-confidence hedge fires
  on default mode based on top-seed similarity; resolved-edge annotation
  is independent.

---

## ADR-060 — D1 evolution edge types

**Status:** Accepted; shipped 2026-05-15 (Phase 8.3 — same migration as
ADR-059). Companion to ADR-059.

**Context:** Phase 8.3's "D1" was the build plan's umbrella for the next
expansion of the EdgeType vocabulary, after ADR-052's literature-stance
verbs (BUILDS_ON, EXTENDS, REFINES, APPLIES_TO, MEASURES). The original
D1 list was `SUPERSEDED_BY`, `SCOPED_TO`, `REGIME_OF`, `RESOLVES`, plus
`FOLLOWS_FROM` (added by the user during the build-plan corrections at
the start of the Phase 8 session; required by Phase 9's narrative
timeline for discourse-order chaining between events).

ADR-059 drops `RESOLVES` from the vocabulary because resolution is a
property of a specific tension edge, carried by a column on `edges`,
not a generic relationship between two notes. This ADR commits the
remaining four types.

**Decision:**

Add the following edge types to the `EdgeType` enum and the `edges.type`
CHECK constraint:

- **`SUPERSEDED_BY`** — A → B: A's content has been replaced or
  outdated by B. The user has moved on from A to B. Differs from
  `EXTENDS` (which keeps A as the foundation) in that A is no longer
  the current position.
- **`SCOPED_TO`** — A → B: A applies within the scope or boundary
  established by B. Captures "A holds when B holds" — a methodology
  scoped to a domain, a claim scoped to a regime, a method valid only
  inside a specific context. Distinct from `APPLIES_TO` (which is "A
  applies the idea/method of B to a specific case") in that the
  direction is constraint-imposing, not application-of.
- **`REGIME_OF`** — A → B: A defines the regime, frame, or operative
  conditions under which B is meaningful. The complement of
  `SCOPED_TO` from the other end — "B is the frame; A is what it
  enables." Useful for capturing meta-level scoping notes whose primary
  semantic is "here are the rules in force when reading the things this
  collects."
- **`FOLLOWS_FROM`** — A → B: A follows from B causally, logically,
  or temporally. **Provenance note:** this type is included in the
  Phase 8.3 / D1 migration not because it emerged from the resolved-edge
  design work, but because Phase 9's narrative-timeline concept
  (`docs/constellation-phase9-concept.md` §8) requires it for
  discourse-order chaining between events. Folding it in here pays the
  CHECK-constraint table-recreate ceremony once instead of twice.

The number of D1 types is therefore **four**, not five as the build
plan originally suggested. The vocabulary now totals **17 types** —
keep this number in mind when reviewing future additions; the
vocabulary should grow only when a proposed type carries semantics
that none of the existing types can express without ambiguity.

**Rationale:**

- **Why these four together.** `SUPERSEDED_BY` is the evolution
  counterpart to `EXTENDS` / `REFINES` — captures "the user's thinking
  has moved on" rather than "the user has refined." `SCOPED_TO` and
  `REGIME_OF` are duals (the same scoping relationship seen from
  opposite ends); they belong together because committing to one and
  not the other forces the user to express the scoped relationship in
  a fixed direction, which fights how knowledge naturally flows.
  `FOLLOWS_FROM` is the temporal/causal sequencer Phase 9 needs.
- **Why drop `RESOLVES` here, not in a separate ADR.** The
  vocabulary-shape decision is inseparable from the resolved-edge-state
  decision; both are answering "where does resolution live in the
  schema." Keeping them in companion ADRs lets each focus on its own
  surface (state vs. vocabulary) while making the cross-reference
  explicit.
- **Why `FOLLOWS_FROM` in this migration and not later.** SQLite
  CHECK-constraint changes require table recreation; the operation is
  cheap on a small DB but doubles when paid twice. The build-plan
  correction at the start of the Phase 8 session named this
  explicitly: include `FOLLOWS_FROM` in 0006 to avoid a 0007 that
  recreates the table again for one more type.
- **Why not include `CAUSED_BY`, `PRECEDES`, `CONCURRENT_WITH`, or
  other temporal types.** `FOLLOWS_FROM` covers causal-and-temporal-and-
  logical succession with sufficient generality. Phase 9's planning
  exercise will revisit if the narrative timeline turns up genuinely
  distinct uses; for now, one verb is enough.

**Consequences:**

- **Frontend** (`frontend/src/lib/edgeTypes.ts`) gets four new entries
  with colour, label, and description. The EdgeForm picker grows to
  17 options; UX discomfort with the size may eventually motivate a
  picker redesign (sectioned by category, search-filter). Not in scope
  of this ADR.
- **Bridge classifier prompt** (`discover_service._CLASSIFY_BRIDGE_SYSTEM`)
  needs to be reviewed to ensure the new types are available to the
  classifier and that their semantics are described accurately. May
  need a follow-on prompt iteration; not in scope of this ADR.
- **Migration 0006** lifts the CHECK constraint to the full 17-type
  set and is the single source of truth for the vocabulary count.
  Future additions must update both the `EdgeType` Literal and the
  migration's CHECK clause via a new migration.
- **Phase 9 narrative timeline can begin.** The discourse-order
  chaining infrastructure (`FOLLOWS_FROM` edges between adjacent
  events) is now schema-ready. Whether Phase 9 actually starts in
  this position depends on the Phase 9 planning exercise; the
  vocabulary cost is paid either way.
- **Documentation drift.** `docs/architecture.md` §1 edge-type table
  has been stale since ADR-052; this ADR is the trigger to update it
  to the full 17-type set along with the schema updates (Phase 8.3
  ships an architecture-doc refresh).

---

## ADR-061 — Scoped Ask (tag + recency filters on RAG query)

**Status:** Accepted; shipped 2026-05-15 (Phase 8.4 — backend + /ask UI).

**Context:** Walkthrough scenarios surfaced that users frequently want
to ask a question against a sub-corpus rather than the full knowledge
base — "what do my eurorack notes say about envelope shapes" should not
have to compete for retrieval slots with cooking notes that happen to
share a vector neighbourhood. C1 in the build plan captured this. The
build plan's Phase 8.4 framing called for "tag/recency scope on Ask"
with a proposed `ScopedAskRequest` shape.

Two related design decisions came up during implementation:

1. **Where in the pipeline does scope filter.** Seed-only (filter
   semantic + FTS candidates) vs. strict (also filter graph-expanded
   neighbours).
2. **Request model shape.** A new `ScopedAskRequest` parallel to
   `ScopedRagRequest` (Synthesize) vs. additive fields on the existing
   `RagRequest`.

**Decision:**

- Extend `RagRequest` with two optional fields:
  - `tag_filter: list[str] | None` — list of tag IDs with **OR
    semantics** (a node matches if it carries any of the listed tags).
    NULL or empty means no tag filter.
  - `since: datetime | None` — ISO 8601 timestamp. NULL means no
    recency filter. When set, nodes with `created_at >= since` match.
- **No new `ScopedAskRequest` model.** Adding optional fields keeps
  the API additive; `ScopedRagRequest` is already taken by the
  Synthesize flow (explicit node_ids, no retrieval) and a second
  "scoped" name would be confusing. Both filters default to NULL,
  preserving exact pre-Phase-8.4 behaviour when omitted.
- **Seed-only scope.** Filter the semantic-search and FTS-search
  candidate lists by scope **before** RRF merge. Graph expansion is
  unrestricted: an in-scope seed can pull an out-of-scope neighbour
  via a typed edge.
- **Widen search limits when scope is active.** Unscoped retrieval
  keeps the pre-Phase-8.4 `limit=10` per search list (cost parity).
  Scoped retrieval widens to `limit=40` so a narrow scope doesn't
  collapse the candidate pool before filtering. Both lists are still
  truncated to `_MAX_SEED_NODES=8` after RRF merge.
- **Scope-resolution helper.** A new `_resolve_scope(db, *,
  tag_filter, since)` returns `set[str] | None` — `None` for the
  unfiltered case (callers skip the filter step entirely), a set
  otherwise. The query joins `nodes` to `node_tags` only when
  `tag_filter` is non-empty.
- **No interaction with `query_scoped()`.** That function (Synthesize)
  takes an explicit `node_ids` list and bypasses retrieval entirely;
  Phase 8.4 is about scoped *retrieval*, a distinct shape. Naming
  remains: `query()` for retrieval-based Ask (optionally scoped);
  `query_scoped()` for ID-list Synthesize.

**Frontend:**

- `/ask` page gains a collapsible "Scope" panel between the question
  textarea and the mode/Ask row. Recency uses preset chips (Any time
  / Last 7 / 30 / 90 days) that translate to `since = now - N days`.
  Tag chips toggle membership of the `tag_filter` list.
- A small badge in the scope header summarises the active filter
  ("2 tags · Last 30 days") when collapsed, so the state is visible
  without expansion.
- Scope is **transient session state** — not URL-encoded, not
  persisted. Closing the page resets it. Persistence belongs to
  Phase 9's Project Workspace (scope sidecar on a structure node).

**Rationale:**

- **Why seed-only, not strict scope.** The strategic bet of
  Phase 8 (ADR-058) is that typed edges become semantically
  load-bearing in RAG. Strict scope would forbid the model from
  reaching past the scope along a SUPPORTS edge into context — that
  fights the entire premise. The user's intent when scoping is
  "anchor the answer to these notes," not "forbid the model from
  knowing anything else." Seeds-only honours both: the answer is
  anchored to in-scope material, but typed-edge context still
  contributes.
- **Why widen to 40 not bigger.** With `tag_filter` selecting a
  small minority of the corpus, the unscoped top-10 may contain 0
  in-scope notes. Empirical: widening to 40 covers the common case
  where the scope is 5-20% of the corpus. Beyond that, the
  low-confidence hedge (ADR-057) should fire honestly. If users
  routinely scope to single-tag sets of <5 notes, that's the
  Synthesize flow's territory (explicit IDs).
- **Why OR semantics for tag_filter.** Synthesize's pool builder
  (A5) defaults to OR. Reusing the semantic keeps mental models
  consistent — "tag chips" mean the same thing across surfaces.
  AND semantics could be added later as a second axis if needed.
- **Why `since` as datetime, not a `days_ago` int.** Datetime is
  more expressive — supports "since my Monday review" not just
  "since 7 days ago." The UI defaults to N-day presets, but the API
  accepts any timestamp. This also matches `RecentEdge` /
  `RecentActivity` conventions (ADR-054).
- **Why drop the `ScopedAskRequest` name.** The build plan's
  proposed shape worked when `query_scoped` didn't already exist,
  but it does (Synthesize). Two scoped-named requests with different
  semantics is precisely the kind of friction the architecture
  rules against. Extending `RagRequest` with optional fields is the
  smaller diff with the clearer intent.

**Consequences:**

- **Phase 9's Project Workspace inherits this for free.** The scoped
  ask bar (Phase 9 §3 left panel) just sends `tag_filter` and `since`
  from the workspace's saved scope; no new backend work needed.
- **Brief / critic modes compose with scope.** Tested
  (`test_rag_query_scope_composes_with_modes`). Brief + tag_filter
  means "argue for X using only my eurorack notes" — a real use
  case that previously required the Synthesize flow.
- **Low-confidence hedge (ADR-057) still applies.** When scope
  collapses the seed pool, `top_similarity` is computed from
  whatever filtered seeds remain. If they're weak, the hedge fires
  and the answer leads with "your notes don't directly cover this."
  Honest behaviour without special-casing.
- **Provenance UI is unchanged.** Direct vs neighbour roles are
  already distinguishable in `/ask`'s `ProvenancePanel`, and that
  was always honest about in-scope vs reach-through. No frontend
  changes needed there.
- **`/ingest`-time tagging discipline becomes more valuable.**
  Scoped Ask is only useful if the corpus is well-tagged. The
  import-time auto-tag work (Phase X) and the tag-editing UI
  combine to make this a workflow the user already invests in.
- **Cost.** The widened search (40 vs 10 candidates each) is a
  ~4× DB read on the vec0 KNN and the FTS5 query. Both are O(log N)
  in corpus size, so this is well under a millisecond on the
  current corpus. Re-evaluate if corpus grows past ~100k notes.
- **No graph_service changes.** Expansion is unchanged; the scope
  filter never touches it.

---

## ADR-062 — `/search/dedup` endpoint contract + capture-time link flow

**Status:** Accepted; shipped 2026-05-15 (Phase 8.5 — backend endpoint +
IntentionalCaptureDialog dedup panel).

**Context:** Walkthrough scenario 10 framed capture-time dedup as the
single highest-leverage pre-commit affordance: at the moment of writing
a thought, the user wants to know "is there already a note like this in
my corpus?" and, if so, "let me link to it from this one without
leaving the capture flow." The existing `/search/semantic` endpoint
returns rank-normalised scores (1.0 / 0.5 / 0.0 ladder by position),
which is fine for ranking but useless for the absolute "looks like a
duplicate" threshold question — a top-rank match with cosine 0.4 would
score 1.0 and look just as concerning as a true 0.9 duplicate.

Capture-time linking pairs naturally with this: once a related note is
visible, the friction to attach a typed edge should be zero. The same
panel surfaces both C3 (compare to corpus) and C6 (save-time typed-edge
suggestion).

**Decision:**

- **New endpoint `POST /search/dedup`** with `DedupRequest { query,
  limit }` and `DedupResponse { results: DedupResult[], query }`.
  `DedupResult` is `{ node: NodeSummary, similarity: float }` where
  `similarity` is the raw clamped-cosine projection of the underlying
  L2 distance — the same `1 - distance^2 / 2` formula used by
  `rag_service._distance_to_similarity` and `discover_service`,
  clamped to [0, 1]. Results are ordered by similarity descending.
- **No threshold baked into the endpoint.** The endpoint returns
  top-K with raw similarities; the client decides what to surface.
  Two thresholds live in the frontend:
  - `DEDUP_SHOW_THRESHOLD = 0.65` — below this, hide the result.
    Anchored at the lower end of the corpus's typed-edge endpoint
    similarities (Phase 8.0 probe data: CONTRADICTS at 0.82, SUPPORTS
    0.66–0.90, ANALOGOUS_TO 0.65–0.79). Set low to surface
    "merely related" notes the user may want to link via
    SUPPORTS / ELABORATES.
  - `DEDUP_DUPLICATE_THRESHOLD = 0.85` — visual flag for "this looks
    like a duplicate." Above ADR-049's 0.7 "plausibly same concept"
    threshold for paired notes; tuned tighter because at capture
    time we want a higher bar before flagging.
  Both are constants in `IntentionalCaptureDialog.tsx`. Threshold
  tuning is data-driven and may revisit after real use.
- **Same embedding provider as `/search/semantic`.** No new
  provider plumbing. Cost per dedup search is one embed + one vec0
  KNN; trivial.
- **Default `limit = 8`** (vs 20 for the rank-normalised endpoints).
  The capture panel only renders top matches; a wider window is
  wasted work.
- **Frontend host: `IntentionalCaptureDialog`** — the modal already
  designed for "capture with intent," already pairs with the edge
  vocabulary, already collects tags/source. Adding the dedup panel
  here keeps capture-with-edges contained. The quick-capture
  `CaptureDialog` (fleeting-only) stays minimal — the dedup panel
  would fight its frictionless intent.
- **Trigger.** Debounced 800ms after `content` changes, only when
  `content.trim().length >= 40`. Below 40 chars the embedding is
  uninformative; above 40 the dedup signal is meaningful. Embedding
  query is `title + "\n" + content` so the title is part of the
  signal.
- **"+ Link" flow.** Each result row has an inline edge-type
  `<select>` (defaulting to SUPPORTS) and a "+ Link" button. Clicking
  adds the match to a `pendingLinks` list shown above the form
  buttons as "Will create on save." The Save button label updates to
  "Save permanent note + 2 links" so the user can confirm the
  bundled action.
- **Partial-failure semantics on save.** Save creates the new note
  *first*, then each pending edge in sequence. If an edge fails
  (e.g., race with a UNIQUE conflict), the note is still kept and
  the dialog closes; failures log to console for now. **Notes are
  the load-bearing artifact; edges are recoverable from the graph
  view.** A future polish surface is a toast for partial failures.

**Rationale:**

- **Why raw similarity, not a second rank-normalised endpoint.**
  Rank-normalised scores answer "which is best" — useless when the
  comparison the user actually wants is "is any of these *close
  enough* to matter." The same `(distance² → similarity)`
  projection used by Phase 8.0's probe and the bridges classifier
  threshold lets every consumer of similarity work on the same
  scale.
- **Why thresholds in the frontend, not the API.** Different
  surfaces want different thresholds: the capture panel surfaces
  related notes at 0.65; an automated dedup-prevention check would
  want 0.85+; a future "find related notes" sidebar might want
  0.5+. Baking a single threshold into the endpoint would force
  every consumer to share it. The endpoint returns raw data; clients
  threshold.
- **Why a `DEDUP_SHOW_THRESHOLD` of 0.65 specifically.** The
  Phase 8.0 probe data showed the actual edge endpoint similarities
  in this corpus span 0.65 to 0.90. Setting the show threshold at
  the low end of *existing* typed-edge connections means the
  capture panel will surface notes that, by the user's own past
  judgments, are connectable. Going lower starts surfacing noise.
- **Why default edge type SUPPORTS.** It's the most common
  author-stance verb in the corpus and the most plausible default
  for "I'm capturing a note related to this existing one." The
  per-row select makes overrides one click.
- **Why bundle save + link rather than save-then-prompt.** Two
  separate confirmations is friction for what is conceptually a
  single intent ("capture this thought, link to that note").
  Bundling matches the walkthrough's framing of C3+C6 as one
  affordance, not two.
- **Why IntentionalCaptureDialog only.** Quick capture
  (`CaptureDialog`, fleeting-only) is for the friction-free inbox
  drop. Adding a dedup panel there would re-introduce the friction
  intentional capture exists to replace. The two dialogs are now
  semantically distinct: quick capture = ingest, intentional
  capture = process.
- **Why no AI edge-type classifier in capture.** ADR-049's
  classifier is on-demand for the bridges flow (post-hoc, when the
  user reviews potential connections). At capture time, the user
  *knows* the relationship — that's why they're typing the new
  note in relation to the old one. A classifier would add an LLM
  call to every "+ Link" action; manual select is faster and
  cheaper.

**Consequences:**

- **Cost.** Each dedup search is one embed call + one vec0 KNN
  lookup. Voyage free tier (3 RPM) handles this comfortably for
  realistic capture pacing (~1 capture / few minutes). The 800ms
  debounce ensures one embed per pause, not per keystroke.
- **The IntentionalCaptureDialog grows.** Six new pieces of state
  (`dedupResults`, `dedupLoading`, `pendingLinks`, plus per-row
  edge-type state inside `DedupPanelRow`). Still well within the
  "single dialog component" cost budget; if it grows further, the
  dedup pieces split into a sibling component cleanly.
- **No new ingest-time dedup.** This ADR scopes to manual capture
  via the dialog. Document import (`/ingest/document`) does not
  currently dedup against the existing corpus. If duplicates become
  a real problem there, the same endpoint can be called per
  literature candidate during ingestion — but that's a separate
  decision.
- **Frontend types regenerated.** `pnpm types` (or the offline
  spec-dump path) brings `DedupRequest`, `DedupResult`,
  `DedupResponse` into `api-types.ts`. The systemd `constellation`
  service needs a restart to expose `/search/dedup`.
- **Interaction with ADR-061 (Scoped Ask).** The dedup search is
  not currently scoped — the user wants to know about *any*
  existing note. If a Phase 9 Project Workspace wants to scope
  dedup to the active project ("does this duplicate any note in
  this project?"), the endpoint should grow optional `tag_filter`
  / `since` fields mirroring `RagRequest`. Not in scope for v1.
- **Tests.** Six new endpoint tests in `test_search.py`: empty DB,
  empty query, raw-similarity-not-rank-normalised, limit respected,
  deleted-node exclusion, descending order. Frontend has no new
  vitest coverage because the dialog state is integration-heavy;
  manual QA via the dialog covers the flow.
- **Phase 8 is now complete.** 8.0 prototype gate / 8.1 prompt-side
  edge semantics / 8.3 resolved-edge state + D1 / 8.4 scoped Ask /
  8.5 dedup endpoint + capture-time linking. 8.2 (retrieval-side
  edge expansion) remains conditionally deferred per ADR-058's
  reactivation criterion.

---

## ADR-063 — Project-as-structure-node with `project_scopes` sidecar

**Status:** Accepted (Phase 9 Slice 0)

**Context:** Phase 9 introduces the Project Workspace — a persistent,
mode-aware working surface that remembers a user's scope, pinned notes,
session history, and resume-briefing prompt across visits. The decision
the build plan and design brief converged on is *where* a project lives
in the data model. Two paths were considered:

1. **Structure-note-as-root.** Reuse the existing `structure` node type
   as the project hub. Add a boolean flag distinguishing project-hub
   structure notes from ordinary maps of content. Persistent
   workspace configuration (pinned nodes, tags, briefing prompt,
   last-visited timestamp, mode) lives in a sidecar table keyed by the
   hub node ID.
2. **New `project` entity.** A new top-level table (or new `NodeType`
   enum value) with its own endpoints, models, and nav entries.

The design brief's §1 Decision 1 picks path (1) — structure note with
sidecar — and this ADR is its formal commit. The build plan's Slice 0
adds the sidecar plus several adjacent project-foundation tables
(drafts, work_sessions, session_nodes, session_edges,
dismissed_corpus_suggestions); those are tracked by their own
foreign-key relationships to the hub node and are documented as
implementation detail of this same decision.

**Decision:**

- **A project is rooted in exactly one structure note (the "hub note").**
  Promotion is the act of setting `nodes.is_project_hub = 1` on an
  existing structure node and creating a `project_scopes` row keyed by
  the same node ID. The hub note keeps its identity in the rest of the
  graph: it can receive QUESTIONS, SUPPORTS, ANALOGOUS_TO, COLLECTS,
  or any other typed edges. Promoting a structure note adds a workspace
  affordance to it; it does not change what the node is or how it
  participates elsewhere.
- **Schema additions** (migration `0007_project_workspace.sql`):
  - `nodes.is_project_hub INTEGER NOT NULL DEFAULT 0` plus a partial
    index `idx_nodes_project_hub` over the small "live project hubs"
    set so `GET /projects` is one indexed scan with no join.
  - `project_scopes` — primary key is `hub_node_id` referencing
    `nodes(id)`. Columns: `pinned_node_ids TEXT NOT NULL DEFAULT '[]'`
    (JSON array of node IDs), `tag_ids TEXT NOT NULL DEFAULT '[]'`
    (JSON array of tag IDs), `primary_tag_id TEXT REFERENCES tags(id)`
    (the tag used by `con --project <name>` to attach captures),
    `briefing_prompt TEXT`, `last_visited_at TEXT`, `mode TEXT NOT
    NULL DEFAULT 'research' CHECK(mode IN ('research', 'narrative',
    'learning'))`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT
    NULL`.
  - `drafts` — one row per project (UNIQUE on `project_id`), holding
    the free-writing-pad content. Server-side storage per design brief
    §1 Decision 2 (SQLite is the source of truth; localStorage is not
    used).
  - `work_sessions` — intentional work-session records (mode is
    independent of project mode per philosophy doc §IIIb.2). Columns
    cover declared intent, status, progress / closing / next-session
    notes, blockers, estimated duration, started_at / closed_at /
    duration_seconds.
  - `session_nodes` and `session_edges` — join tables binding nodes
    and edges to the session active when they were created. Both carry
    a `session_tagged` flag so opt-out bypasses are queryable (philosophy
    doc §IIIb.6) rather than silent omissions.
  - `dismissed_corpus_suggestions` — per-project suppression list for
    corpus-match panel rows the user has dismissed, so the same note
    does not re-surface across sessions (philosophy doc §5.7).
- **Promotion endpoint.** `POST /projects { hub_node_id, mode? }`
  flips the flag and creates the sidecar row. Returns the project
  detail. `POST /projects { title, mode? }` with no `hub_node_id`
  creates a new structure note and promotes it in one call.
- **Listing and detail.** `GET /projects` lists all project hubs
  (`WHERE is_project_hub = 1 AND deleted_at IS NULL`). `GET
  /projects/{hub_id}` returns the hub `NodeDetail` + scope + active
  session (if any).
- **One hub per project, many pinned notes.** A project's scope is the
  hub plus everything in `pinned_node_ids` plus everything carrying any
  tag in `tag_ids`. The hub is the *root*, not the *boundary*.

**Rationale:**

- **Projects are graph citizens.** A new entity type sitting alongside
  nodes would either be invisible to the graph viz, search, and the
  RAG pipeline (and need duplicate plumbing in all three) or would
  re-introduce its own node-shaped identity. The structure-note path
  avoids both: a project is a node, so it already participates in
  everything that operates on nodes.
- **ADR-006 holds.** The node-type vocabulary (fleeting / literature /
  permanent / structure) stays at four entries. A project is a
  *specialization of* `structure`, signaled by a flag, not a new type.
  This matches the same flag-vs-type pattern Slice 4 will use for story
  events (ADR-064).
- **Sidecar over JSON-on-node.** Stashing pinned IDs, tags, briefing
  prompt, mode, last-visited inside the structure note's `content` (as
  JSON or YAML frontmatter) was considered and rejected. Two problems:
  (a) the content field is user-authored prose, and silently merging
  workspace metadata into it would corrupt notes if the user edited
  them by hand; (b) every read of project scope would have to re-parse
  prose, which is slow and brittle. A typed sidecar table is the
  obvious schema for typed configuration.
- **Mode column on the sidecar, not on the node.** Mode is workspace
  configuration — what surfaces the workspace renders by default —
  not an intrinsic property of the hub node. Storing it alongside the
  rest of the workspace config keeps the structure-node abstraction
  clean.
- **Mode sets defaults, not gates** (per build plan philosophy). The
  `mode` column on `project_scopes` chooses which panels are prominent
  on first open. Nothing in the workspace UI or API should gate a
  feature on this column. A research-mode project can open the
  Timeline tab; a narrative-mode project can run a learning check.
- **`primary_tag_id` is the cross-surface project anchor.**
  `con --project eurorack "thought"` (Slice 1) and the workspace Ask
  scope toggle (Slice 1) both resolve a project to its `primary_tag_id`
  and use that tag as the filter / attach point. The CLI does this via
  a new `GET /projects/resolve?name=<name>` endpoint (or, when the CLI
  runs against the local DB directly, an inline repository query) that
  matches `<name>` against `tags.name` where the tag appears as
  `primary_tag_id` on any `project_scopes` row, returning the project
  and its primary tag. Storing the anchor on the scope row keeps this
  resolution one indexed lookup rather than a substring match against
  the hub title and centralizes project identity in a single column.

**Consequences:**

- **Migration ceremony.** `0007_project_workspace.sql` does not require
  the CHECK-constraint table-recreate dance — all additions are new
  columns (with defaults) on `nodes` and new tables. The cost of this
  slice is modest.
- **`GET /projects` is one indexed query.** The partial index
  `idx_nodes_project_hub` keeps the project list trivial to render even
  if the broader corpus grows large; project hubs are inherently a
  small subset.
- **Soft-delete propagation.** Soft-deleting a hub node hides it from
  `GET /projects` (the index is partial). The `project_scopes` row is
  *not* deleted in the same operation; it sits orphaned until a future
  cleanup pass. This matches the existing soft-delete convention (ADR
  "do not hard-delete nodes") and avoids cascading semantics that would
  surprise the user. Restoring the node via `deleted_at = NULL` brings
  the project back with its scope intact.
- **Synthesis history association.** ADR-067 will handle how the
  workspace knows which synthesis outputs belong to it. This ADR is
  agnostic: the hub note can receive CITES edges from synthesis
  permanents like any other node, so option (a) ("CITES edges into the
  project scope") is structurally available without further schema
  work.
- **Soft-delete of hub via `deleted_at` does not flip
  `is_project_hub`.** A future "archive project" UI may choose to flip
  the flag back to 0 explicitly; that is a Phase 10 polish concern, not
  Slice 0.
- **`work_sessions` mode includes `planning`** (a fourth value beyond
  the project-mode enum). Session mode is independent of project mode
  (philosophy doc §IIIb.2): a narrative project can have research
  sessions, and any project can have a planning session focused on
  roadmap / scope work. Project mode and session mode are different
  enums with different domains.
- **`pinned_node_ids` and `tag_ids` are JSON-encoded arrays, not
  per-row tables.** This trades query-friendliness ("which projects
  pin node X?") for write simplicity. The expected workload is
  read-per-render and write-on-edit; reverse-lookup queries are not
  on any current surface. If they become load-bearing, normalizing
  into `project_pinned_nodes(project_id, node_id)` and
  `project_tags(project_id, tag_id)` is a forward-compatible
  migration.
- **`primary_tag_id` is a soft contract, not a NOT NULL column.**
  The column is nullable in `0007_project_workspace.sql` so a project
  can be created and exist briefly without a tag assignment — this
  matches the build plan's flow where Slice 0 promotes the hub note
  without forcing tag wiring. **However, a project without a
  `primary_tag_id` cannot be targeted by `con --project <name>` (no
  tag to resolve) and the Ask scope toggle has no tag to filter on
  (Project / Both modes silently degrade to Full-corpus behavior).**
  This is a class of silent failure the UI must prevent: the project
  creation flow (Slice 1) must enforce or strongly encourage setting
  a primary tag — either by requiring tag selection in the "New
  project" dialog, or by surfacing a prominent "Set primary tag"
  prompt in the workspace until one is set. The list endpoint and
  workspace shell should also reflect "needs primary tag" state on
  any project missing the assignment. Without this UX guardrail, a
  user can quietly end up with a project whose scope toggle does
  nothing.
- **The Ask scope toggle's "Both" state is frontend orchestration
  over the existing `RagRequest`, not a new request shape.** Slice 1
  will implement the three-state toggle (Project / Both / Full
  corpus) by populating `tag_filter` on `/rag/query` for Project and
  the first call of Both, then re-issuing without `tag_filter` if the
  scoped response's confidence (per ADR-057 / B5) falls below
  threshold, then merging and labeling out-of-scope results in
  provenance. No `ScopedAskRequest` model is needed; the orchestration
  shape will be formalized in ADR-068 when Slice 1 builds it.

---

## ADR-068 — Workspace Ask scope toggle (Project / Both / Full corpus)

**Status:** Accepted (Phase 9 Slice 1)

**Context:** Philosophy doc §5.6 open problem 3 ("Full-corpus vs.
project-scoped Ask toggle") names the need for an explicit three-state
toggle in narrative-mode early sessions: project-only is too narrow when
the project is still small ("what in my full corpus touches on X?" is
genuinely more useful), but full-corpus is too noisy once a project has
real depth. The workspace Ask bar is the first place in the app where
this trade-off is explicit. Phase 8.4 / ADR-061 shipped the underlying
`tag_filter` / `since` fields on `RagRequest`; this ADR formalizes how
the workspace UI composes the toggle around them.

**Decision:**

- **Three states, frontend-only orchestration.** The Ask bar offers
  three buttons: `Project` (default), `Both`, `Full corpus`. State is
  local to the workspace; no new backend request shape is introduced.
- **Project state** issues one `POST /rag/query` with `tag_filter =
  [scope.primary_tag_id]`. The provenance returned is by construction
  scoped to that tag.
- **Full corpus state** issues one `POST /rag/query` with no
  `tag_filter`. Behavior matches `/ask` outside the workspace.
- **Both state** is a two-call orchestration:
  1. First call: with `tag_filter = [scope.primary_tag_id]`. If the
     scoped response has acceptable retrieval confidence (provenance
     is non-empty and the answer doesn't fall into the B5 / ADR-057
     low-confidence framing), return it. Done.
  2. Otherwise: re-issue with no `tag_filter`. Merge results: dedupe by
     `node_id`, in-scope items first, out-of-scope items labeled
     visibly in the provenance panel ("Out of scope" badge / amber
     tint).
  The frontend decides whether to fall through by inspecting the
  response, not by a new server flag. The B5 confidence check is the
  same low-confidence detection used by `/ask` outside the workspace.
- **Disabled when no primary tag is set.** If the project's
  `primary_tag_id` is null, the toggle is rendered with `Project` and
  `Both` disabled (and a tooltip explaining "Set a primary tag in
  scope to enable project-scoped Ask"). The default state silently
  flips to `Full corpus`. This is the UX guardrail named in ADR-063's
  consequences: the workspace must never silently degrade Project to
  Full-corpus behavior; it must explicitly tell the user the toggle
  is unavailable until the tag is set.
- **No new ADR for B5 thresholding.** The confidence check reuses
  ADR-057's threshold (the low-confidence framing logic on `/ask`).
  This ADR documents the orchestration; ADR-057 owns the threshold.

**Rationale:**

- **Frontend orchestration over backend complexity.** A
  `BothScopedRagRequest` model that runs both calls server-side and
  merges would add a new endpoint, new tests, and a new orchestration
  pathway in `rag_service`. The frontend already has all the
  ingredients: it can call `POST /rag/query` twice, dedupe by
  `node_id`, and label the merged list. Two HTTP calls cost ~latency,
  not ~complexity. Keep it client-side.
- **Project is the default because most workspace Ask use is
  project-relevant.** The user is in the workspace because they're
  working on this project. The default should be tight scope; the
  toggle lets them widen.
- **Both, not Auto.** "Both" is honest about cost: it makes two
  calls, surfaces both perspectives, and labels which is which. An
  "Auto" mode that silently picks between Project and Full corpus
  would obscure what's happening at the moment the user most needs
  transparency about scope.
- **Disabled-not-hidden when primary_tag_id is missing.** Hiding the
  toggle would let the silent-failure mode named in ADR-063 happen
  by another route ("oh, the toggle just isn't there, must be a
  Full-corpus-only feature"). Showing the toggle as disabled with an
  explanatory tooltip makes the missing tag a visible state, not an
  absence.

**Consequences:**

- **No backend changes.** `POST /rag/query` already accepts
  `tag_filter`. The route, models, and tests from ADR-061 are reused
  verbatim.
- **Two HTTP calls on the Both path.** Worst-case latency is roughly
  doubled when the scoped call is insufficient. The B5 confidence
  check happens client-side after the first response, so the second
  call is conditional. The expected hit rate (scoped sufficient) for
  mature projects should keep average latency closer to single-call.
- **Out-of-scope labeling on provenance.** The provenance panel needs
  to distinguish in-scope from out-of-scope items in the Both state.
  Implementation: tag each `NodeUsed` entry in component state with
  an `out_of_scope: boolean` derived from the second call's results
  minus the first call's, then render an amber "Out of scope" pill
  next to those rows in the existing provenance UI.
- **Per-session state.** The toggle does not persist to
  `project_scopes` — it's per-visit. Users who want a stable default
  are choosing the Slice 1 default (Project). If a future need
  surfaces ("always start Fire Stoker in Both mode"), add a
  `default_ask_scope` column to `project_scopes`; not in Phase 9.
- **Future "Auto" lives elsewhere.** If the dual-call cost becomes a
  problem (large corpora, slow embedding, etc.), the next move is an
  Auto mode that uses a single scoped call and only re-issues when
  the response's confidence falls below threshold — exactly the
  Both-state behavior, just without the always-merge step. Auto is
  intentionally deferred until real usage shows whether it's wanted.

---

## ADR-069 — Session-scoped fleeting synthesis (`include_session_fleetings`)

**Status:** Accepted (Phase 9 Slice 2)

**Context:** Philosophy doc §5.6 open problem 4: in early research
sessions, fleeting notes may be the only material a user has captured.
The current `/rag/scoped` endpoint operates on an explicit `node_ids`
list and the frontend Synthesize tab builds that list from permanents
only (fleeting notes are intentionally excluded from search and
suggest-links via ADR-019). A user who captured ten fleetings today
during a focused session cannot ask "synthesize what I captured today"
without first promoting each one to a permanent — friction that
defeats the purpose of the session container.

The need is narrow and timing-bounded: it applies to fleetings created
*during the active session*, not fleetings in general. Pulling all
fleetings into synthesis would re-introduce inbox noise; pulling
*this session's* unprocessed captures is a useful, scoped widening.

**Decision:**

- **Extend `ScopedRagRequest`** with two optional fields:
  - `include_session_fleetings: bool = False`
  - `session_id: str | None = None`
- **When `include_session_fleetings=True` and `session_id` is
  provided**, the route augments the `node_ids` list with fleeting
  nodes pulled from `session_nodes` joined on `nodes` where
  `session_id = ?`, `session_tagged = 1`, `n.type = 'fleeting'`,
  `n.processed_at IS NULL`, and `n.deleted_at IS NULL`. Deduped
  against the explicit `node_ids` list (set-union semantics).
- **Provided alone, neither field changes behavior.** A request that
  sets `include_session_fleetings=True` but provides no `session_id`
  is treated as if the flag were false (no implicit "all active
  sessions" — explicit only). A `session_id` without the flag is
  ignored.
- **Frontend toggle**: the Synthesize scope builder gains a checkbox
  "Include today's unprocessed captures" wired to
  `include_session_fleetings`. The flag defaults to off. When
  enabled, the workspace's active-session ID is passed as
  `session_id`. The toggle is disabled (with a tooltip) when no
  session is active — there's nothing to include.
- **Session captures are labeled in synthesis output context.** The
  context block for each session fleeting carries a `[session
  capture]` annotation in the synthesis pool description so the
  generated answer can distinguish "from polished notes" vs "from raw
  capture" if it chooses to.

**Rationale:**

- **Two flags rather than auto-detection.** The route could plausibly
  auto-detect an active session and silently widen scope, but silent
  widening is exactly the kind of behavior ADR-068 names as wrong.
  Explicit flag + explicit session_id makes the widening a deliberate
  act of the caller.
- **`session_tagged = 1` matters.** Philosophy doc §IIIb.6 introduces
  the session bypass — a user can opt a capture out of session
  attribution. The session synthesis flag must respect that: opted-out
  captures stay out of scope even when the flag is on. The join
  predicate (`session_tagged = 1`) does this without a separate
  flag.
- **Only fleetings, not permanents.** Permanents created during a
  session are accessible through the normal scope-builder paths
  (tags, manual selection). The flag's purpose is bridging the inbox
  gap; widening it to all session content would be redundant.
- **No new endpoint.** Extending `ScopedRagRequest` is forward-
  compatible — existing callers don't set the new fields and see no
  change. A new endpoint (`/rag/synthesize-session`) would duplicate
  the scoped-RAG pipeline for one flag.

**Consequences:**

- **Set-union semantics, not replacement.** A user who picks 5
  permanents *and* turns on the toggle gets `permanents + session
  fleetings`. Not one or the other. This matches the intuitive
  reading of "include also."
- **The session_id is the workspace's responsibility.** The
  Synthesize page outside the workspace (`/synthesize`) doesn't know
  about active sessions; it leaves the field null. The workspace
  Synthesize tab — which knows the active session — passes it.
- **No persistence.** Whether the toggle is on or off does not
  persist between Synthesize runs. The flag is per-call.
- **Fleeting nodes still have no embedding** in this corpus' current
  state (they're embedded after processing). Synthesize uses scoped
  RAG which doesn't require embeddings (no retrieval, just direct
  context assembly), so this is not a problem for ADR-069. If a
  future pipeline change starts requiring fleeting embeddings, the
  scoped path keeps working as long as `_build_context` doesn't need
  vectors.
- **Tests.** Backend gains coverage for the include-flag plumbing:
  explicit fleetings included, opted-out fleetings excluded,
  processed fleetings excluded, flag-without-session-id is a no-op,
  session-id-without-flag is a no-op.

---

## ADR-070 — Learning mode source material workflow

**Status:** Accepted (Phase 9 Slice 2)

**Context:** Philosophy doc §5.6 open problem 1 is named **critical**:
a learning map without mapped source materials is a curriculum without
textbooks. The system cannot generate a great learning plan and say
"good luck finding materials." A learning mode project's value
depends on giving the user a path from "I want to learn motor
encoders" to "here are five sources at the right level for phase 1,
with free links where they exist."

The design brief recommends a hybrid: AI-suggested free resources
mapped to each phase, with the user able to confirm, replace, or
supplement. This ADR records the implementation shape.

**Decision:**

- **Sources gain a `status` column** via migration
  `0008_slice2_additions.sql`:
  - `'suggested'` — AI-proposed during learning map generation; not
    yet reviewed.
  - `'confirmed'` — user reviewed and accepted as part of the plan.
  - `'user_supplied'` — user added the source themselves, bypassing
    the suggestion flow.
  - Default `'user_supplied'` for backward-compatibility (existing
    sources weren't AI-suggested).
  - Adding a column (no CHECK rewrite) avoids the table-recreate
    ceremony for what is one optional field.
- **Web search at generation time.** The learning map endpoint
  invokes the generation provider with the Anthropic `web_search`
  server tool enabled. The prompt instructs the model to research
  the topic before building the map: derive phases and sub-topics
  from what it finds, then populate each phase with specific source
  recommendations including direct URLs where they exist.
- **The provider Protocol gains an `enable_web_search: bool`
  parameter** on `complete`. Anthropic implements it (passes the
  `web_search_20250305` tool definition to the messages API). Ollama
  raises `NotImplementedError` if `enable_web_search=True` is passed
  to it — local generation has no equivalent.
- **The endpoint returns the structured plan**, not a free-form
  answer. JSON shape:
  ```
  {
    "phases": [
      {
        "name": "Phase name",
        "goals": ["Bullet", "Bullet"],
        "sources": [
          {"title": "...", "url": "...", "type": "article",
           "reasoning": "Why this source for this phase"}
        ]
      }
    ]
  }
  ```
  Phases become rows in the project's working state (no new table —
  the briefing prompt or a structure note's content carries the
  plan). Sources are created in the `sources` table with
  `status='suggested'`.
- **UI surfaces "Suggested — not verified."** Every suggested
  source carries this label in the workspace until the user moves it
  to `'confirmed'` or replaces it. This is the visible part of the
  hybrid design — the user knows what the AI proposed vs what they
  vouched for.
- **Quality variance is a known risk.** Web-search-augmented
  generation can produce inconsistent phase structures across runs
  for the same prompt. This ADR accepts that risk for Slice 2;
  tuning is Phase 10 work. If the variance is severe in practice,
  the PR description will flag it and a follow-up ADR will name a
  fix (lower temperature, structured output enforcement, or
  caching).

**Rationale:**

- **Hybrid over pure AI-suggestion.** A pure-AI plan would force
  users to either accept whatever the model produces or rebuild from
  scratch. The status enum supports the natural workflow: AI seeds,
  user refines.
- **Status on `sources`, not a join table.** A source has one
  current status; tracking history of how it got to that status is
  not in scope. A column with a CHECK constraint is the minimum
  viable schema; if status transitions become load-bearing,
  promotion to a separate `source_status_history` table is forward-
  compatible.
- **Provider Protocol extension, not a side channel.** Adding tool
  support to `complete` means future tool-use features (suggest-
  links with web context, citation verification, etc.) reuse the
  same plumbing rather than each invention re-doing it.
- **Web search is server-side.** The Anthropic API's `web_search`
  tool runs server-side at Anthropic; we don't proxy traffic to
  external search engines from our backend. This is operationally
  the simplest path and matches the existing constraint that all
  generation goes through the provider abstraction.

**Consequences:**

- **Migration `0008_slice2_additions.sql`** adds the `status`
  column on `sources`. Existing rows are backfilled to
  `'user_supplied'`. Phase 9's narrative timeline migration shifts
  from `0008` (build plan illustrative) to `0009`. No coordination
  cost: migration numbers are assigned by landing order.
- **`EmbeddingProvider` unchanged.** Only the generation Protocol
  grows; embeddings have no tool concept.
- **Anthropic-only feature in v1.** Ollama users see "Local
  generation does not support web search" when they request a
  learning map. This is acceptable — the alternative is silently
  producing a map with no sources, which is the failure mode this
  ADR exists to prevent.
- **Cost.** Each learning map generation invokes web search and
  longer-than-usual generation (multiple phases, multiple sources).
  Expected cost is a small multiple of a regular generation call;
  worth tracking once real usage exists. Not gated in v1.
- **Frontend learning-mode panel** gains a "Generate learning map"
  affordance and a per-phase source list with `Confirm` / `Replace`
  actions on each suggested source. Replacement uses the existing
  source-creation flow with `status='user_supplied'`.

---

## ADR-064 — Narrative event node design (flag on permanent nodes)

**Status:** Accepted (Phase 9 Slice 4)

**Context:** The narrative timeline needs an event primitive — the
spine of the inverted workflow described in
`docs/constellation-use-case-philosophy.md` §2.2 and the build plan.
A scene, beat, or story event is something the user places on the
timeline canvas; it has a position in story time, a position in
discourse order, and connections to characters, themes, and lore.

Two structural shapes were considered (concept doc §8 "Node type
decision"):

- **Option A — new `event` node type.** A fifth value in the
  `NodeType` enum alongside `fleeting | literature | permanent |
  structure`. Events get dedicated fields and dedicated API surfaces.
- **Option B — `is_story_event` flag on permanent nodes.** A boolean
  column plus event-specific nullable columns. Events appear in the
  same Notes/Search/Ask surfaces as any other permanent note.

**Decision:** Option B. Story events are permanent nodes with the
following Slice 4 column additions on `nodes` (migration
`0010_narrative_timeline.sql`):

- `is_story_event INTEGER NOT NULL DEFAULT 0` — boolean flag.
- `story_time TEXT` — nullable; free-text or ISO date. Free-text is
  the dominant shape ("Act 2, Scene 3" / "Day 14"). The axis renders
  these positions; ordering is by `discourse_position`, not by parsing
  `story_time`.
- `prose_status TEXT CHECK(prose_status IN ('planned', 'draft',
  'written', 'revised'))` — nullable; tracks where in the writing
  pipeline this scene is (ADR-071).
- `manuscript_location TEXT` — nullable; opaque pointer to where the
  scene lives in the external manuscript (ADR-071).

**Rationale:**

- **Events are graph citizens immediately.** Search, Ask, suggest-
  links, and the embedding pipeline already operate on permanent
  nodes. Option B inherits all of them for free; Option A would
  require copying every plumbing point.
- **ADR-006 holds.** The node-type vocabulary stays at four entries.
  Adding "event" as a fifth type was rejected explicitly in the
  concept doc for the same reason ADR-006 caps the enum: each type
  costs surface-area in every component that pattern-matches on it.
- **Same flag-vs-type pattern as projects.** ADR-063 made `structure`
  nodes specialize via `is_project_hub`. Story events specialize the
  same way via `is_story_event`. One consistent specialization
  pattern across the codebase.
- **Migration is column-add only.** No CHECK-constraint table-recreate
  on `nodes` (the `nodes.type` CHECK doesn't change). The
  `prose_status` CHECK is added on a brand-new column with no
  pre-existing rows to validate, so it works in pure ALTER ADD.

**Consequences:**

- **Notes view needs a "hide story events" toggle.** A narrative
  project with 80 scenes will otherwise drown the Notes list. The
  toggle uses the B2 filter framework (already shipped) with a new
  predicate `is_story_event = 0`. Default off — events visible by
  default, matching the principle that no feature is gated on mode.
- **Ask and Search see event nodes.** This is a feature: "what did I
  encode about the harbor scene?" returns the event node. The
  embedding service operates on title + content, both of which the
  user authors on event creation.
- **Event nodes are embeddable without changes.** They go through
  `embed_or_queue` like every other permanent. The narrative-timeline
  surface is a *lens* over the same graph — not a parallel store.
- **Migration path to Option A is open.** If event-specific fields
  proliferate to the point that they pollute the permanent row, a
  future migration adds the `event` enum value, backfills
  `type = 'event' WHERE is_story_event = 1`, and removes the flag.
  ADR-006's "if the project grows substantially, revisit" clause
  applies. Not in scope for Phase 9.
- **The Notes filter API gains one new predicate.** Backend repo
  `list_nodes` learns `hide_story_events: bool`. ADR-055 (the filter
  contract) covers compose-with-AND semantics; no new ADR needed.

---

## ADR-065 — Parallel timeline data model (structure-node-per-timeline + join table)

**Status:** Accepted (Phase 9 Slice 4 — implementation Slice 5)

**Context:** A narrative project may have one timeline (a simple
single-thread story) or many (parallel storylines, alternating POVs,
multi-protagonist epics). The design brief §1 Decision 5 commits to
multiple-timelines-by-design rather than retrofitting later. The
schema must support:

- One event appearing in multiple timelines with different discourse
  positions (a crossover scene).
- Adding a timeline without changing the event nodes themselves.
- A timeline being a graph citizen (it can have COLLECTS edges to its
  events, can be the target of QUESTIONS edges, etc.).

Two shapes were considered:

- **Option X — `discourse_position` as a column on `nodes`.** Simple
  for single-timeline cases but cannot represent the same event at
  different positions in different timelines.
- **Option Y — structure-node-per-timeline + join table.** Each
  timeline is a structure node; events relate to timelines through a
  separate `event_timeline_positions(event_node_id, timeline_node_id,
  discourse_position)` join with composite primary key.

**Decision:** Option Y. Each parallel timeline is a structure node.
The workspace timeline canvas treats every timeline structure node as
a lane (swim lane in Slice 5; single-lane single-timeline in Slice 4).
Migration `0010_narrative_timeline.sql` creates:

```sql
CREATE TABLE event_timeline_positions (
    event_node_id      TEXT NOT NULL REFERENCES nodes(id),
    timeline_node_id   TEXT NOT NULL REFERENCES nodes(id),
    discourse_position INTEGER NOT NULL,
    PRIMARY KEY (event_node_id, timeline_node_id)
);
CREATE INDEX idx_etp_timeline ON event_timeline_positions(timeline_node_id);
```

**Discourse position is scoped to the timeline, not global.** A
crossover scene has two rows — same `event_node_id`, different
`timeline_node_id`, different `discourse_position`. Reordering one
lane doesn't disturb the other.

**Creating an event on the canvas:**

1. User clicks empty space within a lane (timeline structure node).
2. Frontend creates a permanent node with `is_story_event = 1`.
3. A `COLLECTS` edge is created from the timeline structure node to
   the new event node.
4. A `FOLLOWS_FROM` edge is created from the preceding event node
   (within the same lane, by discourse position) to the new event
   node — if one exists.
5. A row is inserted into `event_timeline_positions` with the
   `discourse_position` derived from the click X-coordinate.

**Rationale:**

- **Crossover scenes have a natural representation.** Two rows in the
  join table, both pointing at the same event. No special handling,
  no "is_crossover" flag, no parent/child links.
- **Reordering is per-lane.** Updating `discourse_position` updates
  one join row; the same event's position in another lane is
  untouched.
- **Timeline is a graph citizen.** Because a timeline is a structure
  node, it has the same graph integrations as any other structure
  node — including the workspace's `COLLECTS`-based scope, the
  graph viz, and Ask context.
- **`COLLECTS` is the right semantic.** A timeline structure node
  *collects* its events. ADR-052 and ADR-051 fixed the meaning of
  `COLLECTS` as "structural inclusion in a map of content"; a
  timeline is exactly that kind of map.

**Consequences:**

- **The `event_timeline_positions` join is the source of truth for
  ordering.** The Slice 4 single-timeline UI still uses this table —
  it just queries `WHERE timeline_node_id = ?` for one timeline.
- **A project can have zero timeline structure nodes** (research or
  learning project with no narrative work). The timeline tab renders
  an empty-state with a "Create your first timeline" affordance.
  Slice 4 ships single-timeline auto-creation: if a narrative project
  has no timeline structure node yet, opening the timeline tab
  creates one. Slice 5 adds explicit timeline creation for
  multi-thread stories.
- **`FOLLOWS_FROM` edges are per-lane too.** When an event is
  re-ordered within a lane, its incoming `FOLLOWS_FROM` edges are
  updated by removing the stale edge and creating a new one to the
  current predecessor in that lane. Edges to events in *other* lanes
  are untouched.
- **Discourse position is an integer.** Frontend reorder operations
  may need to renumber a lane; the backend exposes
  `PATCH /nodes/{id}/timeline-position` that accepts the new integer
  and the timeline_node_id. Atomic single-row update; no batch
  renumbering required in Slice 4.

---

## ADR-066 — Narrative timeline component (custom SVG/Canvas)

**Status:** Accepted (Phase 9 Slice 4)

**Context:** The narrative timeline canvas is the primary authoring
surface for the narrative-mode workflow (philosophy doc §2.2; concept
doc §8). It is not a utility component; it is *the* surface where the
spine of a story is built. Picking the right substrate matters because
this component will accrete features through Slices 4, 5, and Phase
10+.

Three options were considered (design brief §1 Decision 3):

- **`vis-timeline`** — mature, MIT-licensed, two-axis support, drag-
  and-drop included.
- **`react-chrono`** — simpler, React-native, fewer features.
- **Custom SVG/Canvas** — full control, significant build cost.

**Decision:** Custom SVG/Canvas. Both library options are rejected.

**Rationale:**

1. **Story-time x-axis is incompatible with library assumptions.**
   `vis-timeline` and `react-chrono` both assume calendar time on the
   x-axis. Story time is narrative beats, acts, free-text positions
   ("Day 14", "Act 2 Scene 3") with no real-world date. Every feature
   added on top of a calendar-time foundation compounds friction —
   the axis labels, the scaling logic, the zoom behavior, the
   "today" indicator all have to be fought against rather than
   leaned on.
2. **Theme density overlay (Slice 5) is a drawing operation.** Showing
   where a motif is dense vs. sparse across the timeline is a visual
   overlay across event lanes, not a row of events. Library
   components treat this as an unsupported edge case. Custom SVG/
   Canvas handles it as a first-class rendering pass.
3. **Character arc curves (Phase 10) are a drawing operation.**
   Rendering a character's emotional trajectory as a curve overlaid
   on their events is similarly unsupported by library options. The
   component architecture must support it without a rewrite.
4. **Visual language ownership.** Library timeline components carry
   the aesthetic of project management or scheduling tools. The
   narrative timeline should feel like it belongs to Constellation —
   a storyboard surface, not a Gantt chart.

**Technical substrate:**

- **SVG** for the timeline structure: lanes, gridlines, axis labels,
  event card positions, FOLLOWS_FROM connectors. SVG has clean hit-
  testing, scales well at the personal-tool event scale (50–500
  events), and is accessible. Slice 4 uses SVG only.
- **Canvas** for density / heatmap overlays in Slice 5 — avoids SVG
  performance issues when many translucent rectangles overlap. Slice
  4 does not introduce canvas.
- **Drag-and-drop via pointer events.** Slice 4 implements drag-to-
  reorder using SVG pointer events directly (mousedown / pointermove
  / pointerup), not via `@dnd-kit/core`. The interaction is simple
  enough (horizontal drag within a lane) that adding a dependency
  is unjustified. If Slice 5's cross-lane dragging requires it, the
  dependency can be added then.
- **Zoom and pan** via CSS `transform` on the SVG viewport — simple
  and performant at this scale. Not in Slice 4 scope; deferred.

**Phased scope (held tight in Slice 4):**

- **Slice 4:** Single timeline lane, story-time x-axis (rendered as
  positions, not parsed dates), event cards, click-to-create, drag-
  to-reorder, FOLLOWS_FROM auto-edge on creation, act spans as
  background regions, click event → side panel.
- **Slice 5:** Parallel swim lanes, lane toggle, character lane
  filtering, theme/motif attachment UI, crossover-scene support.
- **Phase 10:** Theme density overlay, character arc curves, advanced
  visual vocabulary. Drawing-pass additions, not rewrites.

**The component owns:**

- Lane rendering (single in Slice 4; structure ready for multiple).
- Axis labels and gridlines.
- Event card positioning by discourse_position within a lane.
- Click-on-empty-space → create event affordance.
- Drag-to-reorder within a lane.
- FOLLOWS_FROM connector rendering between adjacent cards.
- Selection → side panel integration.

**The component does not own:**

- Event node CRUD (delegates to `POST /nodes/story-event` and the
  existing node endpoints).
- Edge CRUD (delegates to existing edge endpoints).
- Character / lore management (managed via normal node detail views;
  the timeline only renders attachments to events).

**Consequences:**

- **The component is built with Slice 5 extensibility in mind.** The
  SVG layout takes a lane identifier even when only one lane is
  rendered in Slice 4 — adding multiple lanes is a layout pass, not
  a rewrite. Event card components accept a lane id; coordinate
  calculations are scoped to a lane.
- **No new dependencies in Slice 4.** No `@dnd-kit`, no `react-zoom-
  pan-pinch`, no SVG charting library. Mermaid (Slice 3) is already
  in the bundle for the diagram-rendering case; the timeline is
  separate.
- **Custom-component cost is the single largest piece of Phase 9.**
  Build budget is held by tight Slice 4 scope: single lane, no
  themes, no characters. Anything that creeps into Slice 4 from
  Slice 5 must be flagged and pushed back.

---

## ADR-067 — Synthesis history association

**Status:** Accepted (Phase 9 Slice 2 / Slice 3 — recorded retroactively)

**Context:** The workspace's resume-briefing flow generates a permanent
note from a Synthesize call against the project scope. The synthesis
history list in the workspace needs to know which permanents are
briefings belonging to *this* project.

Three options were considered (concept doc §6 Decision 3):

a. Query for permanents whose CITES edges point at ≥2 nodes within
   the project scope.
b. Tag synthesis outputs with the project's primary tag at save time.
c. A new `synthesis_runs` join table associating each saved synthesis
   with a project.

**Decision:** Option (b) — tag synthesis outputs with the project's
primary tag at save time. The workspace surfaces synthesis history by
filtering permanents tagged with the primary tag where the content
came from `saveAnswer` (heuristic: title starts with "Briefing —").

**Rationale:**

- **Reuses existing tag plumbing.** No new schema, no new endpoint,
  no new join queries. The primary tag is already the cross-surface
  project anchor (ADR-063); using it as the synthesis-history anchor
  is consistent with the rest of the workspace.
- **Option (a) is fragile.** A synthesis happens to cite two
  project-tagged notes incidentally — it would surface as project
  history even when it's not. The user would have no way to opt out
  short of removing the CITES edge.
- **Option (c) is right but premature.** A dedicated join table is
  the correct shape if synthesis history becomes load-bearing
  (cross-project search, dated history queries, etc.). It is not
  worth the migration cost in Slice 2.
- **Forward-compatible.** A future `synthesis_runs` table can be
  populated by inspecting CITES edges and tag membership of existing
  saved briefings; no data is lost by deferring.

**Consequences:**

- **Resume briefing depends on the project having a primary tag.**
  ADR-063's silent-failure guardrail already covers this: the UI
  must surface the "no primary tag" state prominently. The Slice 2
  workspace left panel does so.
- **A user manually tagging a non-briefing permanent with the primary
  tag will see it in synthesis history.** This is a minor source of
  noise. Acceptable for now; a `is_synthesis` boolean on nodes is
  the next-step fix if it becomes a real problem.
- **Migration path:** when ready, `synthesis_runs(synthesis_id,
  project_id, prompt, created_at)` would be populated by the
  save-answer flow going forward and backfilled from CITES + tag
  membership for existing rows.

---

## ADR-071 — Manuscript source handling in narrative mode

**Status:** Accepted (Phase 9 Slice 4)

**Context:** The standard source model (the `sources` table) assumes
a stable, finished external document — a datasheet, a textbook chapter,
an article URL. A manuscript in active development violates this in
every direction:

- It is one massive, constantly changing artifact.
- The relationship is inverted: the manuscript is built *with* the
  notes (events on the timeline become scenes in the manuscript),
  not extracted *from* them.
- Specific positions within the manuscript ("light motif first
  appearance, page 47") matter and shift as the manuscript is edited.

The philosophy doc §5.6 names this as an open problem; the design
brief leaves implementation shape to Slice 4. Three approaches were
considered:

- **Treat manuscript as a giant source** (force-fit the existing
  model). The source row would be massive, edits would mean
  re-ingesting, position-tracking would be impossible.
- **Build a dedicated manuscript editor inside Constellation.** Out
  of scope for v1 — the philosophy doc commits to "writing alongside
  an external editor" (§2.7), not "writing in Constellation."
- **Light integration: open-in-editor + per-scene status + opaque
  location pointer.** Scenes (story event nodes) carry their own
  prose-status and an optional manuscript_location string.

**Decision:** Approach 3. Slice 4 adds two columns to `nodes`:

- `prose_status TEXT CHECK(prose_status IN ('planned', 'draft',
  'written', 'revised'))` — per-scene writing-pipeline state.
- `manuscript_location TEXT` — opaque free-text pointer to the
  scene's location in the external manuscript. Examples:
  "manuscript.md L427", "FireStoker_draft3.docx p47", "/scenes/harbor.md".

**Both are nullable** and unused by non-narrative nodes. The schema
does not interpret `manuscript_location`; the field is purely a
reminder for the writer.

**No manuscript ingestion in Phase 9.** Importing the manuscript as
a source for Ask retrieval, parsing position pointers, syncing scene
changes back into Constellation — all deferred to Phase 11+.

**Rationale:**

- **Respects the external-editor commitment.** Constellation is the
  *context* layer; the manuscript lives in the user's editor of
  choice. The columns added here serve the writer's recall, not the
  app's automation.
- **`prose_status` makes timeline filtering possible.** Slice 4
  ships the column; the side panel renders a status selector. A
  future Slice or Phase 10 surface can filter the timeline to "show
  only `planned` scenes" — directly the writer's "what's next"
  view.
- **`manuscript_location` is opaque.** Any structured pointer
  (filepath + line number, chapter + paragraph, etc.) would break
  the moment the writer edits the manuscript. Free-text is robust:
  the writer maintains it as they see fit, and Constellation never
  needs to parse it. If a future Phase 11 manuscript-aware feature
  needs structure, a separate column or table can encode it without
  invalidating this one.
- **`CHECK` constraint for `prose_status` enforces the enum.**
  Reduces the chance of typos in the values flowing through API
  payloads and frontend code.

**Consequences:**

- **Migration column-add only.** No table-recreate for these two.
- **The event side panel shows a `prose_status` dropdown.** Slice 4
  ships this. The four values are surfaced as a small badge on the
  event card itself so the writer scans the timeline and sees which
  scenes are which color of "done."
- **`manuscript_location` is shown but not validated.** The side
  panel renders the string with a "Copy" button next to it. No
  attempt to launch the editor or follow the pointer.
- **The launch-in-editor affordance** mentioned in the concept doc
  is deferred to a future polish pass. The manuscript_location field
  ships now; the editor-handoff UI does not (cross-OS launching is
  a separate concern).
- **Future Phase 11+ manuscript integration** has a clear extension
  point: a new `manuscripts` table or a new source type, populated
  from `manuscript_location` values that already exist in the user's
  scenes.

---

## ADR-072 — Act span schema (separate table for span events)

**Status:** Accepted (Phase 9 Slice 4)

**Context:** Acts in a story are spans, not points: "Act 2 runs from
the inciting incident through the climax." The timeline must render
acts as background regions with labels — the visual frame within
which point events sit. The current `event_timeline_positions` schema
(ADR-065) handles point events only; acts cannot be represented as
events because they don't have a single discourse position.

Two shapes were considered (philosophy doc §5.6 open problem 5):

- **Special act node type with start/end position columns.** Reuses
  the node table; events and acts coexist in one timeline-positions
  table.
- **Separate `act_spans` table.** Spans live in their own table;
  point events stay in `event_timeline_positions`.

**Decision:** Separate `act_spans` table. Migration
`0010_narrative_timeline.sql` adds:

```sql
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

Act spans are scoped per timeline (one timeline = one set of acts;
multiple timelines = multiple sets). `start_position` and `end_position`
are integers on the same discourse-position axis as
`event_timeline_positions.discourse_position`. Renaming or restructuring
the axis affects both consistently.

**Rationale:**

- **Acts are not events.** They don't have a single position, they
  don't connect via `FOLLOWS_FROM` to adjacent events, they don't
  carry the same fields (`prose_status`, `story_time`). Forcing them
  into the event table would either pollute the event schema or
  require flags everywhere code touches events.
- **Acts are not graph citizens (in Slice 4).** They're a visual
  framing device for the timeline canvas. The user doesn't write
  Ask queries about "act 2" as a primary noun — they write about
  the scenes within act 2. Keeping acts out of `nodes` reflects
  that: they're a property of a timeline, not a knowledge object.
  If Phase 10+ wants acts to be queryable, a `node_id` column can
  be added to `act_spans` without disturbing existing rows.
- **The `color` column is optional.** Default rendering picks a
  color based on the span's index in the timeline; the user can
  override via the side panel. Storing the override here keeps the
  color stable across re-renders.

**Consequences:**

- **API surface:** `POST /projects/{hub_id}/act-spans` creates a
  span; `GET /projects/{hub_id}/timeline` includes the spans for the
  project's active timeline structure node(s). No standalone
  `/act-spans/{id}` GET in Slice 4 — the timeline-view endpoint is
  the only consumer.
- **No CHECK on positions.** The DB allows `start_position >
  end_position` and overlapping spans across rows. The frontend
  prevents both at create-time. Future tightening can add a CHECK
  if the lax form proves to be a source of bugs.
- **Drag-to-resize is Slice 5+ work.** Slice 4 ships act-span
  creation via a "Define act" dialog (label + start + end picker
  pulling from the timeline's event positions). The drag-to-resize
  affordance on the canvas waits.
- **Multiple timelines means multiple act sets.** A two-protagonist
  story with two timelines can have its own "Act 1 / Act 2 / Act 3"
  per timeline. No cross-timeline coupling.

---

## ADR-074 — Frontend visual foundation: single accent, global focus ring, scrolling nav

**Status:** Accepted

**Context:** The frontend grew page-by-page with ad-hoc Tailwind utilities and
no shared design layer. `globals.css` was empty, the Tailwind config was
unextended, and there was no app-wide treatment for keyboard focus, text
selection, or reduced-motion. Concrete symptoms: the top nav mixed three
accent colors (`indigo-700` brand, `blue-600` Ask, `indigo-600` Synthesize),
gave no active-state indication of the current page, and packed 11
non-wrapping links into a single fixed row that clips on narrow viewports.
Most interactive elements (nav links, dashboard tiles, note cards) had no
visible keyboard focus state at all — a WCAG 2.4.7 gap.

**Decision:** Establish a thin, token-light visual foundation rather than
adopt a component library:

- **Indigo is the single brand accent.** Ask's stray `blue-600` is folded
  into indigo. Generative actions (Ask, Synthesize) remain visually grouped
  via a divider and medium weight, not a separate hue.
- **Global `:focus-visible` ring** in `globals.css`, backed by a `--brand`
  CSS variable. Components that define their own ring still win on `:focus`.
- **Top nav becomes horizontally scrollable** (`overflow-x-auto` +
  `scrollbar-none`) instead of clipping/wrapping, with an animated
  active-page underline driven by `usePathname`.
- **App-wide base styles**: font smoothing, heading tracking, a
  `prefers-reduced-motion` reset, and `scrollbar-thin`/`scrollbar-none`
  utilities.

**Rationale:**

- A handful of base rules and shared utility classes deliver app-wide
  consistency and accessibility wins without a large refactor or a new
  dependency, which suits a single-user tool.
- Keeping tokens minimal (CSS variables + Tailwind's default palette)
  avoids a parallel theming system that would drift from the inline
  utilities already in use across pages.
- `:focus-visible` over `:focus` keeps the ring keyboard-only, so mouse
  users see no regression.

**Consequences:**

- New interactive elements inherit a focus ring for free; opt out only
  with an explicit local style.
- Accent color is centralized conceptually but still expressed as inline
  `indigo-*` utilities per element — a future ADR could promote a Tailwind
  `brand` color token if churn warrants it.
- The scrolling nav trades guaranteed visibility of every link on small
  screens for a stable, non-clipping layout; a future breakpoint-driven
  menu can supersede this if the link count keeps growing.
- No change to routes, data, or component APIs — purely presentational.

---

## ADR-075 — Shared UI primitives via a Tailwind `@layer components` layer

**Status:** Accepted

**Context:** ADR-074 unified the global chrome, but each page still styled
buttons, inputs, cards, badges, and empty/loading/error states with bespoke
inline Tailwind strings. The same button appeared as `px-3 py-1 rounded
bg-indigo-600 …` on one page and `px-3 py-1.5 rounded-md bg-indigo-600 …` on
another; "no results" states ranged from italic gray text to dashed cards.
Applying a consistent visual language across ~30 page/component files needed
a single source of truth.

**Decision:** Add a `@layer components` block in `globals.css` defining
reusable primitives via `@apply`, and compose pages from them:

- Buttons: `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` /
  `.btn-danger`, with `.btn-sm`.
- Form controls: `.input`, `.textarea`, `.label`, `.field-hint`.
- Surfaces: `.card`, `.card-interactive`.
- Misc: `.badge`, `.page-title`, `.section-label`, `.empty-state`,
  `.skeleton`, `.alert-error`.

Layout (width, margins, grid placement) stays at the call site; the classes
own only the visual identity. No React component library was introduced.

**Rationale:**

- A CSS component layer gives app-wide consistency with the smallest possible
  footprint — no new dependency, no prop API to design, no migration of every
  element into wrapper components. Pages keep using Tailwind utilities for
  layout and just swap visual strings for a class name.
- `@apply` keeps the primitives co-located with the rest of the design tokens
  in `globals.css`, so the brand accent, focus ring, and component styles
  evolve together.
- Semantic colors that encode meaning (note-type chips, success/warning/error,
  user tag colors) stay as explicit utilities and are deliberately *not*
  folded into the primitives, so meaning is never accidentally restyled.

**Consequences:**

- New UI should reach for these classes first; bespoke button/input strings
  are now the exception, not the norm.
- The primitives are intentionally minimal. Variants beyond the current set
  (e.g. icon-only button sizing, input error state) can be added to the layer
  rather than re-invented per page.
- Because layout stays at the call site, the classes never fight the page —
  but callers must still supply `w-full`, `ml-auto`, etc. where needed.
- Purely presentational: no routes, data, or component APIs changed.

---

## ADR-073 — Markdown-first note content with KaTeX math rendering

> Numbering note: the prompt that scoped this work referred to it as
> "ADR-034", but that number (and several others) was already taken by the
> time this was implemented. Per the append-only convention, this ADR takes
> the next free number, ADR-073. Cross-references in `architecture.md` § 7
> and `docs-site/architecture/stack.md` point here. Supersedes ADR-037.

**Status:** Accepted

**Context:** Note content was stored as plain text and rendered inconsistently
across surfaces — some used `react-markdown` + `remark-gfm`, others rendered
raw text. There was no support for mathematical or engineering notation, which
is needed for embedded systems and technical notes (register values, formulas,
signal timing expressions). A consistent rendering contract was needed.

**Decision:** All note content is treated as markdown by default, both at entry
time (textarea input) and display time (all rendering surfaces). LaTeX math
syntax is supported via `remark-math` + `rehype-katex` + KaTeX CSS. A single
shared `<NoteContent>` component is the canonical renderer used by every surface
that displays note body text. Note entry textareas gain a Write/Preview toggle
for inline verification of formatting and math.

**Rationale:**

- Plain text stored in a markdown-aware system has no downside: it renders as
  plain text with no data loss, no FTS5 interference, and no schema changes.
- KaTeX is significantly faster than MathJax and covers the full LaTeX math
  vocabulary needed for engineering and embedded systems notation.
- A single shared `NoteContent` component ensures rendering consistency across
  all surfaces (note detail, inbox, process page, RAG answers, graph panel,
  narrative surfaces) without per-surface maintenance.
- The Write/Preview toggle on textareas provides lightweight verification without
  the complexity of a full split-pane editor.
- No backend changes are needed: markdown syntax and LaTeX delimiters are plain
  characters at the storage layer, fully compatible with FTS5 and the RAG context
  assembly pipeline (ADR-022). The minor token overhead of markdown syntax in
  RAG context is negligible at personal tool scale.

**Consequences:**

- All new and existing note content is now interpreted as markdown. A note with
  an accidental asterisk will italicize rather than render literally — acceptable
  and expected for a markdown-first system.
- KaTeX math syntax: inline math with `$...$`, display math with `$$...$$`.
- `NoteContent` absorbs the existing fenced-`mermaid` code-block handling that
  previously lived in `MarkdownWithMermaid` (now removed), so diagram rendering
  is preserved alongside math. All other fenced code blocks keep their default
  monospace treatment.
- Narrative surfaces (Story Dump, Timeline → Scene Context, etc.) render note
  content through `NoteContent` — this is correct behavior, not a special case.
- The RAG context sent to Claude contains raw markdown and LaTeX delimiters.
  Claude handles these naturally; the token overhead is negligible.
- Compact one-line list labels that show a truncated `summary` (e.g. search
  results, the Notes list) remain plain text: markdown block rendering is
  incompatible with `line-clamp` truncation, and these are navigational labels,
  not content surfaces. `NoteContent` is used for every full-content and
  multi-line excerpt display.
- Adding a new surface that displays note content requires using `NoteContent` —
  this is now the established convention, documented here.

---

## ADR-076 — Timeline full-screen mode, shared axis + zoom, dim-not-hide filters

**Status:** Accepted

**Context:** The narrative timeline (ADR-066) renders inside the workspace
center column, sandwiched between the 260 px left rail and 280 px right rail —
roughly half the viewport on a laptop. For a trilogy-scale story world with
hundreds of events across several parallel layers (external plot, a dream
progression, a history 50 years prior), that column is far too cramped. Three
concrete defects surfaced in the Canon stress-test audit:

1. No way to give the timeline the full screen.
2. A fixed zoom (`POSITION_SCALE = 0.4`) with no control — a long story runs
   off-canvas with no way to compress, and dense regions can't be expanded.
3. Each lane computed its **own** `minPos`/`maxPos`/`canvasWidth` and lived in
   its **own** horizontal scroll container, so parallel lanes neither aligned
   on a common axis nor scrolled together. A writer could not see "where the
   dream beat falls relative to the external scene".

Filtering was also thin: only a lane-visibility toggle and a single
character-highlight.

**Decision:**

- Add a **full-screen mode**: a toggle promotes the timeline into a
  `fixed inset-0 z-40` overlay (Esc to exit). State is local to the panel; no
  routing change.
- Introduce **discrete zoom levels** (`ZOOM_LEVELS`, default index → 0.4, the
  prior constant) with −/percentage/+ controls. The percentage label resets to
  default on click.
- Compute **one shared position range** across all visible lanes and pass it
  plus the active zoom scale to every lane, so lanes use identical
  x-coordinates and width. Wrap all lanes in a **single** horizontal scroll
  container; lane headers are `sticky left-0` so labels stay visible. Result:
  parallel timelines align and scroll together.
- Broaden filtering with a **prose-status chip set** and a **free-text search**
  over title + story_time. These, plus the existing character-highlight, **dim**
  non-matching events rather than **hiding** them.

**Rationale:**

- Dim-not-hide matches the existing character-highlight philosophy (ADR-066 /
  philosophy doc §6.8) and avoids leaving gaps in the FOLLOWS_FROM connector
  chain or losing the writer's sense of where a beat sits on the axis.
- A shared axis is the minimum needed for parallel-timeline comparison, which is
  the entire point of having parallel lanes.
- Discrete zoom levels (vs. continuous) keep the control trivial and the axis
  math integer-clean for the cross-lane drag hit-test.
- The geometry (`sharedPositionRange`, `canvasWidth`, `positionToX`/
  `xToPosition`, `zoomScale`) and the filter predicate (`eventDimmed`,
  `visibleLanes`) are extracted as pure functions in `timelineLayout.ts` /
  `filterTimeline.ts` and unit-tested, following the repo convention
  (`filterGraph.ts`, `filterPool.ts`).

**Consequences:**

- A single-lane project renders identically to before (range still floors at 0,
  ceils at 1000; default zoom unchanged).
- Cross-lane drag continues to work: each lane registers a `clientX →
  discourse_position` converter built from the shared range + scale.
- No backend change. Lane "kind" (dream vs external vs historical) is still
  expressed only by the timeline structure-node's title; a typed `kind` column
  remains a candidate for a future pass and is noted as a remaining gap.

---

## ADR-077 — Story-specific narrative role types via reserved tags (symbol, faction, open-question)

**Status:** Accepted

**Context:** Slice 5 (ADR-065) modeled narrative roles — character, theme,
location, lore — as reserved `narrative:*` tag names on structure/permanent
nodes rather than as new node types, deliberately avoiding schema churn. The
Canon audit found three high-value roles with **no** representation at all:
**symbols/metaphors** (which recur and accrete meaning — a central concern for
the project), **factions** (authority structures / underground groups), and
**open questions** (the writer's unresolved threads). Ability and Artifact/Text
were also unrepresented.

**Decision:** Extend the reserved-tag vocabulary rather than the schema:

- `narrative:symbol`, `narrative:faction`, `narrative:open-question` — surfaced
  as new workspace tabs (Symbols, Factions, Open questions) reusing the existing
  `NarrativeRoleList` (list + quick-create + Ctrl-edit). Symbols/factions are
  `structure` nodes; open questions are `permanent`.
- `narrative:lore-ability`, `narrative:lore-artifact` — added as quick-create
  categories under the existing World / Lore tab (no new tab).

**Rationale:**

- Consistent with ADR-065's decision to use tags, not types: a node's "role" is
  a classification, and tags already drive the list views and quick-create.
- Purely additive and UI-only: tags are created on demand via the existing
  `createTag` flow; no migration, no model change.
- Symbols and open questions link into scenes via ordinary typed edges
  (`ELABORATES`, `EXPLAINS`, `COLLECTS`, `QUESTIONS`), so a symbol's node-detail
  page already answers "which scenes use this symbol" through its edge list.

**Consequences:**

- The scene-context assembler (`timeline_repo`) does not yet special-case
  symbols/factions/open-questions — they appear as generic arc-notes in scene
  context, not in dedicated buckets. Promoting them to first-class
  scene-context groups is a small backend follow-up, recorded as a remaining
  gap.
- Backend `timeline_repo` narrative-tag constants and the frontend
  `NARRATIVE_TAGS` map can drift; they are mirrored by convention. A future pass
  should add the new constants backend-side if scene-context surfacing is built.
- The workspace tab bar now carries 13 tabs and wraps; acceptable for a
  power-user planning tool.

---

## ADR-078 — Relationship Explorer: role metadata on edge summaries + ConnectionsByRole

**Status:** Accepted

**Context:** Constellation stores rich typed relationships but exposed them
poorly. The node detail page grouped *outgoing* edges by edge type and listed
*incoming* edges flat — useful for a researcher reading author-stance verbs,
useless for answering "what is this connected to, and what role does each
connection play?". A symbol can't show "the scenes I appear in"; a claim can't
show "the observations that demonstrate me". The blocker was data shape:
`EdgeSummary.neighbor` was a bare `NodeRef` (id/title/type), so the frontend
could not tell a Character from a Symbol from a Source without an N+1 fetch per
neighbor. This is a **general** knowledge-graph need (Canon is the validator),
not a narrative feature.

**Decision:**

- Denormalise two fields onto `EdgeSummary` (additive, defaulted): the
  neighbor's `neighbor_tags: list[TagRef]` and `neighbor_is_story_event: bool`.
  `get_outgoing` / `get_incoming` select the story flag and bulk-fetch neighbor
  tags in one query (`_neighbor_tags_bulk`), so a node's full neighbourhood is
  categorisable from a single `GET /nodes/{id}` with no extra round-trips —
  which is the explicit Phase-B backend requirement.
- Add a pure, generic grouping module `lib/connectionsByRole.ts`
  (`roleForConnection`, `groupConnectionsByRole`, `connectionsFromDetail`,
  `connectionReason`). Role assignment degrades gracefully: story-event →
  Scenes; reserved `narrative:*` tag → Characters/Symbols/World Rules/…; else
  the node's base type → Sources/Maps & Structures/Notes/…. So it is equally
  useful for a research corpus and a dense story world.
- Add a reusable `ConnectionsByRole` component (collapsible groups, counts,
  direction-aware "why" labels, resolved badges) and mount it on the node
  detail page. The `EdgePanel` editor is retained (no functionality removed).

**Rationale:**

- Denormalising onto the summary (vs. a new endpoint or a graph query) is the
  smallest additive change that removes the N+1; the fields are cheap and
  already in the same row join.
- A pure grouping helper keeps the role taxonomy testable and reusable across
  surfaces (node detail now; workspace/graph later).
- The "Demonstrated In" relabel for world-rules is pushed to the **caller** via
  a `labelOverrides` option, keeping the core helper domain-agnostic — an
  evidence/consequence framing that generalises (a hypothesis is "supported
  by" its evidence).

**Consequences:**

- The *read* side of the Open-Question and Scene-metadata objectives now works
  for free: a question node's related scenes, and a scene's connected open
  questions, both render through `ConnectionsByRole`.
- `bulk` tag fetch is duplicated in `edge_repo` rather than reusing
  `node_repo`'s private helper, to avoid a `node_repo → edge_repo → node_repo`
  import cycle.
- Other `EdgeSummary` consumers are unaffected (fields default empty/false).
  After `pnpm types` the new fields appear in the generated API types
  automatically.

---

## ADR-079 — Typed timeline layers via reserved `layer:*` tags

**Status:** Accepted

**Context:** Parallel timelines (ADR-065) are structure nodes; their "kind"
(external plot vs. a dream progression vs. a history 50 years prior) was
expressed only in the lane title — a naming convention, not data. The audit
asked for typed lane classifications that are filterable and visually distinct,
and extensible.

**Decision:** Classify a timeline by a reserved `layer:<kind>` tag on its
structure node (mirrors the `narrative:*` role-tag pattern; no schema change).
Seed kinds: `external`, `historical`, `dream`, `metaphysical`, `character-arc`,
`theme-arc`; the set is open. Expose the timeline node's tags on `TimelineLane`
(`timeline_tags`) so the frontend can derive the kind, colour/label each lane,
and filter lanes by kind. A pure `timelineLayers.ts` helper resolves a lane's
kind from its tags and powers the filter.

**Rationale:**

- Consistent with the established reserved-tag convention; additive and
  extensible without migrations.
- Surfacing `timeline_tags` (like ADR-078's neighbor tags) avoids a per-lane
  fetch.

**Consequences:**

- Lanes without a `layer:*` tag fall back to an "Unspecified" kind and remain
  fully usable — backward compatible.
- A future pass could let the New-timeline dialog pick a kind directly
  (currently the tag is applied like any other narrative role tag).

---

## ADR-080 — Lifecycle status via reserved `status:*` tags; question resolution reuses ADR-059

**Status:** Accepted

**Context:** Phase B Objective 2 asks for an Open-Question lifecycle (Open /
Developing / Resolved) plus create/complicate/hint/resolve relationships. Two
ways to model it: (a) add first-class edge types
(`CREATES_QUESTION`/`HINTS_AT`/`COMPLICATES`/`RESOLVES`) and a status column, or
(b) reuse what exists. The product direction (confirmed with the user) is to
prefer additive, graph-native changes and avoid backend complexity.

**Decision:** Reuse existing primitives.

- **Relationship side:** a question relates to scenes/notes via the existing
  `QUESTIONS` edge; "resolved by X" is the edge's resolved-state
  (`resolved_at` / `resolved_by_node_id`, ADR-059) — surfaced in the
  Relationship Explorer. No new edge types; `RESOLVES` stays intentionally
  absent (ADR-059).
- **Node side:** a coarse lifecycle status is a reserved `status:{open,
  developing,resolved}` tag (mirrors `narrative:*` / `layer:*`). A generic
  `lib/lifecycleStatus.ts` parses it; `LifecycleStatusControl` sets it (rewrites
  the node's tag set); the Explorer shows the status badge on connected
  questions. Generic across domains (research hypotheses, etc.).

**Rationale:** Adding edge types means a CHECK-constraint table rebuild
migration and would reverse ADR-059. Tags + the existing resolved-state give the
full lifecycle with zero schema change and reuse the resolution semantics
already built and tested.

**Consequences:**

- "Complicate / hint at" nuance is not separately typed; such links use
  `QUESTIONS`/`ELABORATES` with an edge `note`. If finer verbs are needed later,
  that is a deliberate ADR-059 reversal, not an accident.
- Status is a single coarse state per node; richer history (when it moved
  open→resolved) is not tracked — acceptable for the lifecycle's intent.

---

## How to add a new ADR

1. Append a new section at the bottom with the next ADR number.
2. Fill in all five fields (Status, Context, Decision, Rationale, Consequences).
3. If superseding an existing decision, update the old ADR's Status to
   `Superseded by ADR-NNN` and link forward.
4. Reference relevant ADRs from `architecture.md` § decisions where applicable.