# Constellation — Phase 9 Build Plan

## Project Workspace + Narrative Timeline

*Addendum to `docs/ux-build-plan.md`. Phases 0–8 are documented there.
This document covers Phase 9 only. Written 2026-05-16 following the
UX design session that produced the Phase 9 design brief, the use case
philosophy document, and the workspace UI artifact.*

*Phase 9 begins after Phase 8 (complete as of commit be1288f) and
Bucket B (five standalone PRs, ~3 weeks clock). This plan assumes both
are complete.*

-----

## Documents Claude Code must read before starting

In this order:

1. `docs/ux-build-plan.md` — existing phased plan, Phases 0–8. Read
   §4 (Phase 8) for context on what just shipped. Note: last migration
   was `0006_resolved_edges.sql`. Phase 9 starts at `0007`.
1. `docs/decisions.md` — ADR log through ADR-067 (Phase 8). Phase 9
   ADRs are 068–072 plus any new ones. Match the existing format.
1. `docs/architecture.md` — schema and API surface. Will need updating
   as Phase 9 migrations land.
1. `constellation-phase9-design-brief.md` — resolved design decisions,
   schema additions, ADR assignments, and the suggested slice structure.
   **This is the primary implementation reference.**
1. `constellation-phase9-concept.md` — value proposition and design
   intent. Read §8 (narrative timeline) and §3 (scope) before making
   any decisions that touch the node type vocabulary or EdgeType enum.
1. `constellation-use-case-philosophy.md` — the “why” layer. Read
   Part III.B (sessions), Part V (session 1 profiles), Part VI (lore
   and Scene Context View), and Part VII (character sheets) before
   building any narrative surfaces. Read §5.6 (resolved decisions) for
   the five decisions that were open at design time.
1. `constellation-workspace.jsx` — the UI artifact built during the
   design session. Visual reference for the three-panel layout, mode
   switching, Scene Context View, and mobile responsive behavior.

Do not begin implementation until this reading pass is complete.

-----

## Phase 9 goal

Build the Project Workspace — a persistent, mode-aware working
environment rooted in a structure note — and the Narrative Timeline
canvas. These are the two surfaces that make the three modes (Research,
Narrative, Learning) feel like first-class workflows rather than
features on top of a note-taking tool.

By the end of Phase 9:

- A user can create a project, declare its mode, and return to a
  prepared workspace that remembers their scope, session history, and
  briefing prompt.
- A narrative project has a timeline canvas where events are placed,
  sequenced, and connected to characters and themes.
- Mermaid diagrams render in notes and synthesis output.
- The workspace Ask bar has a three-state scope toggle.
- Session-scoped fleeting synthesis is available.

-----

## ADR index for Phase 9

Write these ADRs before or alongside the slice that triggers them.
Never after. All follow the existing format in `docs/decisions.md`.

|#          |Title                                                  |Trigger|Timing                               |
|-----------|-------------------------------------------------------|-------|-------------------------------------|
|**ADR-063**|Project-as-structure-node                              |Slice 0|Before Slice 0 migration             |
|**ADR-064**|Narrative event node design                            |Slice 4|Before Slice 4 migration             |
|**ADR-065**|Parallel timeline data model                           |Slice 4|Before Slice 4 migration             |
|**ADR-066**|Narrative timeline component choice (custom SVG/Canvas)|Slice 4|Before wrapper implementation begins |
|**ADR-067**|Synthesis history association                          |Slice 2|Inline with synthesis history feature|
|**ADR-068**|Ask scope toggle (Project / Both / Full corpus)        |Slice 1|Inline with Ask bar build            |
|**ADR-069**|Session-scoped fleeting synthesis                      |Slice 2|Inline with Synthesize scope builder |
|**ADR-070**|Learning mode source material workflow                 |Slice 2|Before learning map generation prompt|
|**ADR-071**|Manuscript source handling in narrative mode           |Slice 4|Inline with scene node schema        |
|**ADR-072**|Act span schema for narrative timeline                 |Slice 4|Before Slice 4 migration             |

-----

## Phase 9 plan philosophy

**Vertical slices, independently shippable.** Each slice delivers
working, testable functionality. The workspace is usable after Slice 2.
Mermaid ships in Slice 3. The timeline is progressively built in
Slices 4 and 5.

**Mode sets defaults, not gates.** A Research mode project can add a
Timeline tab. A Narrative mode project can run learning checks. Mode
determines what is prominent on first open — it does not restrict
available features. Never implement mode as a feature gate.

**Everything lands in the graph.** Notes authored in the free-writing
pad, events placed on the timeline, lore captured from the lore library,
characters sketched in onboarding — all become nodes and edges in the
graph. The workspace is a lens, not a silo.

**Live graph assembly.** Scene Context View and any other context-
assembly surface must query current graph state, not a cached snapshot.
The order of creation is invisible to the user. A scene sketched eight
weeks ago opens today showing all the lore and character connections
that have been built since. This is non-negotiable.

**Never research your own work.** The design mantra for Scene Context
View. If the user has to search or browse to find something relevant to
their current scene, the feature has failed.

-----

## Slice 0 — Foundation

**Status:** Pending
**Goal:** Schema and API foundation that all subsequent slices depend on.
No UI yet. Backend and schema only.

**Deliverables:**

- Migration `0007_project_workspace.sql`:
  - `ALTER TABLE nodes ADD COLUMN is_project_hub INTEGER NOT NULL DEFAULT 0`
  - `CREATE INDEX idx_nodes_project_hub ON nodes(is_project_hub) WHERE is_project_hub = 1 AND deleted_at IS NULL`
  - `CREATE TABLE project_scopes (hub_node_id TEXT PRIMARY KEY REFERENCES nodes(id), pinned_node_ids TEXT NOT NULL DEFAULT '[]', tag_ids TEXT NOT NULL DEFAULT '[]', primary_tag_id TEXT REFERENCES tags(id), briefing_prompt TEXT, last_visited_at TEXT, mode TEXT NOT NULL DEFAULT 'research' CHECK(mode IN ('research','narrative','learning')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `CREATE TABLE drafts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES nodes(id), content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, UNIQUE(project_id))`
  - `CREATE TABLE work_sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES nodes(id), mode TEXT NOT NULL CHECK(mode IN ('research','narrative','learning','planning')), intent TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','partial','blocked','abandoned')), progress_notes TEXT, blockers TEXT, closing_notes TEXT, next_session_intent TEXT, intent_assessment TEXT, estimated_duration_minutes INTEGER, started_at TEXT NOT NULL, closed_at TEXT, duration_seconds INTEGER, created_at TEXT NOT NULL)`
  - `CREATE TABLE session_nodes (session_id TEXT NOT NULL REFERENCES work_sessions(id), node_id TEXT NOT NULL REFERENCES nodes(id), created_at TEXT NOT NULL, session_tagged INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (session_id, node_id))`
  - `CREATE TABLE session_edges (session_id TEXT NOT NULL REFERENCES work_sessions(id), edge_id TEXT NOT NULL REFERENCES edges(id), created_at TEXT NOT NULL, session_tagged INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (session_id, edge_id))`
  - `CREATE TABLE dismissed_corpus_suggestions (project_id TEXT NOT NULL REFERENCES nodes(id), node_id TEXT NOT NULL REFERENCES nodes(id), dismissed_at TEXT NOT NULL, PRIMARY KEY (project_id, node_id))`
- API endpoints:
  - `GET /projects` — list all structure nodes where `is_project_hub = 1`
  - `POST /projects` — promote an existing structure node to project hub (sets `is_project_hub = 1`, creates `project_scopes` row)
  - `GET /projects/{hub_id}` — project detail: hub node + scope config + active session if any
  - `GET /projects/{hub_id}/scope` — scope config only
  - `PATCH /projects/{hub_id}/scope` — update pinned nodes, tags, briefing prompt, mode
  - `GET /projects/{hub_id}/draft` — current draft content
  - `PUT /projects/{hub_id}/draft` — upsert draft content
  - `DELETE /projects/{hub_id}/draft` — clear draft after promotion
  - `POST /projects/{hub_id}/sessions` — start a new work session
  - `PATCH /projects/{hub_id}/sessions/{session_id}` — update session (progress notes, close)
  - `GET /projects/{hub_id}/sessions` — session history for a project
- ADR-063 written before migration is applied.

**Definition of done:** `POST /projects` promotes a structure node.
`GET /projects/{hub_id}` returns the hub node, scope config, and any
active session. `PUT /projects/{hub_id}/draft` persists content.
All new endpoints covered by backend tests. No UI yet.

-----

## Slice 1 — Workspace shell

**Status:** Pending
**Goal:** The `/projects` list page and the workspace layout exist.
The workspace is navigable and structurally correct even with mostly
empty panels.

**Deliverables:**

- `/projects` list page: card grid of project hubs. Each card shows
  project title, mode badge, last-visited date, note count, active
  session indicator. “New project” creates a structure node and promotes
  it. “Open existing” promotes any structure node.
- `/projects/[hub_id]` workspace route: three-panel layout as designed.
  Mode-specific default panel configuration (see design brief §2, §3,
  §4 for each mode’s defaults).
- Left panel: pinned scope display (read-only in this slice). Tags chip
  row. Scope stats (note count, last visited, captures since last visit).
- Center panel: tab navigation. Write tab with free-writing pad —
  autosave via `PUT /projects/{hub_id}/draft` on 2-second debounce.
  Promotion flow: selected text → IntentionalCaptureDialog prefilled →
  on save, node auto-added to pinned scope.
- Right panel: recent activity feed (node/edge creation timestamps,
  session opens/closes). Open-questions panel with one-line append input.
- Topbar: session pill (active session name or “Start session”). “Start
  session” opens a dialog: intent field (required), mode selector
  (pre-filled from project mode), estimated duration (optional). On
  confirm, `POST /projects/{hub_id}/sessions`.
- Ask bar: three-state scope toggle — Project / Both / Full corpus.
  Default: Project. Writes `tag_filter` on `ScopedAskRequest` when
  Project or Both. ADR-068 inline.
- Mobile: responsive layout matching the UI artifact. Narrative sidebar
  becomes horizontal scroll strip on mobile. Side panels collapse to
  icon rails by default on mobile.
- `con --project <name>` CLI flag: resolves project name to
  `primary_tag_id`, posts capture with that tag. Ships with this slice
  since session concept ships here.

**Definition of done:** Navigate to `/projects`, create a project from
an existing structure node, open the workspace. The free-writing pad
autosaves. Starting a session creates a `work_sessions` row. The Ask
bar scope toggle works (Project sends scoped request, Full corpus sends
unscoped). `con --project eurorack "thought"` posts a note tagged to
the project. Mobile layout matches the UI artifact.

-----

## Slice 2 — Workspace intelligence

**Status:** Pending
**Goal:** The ambient intelligence panels are populated. The workspace
feels alive rather than structural.

**Deliverables:**

- Left panel editing: add/remove pinned notes (NodePicker with FTS5
  search), add/remove tags.
- Coverage stats panel (left): note count and avg edge count per tag,
  sorted thin-to-dense. Research mode: shows sub-topics from manual
  Sub-topics card. Learning mode: shows source coverage per phase
  (source_status breakdown). Narrative mode: shows character/theme/event
  counts.
- Bridges panel (right): Discover bridges filtered to project scope.
  Cross-tag filter applied by default. Reuses `GET /discover/bridges`
  with tag filter.
- Resume briefing: “Resume briefing” button runs saved `briefing_prompt`
  against project scope via Synthesize. Output saved as permanent with
  CITES edges and `synthesis_run` association. Synthesis history list
  shows dated briefings.
- Session close flow: “End session” opens close dialog. Fields:
  closing notes, next session intent, status (Completed/Partial/
  Blocked). On confirm, `PATCH` session with `closed_at` and
  `duration_seconds`. Session wrap summary displayed: notes created,
  edges created, sub-topics completed (learning), events placed
  (narrative).
- 15-minute implicit session prompt: if user has been active in a
  project for 15 minutes without starting a session, a non-blocking
  toast offers “Log this as a session?” Backdates `started_at` to
  first activity.
- NodeInteractionPopup: universal Ctrl+click (desktop) / tap-and-hold
  (mobile) component. Opens an overlay with full node editing: content,
  tags, edge creation, category (for lore nodes). Works everywhere a
  node is referenced in the app — panels, graph, timeline, search
  results. Reuses and extends `NotePreviewPopover` visual language.
- `include_session_fleetings` flag on `SynthesizeRequest`. UI toggle
  in Synthesize scope builder: “Include today’s unprocessed captures.”
  ADR-069 inline.
- Learning mode: learning map generation uses web search. Prompt
  researches topic domain, derives phase structure from findings,
  populates phases with specific source recommendations including free
  links. Source records created with `source_status = 'suggested'`.
  ADR-070 inline.
- Quick corrections panel: generated from prior knowledge entry during
  project creation onboarding. Session 1 only — left panel switches to
  “My notes” view from Session 2 onward (as designed in UI artifact).

**Definition of done:** Resume briefing runs and saves a dated synthesis.
NodeInteractionPopup opens on Ctrl+click anywhere in the app and saves
changes. Session close dialog creates a complete session record.
Learning map generation for “Motor encoders” produces a phased plan
with source suggestions and free links. Left panel shows quick
corrections in Session 1 and personal notes from Session 2.

-----

## Slice 3 — Mermaid and artifacts

**Status:** Pending
**Goal:** Mermaid diagrams render in notes and synthesis output.
Artifacts can be saved and exported.

**Deliverables:**

- Mermaid rendering: detect ````mermaid` fences in node `content`
  field and render via `mermaid.js` in note detail view. Also renders
  inline in synthesis output on `/ask` and `/synthesize`.
- Free-writing pad: live Mermaid preview panel alongside the textarea
  when a mermaid fence is detected.
- `artifact_type` and `artifact_format` nullable fields on permanent
  nodes. Values: `artifact_type: 'note' | 'artifact'`, `artifact_format: 'mermaid' | 'gantt' | 'document' | null`.
- Export: PNG export for rendered Mermaid charts (client-side canvas
  capture). Markdown export with embedded diagram syntax. Both
  available from the node detail view “Export” menu.
- Gantt synthesis output: no new backend work. Claude’s synthesis
  prompt can output `gantt` syntax; the renderer handles it. Document
  this in the synthesis system prompt as an available output format.

**Definition of done:** Create a permanent note with a mermaid
flowchart fence — it renders in the note detail view. Run a synthesis
scoped to a project’s planning notes with a Gantt request — the output
renders as a Gantt chart. Export a rendered chart as PNG — file
downloads correctly.

-----

## Slice 4 — Narrative timeline foundation

**Status:** Pending
**Goal:** The timeline canvas exists and is usable for a single linear
story. Events can be created, sequenced, and connected to characters.

**Deliverables:**

- Migration `0008_narrative_timeline.sql`:
  - `ALTER TABLE nodes ADD COLUMN is_story_event INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE nodes ADD COLUMN story_time TEXT`
  - `ALTER TABLE nodes ADD COLUMN prose_status TEXT CHECK(prose_status IN ('planned','draft','written','revised'))`
  - `ALTER TABLE nodes ADD COLUMN manuscript_location TEXT`
  - `CREATE TABLE event_timeline_positions (event_node_id TEXT NOT NULL REFERENCES nodes(id), timeline_node_id TEXT NOT NULL REFERENCES nodes(id), discourse_position INTEGER NOT NULL, PRIMARY KEY (event_node_id, timeline_node_id))`
  - `CREATE TABLE act_spans (id TEXT PRIMARY KEY, timeline_node_id TEXT NOT NULL REFERENCES nodes(id), label TEXT NOT NULL, start_position INTEGER NOT NULL, end_position INTEGER NOT NULL, color TEXT, created_at TEXT NOT NULL)`
  - Add `EXPLAINS` to EdgeType CHECK constraint (requires table-recreate migration — share with any other pending EdgeType additions). ADR-072 inline.
- API endpoints:
  - `GET /projects/{hub_id}/timeline` — events + act spans + timeline structure nodes + positions for a project
  - `POST /nodes/story-event` — create a story event node with `is_story_event = 1`
  - `PATCH /nodes/{id}/timeline-position` — update discourse position
  - `POST /projects/{hub_id}/act-spans` — create/update act span
- Notes view: “Hide story events” toggle added to the B2 filter
  framework.
- Frontend timeline component: custom SVG/Canvas (ADR-066). Slice 4
  scope is single timeline lane only:
  - Horizontal canvas with story-time x-axis (numeric/free-text, not
    calendar time)
  - Event cards positioned by discourse order
  - Act span containers rendered as background regions with labels
  - Click-to-create: click empty canvas space → create event node,
    insert into `event_timeline_positions`
  - Drag-to-reorder: drag event card → updates `discourse_position`
    via PATCH on drop
  - FOLLOWS_FROM edge auto-created between adjacent events in
    discourse order
  - Click event card → side panel showing event detail with character
    attachments and theme tags
  - “Open in Scene Context” button on event side panel
- ADR-063, ADR-064, ADR-065, ADR-066, ADR-071, ADR-072 all written
  before this slice begins.
- `prose_status` and `manuscript_location` fields ship here (ADR-071).

**Definition of done:** Open a narrative project. Navigate to Timeline.
Place three events by clicking the canvas — they appear as cards in
sequence with FOLLOWS_FROM edges connecting them. Drag to reorder —
`discourse_position` updates and the canvas reflects the new order.
Define an act span by dragging a range — it renders as a background
container. Click an event card — side panel shows detail and “Open in
Scene Context” button. Notes view “Hide story events” toggle hides
`is_story_event = 1` nodes.

-----

## Slice 5 — Narrative timeline — parallel lanes and thematic layer

**Status:** Pending
**Goal:** Parallel storylines, character/entity lane filtering, and
theme attachment on the timeline. Scene Context View complete.

**Deliverables:**

- Parallel timeline lanes: each timeline structure node is a swim lane
  in the canvas. Multiple timelines visible simultaneously. Lane toggle
  panel: show/hide individual timeline nodes as lanes. Crossover scenes
  (event in two lanes) handled via `event_timeline_positions` join table.
- Character and entity nodes: structure nodes that COLLECTS events.
  Character creation flow from within the workspace — name, archetype,
  brief description. Character nodes attach to events; filtering to a
  character shows only their scenes as a highlighted lane.
- Theme attachment UI: drag a theme node onto an event to create a
  typed edge. Theme density visible on the timeline as colored dots
  per event.
- Scene Context View (complete):
  - Accessed from event side panel “Open in Scene Context” button
  - Three-panel reconfiguration: left = scene connected elements
    (characters, location, lore — relevance-weighted), center = drill-
    down reading surface, right = arc notes, parallel context, world
    rules (collapsed)
  - Live graph assembly: queries current graph state on every open.
    Order of creation is invisible.
  - Relevance weighting: Strong (direct edges to scene elements) /
    Moderate (one hop away) / Background (world rules)
  - Character cards show active traits, author notes (visually
    distinct — amber tint), core wound
  - Lore surfaced from location: EXPLAINS edges to the scene’s
    location node
  - World rules: always present, collapsed by default with session-
    aware expand hint (“By session 20 these should be internalized”)
  - NodeInteractionPopup available on all nodes in Scene Context View
- EXPLAINS edge type: ships in this slice’s EdgeType migration (if not
  already shipped in Slice 4). Documented in ADR-072 or a new ADR if
  separate.
- Narrative workspace navigation sidebar: seven items (Write, Timeline,
  Story Dump, Characters, World/Lore, Locations, Themes) as designed
  in the UI artifact. Mobile: horizontal scroll strip. Each navigation
  item shows the correct surface (Slice 5 completes Characters and
  World/Lore skeletons from Slice 4).

**Definition of done:**

- Create two timeline structure nodes. Add events to each. Toggle
  lanes on/off — each lane’s events appear/disappear.
- Add a crossover event that appears in both lanes — it renders in both
  with different discourse positions.
- Attach a character to three events. Filter to that character — only
  their events are highlighted.
- Open a scene in Scene Context View — characters, location atmosphere,
  lore notes (via EXPLAINS edges), and themes all surface. Soft-delete
  an EXPLAINS edge and reopen the scene — that lore note is gone from
  context (live graph assembly confirmed).
- Ctrl+click a node in Scene Context View — NodeInteractionPopup opens,
  edit saves, view updates without full reload.

-----

## What is NOT in Phase 9

- Learning mode check sessions and learner profile (Phase 10)
- Full lore library UI (Phase 10 — lore nodes are creatable and
  edge-able from Phase 9; the dedicated library view comes later)
- Full character sheet UI (Phase 10 — character nodes are creatable
  from Phase 9; the full sheet surface comes later)
- Location sheets (Phase 10)
- iOS Shortcut work — C4/C5 still held
- Quick-switcher (Cmd+P) — C2 still deferred
- Phase 8.2 retrieval-side edge expansion — still conditionally
  deferred, probe_retrieval.py is the reactivation diagnostic
- World rules management UI (Phase 10)
- Work session history timeline view (Phase 10)
- Full narrative dump → node extraction (the Story Dump tab exists
  from the UI artifact; the actual Claude extraction pipeline ships
  in Phase 10 once the node types it creates are fully defined)

-----

## Phase 9 totals (estimated)

|Slice                             |Focus                                           |Estimated effort|
|----------------------------------|------------------------------------------------|----------------|
|0 — Foundation                    |Schema + API                                    |3–4 days        |
|1 — Workspace shell               |Layout + navigation + session start             |4–5 days        |
|2 — Intelligence                  |Panels + briefing + session close + learning map|4–5 days        |
|3 — Mermaid                       |Rendering + export                              |2–3 days        |
|4 — Timeline foundation           |Schema + single-lane canvas                     |5–7 days        |
|5 — Parallel lanes + Scene Context|Full narrative surface                          |5–7 days        |

**Total: 23–31 working days / ~6–8 weeks of clock at one slice per
week.**

The timeline slices (4 and 5) carry the most uncertainty. The custom
SVG/Canvas component (ADR-066) is the highest-cost single piece. Slice
4’s scope is held deliberately tight (single lane only) to keep it
achievable as a focused sprint. Slice 5 adds the complexity.

-----

## Relationship to Phase 8

Phase 8 work that Phase 9 builds directly on:

- `ScopedAskRequest` (Phase 8.4, C1) — the workspace Ask bar’s backend.
  Slice 1 adds the scope toggle UI around it.
- BUILDS_ON / APPLIES_TO / CITES edges (Bucket A) — make session
  activity feeds and synthesis history more informative.
- FOLLOWS_FROM (Phase 8.3, D1) — the temporal edge the narrative
  timeline uses for discourse sequencing. Already shipped.
- B5 confidence threshold — the “Both” state of the Ask scope toggle
  reuses this logic to decide when to expand from project to full
  corpus.
- `probe_retrieval.py` — do not modify. Run after Phase 9 ships to
  check whether the expanded corpus (more cross-domain edges from
  narrative and learning projects) activates the Phase 8.2
  reactivation criterion.

-----

*This document is the authoritative Phase 9 build plan as of 2026-05-16.
Update it when prototype outcomes change slice scope. The design brief,
philosophy document, and concept doc remain the source of truth for
design decisions. This document is the source of truth for sequencing
and deliverables.*