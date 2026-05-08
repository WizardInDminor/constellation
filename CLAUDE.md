# Constellation

> Working name — rename freely. The package name `constellation` follows from the
> "constellation thinker" framing of the system: a graph of atomic notes with typed
> relationships, surfaced through AI-assisted retrieval and generation.

## What this is

A personal zettelkasten built on Luhmann's slip-box principles, modernized as a
typed knowledge graph with first-class AI integration. Notes are atomic. Edges
are typed and directional. Retrieval is hybrid (vector + full-text) with optional
graph traversal. Generation is grounded in the user's own notes via RAG.

This is a personal tool, not a SaaS product. Single-user. Local-first data with
optional cloud AI providers.

## Tech stack

| Layer       | Choice                                          |
|-------------|-------------------------------------------------|
| Backend     | Python 3.11+, FastAPI, uvicorn                  |
| DB          | SQLite + sqlite-vec + FTS5 (single file)        |
| DB access   | `aiosqlite` + raw SQL via repository pattern    |
| Validation  | Pydantic v2                                     |
| Frontend    | Next.js (App Router), TypeScript, Tailwind      |
| Type bridge | `openapi-typescript` codegen from FastAPI spec  |
| Embeddings  | Voyage AI (`voyage-4`) — primary                |
| Generation  | Anthropic Claude (`claude-sonnet-4-6`) — primary|
| Local fallback | Ollama (`mxbai-embed-large` + `llama3.2`)    |
| Lint/format | ruff, prettier                                  |
| Tests       | pytest (backend), Vitest (frontend)             |

## Repo structure

```
constellation/
├── CLAUDE.md                # this file
├── docs/
│   ├── architecture.md      # schema, structure, API surface, patterns
│   ├── build-plan.md        # phased build plan + scope boundaries
│   └── decisions.md         # ADR-style decision log
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── core/            # database, config, lifespan
│   │   ├── providers/       # embedding + generation provider implementations
│   │   ├── repositories/    # data access layer (raw SQL)
│   │   ├── services/        # business logic, orchestration
│   │   └── api/v1/          # route handlers
│   ├── migrations/          # SQL migration files, applied in order
│   └── tests/
├── frontend/
│   └── (Next.js standard layout)
├── .env.example
└── README.md
```

## Dev commands

```bash
# Backend
cd backend
uv sync                                    # install deps
uv run uvicorn app.main:app --reload       # dev server on :8000; migrations run at startup
uv run pytest                              # run tests
uv run ruff check . && uv run ruff format .

# Frontend
cd frontend
pnpm install
pnpm dev                                   # dev server on :3000
pnpm types                                 # regenerate TS types from FastAPI
pnpm test
pnpm lint

# Local AI (optional)
ollama pull mxbai-embed-large
ollama pull llama3.2
```

## Coding conventions

- **Async everywhere** on the backend. No sync DB calls, no sync HTTP clients.
- **Pydantic models stratified by purpose**: `NodeRef` (id+title), `NodeSummary`
  (list views), `NodeDetail` (full record + edges). Same pattern as the OIP.
- **Repository pattern**: one repo per aggregate root (`node_repo`, `edge_repo`,
  `source_repo`, `config_repo`). Repositories return Pydantic models, never
  raw rows. Services compose repositories.
- **Raw SQL is the default**. sqlite-vec virtual tables and FTS5 don't fit
  cleanly into ORMs. A thin repository layer is sufficient at this scale.
- **Service layer is where AI lives**. `embedding_service`, `generation_service`,
  `rag_service`, `ingest_service`. Routes are thin.
- **Frontend types come from the backend**. Never hand-write API types — run
  `pnpm types` after backend changes.
- **UUIDs for all node/edge/source IDs**. Generated server-side.
- **ISO 8601 timestamps** in the DB as TEXT. Parse to `datetime` in Pydantic.

## Hard rules — do not violate without explicit approval

- **Do not introduce Postgres.** SQLite is the deliberate choice. See
  `docs/decisions.md` § ADR-001.
- **Do not change embedding dimensions from 1024.** Both Voyage `voyage-4` and
  Ollama `mxbai-embed-large` produce 1024-dim vectors. The `vec_nodes` virtual
  table is fixed at this dimension. See ADR-002.
- **Do not bypass the provider abstraction.** All embedding and generation calls
  go through `EmbeddingProvider` / `GenerationProvider` Protocol implementations.
  No direct calls to Voyage or Anthropic SDKs from services or routes.
- **Do not add an ORM** without first updating ADR-005.
- **Do not store secrets in code or config files.** Use `.env` (gitignored) and
  read via `pydantic-settings`.
- **Do not hard-delete nodes.** All deletes are soft (set `deleted_at`).
- **Do not skip writing migration files** for schema changes. Migrations live
  in `backend/migrations/` and are applied in lexicographic order.

## Where to look first

- Designing a new feature? → `docs/architecture.md`
- Starting a coding session? → `docs/build-plan.md` (find current phase)
- Facing a design choice? → `docs/decisions.md` (it's probably settled)
- Recalling a past session decision or env quirk? → `.claude/memory/MEMORY.md` (session-level log; not a substitute for the docs above)
- None of the above answer the question? → ask the user before deciding.