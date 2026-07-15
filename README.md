# Constellation

A personal knowledge graph with first-class AI integration — and the
foundation of a larger ambition: a creative operating system, where ideas
become structured knowledge and structured knowledge drives production
workflows (see `docs/handbook/00_Project_Vision.md`).

At its core it is a zettelkasten built as a typed graph. Notes are atomic.
Edges are typed and directional (31 verbs, from SUPPORTS and CONTRADICTS to
FORESHADOWS and CARRIES_CHARGE_FOR). Every non-fleeting note is embedded at
write time and indexed in both a vector store (sqlite-vec) and a full-text
engine (FTS5). On that foundation the system finds non-obvious connections
between your notes automatically, and answers questions by synthesizing across
your own writing — with citations back to the specific notes that contributed.

Around the core, three larger surfaces have grown:

- **Project workspaces** — persistent, mode-aware working environments
  (research / narrative / learning) with work sessions, a free-writing pad,
  scoped ask, and a narrative timeline canvas.
- **A Canon uncertainty layer** — "not yet knowing" as queryable data:
  canon status, emotional charge, do-not-name-yet flags, and saved views
  over them, so a developing story never hardens into a static wiki.
- **The Builder Pipeline** (early) — a production framework that turns a
  raw creative idea into structured production work: brief → outline →
  script → scenes → shots → generated assets → rough video. Slice B0
  (intake + interpretation + canon promotion) has landed.

Single-user. Local-first data (one SQLite file). Cloud AI via Voyage
(embeddings) and Anthropic Claude (generation). A local Ollama fallback is
designed but deferred indefinitely — API costs at personal-tool scale don't
justify the re-embedding cost of switching.

## What's here

| Path                                  | What it is                                            |
|---------------------------------------|-------------------------------------------------------|
| `CLAUDE.md`                           | Working reference. Auto-loaded by Claude Code.        |
| `docs/handbook/`                      | Project Handbook — the creative-OS vision.            |
| `docs/architecture.md`                | Schema, project structure, API surface, patterns.     |
| `docs/build-plan.md`                  | Phased build plan (core system) with scope boundaries.|
| `docs/builder-pipeline-architecture.md` | Builder Pipeline design: layers, contracts, workers. |
| `docs/builder-pipeline-build-plan.md` | Builder Pipeline slices B0–B5.                        |
| `docs/decisions.md`                   | ADR-style log of design decisions (081 and counting). |
| `docs-site/`                          | MkDocs user guide (capture, search, graph, mobile…).  |
| `backend/`                            | FastAPI + SQLite + sqlite-vec.                        |
| `frontend/`                           | Next.js (App Router) + TypeScript + Tailwind.         |
| `evals/`                              | Retrieval-quality probes and fixture runs.            |

If you're orienting yourself, read `CLAUDE.md` first, then skim
`docs/decisions.md` to understand why things are the way they are.

## Features

**Capture**
- Quick fleeting-note capture from the browser (Ctrl+K) or terminal (`con "thought"`, `con --project <name>`)
- Intentional capture dialog (Shift+Ctrl+K) for permanent and literature notes, with tag assignment and a live dedup panel that surfaces similar existing notes before you save
- Mobile capture from the iPhone via Tailscale + iOS Shortcuts — see `docs-site/user-guide/mobile-capture.md`
- Document ingest at `/ingest`: paste a document, it's chunked into literature-note candidates you accept per-chunk
- Systemd user service so the backend starts automatically on login

**Process**
- Inbox view lists unprocessed fleeting notes oldest-first
- AI-assisted decomposition: Claude suggests 1–3 atomic permanent notes per fleeting note; drafts persist across navigation

**Link**
- Typed, directional edges (31 verbs: author-stance, structural, literature-stance, evolution, narrative, and Canon symbolic/resonance sets) with an optional "why this edge exists" note and the AI's frozen rationale
- AI link suggestions per note, plus batch cluster-link review at `/cluster-links`
- Tension edges (CONTRADICTS / QUESTIONS) can stay open indefinitely or be marked resolved, optionally pointing at the synthesis note that resolved them
- Discover at `/discover`: bridges (semantically similar but unlinked pairs) and triangle completion (pairs sharing neighbors but no direct edge)

**Search & ask**
- Hybrid search (Reciprocal Rank Fusion over vectors + FTS5), pure semantic, and offline fulltext modes at `/search`
- `/ask` — RAG over your own notes: hybrid retrieval → graph expansion → grounded answer with `[Note N]` citations and a provenance panel showing the edges traversed
- Edge-aware synthesis: typed edges are load-bearing in answers — contradictions are surfaced, not smoothed over; resolved tensions are annotated as historical
- Ask scoping (project / both / full corpus), brief mode, and a critic mode that enumerates the questions a careful reader would ask
- `/synthesize` — longer-form synthesis over a chosen scope, saved as a permanent note with CITES edges back to its sources

**Project workspaces** (`/projects`)
- A project is a structure-note hub with persistent scope (pinned notes, tags, briefing prompt) and a mode — research, narrative, or learning. Mode sets defaults, never gates features.
- Work sessions with declared intent, progress/blockers, and closing notes that become the next session's forward brief; resume briefings reconstruct project state on return
- Free-writing pad with autosave and promote-selection-to-note
- Narrative surfaces: a custom SVG timeline canvas (parallel lanes, act spans, crossover events, drag-to-reorder), character/location/lore/theme roles, Story Dump extraction of nodes from freeform text, and a Scene Context View assembled live from the graph on every open
- Learning surfaces: AI-generated learning maps with web-researched source suggestions

**Canon uncertainty layer** (`/canon`)
- Nodes carry optional `canon_status` (canon / provisional / speculative / discarded / image-only), `node_status`, emotional `charge` (up to "goosebump"), a `do_not_name_yet` flag, and a confidence score
- Saved views over structured fields — Images Carrying Charge, Emerging Truths, Do-Not-Name-Yet, Speculative, Open Threads — each narratable by the AI with exact citations
- The RAG layer reads uncertainty from fields, never infers it from prose, and is instructed not to resolve what you've marked as deliberately open

**Builder Pipeline** (API-only so far — Slice B0)
- `POST /builder/productions` turns a raw idea into a production rooted in a project hub; the Interpreter worker produces a structured, editable creative brief
- Restartable by construction: every stage run is an append-only attempt, every output a new version
- Generated outputs never become canon automatically — an explicit promote endpoint creates a provisional node linked from the project hub
- Full production/render schema is in place (scenes, shots, prompt specs, generation jobs, assets with end-to-end traceability); stages land slice by slice per `docs/builder-pipeline-build-plan.md`

**Graph visualization** (`/graph`)
- Force-directed canvas graph, node color by type, edge color by edge type
- Click any node or edge for a side panel; live filters by node type, edge type, tag, and title search; zoom and fit controls

**Writing & rendering**
- Markdown-first note content with KaTeX math and Mermaid diagram rendering (flowcharts, sequence diagrams, gantt) in notes, ask answers, and the writing pad — with PNG/Markdown export

**Operability** (`/admin`)
- Embedding job queue with status dashboard, per-job and bulk retry, attempt counts, and worker health — no silent failures

## Prerequisites

- **Python** 3.11 or newer
- **Node.js** 20 or newer + **pnpm**
- **uv** for Python dependency management — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **SQLite** 3.41+ (for FTS5 + loadable extensions; modern macOS/Linux installs are fine)
- **Voyage AI API key** — sign up at https://www.voyageai.com
- **Anthropic API key** — get one at https://console.anthropic.com

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
# Note: the service binds 0.0.0.0:8000 so the backend is reachable from
# Tailscale peers (used by the iOS mobile-capture Shortcuts). On a publicly
# reachable host, fall back to --host 127.0.0.1 — there is no auth layer.

# 4. Frontend (in a second terminal)
cd frontend
pnpm install
pnpm types                                    # requires backend running; generates TS types
pnpm dev                                      # serves on :3000

# 5. (Optional) Terminal capture — available after uv sync
con "thought to capture"                      # posts a fleeting note from anywhere
con --project fire-stoker "scene idea"        # captures into a project's scope
# Needs the backend running. Add backend/.venv/bin to PATH or use `uv run con`.
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

Core system feature-complete and in active daily use. 528 backend tests and
39 frontend tests passing. The Builder Pipeline is the active development
track.

| Phase | Status | What it delivered |
|-------|--------|-------------------|
| 0–6 — Core system | ✅ | Data layer, embeddings, capture → process → link → search → RAG → graph view |
| 6.5 — Operability | ✅ | `/admin` embedding-job dashboard, retries, worker health |
| Buckets A & B | ✅ | Expanded edge vocabulary, home activity feed, batch link review, triangle discovery, ask modes |
| 8 — Edge-aware RAG | ✅ | Typed edges load-bearing in synthesis, resolved-tension state, scoped ask, capture-time dedup |
| 9 — Workspace & timeline | ✅ | Project workspaces, work sessions, narrative timeline canvas, Scene Context View, Story Dump |
| UI/UX & rendering | ✅ | Design-system pass, accessibility polish, markdown + KaTeX + Mermaid |
| Canon readiness | ✅ | Uncertainty metadata on nodes, 13 symbolic/resonance edge verbs, `/canon` saved views + AI narration |
| Builder B0 — Foundation | ✅ | Production/render schema, Director orchestrator, Interpreter worker, explicit canon promotion |
| Builder B1–B4 | ⏳ | Director planning, script generation, scene/shot planning, media generation (stub-first), timeline assembly + export |
| 7 — Local provider | ⏸ | Deferred indefinitely (ADR'd) — provider abstraction keeps it possible |

**Up next:** Builder Slice B1 — Director planning and script generation, plus
the first Builder UI in the project workspace. See
`docs/builder-pipeline-build-plan.md`.

## License

Personal project. Not licensed for public reuse at this time.
