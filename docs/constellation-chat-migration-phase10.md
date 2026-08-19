# Constellation — Chat Migration Document
## Phase 10 Kickoff Context

*This document is the complete context handoff from the Phase 9
development conversation. Read this before reading any project
documents. It tells you who you are talking to, what has been built,
what the working relationship looks like, and what comes next.*

*After reading this document, read the project documents in the order
listed at the end.*

---

## Who you are talking to

A single developer building Constellation as a personal knowledge
tool for daily use. They are technical (Python, FastAPI, Next.js,
SQLite — this is their stack and they know it well), thoughtful about
design, and have strong instincts about UX. They use the app daily
and test features hands-on against a real corpus of notes.

Their working style:
- They do pre-work conversations (like this one) to resolve design
  decisions before handing to Claude Code. They value this pattern
  and it has worked well.
- They do hands-on browser verification, not just unit tests. They
  will catch things the agent misses.
- They are direct about what they want and will push back when
  something is wrong. The mode-sets-defaults-not-gates audit that
  caught three gates in Phase 9 was their pushback, not the agent's
  initiative.
- They think in use cases and workflows, not in features. When they
  describe something, they're usually describing a workflow they want
  to have, not a spec to implement literally.
- They are building a tool they actually use. "Will I use this daily?"
  is the real acceptance criterion behind every formal definition of
  done.

Their corpus: research notes on embedded systems (STM32, SPI, DACs,
Eurorack hardware), philosophy and consciousness (a significant cluster
— the "light as truth" theme, fields and perception), music and lyrics
(they write music; some of their philosophical permanents are derived
from lyric work), and a growing creative project called Fire Stoker
(a short story / narrative project now in the Constellation workspace).

---

## What Constellation is

A personal zettelkasten built as a typed knowledge graph with
first-class AI integration. Single-user. Local-first (one SQLite
file). Cloud AI via Voyage (embeddings) and Anthropic Claude
(generation).

**The core data model:**
- **Nodes** — atomic units of knowledge. Types: `fleeting` (inbox,
  unprocessed), `permanent` (processed ideas in the user's own words),
  `literature` (notes from external sources), `structure` (Maps of
  Content / project hubs). Story events are permanent nodes with
  `is_story_event = 1`.
- **Edges** — typed, directional. Full vocabulary as of Phase 9:
  SUPPORTS, CONTRADICTS, ELABORATES, ANALOGOUS_TO, QUESTIONS,
  INSPIRED_BY, COLLECTS, CITES, BUILDS_ON, APPLIES_TO, MEASURES,
  EXTENDS, REFINES, SUPERSEDED_BY, SCOPED_TO, REGIME_OF, FOLLOWS_FROM,
  EXPLAINS.
- **Sources** — external references linked to literature notes.
- **Tags** — lightweight categorization.

**The AI integrations:**
- Embedding on write (Voyage AI, 1024-dim, `vec_nodes` virtual table)
- Hybrid search (RRF over vector similarity + FTS5)
- RAG queries (`/ask`) with graph expansion and edge-aware context
  assembly (Phase 8 — typed edges are semantically load-bearing in
  retrieval)
- Fleeting → permanent decomposition
- Link suggestions
- Learning map generation with web search
- Scene Context View live graph assembly
- Narrative dump → node extraction

**Stack:** FastAPI + aiosqlite (raw SQL, repository pattern) + SQLite
+ sqlite-vec + FTS5. Next.js App Router + TypeScript + Tailwind.
`uv` for Python, `pnpm` for Node. `con` CLI tool for terminal capture.
Systemd user service for the backend.

---

## What has been built — phase by phase

**Phases 0–6** (complete before this conversation began):
Foundation, CRUD, embeddings, capture & process workflow, linking,
search & RAG, graph visualization. Core system feature-complete,
170+ backend tests, in active daily use.

**Bucket A** (10 small items, single PR):
CITES edge type, 5 literature-stance edge types (BUILDS_ON, APPLIES_TO,
MEASURES, EXTENDS, REFINES), inbox timestamps, `?ids=` URL param on
graph, cross-tag filter on Discover, union-mode tag selection in
Synthesize, NotePreviewPopover in NodePicker, classifier rationale
persisted on edges, Ask `mode={default,brief}`, Critic mode.

**Bucket B** (5 standalone PRs):
Recently captured/edited/linked sections on Home, schema-level Notes
filters (composable predicate API), batch suggest-links with review UI,
Triangle-completion Discover tab, negative-finding framing on Ask.

**Phase 8** (edge-semantics-into-RAG):
- 8.0: Prototype gate passed (v1 minimal-additive prompt). Key finding:
  edge type and note are already injected into context; the system
  prompt just needed to tell the model what to do with them. F3
  (ANALOGOUS_TO fixture) was the clearest proof — default mode invented
  a third pattern the user didn't encode; edge-aware mode stayed
  disciplined to the user's encoded structure.
- 8.1: Edge-aware system prompt. CONTRADICTS surfaces tensions
  explicitly; SUPPORTS aggregates as evidence; ANALOGOUS_TO respects
  user-encoded structure.
- 8.2: Retrieval-side edge expansion — CONDITIONALLY DEFERRED.
  `probe_retrieval.py` is the standing diagnostic. Reactivation
  criterion: CONTRADICTS/SUPPORTS edges with cosine < 0.6 dropped
  at the `_MAX_NEIGHBOR_NODES=12` cap on ≥2 fixtures. Not met as of
  Phase 9 completion (0/3 fixtures). Re-run monthly.
- 8.3: Resolved-edge state (`resolved_at`, `resolved_by_node_id` on
  edges). D1 evolution edge types (SUPERSEDED_BY, SCOPED_TO, REGIME_OF,
  FOLLOWS_FROM). EdgePanel "Mark resolved" action. RAG annotates
  resolved edges as `[resolved]` or `[resolved → Note N]`.
- 8.4: Scoped Ask — `tag_filter` and `since` fields on RagRequest.
  Note: no separate `ScopedAskRequest` model — fields are on the
  standard RagRequest.
- 8.5: `/search/dedup` endpoint (raw clamped-cosine similarity, not
  rank-normalised). Capture-time dedup panel in IntentionalCaptureDialog
  (≥40 chars content, debounced 800ms, ≥0.65 threshold, ≥0.85 amber
  duplicate treatment, save-and-link flow).

**Phase 9** (Project Workspace + Narrative Timeline):
See the Phase 9 wrap document for full detail. Summary:
- 6 slices, 7 commits, 4 migrations (0007–0010)
- 10 new ADRs (063–072) + ADR-052 addendum (EXPLAINS)
- 387 backend tests at Phase 8 end → 492 at Phase 9 end (+105)
- Project Workspace: persistent mode-aware working environment rooted
  in a structure node. Three modes: Research, Narrative, Learning.
  Free-writing pad, session management, resume briefing, NodeInteraction
  Popup (universal Ctrl+click edit), three-state Ask scope toggle,
  coverage stats, bridges panel, synthesis history.
- Narrative Timeline: custom SVG/Canvas, parallel lanes, act spans,
  crossover scenes (Alt-drag), character/theme attachment, prose_status
  indicator, Story Dump → node extraction, Scene Context View.
- Scene Context View: live graph assembly (never cached, verified
  destructively), characters + location lore + themes + world rules
  assembled from current graph state on every open. "Never research
  your own work" — the design mantra that was held throughout.

**Current migration state:** last migration is
`0010_narrative_timeline.sql`. Phase 10 starts at `0011`.

**Current ADR state:** last ADR is ADR-072 (act span schema).
Phase 10 starts at ADR-073.

**Current test count:** 492 backend, 39 frontend.

---

## The design principles that have governed every phase

These are non-negotiable and have been explicitly audited at the end
of every Phase 9 slice. Any new feature must be evaluated against them.

**Mode sets defaults, not gates.** A project's mode determines which
tab opens first. It never hides or disables a feature. Three gates
were caught and fixed during Phase 9 development. The final audit
confirmed zero mode-conditional feature restrictions.

**The order of creation is invisible.** Scene Context View (and any
similar context-assembly surface) queries current graph state on every
open. A scene created before any lore was written opens today surfacing
all lore that has since been connected to it. Verified destructively.
Protected by a pytest.

**Everything lands in the graph.** Notes created in the free-writing
pad, events placed on the timeline, characters sketched in onboarding —
all become nodes and edges in the SQLite graph. The workspace is a
lens, not a silo.

**The RAG barometer.** A lore note / learning note / character trait
is "done" when asking the RAG agent a question about it returns a
meaningful, specific, connected answer. If the answer is thin or
generic, the node needs more edges.

---

## Key decisions made during this conversation

These were decided in design conversations and are locked in. Don't
relitigate them — reference the ADR or the philosophy document.

**Project architecture:** A project is rooted in exactly one structure
node (`is_project_hub = 1`). The `project_scopes` sidecar table stores
pinned notes, tags, `primary_tag_id`, briefing prompt, and mode.

**Timeline component:** Custom SVG/Canvas (ADR-066). Not vis-timeline,
not react-chrono. Reason: story-time x-axis incompatibility, theme
density overlay requirement (Phase 10), character arc curve requirement
(Phase 10). The component must remain extensible toward these Phase 10
additions.

**Narrative event nodes:** Flag-on-permanent (ADR-064). `is_story_event`
flag + `story_time` + `prose_status` + `manuscript_location` on nodes.
Option A (formal `event` NodeType) was deferred — revisit if
event-specific fields proliferate.

**Parallel timelines:** Structure node per timeline, `event_timeline_
positions` join table with `(event_node_id, timeline_node_id,
discourse_position)` primary key. Crossover scenes have multiple rows
with same `event_node_id` and different `timeline_node_id`. (ADR-065)

**Act containers:** `act_spans` table (separate from point events),
`start_position + end_position` on discourse axis + label. (ADR-072)

**Source materials for learning mode:** AI researches the domain via
web search before building the learning map. Sources labeled
"Suggested — not verified." User can confirm, replace, or supplement.
Processing scoped per-phase as user reaches each phase (~$0.02-0.05
per session, <$1 for a full textbook). (ADR-070)

**Manuscript handling:** Launch-in-editor + `prose_status` flag +
optional `manuscript_location` field. Full manuscript integration
deferred to Phase 11+. (ADR-071)

**Ask scope toggle:** Three states — Project / Both / Full corpus.
"Both" runs scoped first, expands to full corpus if below B5 confidence
threshold, labels out-of-scope results in provenance. Frontend
orchestration only. (ADR-068)

**Session-scoped fleeting synthesis:** `include_session_fleetings`
flag on SynthesizeRequest. Session-scoped only. UI toggle in Synthesize
scope builder. (ADR-069)

**Claim-node / theme-node convergence:** The claim-node primitive
(argumentative research use case, Scenario 12) and the narrative
theme/motif node are the same data shape. Build once with sufficient
generality to cover both. This is Phase 10 work. Building it twice
would be wasted effort.

---

## The use case philosophy — summary for new context

Three primary modes, each with a distinct philosophy:

**Research mode:** The user arrives with intellectual openness.
Progress feels like "tomorrow will be easier than today." The finish
line is open horizon — there is always more to know. The app reduces
the friction of building and querying a personal knowledge base.

**Narrative mode:** The user arrives with creative energy and fear of
forgetting. Progress feels like "something that was only in my head
is now real." Key surfaces: the narrative timeline (build the story
structure first, notes emerge from placement), Scene Context View
(never research your own work), lore library (the invisible
architecture of the story world), character sheets.

**Learning mode:** The user arrives purposeful and slightly anxious.
Progress feels like "I can point to one specific thing I learned
today" and "I am measurably closer to a well-defined end point."
Learning mode is the ONLY mode with a measurable finish line. The
learning map + read + note + audit loop is the core workflow.

**Intentional work sessions:** Sessions have declared intent, progress
notes, blockers, and closing notes (which become the forward brief for
the next session). Explicit start is the primary path; a 15-minute
implicit prompt is the safety net. Session nodes and edges are tracked
via join tables. Session history is a project journal.

---

## What Phase 10 needs to build

Priority order based on daily-use evidence and the philosophy document:

**1. Full character sheet UI** (Part VII of philosophy doc)
Four field types: scalar attributes (stored on character node), rich
text fields (stored as separate permanent nodes with COLLECTS edges
back to character — core wound, desire, need, fear, internal
contradiction, voice, physicality, author instructions), relationship
edges (typed edges to other character/location/lore nodes), corpus
connections (ANALOGOUS_TO, INSPIRED_BY edges to research permanents).
Author instructions are visually distinct from character facts — amber
tint, different border treatment. Visibility per field (Author-only /
Reader-inferred / Reader-known). Arc tracking via arc notes as
permanent nodes with edges to timeline events (Option A — decided).
Character sheets are accessed from the Characters sidebar nav item
(list + summary exists from Phase 9; full sheet is Phase 10).

**2. Learning mode check sessions and learner profile** (§3.2, §3.3
of philosophy doc)
Three question formats: multiple choice, short response, essay. Two
generation modes: corpus-grounded (answerable from project notes),
domain-extended (tests understanding vs. the domain, not just the
corpus). Session storage schema (see §3.3 for the exact SQL). Learner
profile is derived on-demand from session history via the RAG pipeline
— not a separate analytics engine. Format-disaggregated scoring is
what makes the profile useful (high conceptual / low syntax is a
specific finding; a flat aggregate score hides it).

**3. Full lore library** (§6.6 of philosophy doc)
Consistency check: "do any lore notes contradict each other?" powered
by scoped Ask across all lore nodes. "What does this character know?"
filter: display filter over visibility flags and character knowledge
edges. Lore audit feature: "Test this lore note" button runs scoped
Ask against the note and its connections — the narrative equivalent
of Audit my Learning in learning mode.

**4. Frontend test coverage for visual surfaces**
The 39 frontend tests are all pure-function. SVG canvas drag, Mermaid
rendering, Scene Context live query, NodeInteractionPopup overlay —
all verified by hands-on browser inspection only. Adding
`@testing-library/react` + headless DOM coverage for these surfaces
should be Phase 10 Slice 0 work. Establish the testing infrastructure
before building more visual surfaces on top of it.

**5. Claim-node primitive** (§2.5 of philosophy doc)
The claim-node (a node that other nodes relate to with typed stances —
SUPPORTS, CONTRADICTS, QUESTIONS) and the narrative theme/motif node
are the same data shape. Build it once generically. The batch-tag-
against-target UI (show candidates as cards, one click per stance) is
the companion feature. This covers both the argumentative research
use case (Scenario 12, finding #32) and the creative thematic use
case.

**6. Work session history timeline view** (§IIIb.7 of philosophy doc)
`session_nodes` and `session_edges` join tables are already populated.
The visualization — sessions as labeled blocks on a time axis, nodes
and edges as items within each block — reuses the narrative timeline
component (same SVG/Canvas, read-only rather than interactive). This
is the "archaeology of how a project developed" feature.

**7. Full lore library for narrative mode** (Phase 9 delivered list
view and quick-create; Phase 10 delivers the full surface)

**Deferred items that stay deferred:**
- Phase 8.2 retrieval-side expansion — still conditionally deferred,
  probe_retrieval.py is the diagnostic, run monthly
- iOS Shortcut work (C4/C5) — held pending iOS dev story
- Quick-switcher (Cmd+P / C2) — orthogonal, schedule as standalone
- Manuscript full integration — Phase 11+

---

## Open decisions for Phase 10 planning

These need explicit resolution before Phase 10 can be fully sequenced
(same process as the five open problems resolved before Phase 9):

**1. Workspace mode as project-level vs. per-session override.**
`work_sessions.mode` field exists and allows a session to override
project mode, but it's not yet exposed as a deliberate UI choice.
Should a narrative project be able to declare a "research session"
explicitly? Probably yes — the philosophy says sessions are
independent of project mode. Needs a design decision.

**2. Node type for events — whether to formalize as fifth NodeType.**
Current: `is_story_event` flag on permanent nodes (Option B, ADR-064).
Option A (formal `event` NodeType) was deferred with a migration path
noted. If Phase 10's character sheet work introduces significant
event-specific fields, revisit ADR-064.

**3. Theme/motif node and claim-node unified design.**
The philosophy doc (§2.5) names this convergence. Phase 10 should
design the claim-node primitive with sufficient generality to cover
both use cases. This is an ADR-level decision that affects the schema
and the batch-tag UI.

**4. Learning check UI placement.**
Does the learning check surface live as a "Check" tab in the center
panel, or as its own route `/projects/[hub_id]/check`? The philosophy
doc (§3.2) recommends starting as a tab, promoting to dedicated route
when history review becomes a meaningful activity. Needs a decision
before Slice 0 of learning mode.

---

## Documents to read for Phase 10

In this order, before any planning or implementation:

1. `docs/constellation-phase9-wrap.md` — complete Phase 9 record.
   The "What Phase 10 inherits" and "Open decisions" sections are the
   direct input to Phase 10 planning.

2. `docs/constellation-use-case-philosophy.md` — the why layer.
   Read Part III.B (sessions), Part V §5.6 (resolved decisions —
   the five open problems are resolved here), Part VI (lore and Scene
   Context View), Part VII (character sheets) in full. Read §3.2
   and §3.3 (learning checks and learner profile).

3. `docs/ux-build-plan.md` — the full phased plan Phases 0–9.
   The Phase 9 addendum (`constellation-phase9-buildplan.md`) covers
   the slice structure. ADR-073+ continue from where ADR-072 ended.
   Migration `0011_*` is the next slot.

4. `docs/decisions.md` — ADR log through ADR-072. The format for new
   ADRs: Status / Context / Decision / Rationale / Consequences.
   Write ADRs before implementation, not after.

5. `docs/architecture.md` — current schema and API surface. Needs
   updating as Phase 10 lands.

6. `constellation-phase9-concept.md` — the original Phase 9 value
   proposition document. §8 (narrative timeline) and §3 (scope) remain
   relevant for Phase 10 timeline extensions.

---

## The working relationship

This conversation has been a genuine collaboration. The best results
came from:

- Doing thorough pre-work (design conversations, philosophy documents,
  resolved decisions) before handing to Claude Code
- The developer pushing back on things that were wrong (the mode gates,
  the prototype gate criterion, the vis-timeline recommendation)
- Being precise about what is a design decision vs. what is an
  implementation detail
- Hands-on browser verification as the real acceptance bar, not just
  test counts

The single most valuable thing about this conversation was the use case
philosophy document (`constellation-use-case-philosophy.md`). It
captures the "why" behind every surface in a way that no build plan
or ADR can — because it captures the user's actual mental model and
emotional experience of using the tool. Every new chat should read it.

The Fire Stoker project and the motor encoders learning project are
real. When the developer tests features, they test them against actual
work they're doing. Suggestions that fit those real workflows land
better than abstract recommendations.

---

*This document was written at the end of the Phase 9 development
conversation to enable a clean context handoff for Phase 10. The
conversation covered: UX walkthrough exercise → build plan finalization
→ Phase 8 prototype gate → Phases 8.0-8.5 → Phase 9 pre-work design
session → Phase 9 Slices 0-5 implementation → Phase 9 wrap.*

*Total backend test delta across this conversation's work: 387 → 492
(+105 Phase 9) on top of whatever Bucket A and B added.*
