# Decision Log

ADR-style log of significant design decisions made during Constellation's development.

> The full, authoritative decision log lives at `docs/decisions.md` in the repository. This page summarizes the key decisions by theme. Refer to the source file for complete rationale and consequences.

---

## Data storage

**ADR-001 — SQLite + sqlite-vec over Postgres + pgvector**
Single-file portability, zero server overhead, trivial backup. At personal tool scale, SQLite is the right default. FTS5 and sqlite-vec are both bundled — no additional infrastructure.

**ADR-005 — Raw SQL via `aiosqlite` over an ORM**
sqlite-vec and FTS5 virtual tables are awkward in SQLAlchemy. The repository layer provides the abstraction we need without ORM overhead. SQL files are the migration format (not Alembic auto-generated).

**ADR-009 — Soft delete, not hard delete**
All node deletions set `deleted_at`; rows are never removed. Recovery from mistakes is trivial. A future hard-delete maintenance sweep can be added if needed.

---

## Embeddings

**ADR-002 — Standardize on 1024-dimensional embeddings**
The `vec_nodes` virtual table dimension is fixed at creation. Both supported providers (Voyage `voyage-4` and Ollama `mxbai-embed-large`) produce 1024-dim natively. Switching to a model at a different dimension would require rebuilding the table.

**ADR-003 — Voyage AI for cloud embeddings**
Explicitly recommended by Anthropic as the embedding pairing for Claude workflows. Outperforms OpenAI's embedding models on technical benchmarks relevant to the expected note content.

**ADR-010 — Track embedding model per node; re-embed on provider switch**
Each node stores which model produced its vector. Switching providers triggers an `embedding_jobs` queue. A background worker drains the queue every 10 seconds.

**ADR-011 — Provider switch is a settings-level operation, not a per-query toggle**
Hot toggling would require parallel vector indexes or incoherent mid-session retrieval. A settings-level switch is the right scope for what is actually an intent to change working mode.

---

## AI integration

**ADR-004 — Anthropic Claude for generation, Ollama as local fallback**
Claude is the user's preferred model. Quality of the processing and link suggestion workflows depends on generation quality. Ollama provides an offline path for Phase 7.

**ADR-008 — AI-first v1**
The provider layer and auto-embedding landed in Phase 2, before the capture UI was complete. The fleeting → permanent decomposition is highest-value AI integration and should not be gated behind a future phase.

**ADR-016 — Process workflow auto-calls suggestion on page load**
The user already committed to processing by navigating to the page. An extra "Generate" click adds friction without information. The AI call is the UX — surface it immediately.

---

## Graph design

**ADR-006 — Pure graph, no Folgezettel**
Sequence numbers add schema and UI complexity without payoff for a "constellation thinker" who connects across domains rather than developing chains within one domain. Structure notes (Maps of Content) provide the navigational anchor.

**ADR-007 — Typed, directional edges with optional context notes**
Typed edges enable graph-aware retrieval. The optional "why" note on each edge is often more valuable than the link itself when revisited months later. A fixed vocabulary (not user-defined types) keeps AI prompts well-scoped.

**ADR-019 — Fleeting notes excluded from link targets**
Fleeting notes are transient. A link to a fleeting note would point to a moving target once processing changes or decomposes it. The graph is built from stable permanent notes.

---

## Search and RAG

**ADR-021 — RRF fusion parameters: k=60, N=10 per source, top-8 into context**
k=60 is empirically well-validated (Cormack & Clarke 2009). N=10 per source gives the fusion enough signal. Top-8 seeds + up to 12 neighbors stays well within Claude's context window at personal tool scale.

**ADR-022 — Seeds get full content, neighbors get summary-or-excerpt**
Seeds are direct search hits — full content warranted. Neighbors provide topological context, not primary retrieval — summaries suffice and preserve context budget.

**ADR-026 — Citation format: `[Note N]` with frontend-side substitution**
Backend parsing of AI-generated citation text is fragile. Frontend regex replaces `[Note N]` with markdown links to provenance node IDs. Provenance array is independently useful for the sources panel.

---

## Infrastructure and UX

**ADR-012 — Startup-time migrations via FastAPI lifespan**
Eliminates "forgot to migrate" errors. Migration failure = startup failure = fast, visible feedback. Acceptable for a single-user tool with infrequent deployments.

**ADR-013 — Starlette TestClient over httpx.AsyncClient for route tests**
`httpx.AsyncClient(lifespan="auto")` was removed in httpx 0.27+. `TestClient` handles the ASGI lifespan correctly and is already a transitive dependency via FastAPI.

**ADR-027 — Graph visualization: react-force-graph-2d, client-side filtering, dynamic import**
Purpose-built for force-directed layouts, React-native API. All interactive filters are client-side against a single full-graph fetch — instant response without round trips. Canvas component dynamically imported to avoid SSR issues.

**ADR-031 — `con import` as subcommand of `con`, not a separate binary**
A single named tool is more memorable. The dispatch check is five lines. Backwards compatible — `con "quick thought"` continues to work.

**ADR-033 — Candidate persistence via `pending_ingests` table with lazy expiry**
Candidates from `con import` are persisted as a JSON blob for 7 days. Lazy expiry on the next ingest call keeps the table small without a background worker.

---

For the full text of every ADR — including Status, Context, Rationale, and Consequences — see `docs/decisions.md` in the repository root.
