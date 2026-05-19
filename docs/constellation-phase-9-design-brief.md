# Constellation — Phase 9: Design Brief

*Produced 2026-05-16. This document is the pre-work brief for Phase 9
(Project Workspace + Narrative Timeline). It resolves the open decisions
from `constellation-phase9-concept.md` and supersedes that document’s §6
(Open decisions) wherever they conflict. Hand this brief plus the concept
doc, `docs/ux-build-plan.md`, `docs/decisions.md`, and
`docs/architecture.md` to Claude Code at the start of the Phase 9 planning
session.*

*Do not begin implementation until the Phase 9 planning session has produced
a sequenced slice plan reviewed and approved by the user. This brief is
input to planning, not a build instruction.*

-----

## 1. Resolved decisions

### Decision 1 — Project root: structure note with sidecar table (ADR-063)

**Decision:** A project is rooted in exactly one structure note (the “hub
note”). The hub note is an ordinary node with `type = 'structure'` and a
new boolean flag `is_project_hub = true`. A new `project_scopes` table
stores the project’s persistent configuration, keyed by `hub_node_id`.

**Schema addition:**

```sql
-- nodes table: new column
ALTER TABLE nodes ADD COLUMN is_project_hub INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_nodes_project_hub ON nodes(is_project_hub)
    WHERE is_project_hub = 1 AND deleted_at IS NULL;

-- new table
CREATE TABLE project_scopes (
    hub_node_id     TEXT PRIMARY KEY REFERENCES nodes(id),
    pinned_node_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of node IDs
    tag_ids         TEXT NOT NULL DEFAULT '[]',  -- JSON array of tag IDs
    briefing_prompt TEXT,                        -- saved Synthesize prompt
    last_visited_at TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

**Design constraints:**

- Each project has exactly one hub note. Users create the hub note
  intentionally; it becomes the artifact where resume-briefing syntheses
  are saved (CITES edges back to sources).
- A project can span multiple existing structure notes by pinning them
  in `pinned_node_ids` — the hub note is the root, not the exclusive
  member.
- Projects are graph citizens. The hub node can receive QUESTIONS,
  SUPPORTS, ANALOGOUS_TO, and any other typed edges from other nodes.
- The project list UI queries `WHERE is_project_hub = 1` — fast,
  no join.

**ADR required:** ADR-063 — Project-as-structure-node. Captures the
structure-note-as-root decision, the `project_scopes` sidecar design,
and the explicit constraint that each project has exactly one hub.

-----

### Decision 2 — Free-writing pad: server-side draft table

**Decision:** Server-side storage in a new `drafts` table. One draft row
per project. localStorage is not used — the SQLite file is the source of
truth for all data including drafts.

**Schema addition:**

```sql
CREATE TABLE drafts (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES nodes(id),  -- hub_node_id
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL,
    UNIQUE(project_id)
);
```

**Endpoints:**

- `GET /projects/{hub_id}/draft` — returns current draft content or
  `{"content": ""}` if none exists.
- `PUT /projects/{hub_id}/draft` — upserts content. Called on a
  debounced interval (suggested: 2 seconds after last keystroke).
- `DELETE /projects/{hub_id}/draft` — called after successful promotion
  to a node.

**Promotion flow:**

1. User selects text (or all) in the free-writing pad and clicks
   “Promote to permanent note.”
1. Frontend opens the IntentionalCaptureDialog pre-filled with the
   selected content.
1. On successful save, the promoted content is removed from the draft.
   If the whole pad was promoted, `DELETE /projects/{hub_id}/draft` is
   called. If partial, the pad is updated with the remaining text via
   `PUT`.
1. The promoted node is automatically added to the project scope
   (`pinned_node_ids`).

**No ADR required.** Mechanical schema addition; design rationale
(SQLite-as-source-of-truth) is already established by ADR-001.

-----

### Decision 3 — Timeline component: custom SVG/Canvas

**Decision:** The narrative timeline canvas is a fully custom React
component built on SVG/Canvas. All third-party timeline libraries
(`vis-timeline`, `react-chrono`, and equivalents) are eliminated.

**Why custom:**

The narrative timeline is the primary authoring surface for the creative
workflow — not a utility component. Three specific requirements make
library solutions a poor long-term fit:

1. **Story-time x-axis.** Library timelines assume calendar time on the
   x-axis. Story time is narrative beats, acts, scenes, or free-text
   positions (“Day 14”, “Act 2 Scene 3”) with no real-world date. Working
   against a calendar-time assumption compounds with every feature added.
1. **Theme layer density overlay.** Showing where a motif is dense vs.
   sparse across the timeline is a drawing operation — a visual overlay
   on top of event lanes, not a data row or event group. Library
   components treat this as an unsupported edge case. Custom SVG/Canvas
   handles it as a first-class rendering pass.
1. **Character arc curves.** Rendering a character’s emotional or
   narrative trajectory as a curve overlaid on their events is similarly
   a drawing operation, not a data display. This is Phase 10 work but
   the component architecture must support it without a rewrite.
1. **Visual language.** Library timeline components import the aesthetic
   of project management or scheduling tools. The narrative timeline
   should feel like it belongs to Constellation’s visual vocabulary —
   a storyboard or script surface, not a Gantt chart.

**Build cost management — phased scope:**

The custom component is scoped progressively to keep Phase 9 achievable:

- **Slice 4 (Phase 9):** Single timeline lane, event cards, story-time
  x-axis (numeric/free-text), click-to-create event, drag-to-reorder
  (updates `discourse_position` via PATCH on drop), FOLLOWS_FROM
  auto-edge on creation. This is ~1 focused week of frontend work with
  tight scope.
- **Slice 5 (Phase 9):** Parallel timeline swim lanes, character/entity
  lane filtering, theme/motif node attachment UI. Additive to Slice 4’s
  rendering foundation.
- **Phase 10:** Theme density overlay, character arc curve rendering,
  advanced visual vocabulary. These are drawing passes added to the
  existing component — not rewrites.

**Technical approach:**

- SVG for the timeline structure (lanes, gridlines, axis labels,
  connectors) — clean hit-testing, accessible, scales well to personal
  tool event counts (50–500).
- Canvas for any density/heatmap overlays (theme layer) — avoids SVG
  performance issues with many overlapping elements.
- Drag-and-drop via `@dnd-kit/core` (already used elsewhere in the
  frontend if present, otherwise add) — abstracts pointer events,
  handles touch, integrates cleanly with React.
- Zoom and horizontal scroll via CSS transform on the SVG viewport —
  simple and performant at this scale.

**What the component owns:**

- Rendering event nodes as positioned cards within lanes.
- Lane creation, toggle (show/hide), and label display.
- Story-time axis (numeric scale with free-text labels).
- Click-on-empty-space → create event affordance.
- Drag-to-reorder within and between lanes.
- Edge rendering: FOLLOWS_FROM as connecting arrows between cards.
- Selection state → side panel integration (click event → detail panel,
  same pattern as `/graph`).

**What it does not own:**

- Event node CRUD (delegates to existing node endpoints).
- Edge CRUD (delegates to existing edge endpoints).
- Character/entity node management (managed via normal node detail views;
  the timeline just renders their attachment to events).

**ADR required:** ADR-066 — Narrative timeline component choice. Documents
the custom-component decision, the eliminated library alternatives and
their specific failure modes, the phased scope plan, and the SVG/Canvas
split rationale.

-----

### Decision 4 — Narrative events: flag on permanent nodes (Option B)

**Decision:** Story events are permanent nodes with:

- `is_story_event INTEGER NOT NULL DEFAULT 0` — boolean flag.
- `story_time TEXT` — nullable. Free-text or ISO date representing when
  the event occurs in the story world (“Act 2, Scene 3”, “Day 14”,
  “1943-06-06”).
- No `discourse_position` column on nodes — see Decision 5 for why this
  lives in the join table instead.

**Consequences:**

- Event nodes appear in Notes, Search, Graph, and Ask. This is a
  feature: “what did I encode about the harbor scene?” returns the event
  node via Ask.
- The Notes view needs a “hide story events” toggle alongside the
  existing type/tag filters. This is a small addition to the Bucket B
  B2 filter framework already shipped.
- Event nodes are immediately embeddable and searchable without any
  changes to the embedding pipeline.
- Migration is a straightforward column add (no CHECK constraint
  rewrite).

**ADR required:** ADR-064 — Narrative event node design. Documents the
flag-on-permanent decision, the rejected new-node-type alternative, and
the Notes-view filter consequence.

-----

### Decision 5 — Parallel timelines: structure node per timeline + join table

**Decision:** Each parallel timeline is a structure node that COLLECTS
its events. A project can have multiple timeline structure nodes. The
workspace timeline canvas treats each timeline structure node as a
vis-timeline group (swim lane).

**Discourse position is scoped to a timeline, not global.** An event
that appears in two timelines (a crossover scene) has two discourse
positions — one per timeline. This requires a join table:

```sql
CREATE TABLE event_timeline_positions (
    event_node_id    TEXT NOT NULL REFERENCES nodes(id),
    timeline_node_id TEXT NOT NULL REFERENCES nodes(id),
    discourse_position INTEGER NOT NULL,
    PRIMARY KEY (event_node_id, timeline_node_id)
);

CREATE INDEX idx_etp_timeline ON event_timeline_positions(timeline_node_id);
```

**Why not a column on nodes:** A single `discourse_position` column
cannot represent an event that belongs to two timelines at different
positions. The join table handles crossover scenes, convergence points,
and divergence points naturally — these are just rows with the same
`event_node_id` and different `timeline_node_id` values.

**Creating an event on the timeline canvas:**

1. User clicks empty space in a lane (timeline group).
1. Frontend creates a new permanent node with `is_story_event = 1` and
   a default title.
1. A COLLECTS edge is created from the timeline structure node to the
   new event node.
1. A FOLLOWS_FROM edge is created from the preceding event node to the
   new event node (if one exists in that lane).
1. A row is inserted into `event_timeline_positions` with the
   `discourse_position` derived from the click position.

**ADR required:** ADR-065 — Parallel timeline data model. Documents the
structure-node-per-timeline pattern, the join table design, and the
crossover-scene handling.

-----

## 2. ADR index for Phase 9

|#          |Title                              |Trigger                  |Notes                                         |
|-----------|-----------------------------------|-------------------------|----------------------------------------------|
|**ADR-063**|Project-as-structure-node          |Phase 9 planning         |Pre-work: write before first migration        |
|**ADR-064**|Narrative event node design        |Phase 9 — timeline slice |Inline with timeline migration                |
|**ADR-065**|Parallel timeline data model       |Phase 9 — timeline slice |Inline with timeline migration                |
|**ADR-066**|Narrative timeline component choice|Phase 9 — timeline slice |Write before wrapper implementation begins    |
|**ADR-067**|Synthesis history association      |Phase 9 — workspace slice|Inline with synthesis-history feature (see §3)|

ADR-067 covers Decision 3 from the concept doc §6 (synthesis history
association). Recommendation: tag synthesis outputs with the project’s
primary tag at save time (Option b), with a migration path to a
`synthesis_runs` join table if synthesis history becomes load-bearing.
This is the simplest approach consistent with the existing save-answer
infrastructure (ADR-051/CITES edges).

-----

## 3. Scope decisions for Phase 9 planning

### What is in scope for Phase 9

**Project Workspace core:**

- Project list page (`/projects`) and project creation flow (promotes
  any structure note to a project hub).
- Project workspace layout: left scope panel, center working surface
  (Write / Notes / Synthesize tabs), right ambient panel.
- Free-writing pad with server-side draft storage and promotion flow.
- Session mode: `con --project <name>` CLI flag; session pill in
  topbar; auto-tagging of captures during active session.
- Resume briefing: saved Synthesize prompt executed against project
  scope; output saved as permanent with CITES edges and displayed in
  synthesis history.
- Scoped ask bar (reuses Phase 8.4’s `ScopedAskRequest` unchanged).
- Coverage stats in left panel (note count + avg edge count per tag).
- Open-questions panel with one-line append (appends to the project’s
  open-questions structure node).
- Notes view “hide story events” toggle (small addition to B2 filter
  framework).

**Narrative timeline:**

- Timeline structure node concept (each timeline is a structure node).
- `event_timeline_positions` join table and migrations.
- `is_story_event` / `story_time` columns on nodes.
- vis-timeline React wrapper component.
- Event creation from timeline canvas (click-to-create, FOLLOWS_FROM
  auto-edge, COLLECTS auto-edge from timeline node).
- Character and entity nodes (structure nodes attached to events via
  COLLECTS edges from the character/entity node).
- Thematic layer: theme/motif nodes attached to events; canonical usage
  notes on the theme node itself.
- Lane toggle (show/hide parallel timelines as swim lanes).

**Mermaid rendering:**

- Detect and render ````mermaid` fences in note content and synthesis
  output.
- Free-writing pad live preview of Mermaid blocks.
- Gantt synthesis output: no new backend work; Claude can output `gantt`
  syntax and the renderer handles it.

**Artifacts:**

- `artifact_type` and `artifact_format` fields on permanent nodes
  (optional, nullable).
- Export: PNG for rendered Mermaid/Gantt charts; Markdown with embedded
  diagram syntax. PDF deferred.

### What is explicitly NOT in scope for Phase 9

- **Quick-switcher (Cmd+P) — C2.** Deferred from Phase 8, remains
  deferred. Schedule as its own standalone effort post-Phase-9.
- **iOS Shortcut work — C4/C5.** Still held pending iOS dev story.
  `con --project` covers the terminal-capture use case.
- **Long-form prose editor.** The free-writing pad is a markdown
  textarea with autosave. It is not a full editor (no block-level
  formatting toolbar, no collaborative editing, no version history).
  The `EditableField` blur-to-save fix is deferred to a post-Phase-9
  polish pass.
- **PDF export.** Deferred; PNG and Markdown cover the immediate need.
- **Community detection on graph.** Remains deferred (§8,
  build-plan.md).
- **Claim-node primitive.** Deferred. Note for planning: the claim-node
  and the narrative theme/motif node are the same data shape — a node
  that other nodes relate to with typed stances. When claim-node work
  is eventually scheduled (Phase 8.6 or Phase 10), it should be
  designed to cover both the argumentative research use case and the
  creative thematic use case. Build once with sufficient generality.
- **Phase 8.2 (retrieval-side edge expansion).** Remains conditionally
  deferred; reactivation gated on probe_retrieval.py criterion. Do not
  schedule in Phase 9.

-----

## 4. Suggested slice structure for Phase 9 planning

Phase 9 has two largely independent tracks that share the foundational
workspace schema. Suggest the following slice order to the agent during
planning:

**Slice 0 — Foundation (blocking everything else)**

- `is_project_hub` flag + `project_scopes` table + `drafts` table
  migrations.
- `GET/POST /projects` endpoints (list + create from existing structure
  node).
- `GET/PATCH /projects/{hub_id}/scope` (read + update pinned nodes and
  tags).
- ADR-063 written before this slice begins.
- No UI yet. Backend-and-schema only. All subsequent slices depend on
  this.

**Slice 1 — Workspace shell**

- `/projects` list page.
- `/projects/[hub_id]` workspace layout (three-panel shell, tabs, empty
  states).
- Free-writing pad with draft autosave (GET/PUT /projects/{hub_id}/draft).
- Left panel: pinned scope display (read-only first; edit in Slice 2).
- Right panel: recent activity feed (queries existing node/edge
  timestamps — no new backend work).
- Session pill (frontend state only in v1; `con --project` flag for
  terminal capture).

**Slice 2 — Workspace intelligence**

- Scope editing: add/remove pinned notes, add/remove tags.
- Coverage stats in left panel.
- Open-questions panel with append input.
- Resume briefing: saved prompt + one-click execution + synthesis
  history list.
- Bridges panel scoped to project (reuses existing Discover bridges
  endpoint with tag filter).
- Promotion flow: pad → IntentionalCaptureDialog prefill → auto-add
  to scope on save.

**Slice 3 — Mermaid and artifacts**

- Mermaid rendering in note detail and synthesis output.
- Free-writing pad Mermaid preview.
- `artifact_type` / `artifact_format` fields + export (PNG, Markdown).
- ADR-067 (synthesis history) inline.

**Slice 4 — Narrative timeline foundation**

- `is_story_event`, `story_time` columns on nodes.
- `event_timeline_positions` join table.
- ADR-064 and ADR-065 written before this slice begins.
- Backend: event node CRUD extensions, `GET /projects/{hub_id}/timeline`
  returning events + timeline structure nodes + positions.
- vis-timeline React wrapper (basic: single timeline, event display,
  click-to-create, drag-to-reorder).
- ADR-066 written before wrapper implementation begins.
- Notes view “hide story events” toggle.

**Slice 5 — Narrative timeline — characters, entities, themes**

- Character and entity nodes (structure nodes; COLLECTS edges to events).
- Theme/motif nodes; canonical usage notes on theme nodes.
- Lane toggle (parallel timelines as swim lanes).
- FOLLOWS_FROM auto-edge on event creation.
- Crossover scene support (event in two lanes via
  `event_timeline_positions`).

This slice order means the workspace is usable after Slice 2, Mermaid
after Slice 3, and the narrative timeline progressively from Slice 4
onward. Each slice is independently shippable.

-----

## 5. Key files the agent must read before planning

In addition to this brief and the Phase 9 concept doc:

- `docs/ux-build-plan.md` — check the migration numbering. The last
  migration was `0006_resolved_edges.sql`. Phase 9 starts at `0007`.
- `docs/decisions.md` — new ADRs are 063–067. Match the existing format.
- `docs/architecture.md` — schema and API surface; will need updating
  as Phase 9 migrations land.
- `backend/app/api/v1/rag.py` — `ScopedAskRequest` (Phase 8.4) is
  already implemented; the workspace ask bar reuses it unchanged.
- `backend/app/services/rag_service.py` — save-answer and CITES edge
  creation (Phase 8.1 / ADR-051) is the pattern resume-briefing builds
  on.
- `frontend/src/app/graph/filterGraph.ts` — the `?ids=` URL param
  (Phase 8 / A3) is how “Open in graph” from the workspace will work;
  don’t reimplement.
- `evals/phase8_prototype/probe_retrieval.py` — standing diagnostic;
  do not modify.

-----

*This brief is complete as of 2026-05-16. It should be read alongside
`constellation-phase9-concept.md`, which remains the source of truth for
the full feature rationale, value proposition, and design intent. This
brief answers the “how” questions that concept doc left open; the concept
doc answers the “why” questions this brief assumes are settled.*