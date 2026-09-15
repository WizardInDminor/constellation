# Constellation

A personal knowledge and creative workspace built on a typed knowledge graph
with first-class AI integration — and evolving toward a **creative operating
system**: an authoritative project substrate that humans work in through a
visual app and AI clients work in through controlled tools.

The foundation is a zettelkasten: atomic notes, typed directional edges
(SUPPORTS, CONTRADICTS, ELABORATES, … — 32 verbs including a symbolic/resonance
vocabulary for creative work), every non-fleeting note embedded at write time
and indexed in both a vector store (sqlite-vec) and a full-text engine (FTS5).
On top of that sit mode-aware **project workspaces** (research / narrative /
learning), a **narrative timeline** with parallel lanes and live scene-context
assembly, **canon uncertainty metadata** (what is settled, emerging, charged,
or deliberately unnamed), and the beginnings of a **builder pipeline** that
turns ideas into staged, versioned productions.

Single-user. Local-first data (one SQLite file). Cloud AI via Voyage
(embeddings) and Anthropic Claude (generation).

## Where it's heading

The target state is documented in `docs/direction/` (product charter, domain
model, MCP tool contract) and the migration map in
`docs/build/direction-roadmap.md`: a shared proposal-before-truth workflow
core, story context builders, and an MCP server so ChatGPT, Claude Code, and
other agents can search, retrieve, and *propose* against the same durable
state — with the human as the final approval authority. AI-created material
never becomes accepted canon automatically.

## What's here

| Path                        | What it is                                              |
|-----------------------------|---------------------------------------------------------|
| `CLAUDE.md`                 | Working reference. Auto-loaded by Claude Code.          |
| `docs/architecture.md`      | Schema, project structure, API surface, patterns.       |
| `docs/decisions.md`         | ADR-style log of design decisions (ADR-001+).           |
| `docs/direction/`           | The direction pack — target product & architecture.     |
| `docs/build/`               | Current-system map, gap analysis, phased roadmap.       |
| `docs/builder-pipeline-*`   | Builder Pipeline architecture + build plan (Track B).   |
| `docs/handbook/`            | Architecture handbook (vision, principles).             |
| `backend/`                  | FastAPI + aiosqlite + SQLite + sqlite-vec + FTS5.       |
| `frontend/`                 | Next.js (App Router) + TypeScript + Tailwind.           |

If you're orienting yourself, read `CLAUDE.md` first, then
`docs/build/current-system-map.md` for what exists, then skim
`docs/decisions.md` to understand why things are the way they are.

## Features

**Capture & process**
- Quick fleeting capture (Ctrl+K), intentional capture (Shift+Ctrl+K),
  terminal capture (`con "thought"`), iOS capture via Tailscale + Shortcuts
- Inbox with AI-assisted decomposition of fleeting notes into atomic permanents
- Document ingest: import a file, chunk it, review AI-drafted literature notes

**Link & discover**
- Typed directional edges with per-edge "why" notes and AI classifier rationale
- Resolvable tension edges (CONTRADICTS/QUESTIONS can be marked resolved)
- Discover surfaces: orphans, stale notes, AI-classified bridges, triangles
- Batch and cluster link suggestion flows

**Search, Ask & synthesize**
- Hybrid search (RRF over vectors + FTS5), semantic, fulltext, dedup
- `/ask` RAG with graph expansion, edge-aware prompting (contradictions are
  surfaced, not synthesized away), citations, scoped/date-filtered modes
- `/synthesize` multi-note synthesis saved back into the graph

**Project workspaces** (`/projects`)
- A project is a structure node + scope (pinned notes, tags, briefing, mode)
- Modes set defaults, never gates: research / narrative / learning
- Free-writing pad, intentional work sessions with resume briefings,
  per-tag coverage, AI learning maps with web search

**Narrative tooling**
- Custom SVG/Canvas timeline: parallel lanes, act spans, crossover scenes
- Story Dump → extracted candidate nodes; prose status tracking
- Scene Context View assembled live from the graph on every open
- `/canon` uncertainty views: Images Carrying Charge, Emerging Truths,
  Do Not Name Yet, open threads

**Builder pipeline** (Track B, in progress)
- Idea → interpreted creative brief (11-stage pipeline; intake +
  interpretation live), versioned production docs, explicit promote-to-canon

**Graph visualization**
- Force-directed canvas at `/graph` with filters, node/edge panels, and
  virtual source nodes

## Prerequisites

- **Python** 3.11+ and **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Node.js** 20+ and **pnpm**
- **SQLite** 3.41+ (FTS5 + loadable extensions)
- **Voyage AI API key** — https://www.voyageai.com
- **Anthropic API key** — https://console.anthropic.com

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
systemctl --user enable --now constellation   # starts on login
# Note: the service binds 0.0.0.0:8000 so the backend is reachable from
# Tailscale peers (used by the iOS mobile-capture Shortcuts). On a publicly
# reachable host, fall back to --host 127.0.0.1 — there is no auth layer.

# 4. Frontend (in a second terminal)
cd frontend
pnpm install
pnpm types                                    # regenerate TS types (see note below)
pnpm dev                                      # serves on :3000

# 5. (Optional) Terminal capture — available after uv sync
con "thought to capture"                      # posts a fleeting note from anywhere
con -t "Title" -c "Content"                   # explicit flags
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
pnpm types                                    # rerun after backend API changes (needs backend on :8000)
pnpm test
pnpm lint
```

Generated API types (`frontend/src/lib/api-types.ts`) are committed, so a
fresh checkout typechecks without a running backend; rerun `pnpm types` after
backend API changes and commit the diff (see ADR-083).

## Backups

Constellation stores everything in a single SQLite file (path configured by
`DB_PATH` in `.env`, default `./data/constellation.db`). Migrations are
additive and forward-only — snapshot the DB file before upgrading.

```bash
cp ./data/constellation.db ./backups/constellation-$(date +%Y%m%d-%H%M%S).db
```

The `data/` directory is gitignored. Don't commit your knowledge graph to
the same repo as the code.

## Project status

In active daily use. 528+ backend tests.

| Track | Status |
|-------|--------|
| Zettelkasten core (Phases 0–6.5) | ✅ Complete — capture, process, link, search, RAG, graph, operability |
| Edge semantics into RAG (Phase 8) | ✅ Complete — edge-aware prompting, resolved edges, scoped Ask, dedup |
| Project Workspace + Narrative Timeline (Phase 9) | ✅ Complete |
| Canon readiness (uncertainty metadata, edge vocabulary, views) | ✅ Complete |
| Builder Pipeline (Track B) | 🔨 B0 complete; B1 (director planning + script + Builder UI) next |
| Collaboration core → MCP (Track C) | 🔨 In progress — see `docs/build/direction-roadmap.md` |
| Local provider (Ollama) | ⏸ Deferred indefinitely |

## License

Personal project. Not licensed for public reuse at this time.
