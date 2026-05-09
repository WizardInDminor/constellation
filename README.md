# Constellation

A personal zettelkasten built as a typed knowledge graph with first-class AI
integration. Notes are atomic. Edges are typed and directional (SUPPORTS,
CONTRADICTS, ELABORATES, etc.). Every non-fleeting note is embedded at write
time and indexed in both a vector store (sqlite-vec) and a full-text engine
(FTS5). From that foundation the system does two things that most note tools
don't: it finds non-obvious connections between your notes automatically, and
it lets you ask questions that are answered by synthesizing across your own
writing — with citations back to the specific notes that contributed.

Single-user. Local-first data (one SQLite file). Cloud AI via Voyage
(embeddings) and Anthropic Claude (generation), with a local Ollama fallback
planned for Phase 7.

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

## Features

**Capture**
- Quick fleeting-note capture from the browser (Ctrl+K) or terminal (`con "thought"`)
- Intentional capture dialog (Shift+Ctrl+K) for permanent and literature notes with tag assignment
- Systemd user service so the backend starts automatically on login

**Process**
- Inbox view lists unprocessed fleeting notes oldest-first
- AI-assisted decomposition: Claude suggests 1–3 atomic permanent notes per fleeting note
- Draft state persisted to `sessionStorage` so navigating away doesn't lose work

**Link**
- Typed, directional edges with an optional "why this edge exists" note
- AI link suggestions: semantically similar candidates evaluated by Claude with edge-type reasoning
- Node detail view shows incoming and outgoing edges grouped by type; click any to walk the graph

**Search**
- `POST /search/hybrid` — Reciprocal Rank Fusion over vector similarity + FTS5 (default)
- `POST /search/semantic` — pure vector similarity
- `POST /search/fulltext` — FTS5 keyword search; works offline, no API call
- Search UI at `/search` with mode toggle; fulltext is one click from hybrid

**RAG queries**
- `POST /rag/query` — embeds query → hybrid search → graph expansion (depth-1 BFS) → context assembly → Claude synthesis
- Answer returned with `[Note N]` citations; frontend renders them as links back to source notes
- Provenance panel shows which notes contributed and which graph edges were traversed
- Query UI at `/ask` — the primary payoff of the system

**Source management**
- Sources (datasheets, books, articles, etc.) linked to literature notes
- `GET /sources/{id}/open` launches `xdg-open` on the URL/file path
- Inline source creation inside the capture dialog; no navigation required
- Sources list at `/sources` with detail panel, "Open file" / "Open in browser" / "Copy path"

**Graph visualization**
- Force-directed canvas graph at `/graph` via `react-force-graph-2d`
- Node color by type (fleeting/literature/permanent/structure), edge color by edge type (7 types)
- Click any node → side panel with summary and "Open note →"; click any edge → panel with type, note, and endpoint links
- Live client-side filters: node type toggles, edge type toggles, tag filter, hide-isolated toggle, title highlight search
- Zoom in/out and fit-to-screen controls; auto-fits after the force simulation settles

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

# 3. (Optional) Run backend as a systemd user service instead
cp constellation.service ~/.config/systemd/user/
systemctl --user enable --now constellation   # starts on login, no manual uvicorn needed

# 4. Frontend (in a second terminal)
cd frontend
pnpm install
pnpm types                                    # requires backend running; generates TS types
pnpm dev                                      # serves on :3000

# 5. (Optional) Terminal capture — available after uv sync
con "thought to capture"                      # posts a fleeting note from anywhere
con -t "Title" -c "Content"                   # explicit flags
# Needs the backend running. Add backend/.venv/bin to PATH or use `uv run con`.

# 6. (Optional) Local AI mode — Phase 7, not yet wired
ollama pull mxbai-embed-large
ollama pull llama3.2
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

Phases 0–6 complete. Core system is feature-complete and in active daily use. 170 backend tests passing.

| Phase | Status | What it delivered |
|-------|--------|-------------------|
| 0 — Foundation | ✅ | Repo skeleton, DB, migrations, both dev servers |
| 1 — Core CRUD | ✅ | Full data layer, all repository and API routes |
| 2 — Embeddings | ✅ | Provider abstraction, auto-embed on write, embedding job queue |
| 3 — Capture & process | ✅ | Fleeting capture, inbox, AI-assisted decomposition into permanents |
| 3.5 — CLI & resilience | ✅ | `con` terminal tool, systemd service, session-draft persistence |
| 4 — Linking | ✅ | Edge creation UI, AI link suggestions, neighbor browsing |
| 5 — Search & RAG | ✅ | Hybrid search, `/ask` RAG query UI, source management |
| 6 — Visualization | ✅ | Force-directed graph at `/graph`, node/edge colors, filters, side panels |
| 7 — Local provider | ⏳ | Ollama embedding + generation; offline mode via settings |

**Up next (Phase 7, optional):** local provider path — swap Voyage and Claude for Ollama models via the settings page, with a re-embedding job that runs in the background. All provider calls already go through the abstraction layer; Phase 7 is adding the Ollama implementations and settings UI.

## License

Personal project. Not licensed for public reuse at this time.