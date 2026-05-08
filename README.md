# Constellation

A personal knowledge graph built on Luhmann's slip-box principles, modernized
as a typed graph with first-class AI integration. Atomic notes, typed edges,
hybrid retrieval, RAG queries grounded in your own thinking.

Single-user. Local-first data. Optional cloud AI providers (Voyage for
embeddings, Anthropic Claude for generation) with a local Ollama fallback.

## What's here

| Path                    | What it is                                          |
|-------------------------|-----------------------------------------------------|
| `CLAUDE.md`             | Working reference. Auto-loaded by Claude Code.      |
| `docs/architecture.md`  | Schema, project structure, API surface, patterns.   |
| `docs/build-plan.md`    | Phased build plan with scope boundaries.            |
| `docs/decisions.md`     | ADR-style log of design decisions.                  |
| `backend/`              | FastAPI + SQLite + sqlite-vec.                      |
| `frontend/`             | Next.js (App Router) + TypeScript + Tailwind.       |

If you're orienting yourself, read `CLAUDE.md` first, then skim
`docs/decisions.md` to understand why things are the way they are.

## Prerequisites

- **Python** 3.11 or newer
- **Node.js** 20 or newer + **pnpm**
- **uv** for Python dependency management — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **SQLite** 3.41+ (for FTS5 + loadable extensions; modern macOS/Linux installs are fine)
- **Voyage AI API key** — sign up at https://www.voyageai.com
- **Anthropic API key** — get one at https://console.anthropic.com
- **Ollama** (optional, for local provider mode) — https://ollama.com

## Quick start

```bash
# 1. Clone and configure
git clone <repo-url> constellation
cd constellation
cp .env.example .env
# edit .env and fill in VOYAGE_API_KEY and ANTHROPIC_API_KEY

# 2. Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload          # serves on :8000; migrations run on first start

# 3. Frontend (in a second terminal)
cd frontend
pnpm install
pnpm types                                    # requires backend running; generates TS types
pnpm dev                                      # serves on :3000

# 4. (Optional) Local AI mode
ollama pull mxbai-embed-large
ollama pull llama3.2
# then toggle providers in the app's settings page
```

Open http://localhost:3000 to use the app.

## Daily commands

```bash
# Backend
cd backend
uv run uvicorn app.main:app --reload          # dev server; migrations run automatically
uv run pytest                                 # tests
uv run ruff check . && uv run ruff format .   # lint + format

# Frontend
cd frontend
pnpm dev
pnpm types                                    # rerun after backend API changes
pnpm test
pnpm lint
```

## Backups

Constellation stores everything in a single SQLite file (path configured by
`DB_PATH` in `.env`, default `./data/constellation.db`). Back it up the same
way you back up anything else important.

```bash
# Manual snapshot
cp ./data/constellation.db ./backups/constellation-$(date +%Y%m%d-%H%M%S).db

# Restic / Borg / Time Machine / rsync to a remote — all fine.
```

The `data/` directory is gitignored. Don't commit your knowledge graph to
the same repo as the code.

## Project status

Currently in Phase 0 of the build plan. See `docs/build-plan.md` for what's
in scope at each phase and what's deliberately deferred.

## License

Personal project. Not licensed for public reuse at this time.