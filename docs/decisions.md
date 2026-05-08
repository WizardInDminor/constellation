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

## How to add a new ADR

1. Append a new section at the bottom with the next ADR number.
2. Fill in all five fields (Status, Context, Decision, Rationale, Consequences).
3. If superseding an existing decision, update the old ADR's Status to
   `Superseded by ADR-NNN` and link forward.
4. Reference relevant ADRs from `architecture.md` § decisions where applicable.