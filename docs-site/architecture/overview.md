# Architecture Overview

High-level design of the Constellation system.

> For the authoritative and fully detailed reference, see `docs/architecture.md` in the repository. This page is a summary and orientation guide.

---

## Conceptual model

Constellation is a **typed, directional knowledge graph**. The four core entity types are:

- **Nodes** — atomic units of knowledge, polymorphic by type (`fleeting`, `permanent`, `literature`, `structure`)
- **Edges** — typed, directional relationships (7 types: SUPPORTS, CONTRADICTS, ELABORATES, ANALOGOUS_TO, QUESTIONS, INSPIRED_BY, COLLECTS) with an optional free-text context note
- **Sources** — external references that literature notes link to
- **Tags** — lightweight categorization

There is no implicit ordering between notes (no Folgezettel). Structure emerges from edges and structure notes (Maps of Content), not from sequence numbers.

---

## Data layer

Everything lives in a single SQLite file. Three storage engines work together:

| Engine | Purpose |
|--------|---------|
| Standard SQLite tables | Nodes, edges, sources, tags, config, job queue |
| `sqlite-vec` virtual table | 1024-dimensional vector embeddings for semantic search |
| FTS5 virtual table | Full-text search index for keyword search |

All vectors are 1024-dimensional. Both supported providers (Voyage `voyage-4` and Ollama `mxbai-embed-large`) produce 1024-dim embeddings natively. The dimension is fixed at table creation time and cannot change without a migration.

---

## Backend structure

```
backend/app/
├── core/         # database connection, config, startup/shutdown lifespan
├── providers/    # embedding + generation provider implementations (Protocol-based)
├── repositories/ # data access layer (raw SQL via aiosqlite, returns Pydantic models)
├── services/     # business logic, AI orchestration
└── api/v1/       # thin route handlers
```

**Repository pattern**: one repo per aggregate root. Repositories return Pydantic models, never raw rows. Services compose repositories.

**Provider abstraction**: all embedding and generation calls go through `EmbeddingProvider` / `GenerationProvider` Protocol implementations. No direct Voyage or Anthropic SDK calls from services or routes.

**Raw SQL**: sqlite-vec and FTS5 virtual tables don't fit cleanly into ORMs. `aiosqlite` with raw SQL via a thin repository layer is the deliberate choice at this scale.

**Migrations**: SQL files in `backend/migrations/`, applied in lexicographic order at startup via FastAPI's lifespan `asynccontextmanager`. The app won't start if a migration fails.

---

## AI integration points

| Integration | Where |
|-------------|-------|
| Embedding on write | `embedding_service.embed_or_queue()` — called after any node creation |
| Fleeting → permanent decomposition | `rag_service.suggest_permanent()` |
| Link suggestions | `rag_service.suggest_links()` |
| RAG query | `rag_service.query()` — full hybrid search + graph expansion + generation pipeline |
| Document import | `ingest_service.process_document()` — chunks markdown, generates candidates |

---

## RAG pipeline

```
Query → embed → hybrid search (RRF over vector + FTS5) → graph expand (depth-1 BFS)
      → context assembly (seeds: full content; neighbors: summary/excerpt)
      → Claude generation → answer + provenance
```

The top 8 seed nodes receive full content. Up to 12 graph neighbors receive summaries. Edge annotations between nodes in context are included. Every response returns a `provenance` list of which nodes contributed.

---

## Frontend

Next.js App Router. TypeScript types are generated from the FastAPI OpenAPI spec via `pnpm types` — never hand-written. Client components only where interactivity demands it. Graph visualization via `react-force-graph-2d` (canvas, dynamically imported to avoid SSR issues).

---

## What's out of scope (v1)

Multi-user auth, real-time collaboration, mobile native app, plugin system, Obsidian export, image/PDF attachments on notes, voice capture. These are deferred, not forbidden — the architecture doesn't preclude them.
