# Current System Map

**Snapshot:** 2026-09-15, commit `8d51ca5` (merge of Builder Pipeline Slice B0).

> **Update (same day, post-snapshot):** Track C Phases C0–C5 have since
> landed on top of this snapshot (see `direction-roadmap.md` §7): the
> workflow core (migration 0014: proposals / provenance / revisions /
> decisions / activity events), context builders + versioned envelopes,
> the `/proposals` review UI with the first frontend component tests, and
> an authenticated MCP server at `/mcp` (8 read tools + 5 controlled write
> tools). Backend tests 528 → 586; frontend 42 → 50. The §8 constraints
> "no auth" and "no MCP" no longer hold for the MCP surface; the remaining
> inventory below is otherwise still accurate.
**Purpose:** the "where we are" half of the direction-pack migration map. Companion
documents: `constellation-gap-analysis.md` and `direction-roadmap.md` in this
directory; the target-state documents live in `docs/direction/`.

This is a factual inventory, verified against the code (not the docs — several
docs are stale; see §7). Update it when a phase materially changes the system.

---

## 1. Shape of the system

Monorepo: `backend/` (FastAPI + aiosqlite + SQLite/sqlite-vec/FTS5, Pydantic v2,
uv), `frontend/` (Next.js 15 App Router, React 19, TypeScript strict, Tailwind,
pnpm), `docs/`, `docs-site/` (MkDocs), `evals/`.

- Backend: ~7.4K LOC in `backend/app`, ~8.2K LOC in `backend/tests`, **528 tests**.
- Frontend: ~19.5K LOC under `frontend/src/`, **42 tests** (all pure-function; zero component/page tests).
- Single-user, local-first, one SQLite file. **No authentication anywhere.**
- **No MCP code anywhere** (verified: every "mcp" hit in the repo is the MCP4922 DAC chip used as sample corpus content).
- Frontend is 100% client components calling FastAPI directly; zero Next.js server-side surface (no route handlers, no loading/error boundaries).

## 2. Backend

### 2.1 Route modules — `backend/app/api/v1/` (15 modules, 82 endpoints)

| Module | Surface |
|---|---|
| `nodes.py` | Typed node creation (fleeting/permanent/literature/structure/story-event), inbox, quick search, list/detail/patch/soft-delete, neighbors, process, timeline position/placement |
| `projects.py` | Project hubs: list/resolve/create/detail, scope get/patch, draft pad, work sessions (+attach-node, wrap), learning-map generation, coverage, timeline + act spans + parallel timelines, scene-context |
| `rag.py` | suggest-permanent, suggest-links (single + cluster), query, scoped query, save-answer, narrative-dump |
| `builder.py` | productions create/list/detail, stage run, doc get/patch, doc promote-to-canon |
| `search.py` | semantic / fulltext / hybrid (RRF) / dedup |
| `edges.py` | create, delete, resolve/unresolve |
| `discover.py` | orphans, stale, bridges (+AI classify), triangles |
| `canon.py` | open-threads, saved uncertainty views, ask |
| `sources.py` | CRUD + open local file/URL |
| `ingest.py` | document ingest → pending literature candidates |
| `tags.py`, `config.py`, `admin.py`, `activity.py`, `graph.py` | tags CRUD; config + embedding-job ops; worker health + corpus stats; recent-activity feed (derived from timestamps, **not** an event log); whole-graph payload |

### 2.2 Services — `backend/app/services/` (10 modules)

`rag_service` (hybrid retrieval + 1-hop edge expansion, edge-aware prompts,
three modes), `search_service` (RRF hybrid, dedup), `discover_service`
(orphans/stale/bridges/triangles + LLM pair classification), `embedding_service`
(embed-or-queue, drain_jobs), `director_service` (Builder orchestrator: intake +
interpretation only; other stages raise `StageNotImplemented`), `canon_service`
(uncertainty views, open threads, ask), `graph_service` (BFS expansion),
`doc_chunker`, `generation_service` (thin provider passthrough),
`embedding_errors`.

### 2.3 Repositories — `backend/app/repositories/` (11 modules)

`node_repo` (739 L), `timeline_repo` (690 L — placement, lanes, act spans,
scene-context assembly via reserved `narrative:*` tags), `project_repo` (550 L —
scopes, drafts, work sessions + session joins), `builder_repo` (productions,
stage runs, versioned docs w/ promote; **scenes/shots/prompt_specs/
generation_jobs/assets tables have no repo yet**), `edge_repo`, `source_repo`,
`embedding_job_repo`, `graph_repo`, `tag_repo`, `ingest_repo`, `config_repo`.

### 2.4 Core & providers

- `core/lifespan.py`: **one module-global aiosqlite connection** (not a pool);
  runs migrations at startup (filename-tracked, lexicographic, forward-only);
  loads providers from the `config` table; runs the embedding worker as an
  in-process asyncio task (22s interval, Voyage free-tier pacing).
- `providers/base.py`: `EmbeddingProvider` / `GenerationProvider` Protocols.
  Exactly two implementations: Voyage (1024-dim) and Anthropic (with server-side
  web search). Ollama is config-only, unimplemented (Phase 7 deferred
  indefinitely).
- `app/workers/`: Builder worker protocols, added per slice (ADR-080). Only
  `Interpreter` / `LLMInterpreter` exist today.
- `app/cli/capture.py`: the `con` CLI (HTTP client; capture + import).

### 2.5 Database schema (migrations 0001–0013, forward-only, no down-migrations)

| Area | Tables / columns |
|---|---|
| Core graph (0001) | `sources`, `nodes` (4 types, soft delete), `vec_nodes` (FLOAT[1024]), `nodes_fts` + triggers, `edges` (typed, UNIQUE(from,to,type)), `tags`/`node_tags`, `config`, `embedding_jobs` |
| Ingest (0002) | `pending_ingests` (7-day TTL candidate literature notes) |
| Edge vocabulary (0004/0006/0010/0012) | grown to **32 typed verbs** via 4 full table-recreates; `resolved_at`/`resolved_by_node_id` edge state (ADR-059); `classifier_rationale` (0005) |
| Project workspace (0007–0009) | `nodes.is_project_hub`, `project_scopes` sidecar (pinned/tags/briefing/mode/prior_knowledge), `drafts`, `work_sessions` + `session_nodes`/`session_edges`, `dismissed_corpus_suggestions`, `sources.status`, `nodes.artifact_type`/`artifact_format` |
| Narrative timeline (0010) | `nodes.is_story_event`/`story_time`/`prose_status`/`manuscript_location`, `event_timeline_positions` (composite PK — crossover scenes), `act_spans` |
| Canon uncertainty (0011) | `nodes.canon_status` (canon/provisional/speculative/discarded/image_only), `node_status`, `charge` (incl. goosebump), `do_not_name_yet`, `confidence` |
| Builder pipeline (0013) | `productions` (11-stage pointer), `production_stage_runs` (append-only attempts), `production_docs` (versioned; `canon_node_id` set only by explicit promote), `production_scenes`, `production_shots`, `prompt_specs` (frozen context), `generation_jobs`, `assets` |

**Standing invariant already in the code:** generated output never becomes canon
automatically — `canon_node_id` is only set by an explicit promote (ADR-081).
The last 5 builder tables are schema-only (contracts landed ahead of stages).

## 3. Frontend

Root: `frontend/src/` (note: **`src/app/`, not `app/`** — tooling keyed on
`frontend/app/` misses everything).

### 3.1 Routes (`frontend/src/app/`)

`/` dashboard, `/inbox` (+ `/inbox/process/[id]` AI decomposition), `/notes`,
`/nodes/[id]`, `/nodes/new/structure`, `/graph` (force-directed + 7 colocated
panels), `/discover` (1,224 L — largest file), `/cluster-links`, `/canon`
(saved uncertainty views), `/projects` and `/projects/[hub_id]` (the Phase 9
workspace — 11 colocated panels: LeftPanel, RightPanel, AskBar, TimelinePanel
(custom SVG/Canvas), SceneContextView, StoryDumpPanel, NarrativeRoleList,
LearningMapPanel, session dialogs), `/search`, `/ask`, `/synthesize`,
`/sources`, `/ingest`, `/admin`.

### 3.2 Shared components & styling

11 flat files in `src/components/` (AppShell, capture dialogs, NodePicker,
NodeDetailDrawer, NodeInteractionPopup, NotePreviewPopover, NoteContent,
MarkdownTextarea, MermaidBlock, NewMenu). No design-system directory — shared
primitives are Tailwind `@layer components` classes in `globals.css` (ADR-075).
Markdown-first content + KaTeX (ADR-073); single accent + focus ring (ADR-074).

### 3.3 State, API client, types

- **No state library, no React context.** Purely local `useState`/`useEffect`
  per page (heaviest: node detail 39 hooks, TimelinePanel 37), `sessionStorage`
  drafts, one custom polling hook.
- `src/lib/api.ts` (859 L): ~90 flat functions over one `request<T>()` wrapper.
  No auth, no interceptors, no retry, no cancellation; errors are string
  `Error`s.
- Types are codegen'd: `pnpm types` → `openapi-typescript` against a **live
  backend on :8000**. `src/lib/api-types.ts` is **gitignored and absent from a
  fresh checkout** — the tree does not typecheck until the backend runs and
  codegen is executed. A few hand-written fallback types mark codegen drift.

## 4. Tests

- Backend: 30 files, 528 tests. Infra: fake providers injected by monkeypatching
  `lifespan._load_providers`; full-lifespan client fixture on a tmp SQLite file;
  real migrations applied per test DB; no network.
- Frontend: 6 files, 42 cases, all pure helpers — **zero UI render coverage**.
  Visual surfaces (timeline canvas, Scene Context, popovers, Mermaid) verified
  by hand in the browser, by design to date.

## 5. Existing "proposal-like" flows (relevant to the workflow core)

The repo has four ad-hoc review-before-truth flows, none sharing a model:

1. **Ingest:** `pending_ingests` candidates → user reviews in `/ingest` → real
   literature nodes.
2. **Bridge classification:** AI proposes edge type + rationale → user applies →
   edge created with `classifier_rationale` frozen.
3. **Fleeting decomposition / suggest-links / synthesize:** AI drafts →
   user saves.
4. **Builder promote:** versioned `production_docs` → explicit promote →
   provisional canon node linked to hub (ADR-081).

These prove proposal→review→accept is native to the product; what's missing is
one shared lifecycle, provenance, revisions, and an event log.

## 6. Active work track

**Builder Pipeline Slice B1** is the current unit of work
(`docs/builder-pipeline-build-plan.md`): Director planning + script generation,
`LLMWriter`, style bible, and the **first Builder UI** (a Builder tab in the
project workspace). B0 landed 2026-07-14. B2–B4 (scene/shot planning, prompt
compilation + generation + assets, timeline assembly + ffmpeg export) pending.

## 7. Known inconsistencies & doc staleness (cleanup targets)

| Item | Detail |
|---|---|
| `README.md` | One full pivot behind: claims Phases 0–6 / 170 tests; no workspace, canon, or builder content |
| `CLAUDE.md` | Same stale framing; also points at `.claude/memory/MEMORY.md`, **which does not exist in the repo** |
| `docs/build-plan.md` | Phase 5 mislabeled "Pending" (it shipped); stops at Phase 7; treat as historical |
| `docs/decisions.md` | 83 ADR headings, numbered 001–081 with **ADR-034 and ADR-035 each used twice**; file is chronological, not numeric, order |
| Stale in-code citation | `MarkdownTextarea.tsx` cites ADR-034 for markdown-first; the decision is ADR-073 |
| `docs/handbook/01_Architectural_Principles` | Missing `.md` extension (breaks globs/MkDocs) |
| `docs/testin-notes.md` | 60-byte typo'd stray next to `testing-notes.md` |
| Generated types | `api-types.ts` gitignored + absent; fresh checkout can't typecheck |

## 8. Architecture characteristics that constrain change

1. **Single shared DB connection** — any new concurrent surface (e.g. an MCP
   server) must share the FastAPI process/loop or coordinate SQLite access.
2. **No auth or project isolation** — fine for localhost single-user; a blocker
   for any externally reachable MCP surface (this is a named stop-clause in the
   direction pack).
3. **Forward-only migrations, applied at app startup.** No rollback path.
4. **Providers are Protocols with hard-coded loading** — new providers touch
   `lifespan._load_providers`.
5. **Universal node substrate**: characters/themes/locations/lore are nodes with
   reserved `narrative:*` role tags + flags, not typed tables (ADR-064
   pattern). This is load-bearing across timeline, scene context, RAG, canon.
6. **Frontend has no state layer and no UI test net** — new review surfaces are
   page-local state; regression detection is manual.
7. **Guarded design principles** (protected by tests, verified destructively):
   *mode sets defaults, not gates*; *the order of creation is invisible* (live
   context assembly); *everything lands in the graph*.
