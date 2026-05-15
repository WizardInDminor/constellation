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

**Status:** Accepted

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

## How to add a new ADR

1. Append a new section at the bottom with the next ADR number.
2. Fill in all five fields (Status, Context, Decision, Rationale, Consequences).
3. If superseding an existing decision, update the old ADR's Status to
   `Superseded by ADR-NNN` and link forward.
4. Reference relevant ADRs from `architecture.md` § decisions where applicable.