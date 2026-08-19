# Builder Pipeline — Build Plan

*Month-one goal: prove a complete creative production pipeline. A casual
spoken or typed idea becomes a project, brief, characters, locations, style
bible, outline, script, scenes, shots, prompt packs, generated assets, and a
rough assembled video. The goal is NOT a polished film — it is the pipeline
itself, with every stage preserving reusable structured knowledge.*

*Companion to `builder-pipeline-architecture.md`. Same working rules as the
main build plan: find the current slice, work within it, write ADRs as
decisions are made, move on at definition-of-done rather than gold-plating.*

---

## Slice B0 — Foundation: intake + interpretation

**Status:** ✅ Complete (2026-07-14)

**Goal:** The durable skeleton. Full production/render schema, the Director,
the first worker, and the canon promotion contract — proven end-to-end on the
first two stages.

**Delivered:**

- Migration `0013_builder_pipeline.sql`: `productions`,
  `production_stage_runs`, `production_docs`, `production_scenes`,
  `production_shots`, `prompt_specs`, `generation_jobs`, `assets`
  (full schema up front, Phase 9 Slice 0 precedent).
- `app/models/builder.py`: pipeline stage vocabulary, production/doc/run
  models, the `CreativeBrief` contract.
- `app/repositories/builder_repo.py`: production aggregate (productions,
  stage runs, docs).
- `app/workers/`: worker package. `base.py` (protocols + `WorkerError`),
  `interpreter.py` (`LLMInterpreter` via `GenerationProvider`).
- `app/services/director_service.py`: the Director — stage sequencing,
  restartable append-only stage runs, versioned doc outputs,
  forward-only `current_stage` pointer.
- `/api/v1/builder/*` routes: intake, list/detail, stage run (501 for
  unlanded stages), doc read/refine, explicit canon promotion
  (permanent node, `canon_status='provisional'`, `COLLECTS` from hub).
- ADR-078 (layering), ADR-079 (stage runs), ADR-080 (workers),
  ADR-081 (promotion).
- 11 backend tests (intake, interpretation happy/failed/re-run, 501, doc
  refinement, promotion + 409). 528 total.

**Definition of done:** POST an idea → production exists with the idea
preserved verbatim → run interpretation → versioned brief doc with valid
structured JSON → edit it → promote it → provisional permanent node linked
from the project hub. All covered by tests. ✅

---

## Slice B1 — Director planning + script generation

**Goal:** The idea becomes an outline and a script. The Director starts
planning rather than just bookkeeping.

**Deliverables:**

- `Outline` contract model: acts/beats with intended scenes, each beat
  carrying references to canon entities where they exist (node IDs, not
  restated prose — canon is referenced, not copied).
- `director_planning` stage: Director produces the outline doc. Consumes the
  latest brief (user-refined version included); pulls project canon context
  (characters, locations, style) from the graph via scoped retrieval.
- `Writer` worker protocol + `LLMWriter`: outline → screenplay-format script
  doc (`kind='script'`), scene-delimited so scene_planning can split it
  deterministically.
- `style_bible` doc: generated from brief + canon style notes at
  director_planning time; promotable like any doc.
- Stage-input recording: each run's `detail_json` records which doc versions
  and node IDs it consumed (provenance for "what knowledge produced this").
- Frontend: Builder tab in the project workspace — production list, stage
  pipeline view (stage runs with status/attempts), doc viewer/editor with
  promote button. *(First UI slice; backend-only ends here.)*
- `pnpm types` regeneration for the new API surface.

**Definition of done:** idea → brief → outline → script, each stage
re-runnable, each output editable and promotable, visible in the workspace UI.

---

## Slice B2 — Scene + shot planning

**Goal:** The script decomposes into the planning units that drive generation.

**Deliverables:**

- `scene_planning`: Director splits the script into `production_scenes`
  (seq, title, summary, script_text), linking each to a canon story event
  (`canon_event_node_id`) when the user confirms the mapping — optionally
  creating timeline events via the existing story-event flow.
- `Storyboard` worker protocol + implementation: scene → `production_shots`
  (seq, shot_type, description, duration).
- `ShotList` contract model; scene/shot CRUD routes (user reorder/edit/delete
  before compilation).
- Reuse decision hook: Director checks existing project assets before
  planning new generation (cheap heuristic first; this is where
  cost-minimization lives).
- Frontend: scene/shot board under the Builder tab.

**Definition of done:** a script becomes an editable shot list, scene-linked
to the canon timeline where the story overlaps.

---

## Slice B3 — Prompt compilation + generation + assets

**Goal:** Shots become media. The riskiest slice — external media providers
enter the stack behind protocols, stubs first.

**Deliverables:**

- `PromptCompiler` worker: shot + scene + canon context (character/location/
  style nodes, live from the graph) → `prompt_specs` rows. Compiled prompt +
  context frozen at compile time. Never handwritten.
- Media provider protocols (`ImageGenerationProvider`, extend to video/voice/
  music as chosen) — ADR extending ADR-003 to media, provider selection ADR.
- **Stub providers first**: deterministic placeholder assets (solid-color
  frames, silence) so the full pipeline runs end-to-end with zero external
  calls and full test coverage.
- Generation job worker loop (mirror `_embedding_worker`): drain pending
  jobs, retry/attempt counting, failure visibility on `/admin`.
- `asset_registration`: files to a configured assets directory,
  `assets` rows with the full traceability chain.
- Real image provider wired as the first non-stub worker (image before
  video — cheapest, most stable APIs).
- Frontend: prompt pack review + asset gallery per production.

**Definition of done:** every shot has a frozen prompt spec and a registered
asset (stub or real), traceable job → spec → shot → scene → production →
project. Re-running generation on one shot replaces nothing silently — new
job, new asset, old kept.

---

## Slice B4 — Timeline assembly + export

**Goal:** Assets become a rough cut.

**Deliverables:**

- Assembly data model decision (OpenTimelineIO vs. bespoke track/clip tables)
  — the deliberately deferred schema, decided by ADR with B3's real asset
  shapes in hand.
- `TimelineBuilder` worker: shot plan + assets → ordered timeline with
  durations; audio track placement (voice/music) if those workers landed.
- `export`: ffmpeg-based render of the rough cut to a single video file,
  registered as an asset itself.
- Frontend: timeline preview (reuse the SVG/Canvas timeline component
  foundation, read-only) + export button.

**Definition of done:** the month-one demo. One idea, typed once, becomes a
rough animated/slideshow video with every intermediate artifact preserved,
editable, and traceable.

---

## Slice B5 — Knowledge loop hardening (post-demo polish)

**Goal:** The pipeline doesn't just produce a video; it enriches the project.

**Candidates (prioritize by what the demo revealed):**

- Batch promotion review: promote brief characters/locations as individual
  entity nodes with `narrative:*` tags (accept/reject per candidate, Story
  Dump pattern) rather than one doc-node.
- "Recompile against current canon" action + drift report (spec's frozen
  context vs. live graph).
- Production archive/completion flow; cost tracking per production.
- Voice/music/video workers behind the B3 protocols.
- Template extraction from completed productions.

---

## Standing rules for every slice

- ADRs before implementation, not after. Migration numbers and ADR numbers
  continue from wherever the repo currently stands.
- No new stage lands without: restartability (re-run = new attempt + new
  version), a typed contract model, a worker protocol, tests including the
  failure path, and 501 removed from exactly that stage.
- Canon is referenced by node ID, never copied into production prose, except
  when frozen into a prompt spec (where freezing is the point).
- Generated outputs never become canon automatically. Ever.
