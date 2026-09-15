# Constellation

> A personal knowledge + creative workspace on a typed knowledge graph,
> evolving into a "creative operating system": an authoritative project
> substrate with a human UI and a controlled AI/MCP tool surface. The name
> follows the "constellation thinker" framing: a graph of atomic notes with
> typed relationships, surfaced through AI-assisted retrieval and generation.

## What this is

A personal zettelkasten built on Luhmann's slip-box principles, grown into a
mode-aware project workspace (research / narrative / learning), a narrative
timeline with live scene-context assembly, canon uncertainty metadata, and a
staged builder pipeline. Notes are atomic. Edges are typed and directional
(32 verbs). Retrieval is hybrid (vector + full-text) with graph traversal.
Generation is grounded in the user's own notes via RAG.

This is a personal tool, not a SaaS product. Single-user. Local-first data
with cloud AI providers.

**Direction:** the target state (shared proposal-before-truth workflow core,
story context builders, MCP server for external AI clients) is defined in
`docs/direction/` and mapped in `docs/build/direction-roadmap.md`. Two tracks:
Track B = Builder Pipeline (`docs/builder-pipeline-build-plan.md`), Track C =
collaboration core (workflow core → context builders → proposal inbox →
MCP read → MCP write).

## Tech stack

| Layer       | Choice                                          |
|-------------|-------------------------------------------------|
| Backend     | Python 3.11+, FastAPI, uvicorn                  |
| DB          | SQLite + sqlite-vec + FTS5 (single file)        |
| DB access   | `aiosqlite` + raw SQL via repository pattern    |
| Validation  | Pydantic v2                                     |
| Frontend    | Next.js (App Router), TypeScript, Tailwind      |
| Type bridge | `openapi-typescript` codegen from FastAPI spec (generated file committed, ADR-083) |
| Embeddings  | Voyage AI (`voyage-4`) — 1024-dim               |
| Generation  | Anthropic Claude (`claude-sonnet-4-6`)          |
| Local fallback | Deferred indefinitely (Ollama config exists, unimplemented) |
| Lint/format | ruff, prettier                                  |
| Tests       | pytest (backend, 528+), Vitest (frontend)       |

## Repo structure

```
constellation/
├── CLAUDE.md                # this file
├── docs/
│   ├── architecture.md      # schema, structure, API surface, patterns
│   ├── decisions.md         # ADR-style decision log (ADR-001+, append-only)
│   ├── direction/           # direction pack — target product & architecture
│   ├── build/               # current-system-map, gap-analysis, direction-roadmap
│   ├── handbook/            # architecture handbook (vision, principles)
│   ├── builder-pipeline-*.md# Track B architecture + build plan
│   └── (phase docs, philosophy doc, wrap docs — historical/context)
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── core/            # database, config, lifespan, deps
│   │   ├── providers/       # embedding + generation provider implementations
│   │   ├── models/          # Pydantic model families (one module per domain)
│   │   ├── repositories/    # data access layer (raw SQL)
│   │   ├── services/        # business logic, orchestration, AI
│   │   ├── workers/         # builder pipeline worker protocols
│   │   ├── cli/             # `con` terminal capture tool
│   │   └── api/v1/          # route handlers
│   ├── migrations/          # SQL migrations, applied in lexicographic order
│   └── tests/
├── frontend/
│   └── src/                 # NOTE: src/app, src/components, src/lib (not frontend/app)
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
pnpm types                                 # regenerate TS types from FastAPI (backend must be on :8000); commit the diff
pnpm test
pnpm lint
```

## Coding conventions

- **Async everywhere** on the backend. No sync DB calls, no sync HTTP clients.
- **Pydantic models stratified by purpose**: `NodeRef` (id+title), `NodeSummary`
  (list views), `NodeDetail` (full record + edges).
- **Repository pattern**: one repo per aggregate root. Repositories return
  Pydantic models, never raw rows. Services compose repositories.
- **Raw SQL is the default**. sqlite-vec virtual tables and FTS5 don't fit
  cleanly into ORMs. A thin repository layer is sufficient at this scale.
- **Service layer is where AI lives**. Routes are thin. MCP tools (Track C)
  delegate to services — never SQL or business logic in the adapter layer.
- **Frontend types come from the backend**. Never hand-write API types — run
  `pnpm types` after backend changes and commit the regenerated file.
- **UUIDs for all IDs**. Generated server-side.
- **ISO 8601 timestamps** in the DB as TEXT. Parse to `datetime` in Pydantic.
- **Literal enums** over Python Enum classes in Pydantic models (house style).

## Hard rules — do not violate without explicit approval

- **Do not introduce Postgres.** SQLite is the deliberate choice. See
  `docs/decisions.md` § ADR-001.
- **Do not change embedding dimensions from 1024.** The `vec_nodes` virtual
  table is fixed at this dimension. See ADR-002.
- **Do not bypass the provider abstraction.** All embedding and generation
  calls go through `EmbeddingProvider` / `GenerationProvider` Protocol
  implementations. No direct SDK calls from services or routes.
- **Do not add an ORM** without first updating ADR-005.
- **Do not store secrets in code or config files.** Use `.env` (gitignored)
  and read via `pydantic-settings`.
- **Do not hard-delete nodes.** All deletes are soft (set `deleted_at`).
- **Do not skip writing migration files** for schema changes. Migrations live
  in `backend/migrations/`, are additive and forward-only, and are applied in
  lexicographic order at startup.
- **AI output never becomes accepted canon automatically.** Promotion to
  canon / acceptance of proposals is always an explicit human action
  (ADR-081; direction-pack ADR-002). MCP clients must not be able to write
  accepted truth directly.
- **Mode sets defaults, not gates.** A project's mode decides which tab opens
  first; it never hides or disables a feature.
- **The order of creation is invisible.** Context surfaces (Scene Context
  View, dossiers) assemble from live graph state on every open — never cache
  authoritative context.
- **Record decisions as they are made.** Any design choice made during
  planning or implementation that involves a tradeoff — timeout values,
  HTTP status code behavior, polling intervals, error handling strategy,
  library selection, naming conventions — must be added to
  `docs/decisions.md` as a new ADR before the phase is marked complete.
  Do not defer ADR writing to the next session.

## Where to look first

- Designing a new feature? → `docs/architecture.md`
- Where is the project heading? → `docs/build/direction-roadmap.md` (phased
  migration map toward the target in `docs/direction/`), with
  `docs/build/current-system-map.md` and
  `docs/build/constellation-gap-analysis.md` as its companions
- Starting a coding session? → `docs/builder-pipeline-build-plan.md` (Track B)
  or `docs/build/direction-roadmap.md` (Track C); `docs/build-plan.md` is
  historical (Phases 0–7)
- Facing a design choice? → `docs/decisions.md` (it's probably settled)
- Made a design decision during implementation? → Add an ADR to
  `docs/decisions.md` immediately. Don't wait until phase end.
- Why do the narrative/learning surfaces work the way they do? →
  `docs/constellation-use-case-philosophy.md`
- None of the above answer the question? → ask the user before deciding.
