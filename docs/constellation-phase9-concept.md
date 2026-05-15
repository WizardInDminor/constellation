# Constellation — Phase 9: Project Workspace & Narrative Timeline
## Concept Document

*Captured 2026-05-15. Synthesized from design conversation following the UX
walkthrough (2026-05-14) and UX build plan (2026-05-15). This document is a
concept and design brief — not a sequenced build plan. The build plan lives in
`docs/ux-build-plan.md`. This document feeds the Phase 9 planning exercise
when Phase 8 is complete.*

---

## 1. The problem this solves

Every project-oriented workflow in Constellation today carries a hidden tax:
**membership reconstruction**. You filter Notes by tag. Then filter Graph by
tag. Then rebuild the Synthesize scope from scratch. Then ask a question in
Ask and get globally-retrieved results that ignore your project context. The
app has all the right primitives — it makes you reassemble the frame every
single time.

There is a second, separate problem: **the app has no creative authoring
surface**. Notes are atomic. Synthesize is single-shot. There is nowhere in
the system for a draft to live that isn't already a finished permanent note.
For research workflows this is fine. For writing — fiction, feature planning,
argument-building — the absence is a structural gap.

Phase 9 addresses both in a unified surface: the **Project Workspace**.

---

## 2. Core concept

A Project Workspace is a **structure note promoted to a first-class working
environment**. It doesn't replace the graph or any existing surface — it is
an assembly layer that holds project context persistent so you never rebuild
it again.

The workspace is rooted in a structure note (the project's hub node). That
hub node already exists in the graph, already has COLLECTS edges to member
notes, and is already navigable. What Phase 9 adds is a UI that treats that
structure node as a **persistent context** rather than just another node
detail page — with a saved scope, a writing surface, and ambient intelligence
panels that are always scoped to this project.

**Guiding principle: everything created in the workspace lands in the graph.**
The workspace is not a silo. Notes authored in the free-writing pad and
promoted become permanent nodes. Timeline events are permanent nodes.
Character nodes are graph citizens with edges. Synthesis outputs are saved
with CITES edges back to their sources. The workspace is a lens onto the
graph, not a layer above it.

---

## 3. Layout and panels

```
┌─ topbar: project name · session pill · Graph view · Resume briefing ──────┐
│                                                                            │
│  ┌── Left: Pinned scope ──┐  ┌── Center: Working surface ──────────────┐  │
│  │                        │  │                                          │  │
│  │  Pinned notes (curated)│  │  [ Write | Notes | Synthesize ] tabs    │  │
│  │  Tags (broad membership│  │                                          │  │
│  │  Scope stats           │  │  Free-writing pad (autosave)            │  │
│  │    · 71 notes in scope │  │  → Promote to: permanent / lit / seed   │  │
│  │    · last visited 22d  │  │                                          │  │
│  │    · 14 new captures   │  │  Recent notes in project (card feed)    │  │
│  │                        │  │                                          │  │
│  └────────────────────────┘  │  [ Ask bar — scoped to this project ]  │  │
│                               └──────────────────────────────────────────┘  │
│  ┌── Right: Ambient intelligence ──────────────────────────────────────┐   │
│  │  Bridges in scope · Recent activity · Open questions                │   │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Left panel — Pinned scope

A curated list of notes that are always in context for this project. Structurally these are the hub structure note's COLLECTS edges made editable. Tags define the broader membership (the full set of notes the workspace knows about). Scope stats show notes in scope, last-visited date, and captures-since-last-visit — the three signals needed for the "Resume project" flow.

### Center panel — Working surface

Three tabs:

**Write tab** — the free-writing pad. A real markdown textarea with autosave (server-side draft, not localStorage). Promote any selected text or the whole pad to: permanent note, literature note, or Synthesize seed. The promotion action creates the node, embeds it, and adds it to the project scope automatically. This inverts the current capture → inbox → process model: you write first, decide ontological status later.

**Notes tab** — all notes in scope, filterable and sortable. The project-scoped version of `/notes`, with the schema-level filters from Bucket B (B2) pre-applied to project membership.

**Synthesize tab** — Synthesize with the project scope pre-loaded. Scope is already built; the user adds a question and custom prompt. Synthesis outputs are saved with CITES edges and associated with the workspace's synthesis history.

### Right panel — Ambient intelligence

**Bridges in scope** — Discover bridges filtered to this project's notes only. The cross-tag-domain filter (A4) applied by default, surfacing cross-domain connections within the project's scope.

**Recent activity** — a dated feed: captures, edits, links created, syntheses run. This is the "what happened since last visit" panel that Scenario 2 needed.

**Open questions** — the project's open-questions structure note rendered as a live list with a one-line append input. Appending creates a new entry in the structure note and adds a QUESTIONS edge from the new entry back to the currently open note.

**Coverage** — per-tag or per-cluster statistics: note count and average edge count. Surfaces thin sub-topics ("eurorack/firmware — 4 notes, 1.1 avg edges") without requiring the graph or raw SQL.

### Top bar

**Session pill** — when active, Ctrl+K captures auto-tag to the project and land in the project-scoped inbox view. Ctrl+K from anywhere in the app while a session is active routes captures into the project scope.

**Resume briefing** — runs a saved Synthesize prompt against the saved scope. Output is dated and saved as a permanent node with CITES edges. Over time, these accumulate as a snapshot history of the project's state at each return.

**Graph view** — opens `/graph?ids=...` pre-filtered to the project scope, inheriting the `?ids` URL param from Bucket A (A3).

---

## 4. The "Resume project" workflow

This is Scenario 2's missing primitive. One click from the workspace home:

1. Scope is already loaded (saved from last session).
2. Resume briefing runs the saved Synthesize prompt: *"List open decisions, unfinished work, and anything captured since my last visit. Structure as: Status / Open Questions / Next Steps."*
3. Output cites notes from the scope. Saved as a permanent with today's date and CITES edges.
4. Captures-since-last-visit are surfaced in the Recent activity panel alongside the briefing output.

The user reads the briefing, walks the recent captures, and is oriented in under two minutes. No rebuilding scope, no manual Synthesize setup, no cold re-reading of notes.

---

## 5. New backend work required

Most of Phase 9 is front-end assembly over existing endpoints. Three pieces of backend work are genuinely new:

**Scope persistence.** A `project_scopes` table (or a JSON blob column on the structure node) storing: pinned note IDs, tag filters, last-visited timestamp, and saved briefing prompt. Lightweight schema addition. The structure-node-as-project-root means the scope sidecar is attached to an existing node ID.

**Session context.** A lightweight backend concept (or purely frontend state) for "current project session." When active: the capture endpoint accepts an optional `project_id` parameter, auto-tags the note, and routes it to the project's inbox view. The `con` CLI tool needs a `--project` flag that posts this parameter.

**Free-writing pad draft storage.** Server-side draft storage for the free-writing pad, distinct from the node `content` field until promotion. Options: a `drafts` table keyed by `(user, project_id)`, or a special draft node type with a `promoted_at` column. The draft is not a graph citizen until promoted; it exists only in the workspace.

---

## 6. Open decisions before Phase 9 planning

These need ADRs before sequencing begins.

**Decision 1 — Structure note as project root vs. new `project` entity.**
The lightweight path: a structure note with a scope sidecar. The richer path: a new `project` entity type in the schema with its own table, endpoints, and nav entry. The walkthrough's framing ("a structure note with a scope sidecar") favors the lightweight path, and it keeps projects as graph citizens — a project node can have QUESTIONS edges, SUPPORTS edges from other projects, etc. Recommended: structure-note-as-root, with a `is_project_hub` boolean flag or a dedicated `project_scopes` join table.

**Decision 2 — Free-writing pad draft storage.**
Server-side (a `drafts` table) vs. client-side (well-managed localStorage with periodic sync). Server-side is more robust and consistent with the "local-first data" principle (the SQLite file is the source of truth). Recommended: server-side `drafts` table with `project_id`, `content`, `updated_at`.

**Decision 3 — Synthesis history association.**
How does the workspace know which synthesis outputs belong to it? Options: (a) query for permanents that CITES ≥2 nodes in the project scope, (b) explicitly tag synthesis outputs with the project's tag at save time, (c) a `synthesis_runs` join table. Option (a) is elegant but fragile (a synthesis could cite project nodes incidentally); option (b) is simple but relies on tagging discipline; option (c) is explicit. Recommended: option (b) as v1, with a migration path to (c) if synthesis history becomes load-bearing.

**Decision 4 — Node type for narrative events (see §8).**
Does the narrative timeline use a new `event` node type, or a flag on existing `permanent` nodes? This decision affects the schema, the API surface, and whether event nodes show up in regular Notes views. See §8 for full discussion.

---

## 7. Mermaid rendering and artifacts

### Mermaid rendering

Mermaid diagram rendering belongs in Phase 9 as a foundational feature. Implementation:

- Detect ` ```mermaid ` fences in any node's `content` field and render via `mermaid.js` in the note detail view and in synthesis output.
- Claude can output Mermaid syntax in synthesis responses; the app renders it inline.
- The free-writing pad renders Mermaid fences live as a preview alongside the text.

Supported diagram types with immediate value: `flowchart` (feature dependency graphs, decision trees), `gantt` (project phase planning), `sequenceDiagram` (workflow and API flows), `timeline` (narrative event ordering as a derived view).

### Gantt for project planning

With Mermaid rendering in place, project planning Gantt charts are nearly free. The workflow:

1. Scope the workspace to a project's planning notes.
2. Ask (scoped): *"Generate a Gantt chart of the proposed phases and their dependencies."*
3. Claude outputs `gantt` syntax; it renders in the answer and can be saved as a note.

No new data model needed. The Gantt is a synthesis artifact, not a primary authoring surface.

### Artifact model

Phase 9 needs a distinction the current system doesn't make: **notes** (atomic, always graph-resident) vs. **artifacts** (rendered outputs — charts, timelines, documents — with a save path, a version, and an export option).

Proposed: an `artifact_type` field on permanent nodes, with values `note` (default) and `artifact`. Artifact nodes have an additional `artifact_format` field (`mermaid`, `gantt`, `timeline`, `document`) and a `source_prompt` field recording the prompt that generated them. Export formats: PNG for rendered charts, Markdown with embedded diagram syntax, PDF via a server-side render.

The save/export capability is high-value for the OIP use case: a feature plan synthesized from supervisor workflow notes should be exportable as a structured document with embedded Gantt diagram, not just a node in the graph.

---

## 8. Narrative timeline — design concept

*This is the most novel feature in Phase 9 and the one that requires the most
new design work. It may slip to Phase 10 depending on Phase 9 scope. It is
documented here in full so the decisions are captured before they're needed.*

### The inverted workflow

The conventional direction — notes first, timeline derived — works against narrative authoring. Stories have a spine. Scenes have order, causality, and character presence. Discovering that spine by staring at a force-directed graph of scattered notes is friction in the wrong direction.

The Phase 9 narrative timeline **inverts the workflow**: the timeline canvas is the primary authoring surface. You place events, and the graph is built underneath you. Notes come from the timeline, not the other way around.

This is a meaningful distinction. The user doesn't populate the graph and hope a timeline emerges. They build the timeline directly, and the graph representation comes for free.

### Three layers on the timeline canvas

**Events** — the spine. Placed by drag or click. Each event is a node (see node type decision below). Two orderable sequences per event: story time (when it happens in the world) and discourse order (when the reader encounters it — supports flashbacks, non-linear structure). A FOLLOWS_FROM edge is created automatically between adjacent events in discourse order.

**Characters and entities** — who and what is present. Characters are structure nodes. Entities (objects, locations, recurring symbols) are permanent or structure nodes. Attaching a character to an event creates a COLLECTS edge from the character node to the event. Filter the timeline to a character to see only their scenes. Filter to an entity to trace its journey through the story. Characters and entities have their own detail views and can have edges into the broader knowledge graph — a character node can have INSPIRED_BY edges to historical figures, ANALOGOUS_TO edges to archetypes in your corpus.

**Thematic and metaphorical layer** — the most distinctive layer. A theme, motif, or metaphor is a node (structure or permanent) that attaches to events where it appears. The density of a theme across the timeline becomes visible — gaps in metaphor coverage are legible at a glance. When writing scene 14 you can see that the water metaphor last appeared in scene 3. When you want all the scenes where the listener motif surfaces, you filter to it.

Canonical usage notes attach to the theme node itself: "water as judgment — first appears at the harbor, peaks at the storm, resolves at the well. Should feel inevitable not symbolic." This is craft memory, not an event. It lives on the theme node, not on any individual scene.

### Connection to the knowledge graph

This is where the narrative timeline earns its place in Constellation rather than in a dedicated writing tool.

A theme node in your story can have ANALOGOUS_TO edges to physics permanents about entropy. A character node can have INSPIRED_BY edges to a literature note about a real historical figure. A motif can have SUPPORTS edges to philosophical permanents that theorize it. When you ask "what does my corpus know about liminality that I haven't used in this story yet," the answer is findable — because the theme node is a graph citizen, not a tag that lives inside a writing app silo.

The thematic layer is structurally identical to the **claim-node primitive** identified in the walkthrough's Scenario 12 (finding #32). A claim node — the thing that other notes SUPPORT or CONTRADICT — and a theme node — the thing that events and notes elaborate or instantiate — are the same data shape. Building one with sufficient generality covers both the argumentative and the creative use cases.

This convergence reduces total build cost. The batch-tag-against-target UI (show candidates as cards, one click per stance) planned tentatively as Phase 8.6 or Phase 10 is directly useful for thematic tracking: show all events as cards, one click to mark each as ELABORATES / QUESTIONS / INSPIRED_BY the theme.

### Node type decision

**Option A: `event` as a new node type.**
A fifth entry in the `NodeType` enum alongside fleeting / permanent / literature / structure. Events have dedicated fields: `story_time` (ISO date or relative position), `discourse_position` (integer), `story_id` (FK to the project's hub node). First-class in the API and schema.

*Pros:* Clean separation. Event-specific fields don't pollute permanent nodes. The timeline view can query `WHERE type = 'event'` without relying on flags.
*Cons:* Breaks ADR-006's explicit "small, stable node type vocabulary" decision. Adds a new type to every component that handles NodeType (API, frontend, graph viz, search, embedding).

**Option B: `story_event` flag on permanent nodes.**
A boolean column `is_story_event` plus two nullable columns `story_time` and `discourse_position` on the `nodes` table. Events appear in all normal node views (Notes, Graph) and are fully embeddable and searchable.

*Pros:* No new type; consistent with ADR-006; events are immediately searchable, embeddable, and Ask-queryable as permanents.
*Cons:* Event-specific fields live on every node row (NULL for non-events). The timeline view needs a filter predicate rather than a type query.

**Recommendation: Option B for v1, with a migration path to Option A.**
The flag approach is consistent with the existing vocabulary decision and keeps events as full graph citizens immediately. If the narrative timeline becomes load-bearing and event-specific fields proliferate, a migration from flag to type is straightforward (add the enum value, backfill, remove the flag). ADR-006's "if the project grows substantially, revisit" clause applies here.

### Timeline rendering component

The timeline canvas is a new frontend component, distinct from the force-directed graph. Technology options:

- **Custom SVG/Canvas** — full control, significant build cost.
- **`vis-timeline`** — mature, MIT-licensed, handles two time axes, drag-and-drop event placement. Most likely fit.
- **`react-chrono`** — simpler, React-native, less feature-complete.

The component needs: horizontal scroll, two-axis display (story time + discourse order), lane filtering by character/entity/theme, drag-to-reorder (updates `discourse_position`), click-to-edit event details inline, and a "create event here" affordance on empty timeline space.

This is the highest-cost single component in Phase 9. It warrants its own scoping exercise before Phase 9 begins.

---

## 9. Workflow: writing alongside an external editor

The workspace is not a replacement for a real editor or IDE. The right mental model for code and long-form prose is a **vertical split**: editor/terminal on the left, Constellation workspace on the right.

What makes this work rather than awkward is whether the workspace can serve as an *active* context layer rather than a passive reference:

- The **scoped ask bar** lets you query project context without leaving the editor flow.
- **`con --project <name> "thought"`** posts captures directly into the project scope from the terminal, without opening the browser.
- The **free-writing pad** holds ideas that surfaced while coding — notes you don't want to lose but don't want to interrupt flow to process.

The workspace's value in a coding or writing session is not as the place where the artifact lives — it's as the place where *decisions about the artifact* live. Constellation is better at "why did we choose SPI over I2C" than at editing the SPI driver, and it should lean into that positioning rather than trying to absorb the editor.

The `con --project` flag is a small addition to Phase 9's CLI work that closes the terminal-to-workspace loop. It should be scoped alongside the session-context backend work.

---

## 10. Value proposition summary

Phase 9 delivers three distinct value propositions that compound:

**For research and knowledge work:**
The context-rebuilding tax is eliminated. You arrive at a project and your scope, recent activity, open questions, and a one-click briefing are already there. Scoped Ask and Synthesize mean AI answers are drawn from your project's notes, not the global corpus. Coverage visibility makes it clear where your knowledge is thin before you synthesize.

**For planning and professional work:**
Mermaid rendering makes diagrams a first-class output of synthesis. Gantt charts emerge from planning notes. Artifacts can be saved with version history and exported as documents. The workspace becomes a place where feature plans, architecture decisions, and project timelines are *generated from your notes* rather than authored separately.

**For creative and narrative work:**
The narrative timeline makes story structure a first-class authoring surface. You build the timeline and the graph builds with it. Characters, entities, and themes are graph citizens connected to your broader knowledge base. Canonical usage notes for motifs and themes keep the creative vision coherent across a long project. Connections between your story's thematic vocabulary and your research corpus surface through Discover and Ask in ways no dedicated writing tool can offer.

---

## 11. What Phase 9 is explicitly not

- A replacement for a code editor or long-form text editor. The workspace complements external tools; it doesn't compete with them.
- A full project management system. There are no assignees, deadlines, or status workflows. Gantt charts are synthesis outputs, not a managed project plan.
- A multi-user collaboration surface. Single-user, consistent with Constellation's core design principle.
- A publishing platform. Export produces documents; distribution is out of scope.

---

## 12. Relationship to Phase 8

Phase 8 (edge-semantics-into-RAG) materially improves Phase 9 before Phase 9 starts:

- Scoped Ask (Phase 8.4, C1) is the workspace ask bar's backend — the `tag_filter` and `recency_filter` on `ScopedAskRequest` are exactly what the workspace needs.
- BUILDS_ON / APPLIES_TO edges (Bucket A, A6) make the Recent activity feed more informative — semantic relationship verbs appear, not just "linked."
- FOLLOWS_FROM (evolution edge types, Phase 8.3, D1) is the temporal edge that the narrative timeline's discourse-order sequence uses.
- CITES edges (Bucket A, A1) make the synthesis history association in the workspace accurate — synthesis outputs are distinguishable from MOC-style collections.
- The prototype gate's edge-aware context assembly (Phase 8.0–8.2) means that when you ask "what does my corpus know about entropy that I haven't used in this story?" the answer is drawn through typed graph edges, not just semantic similarity.

Phase 9 is where the investment in Phase 8's infrastructure becomes visible to the user as a coherent daily workflow.

---

*This document should be reviewed and updated when Phase 8's prototype gate
outcome is known. The node type decision (§8, Decision 4) and the timeline
rendering component choice should be made before Phase 9 planning begins.
The narrative timeline component may slip to Phase 10 depending on Phase 9
scope — that decision belongs to the Phase 9 planning exercise.*
