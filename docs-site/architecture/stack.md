# Tech Stack

Technology choices and their rationale.

---

## Backend

| Layer | Choice | Why |
|-------|--------|-----|
| **Web framework** | FastAPI + uvicorn | Async-native, automatic OpenAPI spec generation used for frontend type codegen |
| **Database** | SQLite | Single-file portability, zero server overhead, trivial backup — right for a personal tool |
| **Vector search** | sqlite-vec | Natural pairing for SQLite-based vector workloads; 1024-dim `vec_nodes` virtual table |
| **Full-text search** | FTS5 | Bundled with SQLite, excellent BM25 ranking, works offline |
| **DB access** | aiosqlite + raw SQL | Virtual tables (sqlite-vec, FTS5) don't fit ORMs cleanly; the repository layer provides sufficient abstraction |
| **Validation** | Pydantic v2 | Type-safe models across API boundaries; `NodeRef` / `NodeSummary` / `NodeDetail` hierarchy mirrors API response shapes |
| **Settings** | pydantic-settings | `.env` file loading; no secrets in code |

## AI providers

| Role | Primary | Fallback |
|------|---------|---------|
| **Embeddings** | Voyage AI (`voyage-4`) | Ollama (`mxbai-embed-large`) — Phase 7 |
| **Generation** | Anthropic Claude (`claude-sonnet-4-6`) | Ollama (`llama3.2`) — Phase 7 |

Both primary and fallback providers produce 1024-dimensional embeddings, which is the fixed dimension of the `vec_nodes` virtual table. Switching between providers triggers a background re-embedding job.

All embedding and generation calls go through `EmbeddingProvider` / `GenerationProvider` Protocol interfaces — no direct SDK calls from services or routes.

## Frontend

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Next.js (App Router) | React server components by default, minimizes client bundle; standard choice for TypeScript SPAs |
| **Language** | TypeScript | Types generated from FastAPI's OpenAPI spec via `pnpm types` — never hand-written |
| **Styling** | Tailwind CSS | Utility-first, co-located with components, no CSS file management |
| **Graph viz** | react-force-graph-2d | Canvas-based, force-directed, React-native API; purpose-built for this use case |
| **Markdown** | react-markdown + remark-gfm | Note content and RAG answers rendered with GFM support |
| **Forms** | react-hook-form + zod | For non-trivial forms (capture dialogs, edge creation) |

## Tooling

| Tool | Use |
|------|-----|
| **uv** | Python dependency management and virtual environment; `con` CLI installed as a `[project.scripts]` entry point |
| **pnpm** | Node package management |
| **ruff** | Python linting and formatting |
| **prettier** | TypeScript/CSS formatting |
| **pytest** | Backend tests |
| **Vitest** | Frontend tests |
| **openapi-typescript** | Frontend type generation from FastAPI spec (`pnpm types`) |

## Infrastructure (dev)

The entire system runs locally with two processes:

- `uvicorn app.main:app --reload` on port 8000
- `pnpm dev` (Next.js) on port 3000

A systemd user service unit is included for running the backend automatically on login. No Docker, no compose file, no cloud infrastructure required for local use.
