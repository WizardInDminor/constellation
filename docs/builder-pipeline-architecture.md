# Builder Pipeline — Architecture

*The Builder Pipeline is Constellation's first production framework: it
transforms creative intent into structured production work — scripts,
storyboards, generated media, assembled video — while preserving every
reusable creative decision as durable, structured knowledge.*

*This document is the implementation-level companion to the Project Handbook
(Chapter 00 — Project Vision). Handbook chapters describe philosophy; this
document describes tables, contracts, and code. ADR-078 through ADR-081 record
the decisions behind it.*

---

## 1. The three layers

The architecture separates three concerns. The separation is the design — the
rest is consequences.

| Layer | Responsibility | Storage |
|---|---|---|
| **Canon** | Persistent creative truth: entities, relationships, facts, themes, uncertainty state | The **existing graph** — nodes, edges, tags, `canon_status` metadata, project hubs |
| **Production** | Planning a specific production: stages, briefs, scripts, scenes, shots, compiled prompts | New tables (`productions`, `production_*`, `prompt_specs`) |
| **Render** | Generated media and the jobs that made them | New tables (`generation_jobs`, `assets`) + files on disk |

Two rules bind the layers together:

1. **Canon feeds production; production never silently writes canon.**
   Generated outputs (briefs, scripts, assets) live in the production/render
   layers until the user explicitly promotes them. Promotion creates a real
   node in the graph — there is no automatic path in (ADR-081).
2. **Everything generated is traceable.** An asset points to the generation
   job that made it, which points to a frozen prompt spec, which points to the
   shot/scene it serves, which belongs to a production, which is rooted in a
   project hub. The chain never breaks.

### Why the Canon layer is the existing graph (and not new tables)

This was the one genuine architectural fork (ADR-078). The mission brief lists
Canon-layer components — Projects, Entities, Relationships, Canon Facts,
Templates, Assets, Style Bibles, Context Bundles — and almost all of them
already exist in Constellation with years of accumulated design behind them:

| Brief concept | Existing Constellation implementation |
|---|---|
| Projects | Project hubs (`is_project_hub` structure nodes + `project_scopes`, ADR-063) |
| Entities (characters, locations, lore, themes) | Nodes with `narrative:*` role tags (Phase 9) |
| Relationships | Typed, directional edges — 32 verbs incl. the symbolic/resonance set (ADR-077) |
| Canon Facts | Nodes with `canon_status` / `node_status` / `charge` / `confidence` (ADR-076) |
| Style Bibles | Production doc (`kind='style_bible'`), promotable to a canon node |
| Assets | Render layer (`assets` table); promotable references into the graph |
| Templates | Deferred — see § 8 |
| Context Bundles | Deferred — assembled live from the graph for now (§ 8); the Scene Context View precedent says "never cache what the graph can answer" |

Building a parallel canon store would have duplicated all of this and violated
the workspace's founding principle ("everything lands in the graph"). The
production and render layers, by contrast, are genuinely new shapes — ordered,
hierarchical, job-oriented — and get new tables.

---

## 2. The pipeline

Eleven stages, a closed vocabulary shared by the schema, the Director, and the
frontend:

```
intake → interpretation → director_planning → script_generation
      → scene_planning → shot_planning → prompt_compilation
      → generation → asset_registration → timeline_assembly → export
```

| Stage | Actor | Durable output |
|---|---|---|
| intake | Director (no AI) | `productions` row — the raw idea, verbatim |
| interpretation | Interpreter worker | `production_docs` `kind='brief'` (CreativeBrief contract) |
| director_planning | Director | outline doc + scene skeleton *(B1)* |
| script_generation | Writer worker | `production_docs` `kind='script'` *(B1)* |
| scene_planning | Director | `production_scenes` rows *(B2)* |
| shot_planning | Storyboard worker | `production_shots` rows *(B2)* |
| prompt_compilation | Prompt Compiler worker | `prompt_specs` rows — frozen *(B3)* |
| generation | Media workers | `generation_jobs` rows *(B3)* |
| asset_registration | Director | `assets` rows *(B3)* |
| timeline_assembly | Timeline Builder worker | assembly tables *(B4 — schema deferred)* |
| export | Director | rendered output file *(B4)* |

Stages are **restartable and non-destructive** (ADR-079): every execution is a
new attempt row in `production_stage_runs`; every doc output is a new version
in `production_docs`. Nothing is mutated, so a re-run is always safe and the
full history of how a production developed is preserved. `current_stage` on
the production is a convenience pointer that only moves forward — re-running
an earlier stage refines its output without resetting pipeline position.

Unimplemented stages return **501** from the run endpoint (the Phase 1
`process`-returns-501 precedent): the contract is fixed up front, the slices
land one at a time.

---

## 3. The Director

The Director (`services/director_service.py`) is the workflow orchestrator —
the one component that is *not* replaceable. It:

- sequences stages and enforces the pipeline contract
- opens/completes/fails stage runs (the restartability bookkeeping)
- will decide, from B2 onward: what scenes exist, what shots are required,
  which existing assets can be reused, what needs generation, and how to
  minimize production cost
- **never generates media itself** — it delegates content work to workers

Planning intelligence accrues to the Director; content skill accrues to
workers. When a future model is better at storyboarding, the Storyboard worker
is swapped; the Director's plan format doesn't change.

---

## 4. Workers

Workers (`app/workers/`) are the replaceable specialists. Each sits behind a
small typed protocol (mirroring the provider abstraction, ADR-003):

| Worker | Task | Status |
|---|---|---|
| Interpreter | raw idea → CreativeBrief | **implemented (B0)** |
| Writer | brief + outline → script | B1 |
| Storyboard Agent | scene → shot list | B2 |
| Prompt Compiler | shot + canon context → frozen prompt spec | B3 |
| Image / Video / Voice / Music workers | prompt spec → media asset | B3 (stub first) |
| Timeline Builder | assets + shot plan → assembled timeline | B4 |

Two rules (ADR-080):

- **Protocols are added when their slice lands**, not speculatively — an
  interface nobody has implemented is a contract nobody has validated. The
  roster above is the plan; `workers/base.py` is the reality.
- **LLM-backed workers go through `GenerationProvider`** — the existing
  provider abstraction. No direct SDK calls from workers. Media workers will
  get their own provider protocols (e.g. `ImageGenerationProvider`) when B3
  lands, extending ADR-003 to media rather than bypassing it.

Worker failures raise `WorkerError`; the Director records the failure on the
stage run (status `failed`, error text preserved) and the API returns 502. The
failed attempt stays in history; the fix is a re-run.

---

## 5. Data contracts

Every stage output has two representations, stored together on the doc:

- **`content`** — markdown for the human (and for canon promotion)
- **`structured_json`** — the machine contract the next stage consumes,
  validated by a Pydantic model (`CreativeBrief` today; `Outline`, `Script`,
  `ShotList` as their slices land)

The contract models live in `app/models/builder.py` and are the *only*
interface between stages. A worker can be swapped freely as long as it honors
the contract. Users can edit either representation via `PATCH /builder/docs/{id}`
before the next stage consumes it — human refinement between stages is a
designed-in step, not an exception path.

### Reproducibility (ADR-079/080)

- Stage runs record `worker`, `model_id`, and a `detail_json` audit blob.
- Prompt specs freeze both the `compiled_prompt` text and the `context_json`
  of structured inputs used to compile it — a generation job is fully
  determined by (prompt spec, provider, model, params) even after the canon
  has evolved.
- Doc versions and stage attempts are append-only.

---

## 6. API surface (B0)

```
POST  /api/v1/builder/productions                          intake
GET   /api/v1/builder/productions?project_id=              list
GET   /api/v1/builder/productions/{id}                     detail (runs + docs)
POST  /api/v1/builder/productions/{id}/stages/{stage}/run  run/re-run a stage
GET   /api/v1/builder/docs/{id}                            doc detail
PATCH /api/v1/builder/docs/{id}                            user refinement
POST  /api/v1/builder/docs/{id}/promote                    explicit canon promotion
```

Promotion (ADR-081): creates a `permanent` node with the doc's markdown,
`canon_status='provisional'` (newly promoted truth is not yet settled — the
user upgrades it to `canon` when it earns it), embeds it, links it from the
project hub via `COLLECTS`, and stamps `canon_node_id` on the doc. Promoting
twice is a 409.

---

## 7. Database schema (migration 0013)

Following the Phase 9 Slice 0 precedent, the full production/render schema
landed in one migration so the contracts are fixed before the stage
implementations arrive:

- `productions` — one Builder run per project hub; preserves the idea verbatim
- `production_stage_runs` — append-only stage attempts (restartability)
- `production_docs` — versioned stage outputs (brief / style_bible / outline / script)
- `production_scenes` / `production_shots` — planning units; scenes carry
  `canon_event_node_id` to bridge to the canon timeline when a production
  scene realizes a story event
- `prompt_specs` — compiled prompts, frozen with their structured context
- `generation_jobs` — media work items (mirrors the `embedding_jobs` queue pattern)
- `assets` — render outputs + imported references; `generation_job_id` gives
  the traceability chain, `canon_node_id` the explicit promotion hook

No existing table was touched. SQLite remains the store (ADR-001); asset
*files* live on disk with paths in `assets.file_path`.

---

## 8. Deliberately deferred

- **Timeline-assembly tables** — their shape depends on the assembler chosen
  in B4 (e.g. OpenTimelineIO vs. a bespoke track/clip model). Guessing now
  means a rework migration later.
- **Context Bundles as stored objects** — for now, context is assembled live
  from the graph at prompt-compilation time (the Scene Context View precedent:
  never cache what the graph can answer) and *frozen into the prompt spec* at
  compilation. If bundle assembly becomes expensive or needs versioning
  independent of prompts, revisit with an ADR.
- **Templates** — reusable production patterns ("music video", "explainer").
  Wait until two real productions expose what actually repeats.
- **Media generation providers** — B3 decision. Requirements are already
  fixed: Protocol-based, replaceable, no direct SDK calls from workers, stub
  implementation first so the pipeline is testable end-to-end before any real
  media API is wired.

---

## 9. Known risks

1. **Media provider churn.** Video/music generation APIs are the least stable
   dependency in the stack. Mitigation: provider protocols + stub-first + the
   frozen prompt spec means a provider swap re-runs jobs, not planning.
2. **LLM structured-output fragility.** Workers parse model JSON; the
   `WorkerError` → failed-run → re-run path makes this loud and recoverable,
   but B1+ should consider schema-in-prompt repair retries if failure rates
   annoy in practice.
3. **Production/canon drift.** A long-running production can diverge from
   evolving canon. The frozen prompt spec makes this *visible* (the spec
   records what the canon said at compile time); a "recompile prompts against
   current canon" action is the natural B3+ answer.
4. **Asset storage growth.** Generated media in a personal tool can still be
   gigabytes. Files stay on disk (not in SQLite); a retention/cleanup story is
   a B4 concern.
