# Constellation — Phase 9 Wrap
## Project Workspace + Narrative Timeline

*Completed 2026-05-19. Branch `claude/phase-9-workspace-timeline-sZdYq`,
PR #7, final commit `67a1ad0`. This document is the authoritative
completion record for Phase 9. It covers what was planned, what
shipped, what was learned, and what Phase 10 inherits.*

---

## Summary

Phase 9 delivered the Project Workspace — a persistent, mode-aware
working environment rooted in a structure note — and the Narrative
Timeline canvas. Six slices shipped over approximately six weeks.
The two governing design principles were held throughout and verified
destructively at completion:

**Mode sets defaults, not gates.** Every feature is accessible from
every project mode. Mode determines only which tab opens first.
Three gates were caught and fixed during development (Learning Map tab,
Prior-knowledge panel, NewProjectDialog prior-knowledge field). The
final audit confirmed zero mode-conditional feature restrictions across
the full codebase.

**The order of creation is invisible.** Scene Context View queries
live graph state on every open. A scene placeholder created before
any lore was written opens today surfacing all lore, characters, and
themes that have since been connected to it. Verified destructively:
soft-delete an EXPLAINS edge, reopen the scene, the lore note is gone.
A pytest (`test_scene_context_surfaces_characters_themes_location_lore`)
protects this contract against future regression.

---

## What shipped

### Slice 0 — Foundation (commit `6383bb5`)

All workspace schema in a single migration (`0007_project_workspace.sql`):
`is_project_hub` flag on nodes, `project_scopes` sidecar table,
`drafts` table, `work_sessions`, `session_nodes`, `session_edges`,
`dismissed_corpus_suggestions`. One-active-session-per-project enforced
at the API layer.

Full projects API: list/create, detail, scope read/patch, draft
GET/PUT/DELETE, sessions start/list/patch (close with `duration_seconds`
computed on `close: true`). `GET /projects/resolve?name=` for CLI
project name resolution.

**+35 backend tests. 422 total.**

### Slice 1 — Workspace shell (commit `f386fc6`)

`/projects` list page and project creation flow (promote any structure
node to a project hub). `/projects/[hub_id]` workspace route with
three-panel layout matching the UI artifact: collapsible side panels,
mobile-responsive (horizontal nav strip under 640px, side panels
auto-collapsed).

Free-writing pad with server-side draft autosave (2-second debounce).
Promotion flow: selected text → IntentionalCaptureDialog prefilled →
node auto-added to pinned scope on save.

Ask bar with three-state scope toggle: **Project** (tag_filter set),
**Both** (scoped first, expands to full corpus if confidence below B5
threshold, out-of-scope results labeled in provenance), **Full corpus**
(unscoped RagRequest). Frontend orchestration only — backend already
supported both shapes from Phase 8.4.

Session start dialog: intent (required), mode selector, estimated
duration. Session pill in topbar shows active session intent.

`con --project <name>` CLI flag: resolves via `GET /projects/resolve`,
attaches primary_tag_id to the fleeting note capture.

ADR-068 (Ask scope toggle) written inline.

**+12 backend tests. 434 total.**

### Slice 2 — Workspace intelligence (commit `d7a1ac2`)

Left panel scope editing: add/remove pinned notes via NodePicker (FTS5,
excludes fleeting per ADR-019), add/remove tags, primary tag selector.

Coverage stats panel (mode-aware): Research shows sub-topics (note
count + avg edge count per tag, thin-to-dense); Learning shows source
coverage per phase (suggested/confirmed/user_supplied breakdown);
Narrative shows character/theme/event counts.

Bridges panel: Discover bridges filtered to project scope, cross-tag
filter on by default, hides when empty.

Resume briefing: saved prompt with editable default, one-click run,
output saved as permanent with CITES edges, synthesis history list.

Session close flow: closing notes, next session intent (becomes forward
brief for next session start), status selector. Wrap summary on close:
notes created, edges created, mode-specific metric.

15-minute implicit session prompt: non-blocking toast after 15 minutes
of untracked activity, dismiss-once-permanent for the visit, backdates
`started_at` to first activity.

NodeInteractionPopup: universal Ctrl+click / tap-and-hold component.
Content editor, tag chips, edge creation with type selector, category
selector for lore nodes. Deployed in left-panel pinned rows and
right-panel bridges rows in this slice; deployed in timeline and Scene
Context View in Slice 5.

`include_session_fleetings` flag on SynthesizeRequest: adds unprocessed
fleetings from the current active session to the synthesis pool, labeled
"from unprocessed session captures." UI toggle in Synthesize scope
builder.

Learning map generation with web search: the learning map prompt
researches the topic domain before building phases and sub-topics.
Source recommendations populated with free links where available,
labeled "Suggested — not verified." Ollama graceful degradation.

Quick corrections panel: Session 1 only, sourced from `prior_knowledge`
captured at project creation. Left panel switches to personal notes
view ("My notes") from Session 2 onward, with Phase/Recent sort toggle.

Three gates fixed in this slice after audit: Learning Map tab was
hidden in non-learning modes, Quick corrections panel was hidden in
non-learning modes, prior_knowledge textarea was hidden in non-learning
modes. All three made mode-agnostic.

ADR-069 (session-scoped fleeting synthesis) and ADR-070 (learning mode
source workflow) written before their implementations.

**+15 backend tests. 449 total.**

### Slice 3 — Mermaid and artifacts (commit `4574fda`)

Mermaid rendering in note detail view and synthesis output on /ask and
/synthesize. Non-mermaid code blocks unaffected — the component
intercepts only `language-mermaid` className, everything else falls
through to react-markdown's default rendering.

Free-writing pad live Mermaid preview: detects fenced blocks, renders
preview panel alongside textarea, debounced 800ms, collapsible.

`artifact_type` and `artifact_format` nullable columns on nodes via
`0009_artifacts.sql`.

PNG export: client-side canvas capture from mermaid.js SVG render,
browser download, filename slugified from note title.

Markdown export: raw content as .md file, mermaid fences preserved.

RAG system prompt updated to note that mermaid fenced blocks (flowchart,
gantt, sequenceDiagram) are available as output formats when a visual
would clarify the answer.

**+0 backend tests (frontend-only slice). 449 total.**

### Slice 4 — Narrative timeline foundation (commit `21cbecc`)

Migration `0010_narrative_timeline.sql`: `is_story_event`, `story_time`,
`prose_status`, `manuscript_location` columns on nodes;
`event_timeline_positions` join table; `act_spans` table; EXPLAINS added
to EdgeType via table-recreate (same ceremony as `0004`).

Timeline API: `GET /projects/{hub_id}/timeline` (lazy-creates a default
timeline structure node COLLECTS-linked from hub on first call),
`POST /nodes/story-event`, `PATCH /nodes/{id}/timeline-position`,
`POST /projects/{hub_id}/act-spans`.

Custom SVG/Canvas timeline component per ADR-066. Single timeline lane
in this slice. Horizontal canvas with story-time x-axis (numeric/free-
text, not calendar time). Event cards positioned by `discourse_position`.
Act span containers as background regions with labels. Click-to-create:
click empty canvas → event title + story_time dialog → node created →
FOLLOWS_FROM auto-edge to preceding event. Drag-to-reorder within lane:
updates `discourse_position`, rewires FOLLOWS_FROM edges.

Event side panel: title, story_time, prose_status (read-only in this
slice, writable in Slice 5), act span label, "Open in Scene Context"
button (present but disabled — enabled in Slice 5).

Notes view "hide story events" toggle added to B2 filter framework.

ADR-064, ADR-065, ADR-066, ADR-071, ADR-072 written before
implementation. ADR-052 extended with EXPLAINS addendum.

**+18 backend tests. 467 total.**

### Slice 5 — Parallel lanes, thematic layer, Scene Context View
(commits `ce68a0e`, `67a1ad0`)

**Prose_status and manuscript_location write support** (Slice 4
deferral): segmented selector and free-text input in event side panel,
writes via PATCH /nodes/{id}.

**Parallel timeline lanes**: lane registry pattern in TimelinePanel —
each lane registers its SVG reference and position-translation function
with the parent. Parent owns pointer event state, walks registry to
find which lane the cursor is over during drag. Lane toggle chips.
"Add timeline" creates a new structure node COLLECTS-linked from hub.

**Cross-lane drag**: `POST /nodes/{id}/timeline-placement` endpoint.
`remove_from_timeline_node_id: null` → crossover (keep source row,
insert target row). `remove_from_timeline_node_id: set` → move (remove
source row, insert target, rewire FOLLOWS_FROM in both lanes). Default
drop = move; Alt-held drop = crossover. Target lane shows blue ring
("Drop = move here") or amber ring ("Drop = copy to both") based on
modifier key. Ghost card renders at would-be drop position before
release.

**Crossover event rendering**: event appearing in multiple timelines
renders in each lane with amber dashed border and "crossover · N lanes"
label.

**Prose_status indicator on cards**: colored dot/chip per event card
(Planned / Draft / Written / Revised).

**Character and entity attachment**: character nodes (structure nodes)
attach to events via COLLECTS edges. Event side panel shows attached
characters, add via NodePicker, remove inline. Character quick-create
from Characters tab: name, archetype, brief description. Click character
in left panel → their events highlight (opacity 1), other events dim
(opacity 0.3).

**Theme attachment**: drag theme node from left panel onto event card →
ELABORATES edge created. Theme density dots on cards (up to 6 dots,
5-color palette). Density pattern across timeline shows theme
concentration.

**NodeInteractionPopup deployed on timeline**: Ctrl+click / tap-and-hold
on any event card opens the universal popup. Component reused from
Slice 2, no new implementation.

**Scene Context View**: the central Phase 9 deliverable. Entered from
"Open in Scene Context" on event side panel. Three-panel reconfiguration:
left = scene-connected elements (characters, location, lore, themes —
relevance-weighted Strong/Moderate/Background), center = drill-down
reading surface, right = arc notes, parallel context, world rules.
World rules collapsed by default; session-aware hint at session > 10.
NodeInteractionPopup on all nodes — view refreshes without full reload
after popup save. "Back to timeline" returns to timeline with event
selected.

Relevance weighting by graph topology: Strong = direct edges to scene
elements, Moderate = one hop away, Background = world rules. No manual
curation. The graph structure does the weighting.

**Narrative workspace sidebar navigation (final)**: Write, Timeline,
Story Dump, Characters, World/Lore, Locations, Themes. Characters shows
list + summary panel + quick-create. World/Lore shows list by category
(World Rules, History, Power Structures, Social Fabric, Character
Backstory, Secrets) + quick-create with category selector. Locations
skeleton + quick-create. Themes list + quick-create. Story Dump wired
to `POST /rag/narrative-dump` — returns proposed nodes by type for
per-candidate accept/dismiss review.

**Slice 4 polish fixes**: act label on event cards now derives from
the act_span container whose start/end range contains the event's
`discourse_position` (was reading `story_time`). `discourse_position`
value (pos N) removed from production card UI.

**+18 backend tests (Slice 5 base) + 7 backend tests (cross-lane drag
fix) = +25. 492 total.**

---

## Metrics

| Metric | Value |
|---|---|
| Slices | 6 (Slice 0 through Slice 5) |
| Commits | 7 on branch (+ 1 post-completion fix) |
| Migrations | 4 (`0007` through `0010`) |
| ADRs written | 10 new (ADR-063 through ADR-072) + ADR-052 addendum |
| Backend tests | 387 (Phase 8 end) → **492** (Phase 9 end) **+105** |
| Frontend tests | 39 → 39 |
| Frontend `tsc --noEmit` | Clean throughout |
| Estimated duration | ~6 weeks clock |
| Branch | `claude/phase-9-workspace-timeline-sZdYq` |
| PR | #7 |
| Final commit | `67a1ad0` |

---

## ADR record

| ADR | Title | Slice |
|---|---|---|
| ADR-052 addendum | EXPLAINS edge type (narrative-specific addition) | Slice 4 |
| ADR-063 | Project-as-structure-node | Slice 0 |
| ADR-064 | Narrative event node design (flag-on-permanent) | Slice 4 |
| ADR-065 | Parallel timeline data model | Slice 4 |
| ADR-066 | Narrative timeline component choice (custom SVG/Canvas) | Slice 4 |
| ADR-067 | Synthesis history association | Slice 2 |
| ADR-068 | Ask scope toggle (Project / Both / Full corpus) | Slice 1 |
| ADR-069 | Session-scoped fleeting synthesis | Slice 2 |
| ADR-070 | Learning mode source material workflow | Slice 2 |
| ADR-071 | Manuscript source handling in narrative mode | Slice 4 |
| ADR-072 | Act span schema for narrative timeline | Slice 4 |

---

## Phase 8.2 probe result

Run against the expanded Phase 9 corpus (2026-05-19):

```
Fixtures with reactivation signal: 0 / 3
→ Phase 8.2 stays deferred.
```

F1 (consciousness/CONTRADICTS): cap binds (27 raw → 12 kept). All
kept CONTRADICTS and SUPPORTS edges have cosine similarity > 0.6 —
three dropped SUPPORTS edges are 0.722, 0.700, 0.698, all above the
reactivation threshold.

F2 (MCP4922/SUPPORTS): cap doesn't bind (9 raw < 12 cap).

F3 (looper/ANALOGOUS_TO): cap doesn't bind (4 raw < 12 cap).

Phase 8.2 (retrieval-side edge-type-aware truncation) remains
conditionally deferred per ADR-058. The reactivation criterion —
CONTRADICTS or SUPPORTS edges with endpoint cosine similarity < 0.6
dropped at the cap on ≥2 fixtures — is not met. Re-run
`evals/phase8_prototype/probe_retrieval.py` after the narrative
corpus grows, particularly after lore EXPLAINS edges and theme
ANALOGOUS_TO edges create genuine cross-domain connections between
creative and research material.

---

## Design principles: final verification

### Mode sets defaults, not gates

Ten center-panel tabs declared in `ALL_TABS` (Write, Notes, Synthesize,
Timeline, Learning map, Story Dump, Characters, World/Lore, Locations,
Themes). Every tab is reachable from every project mode. `DEFAULT_TAB`
chooses only the opening tab:

- Research → Write
- Narrative → Timeline
- Learning → Learning map

Three gates caught and fixed during Slice 2 development. Zero
mode-conditional feature restrictions in the final codebase.

### The order of creation is invisible

`SceneContextView.tsx` carries a file-level comment documenting the
live-graph-assembly contract. `refresh()` calls `getSceneContext()`
which hits `GET /projects/{hub}/scene-context/{event}`. The endpoint
calls `timeline_repo.assemble_scene_context()` — five live SQL queries
against current graph state (characters, themes, location-and-lore,
arc-notes, world-rules). No materialized view, no SWR-style local
store, no localStorage shadow copy.

Verified destructively: soft-delete the EXPLAINS edge between Harbor
and Harbor History lore note. Reopen Scene Context for Harbor Arrival.
Lore note absent from response. HTTP 204 on delete, lore role empty
on reopen.

Pytest `test_scene_context_surfaces_characters_themes_location_lore`
covers this destructively — any future caching layer that sneaks in
will fail this test loudly.

---

## What Phase 9 explicitly did not ship

Per the build plan, the following are deferred to Phase 10 or later:

- **Full character sheet UI** — character list and summary landed;
  the full sheet (field structure, arc notes, corpus connections,
  author instructions) is Phase 10.
- **Full lore library UI** — lore list by category landed; the full
  library (consistency check, "what does this character know" filter,
  lore audit feature) is Phase 10.
- **Location sheets** — skeleton and quick-create landed; full sheets
  are Phase 10.
- **Learning mode check sessions and learner profile** — learning map
  generation landed; formal knowledge checks (multiple choice, short
  response, essay), check session storage, and the learner profile
  synthesis are Phase 10.
- **Work session history timeline view** — session records and
  session_nodes/session_edges join tables landed; the creation timeline
  visualization is Phase 10.
- **Frontend test coverage for integration-heavy surfaces** — SVG
  canvas drag, Mermaid runtime, Scene Context live query, and
  NodeInteractionPopup overlay are verified by hands-on browser
  inspection. Adding `@testing-library/react` + headless DOM coverage
  for these surfaces is a Phase 10 polish item.
- **Story Dump LLM extraction quality tuning** — the endpoint, prompt,
  and review UI landed; prompt tuning for extraction quality is
  Phase 10.
- **Phase 8.2 retrieval-side edge expansion** — remains conditionally
  deferred. Reactivation diagnostic is `probe_retrieval.py`.
- **iOS Shortcut work (C4/C5)** — still held pending iOS dev story.
- **Quick-switcher (Cmd+P / C2)** — still deferred, orthogonal to
  Phase 9.

---

## What Phase 10 inherits

Phase 10 builds on a complete workspace foundation. The data layer,
session infrastructure, timeline schema, and live graph assembly
pattern are all established. Phase 10 work is primarily surface
completion and depth — building out the rich UI views that Phase 9
scaffolded.

**Highest-priority Phase 10 items based on the use case philosophy
document and daily-use evidence:**

Full character sheet UI (Part VII of philosophy doc). The four field
types (scalar attributes, rich text nodes as separate permanent nodes,
relationship edges, corpus connections) are designed and documented.
Arc tracking (Option A — arc notes as edges to timeline events) is
the decided approach. Author instructions as a visually distinct
field type is the most important implementation detail.

Learning mode check sessions (§3.2 of philosophy doc). Three question
formats (multiple choice, short response, essay), two generation modes
(corpus-grounded, domain-extended), session storage schema. The learner
profile is derived on-demand from session history via the RAG pipeline —
no separate analytics engine needed.

Full lore library (§6.6 of philosophy doc). The consistency check
("do any lore notes contradict each other?"), the "what does this
character know?" filter, and the lore audit feature are the three
high-value additions beyond the list view that shipped in Phase 9.

Frontend test coverage for visual surfaces. The gap is real and
manageable. `@testing-library/react` with a headless browser covers
SVG pointer events, Mermaid rendering, Scene Context live query, and
popup z-stacking. This should be Phase 10 Slice 0 work — establish
the testing infrastructure before building more visual surfaces on
top of it.

Claim-node primitive (§2.5 of philosophy doc). The claim-node and the
narrative theme/motif node are the same data shape. Building it once
with sufficient generality covers both the argumentative research use
case (Scenario 12, finding #32) and the creative thematic use case.
This is the most architecturally leveraged item in Phase 10.

Work session history timeline view (§IIIb.7 of philosophy doc).
The `session_nodes` and `session_edges` join tables are populated.
The visualization — sessions as labeled blocks, nodes and edges as
items within each block — reuses the narrative timeline component
(same SVG/Canvas foundation, read-only rather than interactive).

**The Phase 8.2 reactivation criterion to watch:** run
`probe_retrieval.py` monthly. When lore EXPLAINS edges and theme
ANALOGOUS_TO edges create genuine cross-domain connections between
the narrative corpus and the research corpus, high-signal edges will
start getting dropped at the neighbor cap. That is when Phase 8.2
earns its keep.

---

## Decisions that remain open for Phase 10 planning

These were deferred from the Phase 9 design session and are not yet
resolved:

**Workspace mode as project-level configuration vs. per-session
override.** Currently mode is set at project creation and stored in
`project_scopes.mode`. Whether a session can override the project's
default mode (a narrative project having a research session) is
supported in the `work_sessions.mode` field but not yet exposed as
a deliberate UI choice.

**Node type for `event` — whether to formalize as a fifth NodeType.**
Phase 9 used the flag-on-permanent approach (Option B, decided in the
design brief). Option A (a formal `event` NodeType) was deferred with
a migration path noted. If event-specific fields proliferate in Phase
10, revisit ADR-064.

**Theme/motif node and claim-node convergence.** The philosophy doc
(§2.5) names this explicitly. Phase 10 should design the claim-node
primitive with sufficient generality to cover both use cases. This is
an ADR-level decision that affects the schema.

**iOS dev story for `con --project` on mobile.** C4 and C5 are still
held. The `con --project` flag works from the terminal; the mobile
Shortcut equivalent is blocked on the iOS dev story question.

---

*Phase 9 complete. Branch `claude/phase-9-workspace-timeline-sZdYq`
ready to merge. Phase 10 planning should begin with the use case
philosophy document (Parts III.B, V, VI, VII) and this wrap document
as the primary inputs.*
