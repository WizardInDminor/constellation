# Constellation — Use Case Philosophy

## Narrative Mode & Learning Mode

*Started 2026-05-16. This is a living document. Update it as the design
evolves, as new use cases surface during build, and after each phase
delivers new evidence about how these modes are actually used. This document
is not a build plan — it is the “why” layer that build plans reference.
Hand it to Claude Code at the start of any session that touches narrative
or learning surfaces.*

-----

## Part I — Why these modes exist

Constellation began as a research and knowledge-capture tool: a place to
accumulate atomic notes, build typed connections between them, and query
across the corpus with AI assistance. That foundation is solid and
intentional. But two use cases kept surfacing during UX walkthrough work
that the research model doesn’t fully serve:

**Narrative use** — constructing stories, arguments, and sequential
structures where the *order* and *relationship* of ideas matters as much
as the ideas themselves. Research is fundamentally non-linear; narrative
is fundamentally sequential. The tools that work for one work against
the other.

**Learning use** — deliberately building understanding of a new domain,
testing that understanding, identifying gaps, and revisiting what you
know over time. Research accumulates; learning internalizes. The
feedback loop is different, and the system needs to support it
explicitly.

Both modes share Constellation’s foundational architecture — everything
is a graph, everything is embeddable, everything is queryable — but they
require different authoring surfaces, different ambient intelligence, and
a different philosophy about what the system is doing for the user.

The decision to support these modes inside Constellation rather than
deferring to specialized tools (dedicated writing apps, spaced repetition
systems) is deliberate. The reason is the **knowledge substrate
advantage**: Constellation’s graph connects your research, your notes,
your creative work, and your learning corpus into a single queryable
structure. A theme in your story can be connected to the philosophy
permanents that inspired it. A gap in your learning can be surfaced
against the research notes you’ve already accumulated. Specialized tools
can’t offer this because they don’t have access to the full graph. That
connection is what makes Constellation’s version of these modes
distinctive.

-----

## Part II — Narrative Mode

### 2.1 The problem with notes-first narrative

Every graph-based knowledge tool works the same way for narrative:
accumulate notes, link them, hope a coherent structure emerges. For
factual knowledge this is fine — knowledge is genuinely non-linear and
discovering connections is the point. But narrative has a spine. Stories
have scenes in order, causality between events, characters who appear
and disappear, themes that arc across the whole. Trying to discover that
spine by staring at a force-directed graph of scattered notes is working
against the grain of how stories are constructed.

The specific failure mode: the system captures the *content* of story
ideas well (notes are atomic, embeddable, queryable) but provides no
surface for the *structure* of a story. Structure has to be held in the
writer’s head or in a separate tool, disconnected from the knowledge
base that generated it.

### 2.2 The inverted workflow

Narrative mode inverts the standard direction. Instead of:

```
scattered notes → hope structure emerges → derive timeline
```

The workflow becomes:

```
build timeline → notes emerge from placement → graph builds underneath
```

The timeline canvas is the primary authoring surface. The user places
events, and the system creates the underlying graph representation
automatically. Notes come from the timeline, not the other way around.
The graph is built as a byproduct of narrative construction, not as a
prerequisite to it.

This is meaningful because:

- The writer thinks in scenes and sequences, not in atomic propositions.
  Meeting them in that mental model reduces friction.
- Structure is explicit from the start rather than emergent and
  uncertain.
- The graph representation comes for free — every event placed is
  immediately embeddable, searchable, and queryable via Ask.

### 2.3 The three layers

The narrative timeline canvas has three overlapping layers that can be
viewed independently or together. This is the core design concept:

**Layer 1 — Events (the spine)**

Scenes, chapters, moments — whatever the unit of narrative structure is
for this project. Each event is a permanent node with an `is_story_event`
flag and a `story_time` field. Events have two orderable sequences:

- *Story time*: when the event happens in the world of the narrative.
  May be a calendar date, a relative position (“Day 14”), or a narrative
  beat (“Act 2, Scene 3”). Free-text to accommodate any story structure.
- *Discourse position*: the order in which the reader encounters events.
  This is separate from story time because stories are frequently told
  out of order — flashbacks, parallel cutting, non-linear structure.
  Stored in `event_timeline_positions` scoped to a specific timeline,
  not as a global property of the event node.

FOLLOWS_FROM edges connect adjacent events in discourse order within a
timeline. These are created automatically when the user places an event
on the canvas. They are the temporal skeleton of the story.

**Layer 2 — Characters and entities (who and what is present)**

Characters, locations, objects, recurring symbols — anything that
persists across events and whose presence or absence matters. These are
structure nodes. Attaching a character to an event creates a COLLECTS
edge from the character node to the event node.

Filtering the timeline to a character shows only their scenes — their
arc becomes visible as a sequence. Filtering to an object traces its
journey through the story. Each character or entity has its own detail
view and can have edges into the broader knowledge graph: a character
node can have INSPIRED_BY edges to real historical figures, ANALOGOUS_TO
edges to archetypes in the research corpus, or BUILDS_ON edges to
literary notes about the archetype’s traditional role.

**Layer 3 — Themes and metaphors (the invisible structure)**

The most distinctive layer, and the one that most clearly differentiates
Constellation’s narrative mode from any dedicated writing tool.

A theme, motif, or metaphor is a node (structure or permanent) that
attaches to events where it appears. The density of a theme across the
timeline becomes visible — gaps in metaphor coverage are legible at a
glance. When writing scene 14, the writer can see that the water metaphor
last appeared in scene 3. When they want all the scenes where the
listener motif surfaces, they filter to it.

**Canonical usage notes** attach to the theme node itself, not to any
individual event. These are craft-memory notes: “water as judgment —
first appears at the harbor, peaks at the storm, resolves at the well.
Should feel inevitable, not symbolic.” This is the kind of authorial
intention that gets lost across a long writing project. Having a
first-class place for it, connected to both the timeline and the
knowledge graph, is something no dedicated writing tool can offer.

### 2.4 The knowledge graph connection

This is the core value proposition that justifies building narrative mode
inside Constellation rather than in a dedicated writing tool:

A theme node in a story is a graph citizen. It can have ANALOGOUS_TO
edges to physics permanents about entropy. A character node can have
INSPIRED_BY edges to a literature note about a real historical figure. A
motif can have SUPPORTS edges to philosophical permanents that theorize
it.

When the writer asks “what does my corpus know about liminality that I
haven’t used in this story yet?” the answer is findable — because the
theme node has edges into the research corpus. When they ask “what
events involve Elena and also touch the water motif?” the graph answers
it. When they want to understand why a scene feels right, they can trace
the INSPIRED_BY and ANALOGOUS_TO edges back to the research and
experience notes that generated the idea.

This connection also works in reverse. Insights that emerge during
narrative construction — a connection noticed while placing events,
a theme that turned out to be more central than expected — can be
promoted to permanent notes and added to the research corpus. The
creative work enriches the knowledge base.

### 2.5 The claim-node convergence

The thematic layer in narrative mode is structurally identical to the
**claim-node primitive** identified in research workflows (walkthrough
Scenario 12, finding #32). A claim node — the thing that other notes
SUPPORT or CONTRADICT — and a theme node — the thing that events and
notes elaborate or instantiate — are the same data shape: a node that
other nodes relate to with typed stances.

**This convergence is important for implementation.** When the claim-node
primitive is built (tentatively Phase 10), it should be designed with
sufficient generality to cover both the argumentative research use case
and the creative thematic use case. The batch-tag-against-target UI
(show candidates as cards, one click per stance) is directly useful for
thematic tracking: show all events as cards, one click to mark each as
ELABORATES / QUESTIONS / INSPIRED_BY the theme.

Build once, not twice.

### 2.6 Parallel timelines

Stories often have multiple concurrent timelines: a main plot and a
subplot, two characters whose stories eventually converge, a present-day
frame and a historical flashback sequence. The system must represent
these without forcing all events onto a single spine.

**Data model:** Each parallel timeline is a structure node that COLLECTS
its events. A project can have multiple timeline structure nodes. The
workspace renders each timeline structure node as a swim lane in the
vis-timeline canvas.

**Discourse position is scoped to a timeline**, not global. An event
that appears in two timelines (a crossover scene) has two discourse
positions — one per timeline. This is stored in the
`event_timeline_positions` join table:

```
event_timeline_positions(event_node_id, timeline_node_id, discourse_position)
```

This handles crossover scenes, convergence points, and divergence points
naturally — these are rows with the same `event_node_id` and different
`timeline_node_id` values.

**UI representation:** Swim lanes (one per timeline structure node) with
a lane toggle panel. The user can show/hide individual timelines, view
all in parallel to check pacing alignment between plots, or filter to
one timeline for focused work. Future: density overlays showing theme
presence per lane, character arc curves per lane.

### 2.7 The writing-alongside-the-app workflow

Narrative mode is not a replacement for a real prose editor. The intended
workflow for extended writing sessions is a **vertical split**:

- Left pane: prose editor or script editor for the actual text
- Right pane: Constellation workspace in narrative mode for structure,
  character notes, theme tracking, and knowledge graph queries

The workspace serves as the *active context layer* for the writing
session — not passive reference but a queryable, updatable structure
that the writer interacts with while writing:

- Scoped Ask answers “what did I decide about this character’s
  motivation?” without leaving the editor flow.
- `con --project <name> "insight"` captures ideas that surface while
  writing, routed directly into the project scope.
- The free-writing pad holds half-formed thoughts that aren’t yet scenes
  but shouldn’t be lost.
- The open-questions panel accumulates structural questions as they arise.

### 2.8 Future directions for narrative mode (Phase 10+)

*These are design intentions, not commitments. Capture them so they
inform Phase 9 architectural decisions.*

- **Theme density overlay:** A visual pass on the timeline canvas showing
  where a motif is dense vs. sparse — not as event cards but as a color
  or opacity gradient across the lane. Requires the custom SVG/Canvas
  component (decided in ADR-066); cannot be added to a library-based
  component.
- **Character arc curves:** A writer’s-room affordance — an emotional or
  narrative trajectory curve overlaid on a character’s swim lane, showing
  rise and fall across their scenes. Same requirement: custom component.
- **Scene-level synthesis:** Ask scoped to a single scene’s contributing
  notes — “synthesize what I know about this moment in the story from
  all attached notes, themes, and character arcs.”
- **Narrative gap analysis:** “What events are missing from Elena’s arc
  between scenes 4 and 9?” — using graph topology to identify structural
  gaps.
- **Export:** Timeline as a structured document (scene list with
  character presence and theme annotations), as a Mermaid sequence
  diagram for sharing, or as a formatted screenplay outline.

-----

## Part III — Learning Mode

### 3.1 The problem with accumulation-only knowledge tools

Most knowledge tools, including the base Constellation research workflow,
are optimized for accumulation: capture, process, link, query. This is
valuable and the foundation is right. But accumulation alone doesn’t
produce understanding. Understanding requires:

- **Testing**: can you explain what you know coherently?
- **Identifying gaps**: what don’t you know yet relative to what you
  should know?
- **Revisiting**: does what you captured earlier still make sense in
  light of what you’ve learned since?
- **Building structure**: does your knowledge of a domain have
  conceptual coherence, or is it a pile of disconnected facts?

The research workflow captures notes and builds connections. The learning
workflow uses those notes and connections as the raw material for
deliberate understanding-building. The feedback loop is different: in
research you’re looking outward (what does the source say?); in learning
you’re looking inward (what do I actually understand?).

### 3.2 The four learning use cases

**Use case 1 — Concept acquisition**

You’re learning a new domain from scratch: control theory, music harmony,
a new programming paradigm, a historical period. The workflow:

1. Capture notes from sources (literature notes linked to datasheets,
   books, articles).
1. Process into permanents — atomic concepts in your own words.
1. Build the conceptual map — typed edges between concepts (SUPPORTS,
   BUILDS_ON, CONTRADICTS, APPLIES_TO).
1. Test understanding: ask the system questions and see whether it can
   synthesize a coherent answer from your own notes.

Step 4 is the gap. The current Ask surface works but it doesn’t frame
the query as a learning check — it returns an answer without telling you
whether the answer came from deep coverage or thin coverage, whether it
had to infer across gaps, or where the weak points in your corpus are.
A learning-oriented Ask would explicitly surface retrieval confidence
(B5 from the build plan) and frame it as “here’s what your notes
actually cover, here’s where they’re thin.”

**Use case 2 — Spaced revisitation**

You captured a cluster of notes three months ago. You haven’t touched
them since. There’s a strong probability that you’ve forgotten much of
what you encoded, and that those notes now connect to newer notes in ways
you haven’t noticed.

The graph knows which notes you haven’t visited recently and which have
high edge density (suggesting they’re hub concepts worth revisiting).
A learning-mode workspace surface would expose this: “notes you haven’t
revisited in 90 days that have 5+ edges” as a candidate review queue.

This is not spaced repetition in the Anki sense — there are no cards,
no scheduling algorithm, no ratings. It’s a softer, graph-aware version:
surface high-value notes that have gone cold, let the user decide whether
to re-engage. The data exists in the schema (`updated_at`, edge counts);
this is a query and display question.

**Use case 3 — Explanation synthesis**

You’ve accumulated notes on a topic and want to produce an explanation
of it as if writing for someone who doesn’t know it. This is a learning
check: can you explain it clearly?

The output reveals where your understanding has gaps. If the synthesis
is thin or incoherent in a section, it’s because your notes are thin or
incoherent there — the model can only synthesize from what’s present.
The provenance panel shows exactly which notes contributed, making the
gaps visible.

This use case is largely achievable with the existing Synthesize surface
plus a custom prompt. The learning-specific addition is framing: the
system should be able to recognize “explain X as if to a newcomer” as an
explanation-synthesis request and respond with explicit flags where
coverage is thin — rather than generating confident prose that papers
over the gaps.

**Use case 4 — Gap identification**

You’re studying a domain and want to know what you don’t know yet
relative to what you do know. This is the most ambitious use case and
has two variants:

*Inward gap identification* (achievable now): “What sub-topics within
the notes I have on control theory have low coverage?” — using note
count, edge density, and tag membership to find thin areas. The
workspace coverage stats (left panel) gesture at this but need to be
more actionable.

*Outward gap identification* (architecturally out of scope for now):
“What concepts in control theory are typically connected to PID tuning
that don’t appear in my notes?” — requiring the model to reason about
what should be in the corpus relative to external knowledge. This would
require the model to bring in knowledge beyond the graph, which conflicts
with Constellation’s grounded-synthesis principle (RAG answers are
grounded in your notes, not in the model’s training data). This variant
is a future direction, not a current commitment.

**Use case 5 — Structured learning checks**

You want to test whether you actually know what you think you know —
not through synthesis but through direct questioning. This is the use
case where Constellation moves closest to a traditional learning tool,
but with two properties no traditional tool has: the questions are
grounded in *your* corpus, and the history of your performance becomes
part of the knowledge graph.

Learning checks have three response formats, each testing a different
depth of understanding:

*Multiple choice* — tests recognition and discrimination. “Which of the
following best describes the relationship between SPI clock polarity and
phase in the MCP4922?” Four options, one correct, distractors drawn from
common misconceptions surfaced from the corpus. Good for vocabulary,
definitions, and distinguishing similar concepts.

*Short response* — tests recall with production. “What is the practical
difference between polling and interrupt-driven gate input handling on
the STM32?” Requires the user to produce an answer in their own words.
The system evaluates against the corpus and scores for accuracy and
completeness.

*Essay response* — tests synthesis and integration. “Explain the
trade-offs involved in choosing a 12-bit vs 16-bit DAC for CV output in
a Eurorack context, and defend the choice you would make.” Requires
constructing a coherent argument from multiple notes. The system
evaluates for logical structure, use of evidence from the corpus, and
awareness of trade-offs.

**Two generation modes for question creation:**

*Corpus-grounded questions* — questions generated directly from the
notes in the project scope. Every question has at least one source note
in the corpus that contains the answer. This tests whether the user has
internalized what they have captured. The question generation prompt is
given the corpus content and instructed to produce questions answerable
from it. Provenance for each question points to the source notes.

*Domain-extended questions* — questions about the topic that are not
answered by the current corpus but are directly related to it. The model
uses its knowledge of the domain to generate questions the user should
be able to answer if they truly understand the topic, regardless of
whether their notes cover it. This tests understanding against the
domain, not just against the corpus. When the user cannot answer, it
surfaces a genuine gap to fill.

These two modes serve different purposes and should be explicitly labeled
in the UI. Corpus-grounded checks test retention of what has been
captured. Domain-extended checks test understanding relative to the
domain and generate a study agenda.

**Question storage:**

Learning check sessions are stored as a dedicated entity attached to
the project. Each session contains: the questions generated, the
response format mix, the user’s responses, the scores, and provenance
(which notes contributed to each question). Sessions are browsable and
re-runnable — the same question set can be repeated six weeks later to
measure retention change.

-----

### 3.3 Learning history and the learner profile

Learning checks produce structured performance data. Storing and
reasoning over that data is what makes learning mode genuinely
distinctive — it turns individual check sessions into a longitudinal
record of understanding development.

**What gets recorded per session:**

- Domain and project scope checked against
- Date and duration
- Question format mix (N multiple choice, N short response, N essay)
- Per-question: question text, format, generation mode, user response,
  score, and provenance notes
- Session-level scores: overall, by format, by sub-topic (derived from
  tags of provenance notes)

**What the learner profile produces:**

The learner profile is not a separate data structure — it is a synthesis
derived from learning check history on demand, generated by the RAG
pipeline running over stored session records. When the user requests a
profile summary the system produces an oriented assessment:

> “Your notes on Eurorack CV output show strong conceptual understanding
> (essay scores averaging 82%) but weak recall of specific syntax and
> register-level details (short response averaging 51%). You have checked
> this domain 4 times over 6 weeks. The sub-topics with lowest consistent
> scores are interrupt configuration on STM32 GPIO and DAC SPI timing
> tolerances. Recommended: a focused study session on those two sub-topics
> followed by a small hands-on build project to reinforce the syntax.”

The check sessions are the corpus; the learner profile is the synthesis.
No separate analytics engine is needed.

**Three layers of learning history value:**

*Retention tracking* — run the same question set at intervals. Score
change over time shows whether understanding is consolidating or
decaying. Identifies concepts needing active reinforcement vs. ones
that have been genuinely internalized.

*Format-disaggregated insight* — consistently scoring high on multiple
choice but low on essay for the same domain reveals a specific pattern:
recognition without synthesis. The system names this explicitly rather
than returning an aggregate score that hides the pattern. Consistently
scoring high on conceptual essay questions but low on short-response
syntax questions reveals the inverse: theoretical understanding without
procedural fluency. These patterns require disaggregated data to surface
and are exactly what a generic score cannot show.

*Recommendation generation* — the learner profile synthesis produces
explicit next-step recommendations generated by the model reasoning over
performance patterns. They are suggestions, not a prescribed curriculum:

- *Focused study session*: revisit specific notes and their cited sources.
- *Hands-on build project*: when conceptual scores are high but syntax
  scores are low, a small implementation exercise consolidates the gap.
- *Note capture*: domain-extended checks may surface concepts the user
  could not answer that are absent from the corpus — name them explicitly
  as capture targets.
- *Re-check scheduling*: if scores are flat or declining across sessions,
  flag that more of the same study approach is not working.

**Schema implications (for Phase 10 planning):**

```sql
CREATE TABLE learning_check_sessions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES nodes(id),
    mode        TEXT NOT NULL CHECK(mode IN (
                    'corpus_grounded', 'domain_extended', 'mixed')),
    created_at  TEXT NOT NULL,
    duration_seconds INTEGER,
    summary_scores TEXT  -- JSON: {overall, by_format, by_subtopic}
);

CREATE TABLE learning_check_questions (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL
                        REFERENCES learning_check_sessions(id),
    question_text   TEXT NOT NULL,
    format          TEXT NOT NULL CHECK(format IN (
                        'multiple_choice', 'short_response', 'essay')),
    generation_mode TEXT NOT NULL CHECK(generation_mode IN (
                        'corpus_grounded', 'domain_extended')),
    options         TEXT,  -- JSON array, multiple choice only
    correct_option  TEXT,  -- multiple choice only
    provenance_node_ids TEXT,  -- JSON array
    user_response   TEXT,
    score           REAL,  -- 0.0–1.0
    score_rationale TEXT,
    created_at      TEXT NOT NULL
);
```

This schema is intentionally simple. History is queryable as raw records
for re-running checks and synthesizable via the RAG pipeline for profile
generation.

**Philosophy note on profile framing:** The learner profile is a current
snapshot derived from available evidence, not a permanent judgment. The
model should frame it as “based on your last N checks” and include
explicit uncertainty where evidence is thin. Overconfident profiles are
worse than no profile — they direct study effort based on noise.

-----

### 3.4 The philosophy behind learning mode

Learning mode rests on a specific philosophical claim: **the best test
of understanding is the ability to synthesize, not the ability to recall.**

Recall-based learning (flashcards, quizzes) tests whether you can
retrieve a fact. Synthesis-based learning tests whether you can construct
a coherent account from the pieces you have. Constellation’s RAG
pipeline is naturally a synthesis engine — it assembles context and
generates an answer. Turning that toward learning means using it to
test whether your notes, collectively, can support a coherent
explanation.

This is why the provenance panel is learning-relevant: it tells you not
just what the answer was, but which notes contributed and which edges
were traversed. A learner who gets a thin answer can look at the
provenance and see exactly which part of the domain is underbuilt.
The feedback is structural, not just evaluative.

The second philosophical claim: **gaps are more valuable than coverage.**
In research mode, you want the corpus to cover what you need. In learning
mode, you want the gaps to be visible, because gaps are what you study
next. The workspace’s ambient intelligence should surface gaps as
actionable information, not hide them behind confident-sounding synthesis.

### 3.4 Learning mode workspace configuration

The learning-mode workspace shares the same three-panel layout as the
standard workspace but with different default content in each panel:

**Left panel (scope) — same as standard**
Pinned notes and tags define the learning domain. Coverage stats are
more prominent: note count, avg edge count, and a thin-coverage alert
(“3 sub-topics below 3 notes”).

**Center panel — different default tab**
The default tab in learning mode is not Write but **Review**. The Review
tab surfaces:

- Spaced revisitation queue: notes older than 30 days with 3+ edges,
  not opened recently.
- Recent additions: notes added since last session (what did you learn
  recently?).
- Explanation synthesis shortcut: one-click “Explain this domain” that
  runs a pre-set Synthesize prompt with explicit thin-coverage
  instructions.

**Right panel — different ambient content**
Instead of Bridges and Recent activity, learning mode surfaces:

- **Coverage map**: sub-topic breakdown with note and edge counts,
  sorted by coverage density ascending (thinnest first).
- **Open questions queue**: the project’s open-questions node, but
  framed as “what do I still need to understand?” rather than “what
  are the unresolved design questions?”
- **Connection suggestions**: cross-domain bridges between the learning
  corpus and other parts of the knowledge graph — the connections
  between what you’re learning and what you already know.

### 3.5 The workspace mode question

The existence of three workspace configurations (research/standard,
narrative, learning) raises a design question that needs to be resolved
before the workspace shell is built in Phase 9 Slice 1:

**Does the workspace have explicit modes the user selects, or does it
adapt based on the content of the project?**

Option A — explicit modes: the project creation flow asks “what kind of
project is this?” (Research / Narrative / Learning). The workspace
configures itself accordingly. The user can switch modes later. Clear
and predictable; requires the user to categorize upfront.

Option B — adaptive: the workspace infers mode from project content
(presence of `is_story_event` nodes → show timeline tab; presence of
literature notes from learning sources → show review tab). No upfront
categorization. More fluid but potentially confusing when the workspace
changes configuration unexpectedly.

Option C — configurable panels: the workspace has a fixed shell but the
user configures which panels and tabs appear. Mode is a saved panel
configuration, not a categorical state. Most flexible; highest UI
complexity.

**Decision: Option A confirmed.** Explicit mode selection at project
creation. A project’s mode is stored in `project_scopes.mode`
(enum: `research | narrative | learning`). The workspace shell renders
different default tab and panel configurations based on this field.
Option C is the right long-term direction and Option A’s mode field
is forward-compatible with it.

**Critical implementation note — mode sets defaults, not gates.**
Mode determines what is prominent on first open and what the ambient
intelligence panels show by default. It does not restrict available
features. A Research mode project can add a Timeline tab; a Narrative
mode project can run learning checks; a Learning mode project can use
the free-writing pad. The user can surface any tab from a “customize
workspace” affordance. This resolves the cross-mode feature sharing
concern: a researcher studying the history of control theory can have
a timeline view without their project being classified as Narrative.

The agent must not implement mode as a feature gate. It is a starting
configuration, not an access control.

### 3.6 Future directions for learning mode (Phase 10+)

*Design intentions, not commitments.*

- **Understanding graph**: a separate visualization showing the
  conceptual structure of a learning domain — nodes as concepts,
  edges as relationships, color-coded by coverage density. Distinct
  from the main graph which shows all notes; this is a domain-specific
  concept map.
- **Outward gap identification**: model-assisted identification of
  concepts that should be in the corpus relative to what’s present.
  Architecturally complex; requires careful design to avoid violating
  the grounded-synthesis principle.
- **Explanation quality scoring**: after running an explanation
  synthesis, the system evaluates the output for coherence and coverage
  and returns an explicit assessment. Requires a second-pass generation
  call; deferred until the latency is acceptable.
- **Learning path suggestions**: given a target concept and the current
  corpus, suggest an order in which to process existing notes to build
  toward it systematically.

-----

## Part III.B — Intentional Work Sessions

*This section applies across all three modes. It is placed here rather
than in Part IV because it is a first-class feature of the workspace
architecture, not a cross-cutting concern. Sessions are the container
within which research, narrative, and learning work happens.*

### IIIb.1 What an intentional session is

The session pill introduced in Phase 9 Slice 1 is a lightweight context
marker: it says “I am currently working on this project” and routes
captures accordingly. An intentional work session is something richer —
a **named, structured container for a specific bout of focused work**
with declared intent, tracked progress, and closing notes that brief
the next session.

The distinction matters because the session pill is stateless. It knows
which project is active but not what you are trying to accomplish within
it. An intentional session is stateful: it knows what you set out to do,
what you accomplished, where you got stuck, and what the next session
needs to pick up.

**Examples of intentional sessions by mode:**

*Research:*

- “OIP supervisor workflow feature planning — synthesize field notes into
  candidate features”
- “Control theory literature review — process the last six literature
  notes into permanents”

*Narrative:*

- “Fire Stoker — location and environment details session”
- “Fire Stoker — scene 2 act 4 drafting session”
- “Fire Stoker — review chapter 3 for water motif consistency”

*Learning:*

- “Learning session — STM32 pitch detection algorithms, focus on DMA
  and timer configuration”
- “Learning session — Pandas syntax for groupby and aggregates”
- “Learning session — run corpus-grounded check on control theory after
  three weeks away”

The intent declaration is not just a label. It scopes the workspace
automatically (relevant notes surface in the recent panel), primes the
Ask bar context, and creates a dated artifact that the resume-briefing
feature can reference alongside synthesis history.

### IIIb.2 Session lifecycle

**Opening a session:**

The user clicks “Start session” from the workspace home or topbar. A
lightweight dialog asks:

- *What are you working on today?* (free-text intent field, required)
- *Mode* (pre-filled from project mode, overridable per session — a
  narrative project can have a research session)
- *Estimated duration* (optional; used only to show a soft timer)

On confirm, the session becomes active: the session pill in the topbar
updates to show the session intent, the workspace’s recent panel shifts
to surface notes most relevant to the declared intent, and the Ask bar
gets an implicit context prefix.

**During a session:**

A persistent but unobtrusive scratchpad is available throughout the
session — a collapsible panel or drawer, not a modal. The user records:

- *Progress notes*: what has been accomplished. Running, informal, not
  required to be structured.
- *Blockers*: what is stopping progress. Explicit field so blockers are
  surfaced in the next-session brief rather than buried in prose notes.

Captures made during an active session (`con --project` or Ctrl+K) are
automatically associated with the session ID in addition to the project
scope. This allows session-scoped queries later: “what did I capture
during the Fire Stoker environment session?”

**Closing a session:**

The user clicks “End session” from the topbar or session panel. A
closing dialog prompts for:

- *Closing notes*: what was accomplished, what shifted in understanding,
  what felt unresolved.
- *Next session intent*: the forward brief. “Next: pick up from scene 3
  paragraph 4. Need to research Victorian harbor lighting before writing
  the night arrival scene.”
- *Status*: Completed / Partial / Blocked (for history filtering).

On close, `closed_at` and `duration_seconds` are recorded. The session
becomes part of the project’s session history.

**Abandoned sessions:**

If the user closes the browser without ending the session, the session
is marked `abandoned` after a configurable timeout (suggested: 2 hours
of inactivity). An abandoned session still retains whatever progress
notes were written. On next project open, a banner offers: “You have an
unfinished session from [date]. Resume it or close it?”

### IIIb.3 Session start: explicit first, implicit as safety net

**Decided:** Explicit session start is the primary path. The user
deliberately clicks “Start session” and declares intent. This is the
target implementation for Phase 9/10.

**Future addition — 15-minute threshold prompt:** If the user has been
active in a project for 15 minutes without starting a formal session,
the app asks: “You’ve been working for 15 minutes — would you like to
log this as a session?” The prompt is non-blocking (dismissible, doesn’t
interrupt work) and captures a session start time backdated to first
activity. This ensures users don’t lose session history simply because
they forgot to click a button before diving in.

The threshold is 15 minutes because it reliably distinguishes a real
work session from a quick reference lookup or a capture-and-go visit.
Under 15 minutes is almost never a session worth logging; over 15 minutes
almost always is.

**Implementation note:** The implicit prompt requires tracking
`first_activity_at` per project visit in frontend state (not persisted
until the user confirms). On the 15-minute mark, a soft toast or banner
appears. If confirmed, a session is created with
`started_at = first_activity_at`. If dismissed, the visit is not logged
as a session and the prompt does not reappear for that visit.

### IIIb.4 Session history and the project journal

Across a project’s lifetime, session history becomes a **journal of
how the work developed** — a longitudinal record that no dedicated
tool currently provides.

**For narrative projects:** A writer’s journal. Session 14: “Figured
out that Elena’s arc needs to mirror the water motif more explicitly in
act 2. Blocker: harbor master scene still isn’t working. Next: try
writing it from the harbor master’s POV first.” This documents the
creative process alongside the creative output. Six months later,
browsing the session history shows not just what the story became but
how it got there — what was struggled with, what unlocked it.

**For learning projects:** Session history combined with check session
history tells a complete story: what was studied, how long, what was
struggled with, how check scores moved in response. The learner profile
synthesis draws from both. “You spent four sessions on control theory
in February before your check scores improved — here’s what shifted.”

**For research projects:** A thinking journal — a record of what
questions were being pursued in each session, when understanding shifted,
what led to which synthesis. Paired with synthesis history (dated
briefings via resume-briefing), this gives a rich longitudinal record
of intellectual work on a problem.

**Session history is queryable via Ask.** “What was I working on in
the Fire Stoker project during March?” “What blockers came up most
frequently in my Eurorack build sessions?” “When did my understanding
of PID tuning change?” These are natural questions once the history
exists. The session records are corpus for the RAG pipeline.

### IIIb.5 The next-session brief

The `next_session_intent` field written at session close is the primary
input to resume-briefing, superseding the generic synthesis-from-notes
approach. The resume brief for a project with active session history
is structured as:

1. **Your last session’s forward note** (verbatim from
   `next_session_intent`) — what you told yourself to do next.
1. **What happened since** — captures, notes, edges created after
   `closed_at` of the last session. Synthesis of new material.
1. **Relevant context** — synthesis of the project scope most relevant
   to the declared next intent.

Your stated forward intent plus new-material synthesis plus relevant
context is significantly better than generic synthesis alone. It respects
the user’s own continuity of thought rather than reconstructing it from
scratch.

### IIIb.6 Schema (for Phase 10 planning)

```sql
CREATE TABLE work_sessions (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES nodes(id),
    mode                TEXT NOT NULL CHECK(mode IN (
                            'research', 'narrative', 'learning',
                            'planning')),
    intent              TEXT NOT NULL,
    status              TEXT NOT NULL CHECK(status IN (
                            'active', 'completed', 'partial',
                            'blocked', 'abandoned'))
                        DEFAULT 'active',
    progress_notes      TEXT,
    blockers            TEXT,
    closing_notes       TEXT,
    next_session_intent TEXT,
    estimated_duration_minutes INTEGER,
    started_at          TEXT NOT NULL,
    closed_at           TEXT,
    duration_seconds    INTEGER,   -- computed on close
    created_at          TEXT NOT NULL
);

CREATE INDEX idx_work_sessions_project
    ON work_sessions(project_id, started_at DESC);

-- Nodes created during a session. Default: all nodes created while a
-- session is active are associated. Users can opt individual nodes out
-- at creation time (see §IIIb.6 — session bypass).
CREATE TABLE session_nodes (
    session_id      TEXT NOT NULL REFERENCES work_sessions(id),
    node_id         TEXT NOT NULL REFERENCES nodes(id),
    created_at      TEXT NOT NULL,
    session_tagged  INTEGER NOT NULL DEFAULT 1, -- 0 = user bypassed
    PRIMARY KEY (session_id, node_id)
);

CREATE INDEX idx_session_nodes_session
    ON session_nodes(session_id, created_at);

-- Edges created during a session. Same opt-out semantics as session_nodes.
CREATE TABLE session_edges (
    session_id      TEXT NOT NULL REFERENCES work_sessions(id),
    edge_id         TEXT NOT NULL REFERENCES edges(id),
    created_at      TEXT NOT NULL,
    session_tagged  INTEGER NOT NULL DEFAULT 1, -- 0 = user bypassed
    PRIMARY KEY (session_id, edge_id)
);

CREATE INDEX idx_session_edges_session
    ON session_edges(session_id, created_at);
```

**Note on the `mode` field:** Session mode is independent of project
mode. A narrative project can have research sessions. The session mode
reflects the intent of this specific bout of work, not the project’s
default. The enum includes `planning` as a fourth session mode for
sessions focused on project structure, roadmapping, or scope definition
— work that doesn’t fit cleanly into research, narrative, or learning.

**Session bypass — opting a node or edge out of session association:**

Most nodes and edges created during an active session genuinely belong
to that session. But not all of them. Mid-session you might think of
something completely unrelated — a fleeting note about a separate
project, a capture that belongs to a different context entirely — and
want to jot it down without tagging it to the current session.

The bypass mechanism:

- Default behavior: all nodes and edges created while a session is
  active are session-tagged (`session_tagged = 1`). No action required
  from the user for the common case.
- Opt-out: the capture dialog and intentional capture dialog show a
  small “Don’t tag to current session” toggle, collapsed/unobtrusive
  by default. Activating it sets `session_tagged = 0` in the join table
  row. The node is still created normally and associated with the project
  (if its tags match); it just isn’t attributed to this session.
- The toggle state is not persisted across captures — it resets to
  default (tagged) after each save. This prevents accidental blanket
  de-tagging during a long session.
- For edges created via the EdgeForm during an active session, the same
  toggle appears in the edge creation UI.
- For `con --project` captures from the CLI: a `--no-session` flag
  bypasses session tagging. `con --project eurorack --no-session "reminder about something unrelated"` creates the note in the project
  scope but not in the active session.

The bypass is intentionally lightweight. It is not a reassignment flow
(you cannot tag a node to a *different* session from the capture dialog
— that’s an edge case handled by editing session history post-hoc if
ever needed). It is simply an opt-out: “this note is not part of what
I’m doing right now.”

**Why `session_tagged` is a column rather than row absence:**

Storing the row with `session_tagged = 0` rather than simply not
inserting a row preserves the information that the node was created
*during* this session even though it was deliberately excluded. This
is occasionally useful: “what did I create during session 14, including
things I opted out of session tagging?” is a valid retrospective query.
If the row were absent, that question would have no answer. The column
makes the opt-out an explicit, queryable decision rather than a silent
omission.

### IIIb.7 The creation timeline view

Session IDs on nodes and edges enable a visualization that dates alone
cannot provide: a **chronological archaeology of how a project’s
knowledge structure developed**, grouped by intentional work unit rather
than by individual timestamp.

**What the view shows:**

A horizontal or vertical timeline where each work session is a labeled
block. Within each block: the nodes created (by type — permanent,
literature, structure, story event), the edges created (by type —
SUPPORTS, CONTRADICTS, BUILDS_ON, FOLLOWS_FROM, etc.), and the
session’s declared intent as a header. Nodes opted out of session
tagging appear in a separate “uncategorized” section between blocks
rather than being silently hidden.

**What becomes visible that dates alone can’t show:**

- *Work unit patterns*: “session 4–6 were heavy on edge creation with
  few new nodes — a connecting phase, not an accumulation phase.” This
  pattern is meaningful but invisible from a raw date-sorted list.
- *Clustering*: which notes and edges were created together in a single
  bout of focused intent. This is the natural unit of intellectual work,
  not the individual timestamp.
- *Progression*: the arc from early sessions (many nodes, few edges —
  accumulating raw material) to later sessions (fewer nodes, more edges
  — building structure and connections) is visible as a pattern across
  the timeline. This is a signal about the maturity of understanding
  in the domain.
- *Blockers made visible*: sessions marked “blocked” or “partial” stand
  out in the timeline. Reviewing what was created just before and just
  after a blocked session often reveals what the blocker was about and
  how it was resolved.

**For the AI:** Session grouping gives the model a richer unit of
context than individual timestamps. When asked “how did my understanding
of DMA configuration develop?” the model can reason over session blocks
— “in session 3 you created three notes that treated DMA as a
complication; by session 7 you were treating it as the primary pattern
and creating edges that organized earlier notes around it.” That
narrative is only constructable when creation events are grouped by
intent.

**Implementation:**

The lightweight version — a list view showing sessions as expandable
rows with node and edge counts and type breakdowns — is achievable as
a workspace tab (“History”) with no new backend work beyond the join
tables. Query: join `work_sessions`, `session_nodes`, and `session_edges`
for the project, group by session, aggregate counts by type.

The richer canvas visualization (the actual timeline with blocks,
visual density, type-color coding) is Phase 10 scope, implemented as a
variant of the narrative timeline component once that custom SVG/Canvas
component exists. The two share a rendering foundation — both are
event-positioned on a time axis — but the creation timeline is
read-only (no drag-to-reorder) and system-generated rather than
user-authored.

-----

## Part IV — Cross-mode considerations

### 4.1 A project can serve multiple modes

A research project on the history of feedback control might produce both
permanent notes (research mode) and a narrative timeline of the
development of control theory across the 20th century (narrative mode),
while also being the corpus against which you test your understanding
(learning mode). These aren’t mutually exclusive.

The explicit-mode decision (§3.5) should accommodate this. Option A’s
mode field is a primary mode, not an exclusive one. A project in
`narrative` mode should still have access to research features; a
project in `learning` mode should still be able to use the free-writing
pad.

### 4.2 The Ask surface is shared

All three modes use Ask. What differs is the framing:

- Research mode: “what do my notes say about X?” — synthesis of existing
  knowledge.
- Narrative mode: “what did I encode about this scene / character /
  theme?” — retrieval of creative structure.
- Learning mode: “can my notes explain X coherently?” — understanding
  test.

The brief and Synthesize modes (ADR-053) already gesture at this
framing distinction. Learning mode may eventually warrant its own Ask
mode (e.g., `mode="explain"`) that explicitly flags thin coverage in
the response. This is Phase 10 territory but should be kept in mind
when extending the mode enum.

### 4.3 Mermaid serves all three modes

The Mermaid rendering planned for Phase 9 Slice 3 is cross-mode:

- Research / planning: Gantt charts, flowcharts, architecture diagrams.
- Narrative: sequence diagrams, timeline exports, character relationship
  diagrams.
- Learning: concept maps, dependency graphs, relationship diagrams
  between domain concepts.

The rendering infrastructure is mode-agnostic. The prompts that generate
Mermaid output are mode-aware. Design the rendering component once;
the synthesis prompts are where mode differentiation happens.

-----

-----

## Part V — Session 1 Profiles

*Derived from a structured design exercise (2026-05-16) walking through
five questions per mode: what to capture at session start, what the
workspace does on first open, what the user reaches for first, how each
UI feature is used in session 1, and what progress feels like. These
profiles are the direct input to workspace UI design — empty states,
onboarding flows, default panel prominence, and first-session behavior
all derive from here.*

-----

### 5.1 The emotional texture of starting

Each mode has a distinct emotional starting state that the onboarding
and first-open experience must meet the user inside of:

**Research:** Intellectual openness. Curious, slightly uncertain about
scope. The domain is interesting but not yet mapped. The anxiety is
“where do I even start?” not “will I succeed?”

**Narrative:** Creative energy mixed with fear of forgetting. Something
precious — a story, a character, a world — is living only in the user’s
head and is at risk of being lost or distorted by time. The urgency is
“get this down before it fades.” Gut feelings are valid and useful data
at this stage in a way they aren’t in Research.

**Learning:** Purposeful and slightly anxious. There is a defined gap
between what the user knows and what they need to know, and they are
about to attempt to close it. The structure of the mode is a feature,
not a limitation — it converts anxiety into direction.

-----

### 5.2 Research mode — Session 1 profile

**Onboarding sequence (four questions, sequential dialog):**

1. *“In one sentence, what are you looking to research?”* → stored as
   project node title. Specific or generic, both valid.
1. *“What specifically do you want to learn or accomplish by the end of
   this project? Use a numbered list if needed.”* → stored as goals,
   populates Goals card. Outcome-oriented, not topic-oriented.
1. *“What do you already know about this domain?”* → stored in
   `prior_knowledge` field on `project_scopes`. Free-form, honest,
   uncertainty welcome. Both a user baseline and an AI diagnostic.
1. *“Do you have source materials you want to use already prepared?”*
   → yes/no branch. Yes: gentle linking flow with reminder about how
   sources work in the app. No: optional AI source suggestions.

**What the workspace does before the user clicks anything:**

Corpus match panel auto-populates with semantically similar existing
notes. Goals card is populated. Scratchpad opens with instructional
placeholder text. Empty panels hide rather than display emptiness. The
workspace arrives prepared, not blank.

**First reach:**

Corpus triage first (accept/dismiss), then scratchpad planning or
source diving. Path depends on how prepared the user feels.

**Session 1 feature prominence:**

*Loud:* Goals card, Scratchpad, Corpus matches panel, Source materials,
Session intent + AI assessment.

*Quiet:* Scoped Ask, Synthesize, Bridges, Coverage map.

*Optional but valuable:* Knowledge check baseline, AI session intent
assessment.

**Key design decisions:**

- Goals card auto-populates as “Free Exploration” if skipped.
- Corpus panel hides entirely when empty.
- Coverage map replaced in early sessions by a manual Sub-topics card.
  Transitions to data-driven as notes accumulate.
- AI session intent assessment stored as `intent_assessment` on
  `work_sessions`. Framed as collaborator observation, not warning.
- Synthesize access to fleeting notes: open question — see §5.6.
- Dismissed corpus suggestions tracked per project so same note is not
  re-surfaced in subsequent sessions. Requires `dismissed_corpus_suggestions`
  record per project.

**What progress feels like:**

Tomorrow will be easier than today was. Two valid forms: material
progress (notes generated, sources read) or logistical progress (sources
found and linked, next session has a clear start). Both legitimate.
Session close: “What did you accomplish and what would make tomorrow
easier?” — not “What did you learn?”

-----

### 5.3 Narrative mode — Session 1 profile

**Onboarding sequence (conversational, acknowledges uncertainty):**

1. *“Do you have a working title for this project yet?”* → yes: title.
   No: placeholder or optional generated title.
1. *“What kind of narrative project is this?”* → Short story / Novel /
   Script / Essay / Argument / Other. Optional, never blocks creation.
1. *Knowledge spectrum:* “Do you know what happens in this story
   already?” → No idea / Some ideas / Strong knowledge / Fully flushed
   out. Calibrates workspace first-open defaults.
1. *“Do you know who these things happen to?”* → optional early
   character sketching. Name + role + brief description. Archetype tag
   optional. “You can always edit these later.”
1. *“Do you know where these events happen?”* → optional location
   sketching.
1. *“Do you know why, or what you want the reader to walk away with?”*
   → optional theme sketching. Gut feelings explicitly valid.
   Tentativeness invited, not corrected.
1. *“Do you have existing material to link?”* → same branch as Research.
1. *Session scope* (required): “What are you specifically working on
   in this session?” Defaults to “Exploratory” if skipped.

**What the workspace does before the user clicks anything:**

Three primary creation surfaces immediately visible: Add Character,
Add Event, Add Theme. Any nodes created during onboarding already
populated. Timeline appears only once events exist. Narrative dump
tool available immediately.

**The narrative dump → node extraction feature:**

Three distinct dump types with calibrated extraction prompts:

1. *Story arc dump:* events + rough sequence + character references
   → proposed scene nodes with discourse order and character edges.
1. *Character deep dive:* traits, motivations, relationships,
   contradictions → proposed character properties and relationship edges.
1. *Themes and subtext dump:* concepts, symbols, emotional weight,
   things felt but never said → proposed theme nodes with sub-themes
   and canonical usage notes.

User reviews all proposed nodes before accepting. Same pattern as
document import pipeline.

**Session 1 feature prominence:**

*Loud:* Narrative dump → extraction, Character/Event/Theme creation,
Timeline (once events exist), Session scope, Scratchpad (ambient).

*Contextual:* Parallel timeline lanes (story-dependent), Cork board
(after dump, finding additional connections).

*Quiet:* Scoped Ask (sparse corpus); full-corpus toggle more useful.

*Hidden until needed:* Focus views (character/theme/event/world-building).

**Key design decisions:**

- Timeline appears only after events exist.
- Act containers are spans (start + end position + label), not point
  events. Separate schema representation required — see §5.6 open
  problem 5.
- Parallel timelines nameable before events are placed in them.
- Cork board: spatial connection surface distinct from timeline. About
  what connects to what, not when.
- Full-corpus vs. project-scoped Ask toggle needed — see §5.6 open
  problem 3.
- Session wrap: “What did you work on, and what surprised you?” —
  not “did you meet your session scope?” Scope drift is legitimate
  creative progress.
- Theme nodes need sub-theme depth from session 1. A theme like “light
  as truth” (fluorescent/manufactured vs. sunlight/natural vs.
  firelight/brutal) is a document with sub-concepts, not a tag.
- Focus views are distinct surfaces with their own information
  architecture. Need dedicated design session — not variations of one UI.

**What progress feels like:**

One of two emotional states, both valid:

*Relief/calm:* Something in your head is now real. Fear of forgetting
it is gone. Even one character name or scene placeholder counts.

*Excitement/energy:* A hidden connection surfaces. A theme becomes more
meaningful than expected. The app found something the user didn’t know
was there.

-----

### 5.4 Learning mode — Session 1 profile

**Onboarding sequence:**

1. *“What would you like to learn about?”* → topic.
1. *“What is your motivation for pursuing this?”* → the why.
   Distinct from goals: motivation is the reason, goals are milestones.
1. *“Tell me in a few sentences what you already know.”* → free-form
   diagnostic. Half-remembered assertions, flagged uncertainties, and
   named gaps are all valuable. “I think they use grayscale” is more
   useful than “beginner.” Parsed immediately for correctable
   misconceptions.
1. *“What are three goals you want to achieve by the end of this
   project?”* → numbered, outcome-oriented, specific.
1. *“Do you have source materials, or would you like suggestions?”*
   → load-bearing branch — see §5.6 open problem 1.

**What the workspace does before the user clicks anything:**

1. *Quick corrections:* correctable misconceptions from prior knowledge
   entry surfaced as 1-2 sentence corrections with “Save as permanent
   note” button. First permanent notes of the project generated before
   user has done anything. Do not audit these — they were just checked.
1. *Learning map generated:* phased plan from topic + goals + prior
   knowledge gaps + motivation. Each phase has: named sub-topics,
   learning goals, mapped source materials, knowledge check placeholder.
   Editable proposal, not prescription.

**The core learning loop:**

```
Map → Read sources (with attention cues)
    → Make notes (at least one per sub-topic)
    → Audit my Learning
    → Gap surfacing (targeted questions for anything missing)
    → Mark complete → next sub-topic
```

**First reach:**

The learning map. Seeing the plan makes the goal feel real and
achievable. Review and adjust, then dive into first lesson.

**Session 1 feature prominence:**

*Required:* Learning map, Sub-topic completion tracking, Session scope.

*High value:* Quick corrections, Source materials with attention cues,
Scratchpad.

*Available but not required:* Audit my Learning (triggered by first
manually entered user note), Knowledge check (phase wrap-up primarily).

*Not useful:* Scoped Ask (replaced by Audit my Learning in active
learning sessions), Learner profile (long-term).

*Hidden by default:* Bridges (focus must be maintained during input
phase; available via explicit action only).

**Coverage map reframed:**

Early sessions: source coverage — “Materials cover sub-topics 1-4 and
6-8. Missing: encoder fail modes.” Later: note coverage as corpus
matures. Distinct implementation from research and narrative maps.

**Session close-out formalized:**

- “You wrote 3 notes and completed one sub-topic branch. Great work!”
- “No notes captured — would you like to add one now, or capture a
  topic that gave you trouble?”
  Never punitive. Context fuel for next session start.

**Key design decisions:**

- `learning_verified` flag on permanent notes: set when Audit confirms
  correct understanding. Trusted for knowledge checks and learner
  profile. Notes without flag are captured but unverified.
- Prior knowledge entry passed to Claude as context for learning map
  generation, quick corrections, source suggestions, and first check.
- Knowledge checks are phase wrap-up tools. Never auto-triggered at
  session start.
- Audit my Learning ≠ Scoped Ask. Audit asks “are my notes correct
  and complete?” not “what do my notes say?”
- Learning map sub-topics become tags or child structure nodes notes
  attach to. Enables “show me everything I learned about Gray code
  across all learning projects” as a corpus query over time.
- Source material attention cues require content access. Imported
  documents: achievable. Linked URLs: requires fetching. AI-suggested
  resources: model generates cues from domain knowledge.

**What progress feels like:**

Two measures, both present in a complete session:

*“I can point to at least one specific thing I learned today.”*
Nameable. “I now understand what Gray code is and why it reduces
counting errors at position boundaries.”

*“I am measurably closer to a well-defined end point.”* Unique to
learning mode. Research has no finish line. Narrative has a moving
self-defined finish line. Learning has a real, measurable finish line
set during onboarding. Checking a sub-topic box is evidence of real
closure.

Setup sessions have their own valid close-out: “Tomorrow I know exactly
what I’m doing and where to start.”

-----

### 5.5 Cross-mode session 1 comparison

|                          |Research                              |Narrative                                            |Learning                                                       |
|--------------------------|--------------------------------------|-----------------------------------------------------|---------------------------------------------------------------|
|**Emotional texture**     |Intellectual openness                 |Creative energy + fear of forgetting                 |Purposeful, slightly anxious                                   |
|**Onboarding captures**   |Topic, goals, prior knowledge, sources|Title, type, characters, themes, events, gut feelings|Topic, motivation, prior knowledge (diagnostic), goals, sources|
|**First workspace action**|Surfaces corpus matches               |Opens creation surfaces + dump tool                  |Quick corrections + learning map                               |
|**First user reach**      |Corpus triage                         |Narrative dump or node creation                      |Review learning map                                            |
|**Scratchpad role**       |Exploratory, planning                 |Ambient, stream-of-consciousness                     |Intentional, reaction-to-material                              |
|**Bridges**               |Quiet in session 1                    |Present but not prominent                            |Hidden by default                                              |
|**Scoped Ask**            |Low utility until corpus exists       |Full-corpus toggle more useful                       |Replaced by Audit my Learning                                  |
|**Progress metric**       |Tomorrow will be easier               |Something in my head is now real                     |I can name one specific thing I learned                        |
|**Finish line**           |Open horizon                          |Self-defined, moves                                  |Real, measurable, visible always                               |
|**Session close framing** |“What did you accomplish?”            |“What surprised you?”                                |Specific learning + sub-topic count                            |

-----

### 5.6 Open problems requiring design decisions before Phase 10

**Open problem 1 — Source materials for learning mode (CRITICAL)**

A learning map without mapped source materials is a curriculum without
textbooks. The system cannot generate a great learning plan and say
“good luck finding materials.” Highest-priority open problem in learning
mode.

Options:

- AI-suggested free resources mapped to each phase
- User-supplied materials with AI attention cue generation
- Hybrid: AI suggestions as starting point, user supplements

Attention cue specificity constraint: cues need to target both the
source content and the user’s current knowledge gaps. For linked URLs
this requires content fetching — a new backend capability. For imported
documents it is achievable via the existing ingest pipeline. Needs a
dedicated ADR before Phase 10.

**Open problem 2 — Manuscript as evolving source in narrative mode**

The standard source model assumes a stable, finished document. A
manuscript in active development is one massive, constantly changing
artifact. Relationship is inverted — the manuscript is built with the
notes, not extracted from. Specific problems: finding a specific
location (light motif in 100+ pages), source changing under links,
bidirectional note-to-manuscript relationship. Possible directions
named in §5.3 but not resolved.

**Open problem 3 — Full-corpus vs. project-scoped Ask toggle**

In narrative mode early sessions, “What in my full corpus touches on X?”
is more useful than project-scoped Ask. Needs an explicit scope toggle:
project only / full corpus / both. New feature not in any existing ADR.
Needs design decision before Phase 9 Slice builds the workspace Ask bar.

**Open problem 4 — Synthesize access to fleeting notes**

In early research sessions, fleetings may be all that exists. A session-
scoped Synthesize on fleetings (“what did I capture today, synthesized”)
would be valuable. Currently Synthesize is permanent-only. Needs a
decision: add session-scoped fleeting synthesis variant, or accept the
early-session limitation.

**Open problem 5 — Act containers in narrative timeline**

Acts are spans (start + end position + label), not point events.
Current `event_timeline_positions` handles point events only. A separate
span representation is needed. Options: new `act_spans` table, or
start/end fields on a special act node type. Schema decision required
before Phase 9 Slice 4 builds the timeline component.

-----

### 5.7 Decisions made during session 1 design exercise

- **Session scope required in narrative mode onboarding.** Defaults to
  “Exploratory” if skipped.
- **Narrative session wrap: “What did you work on, and what surprised
  you?”** Scope drift is legitimate creative progress.
- **Empty panels hide rather than display emptiness.** Applies to corpus
  matches (research), bridges (all modes), coverage map (early sessions).
- **Bridges hidden by default in learning mode.** Available via explicit
  action only. Never auto-surfaced.
- **Learning coverage map is source coverage in early sessions,**
  transitions to note coverage as corpus matures.
- **Quick corrections are not audited.** Audit triggered only by manually
  entered user notes.
- **Knowledge checks are phase wrap-up tools.** Not session start tools.
- **Parallel timelines nameable before events are placed.**
- **`learning_verified` flag on permanent notes** set by Audit
  confirmation.
- **Dismissed corpus suggestions tracked per project** to prevent
  re-surfacing the same note across sessions.

-----

## Part VI — Lore and Scene Context View

*Derived from a structured design exercise (2026-05-16) walking through
five questions about lore capture, organization, in-session access, in-
context editing, and the mature-project experience. This section covers
the lore node type, the lore library surface, Scene Context View, and
the NodeInteractionPopup — all specific to narrative mode.*

-----

### 6.1 What lore is and why it needs its own surface

Lore is the invisible architecture of a story world — the history, power
structures, world rules, social fabric, and secrets that explain why
everything is the way it is. It is distinct from the other narrative
node types:

- **Characters** answer: who is this person?
- **Locations** answer: what is this place?
- **Themes** answer: what does this mean?
- **Events** answer: what happens?
- **Lore** answers: why does this world work this way?

Lore is the most cross-cutting node type in the system. A single lore
note may explain a character’s psychology, a location’s atmosphere, a
power dynamic, and the backdrop against which a dozen scenes play out
simultaneously. It is causal and connective in a way no other node type
is.

The reader may never see lore explicitly. The writer needs it to make
every scene feel inevitable rather than arbitrary. The app’s job is to
make lore easy to capture, easy to organize, and always surfaced at the
right moment — without the writer having to remember it consciously.

-----

### 6.2 Lore categories

Lore notes are categorized at capture time (or during organization).
Six categories, ordered from most-universal to most-specific:

**World Rules** — the physics, metaphysics, or social contracts of the
universe. Things that simply are. “Some people live in the dream world
forever.” “The all-mighty Splongletgorpe exists outside time but within
space.” These govern everything; they sit at the top of the lore
hierarchy.

**History** — things that happened before the story begins that shape
the present. “Riots ruined the city 25 years ago and the government
blocked organized rebuilding.” “The underground started as a grief
support network before government surveillance radicalized it.”

**Power Structures** — who controls what and why. “The government uses
surveillance to suppress organized resistance.” “Vincent’s organization
operates through layers of deniable contractors.”

**Social Fabric** — norms, culture, religion, class, the texture of
daily life. “Mass surveillance has driven a group of people off the
grid.” “The underground would never be so obvious with their rebellion.”

**Character Backstory** — causal history specific to a character.
“Vincent is ruthless because he is compensating for perceived slights
from three decades ago.” “Ian and Vincent went to college together 30
years ago, which Michael doesn’t discover until after Ian is killed.”
These attach to character nodes via edges.

**Secrets** — things that are true but unknown to certain characters,
including the reader at story start. The Ian/Vincent college connection
is a Secret until it’s revealed. Secrets have a *known-to* field
listing which characters are aware of them at any given point.

-----

### 6.3 Lore note fields

**Minimum viable capture (fast path):**

- Text blob (the lore itself)
- Category (single tap — World Rule / History / Power / Fabric /
  Backstory / Secret)
- Free tags (e.g., “underground”, “government”, “riots”)

No more structure required at capture time. Speed is the priority.
The category is enough to prevent chaos across multiple sessions of
lore dumping. Everything else is filled in during an organization pass.

**Full lore note (organization pass):**

- Text blob
- Category
- Free tags
- **Visibility** — Reader-known (reader learns this in the story) /
  Reader-inferred (a careful reader figures it out; never stated) /
  Author-only (writer knows this, it shapes everything, it never
  surfaces explicitly). This is a field no other writing tool tracks.
  Author-only lore is often the most important — the internal logic
  that makes a character’s every decision feel motivated without
  the motivation ever being named.
- **Temporal tag** — Past (before story begins) / Present (concurrent
  with story) / Future (revealed later) / Timeless (world rule that
  simply is)
- **Edges** — to characters, locations, events, acts, themes, and
  other lore notes
- **Timeline anchors** — edges to specific events or acts where this
  lore becomes load-bearing or visible in the story

-----

### 6.4 Lore capture flow

Lore capture is closer to fleeting note than intentional capture.
Speed is the priority. The lore capture trigger should be available
from within the narrative workspace without navigating away — a
keyboard shortcut or persistent “Add lore” button.

**From the workspace:** trigger → text field → category selector
(single tap) → optional free tags → submit. Three taps and a text
entry.

**From the terminal:**

```bash
con --project fire-stoker --lore history   "The underground started as a grief support network after the riots,
   radicalized by government surveillance"
```

Lands as a History-category lore note, unreviewed, tagged to the
project. The category is captured at the moment of insight — when it’s
most obvious — not reconstructed later.

**From mobile:** same as workspace, optimized for thumb reach. The
category selector is a horizontal scroll of large tap targets, not a
dropdown.

-----

### 6.5 Lore organization pass

The organization pass is a deliberate session activity, distinct from
capture. “Done” for a lore note means:

1. Category confirmed
1. Key edges built — to characters, locations, events, themes, and
   other lore notes that this lore touches
1. Timeline anchors set where applicable
1. Free tags pruned — tags placed as connection reminders at capture
   time are removed once the actual edges exist. Tags were scaffolding;
   edges are the structure.
1. Visibility field populated
1. The note sits visibly in its grouping context in the lore library

**The RAG barometer:** a lore note is truly done when asking the RAG
agent a question about it returns a meaningful answer — where it
touches the story, which characters it affects, how it shapes the
world. If the answer is thin or generic, the note needs more edges or
more content. If the answer is specific and connected, the note is
doing its job.

**Lore audit feature:** a “Test this lore note” button that runs a
scoped Ask against the note and its connections, returning a brief
assessment of whether the note is connected enough to be useful. The
narrative equivalent of Learning mode’s Audit my Learning. Same
principle: immediate feedback on whether the work is connected enough
to serve its purpose.

**Organization pass activities in rough priority order:**

1. Edge building (primary work)
1. Category confirmation
1. Contradiction check via Ask (“do any of my lore notes contradict
   each other?”)
1. Timeline anchoring
1. Tag pruning
1. Cross-domain connection check (“what in my broader corpus connects
   to this concept?”)

-----

### 6.6 The lore library view

The lore library is the center-panel surface for the World navigation
item in the narrative workspace. It is distinct from Locations (which
has its own surface).

**Layout:** hierarchical grouping by category — World Rules at top
(most universal), then History, Power Structures, Social Fabric,
Character Backstory, Secrets. Within each category, notes are cards
sortable by recency, temporal tag, or connection count. The hierarchy
is the default reading order but user-reorderable.

**Filters:** category, visibility (author-only / reader-known /
reader-inferred), temporal tag (past / present / future / timeless),
character (show only lore connected to a specific character), location
(show only lore connected to a specific location).

**“What does this character know?” filter:** show only lore that a
given character is aware of at a given point in the story. A display
filter over visibility and character knowledge edges. Michael at
chapter 3 doesn’t know about the Ian/Vincent college connection — the
lore note exists in the world, it’s just outside his knowledge radius.

**Lore consistency check:** an Ask-powered affordance in the lore
library header. “Check for contradictions” runs a scoped synthesis
across all lore notes and surfaces conflicts. “Your technology lore
says mass surveillance is total, but your character note says The
Underground communicates via physical dead drops — is that a
contradiction or a feature?” This is what a thoughtful editor would
ask; the graph makes it answerable.

-----

### 6.7 The EXPLAINS edge type

The current edge vocabulary lacks a clean way to express lore
relationships. SUPPORTS is directionally wrong (lore doesn’t support
a theme the way evidence supports a claim — it explains why the world
produces the conditions for the theme). ELABORATES implies zooming in
on an existing thing; lore often explains why the thing exists at all.

**New edge type: EXPLAINS**

- A → B: A provides the causal backstory or world-rule context for
  B’s current state.
- “Riots lore note EXPLAINS the city’s ruined atmosphere.”
- “Vincent’s wound lore note EXPLAINS his ruthlessness character trait.”
- “Underground-as-grief-network lore EXPLAINS why The Underground’s
  communication patterns feel like mourning rituals.”

EXPLAINS is directional: the lore note explains the story element, not
the reverse. It is distinct from SUPPORTS (evidential), ELABORATES
(zoom-in), and BUILDS_ON (extends a framework). It specifically names
the causal relationship between background world-building and
foreground story elements.

This edge type should be added to the EdgeType enum when lore ships,
alongside the existing vocabulary. It belongs to the narrative-specific
set alongside FOLLOWS_FROM.

-----

### 6.8 Scene Context View

**The most important feature in narrative mode.**

Scene Context View is a dedicated writing companion surface that
assembles everything relevant to a specific scene in one place,
designed to sit beside an external text editor in a vertical split.

**Core design principle: the order of creation is invisible.**

It doesn’t matter when a lore note was written relative to the scene
placeholder. When you open a scene in Scene Context View today, the
view assembles from the current state of the graph — not from what
existed when the scene was created. A scene sketched eight weeks ago,
before most of the lore was written, opens today showing all the lore
that has since been connected to its characters and location. The
scene feels continuous with the world as it currently stands. The
writer never has to “catch up” a scene to the current world state —
the graph does it automatically.

**This is called live graph assembly.** Scene Context View is a live
query, not a cached view. Every open asks the graph: “given this scene,
what is connected right now?” The answer changes as the world grows.
The view grows with it.

**The design mantra for Scene Context View: never research your own
work.** Every design decision about what to surface and how should be
evaluated against this standard. If the user has to search or browse
to find something relevant to their current scene, the feature hasn’t
done its job.

**What surfaces automatically when a scene is opened:**

*Characters in this scene* — with one-click drill-down to their full
sheet. Tension-relevant details surface without the user having to
remember them. “Ian and Vincent have a history Michael doesn’t know
about” is visible because the edge exists between those character
nodes.

*Location and its lore* — the location node plus all lore notes
connected to it via EXPLAINS or other typed edges. The harbor’s
history as a grief network meeting place surfaces here because the
edge exists between the lore note and the location node.

*Active themes and motifs* — themes tagged to this scene with their
canonical usage notes. “Light as truth” in a scene under fluorescent
lights — the theme node’s canonical note reminds the writer what that
light is supposed to mean in this moment.

*Parallel storyline context* — which timeline thread this scene belongs
to, what came immediately before and after in discourse order, what
is happening simultaneously in parallel threads.

*Story arc notes* — any notes about what this scene is supposed to
accomplish narratively. “This is where Michael first suspects something
is wrong but can’t name it.”

*Lore relevant to this scene* — lore nodes connected to any of the
characters or locations in play. Surfaces by graph proximity, not
manual curation. The underground-as-grief-network lore appears because
the location is connected to it.

*World rules* — always available but collapsed by default by session
number. Early sessions: prominent. Session 20: collapsed with a quiet
“tap to expand” affordance. “By now you’ve probably internalized these
— they’re still here.” The app acknowledges that internalization
happens without making the writer feel the rules have disappeared.

**Relevance weighting:**

Some connections are more load-bearing for a scene than others. Rather
than asking the writer to manually rate relevance, the graph topology
provides it:

- **Strong** — edges directly connecting to scene elements
  (characters, location, themes explicitly tagged to this scene)
- **Moderate** — one hop away (lore connected to the location,
  backstory connected to a character present)
- **Background** — world rules (always ambient, rarely urgent)

No manual rating required. The graph structure does the weighting.
The writer sees what’s most relevant without having to curate it.

**Workspace reconfiguration for Scene Context View:**

When Scene Context View is entered, the three-panel layout shifts:

- Left panel: scene’s connected elements (characters, location, lore,
  relevance-weighted)
- Center panel: focused reading surface for drilling into any element
  (click a character → see their sheet in center; click a lore note →
  see full text and connections)
- Right panel: arc notes, parallel thread context, world rules
  (collapsed)

The scratchpad is minimized but accessible — the writer is working in
their external editor, not here. The workspace is the context layer,
not the writing surface.

-----

### 6.9 The NodeInteractionPopup

**A universal component, not a Scene Context View-specific feature.**

When the writer is in Scene Context View and notices a missing
connection — a lore note that should connect to a character but
doesn’t — they need to add it without breaking writing flow.

**Interaction model:** Ctrl+click (desktop) or tap-and-hold (mobile)
on any node anywhere in the app opens the NodeInteractionPopup — a
focused overlay giving full access to standard node tools:

- Edit content (full text)
- Add/remove tags
- Create edges (with edge type selector)
- Change category (for lore nodes)
- View existing connections

Submit closes the popup. The underlying view updates without a full
reload. The writer is back in context within seconds.

**The containment rule:** if the change fits in the popup, do it here.
If it doesn’t — if the lore note needs a full organization pass, or
the character sheet needs a complete rebuild — that’s a signal to
navigate to the dedicated surface. The popup is not trying to be the
full workspace. It is “quick change, get back to writing.”

**Universal deployment:** the NodeInteractionPopup works anywhere a
node is referenced in the app:

- Scene Context View (primary use case)
- Graph view (edit a node without leaving the graph)
- Timeline (edit an event node inline)
- Corpus matches panel (edit an accepted note without navigating)
- Search results (edit directly from results list)
- Lore library (edit a lore note without opening its full view)
- Bridges panel (edit either endpoint of a bridge)

This is the editable counterpart to the existing NotePreviewPopover
(ADR-039). The preview popover is read-only on hover; the
NodeInteractionPopup is editable on Ctrl+click. They share a visual
language — same positioning, same panel style — but serve different
intents.

One component, built once, deployed everywhere. This is a
significant quality-of-life improvement across the entire app, not
just narrative mode.

-----

### 6.10 Narrative workspace navigation

With lore, Scene Context View, characters, locations, themes, and
the timeline all as first-class surfaces, the narrative workspace
navigation is:

**Primary navigation (sidebar within narrative mode):**

- Write — scratchpad, free-writing pad
- Timeline — event sequence, act structure, discourse order, parallel
  lanes
- Characters — character sheets (list → detail)
- World — lore library (history, rules, secrets, power, fabric)
- Locations — location sheets with spatial relationships
- Themes — theme nodes with sub-themes and corpus connections
- Scene Context — enter from any scene node; reconfigures the workspace

**Navigation principle:** these are sections of one workspace, not
separate pages. The three-panel layout persists across all sections.
The ambient intelligence panels (right panel) stay visible regardless
of which section is active — open questions, theme activity, session
activity are always accessible.

**Scene Context View** is entered from the Timeline (click a scene →
“Enter Scene Context”) or from any event node (click → “Open in Scene
Context”). It is not a navigation item itself — it’s a mode triggered
from a specific scene.

-----

### 6.11 Design principles captured from lore exercise

- **Lore capture is fast; lore organization is deliberate.** Two
  distinct modes. The UI honors both without conflating them.
- **Category at capture, edges at organization.** The category tag
  is the minimum viable structure for keeping lore navigable across
  sessions. Edges are built when there is time and attention.
- **Free tags as scaffolding, edges as structure.** Tags placed at
  capture time as connection reminders get pruned once edges exist.
- **The RAG barometer.** A lore note is done when the RAG agent can
  answer meaningfully about its impact on the story.
- **The order of creation is invisible.** Scene Context View assembles
  from current graph state, not creation order. A scene sketched before
  its world existed opens today showing the full world.
- **Never research your own work.** The design mantra for Scene Context
  View. If the writer has to search to find something relevant to their
  current scene, the feature has failed.
- **Live graph assembly.** Scene Context View is a live query over
  current graph state. It grows as the world grows.
- **The NodeInteractionPopup is universal.** Built once for Scene
  Context View, deployed everywhere a node appears in the app.
- **Visibility is a first-class field.** Author-only lore — the
  internal logic that makes everything feel motivated without being
  stated — is a category no other tool tracks. It matters and it
  deserves explicit representation.

-----

## Part VII — Character Sheets

*Locked in from design conversation 2026-05-16. Standard character sheet
content restructured for graph-native representation. The fields are
familiar; the architecture is what makes this different from every other
character sheet tool.*

-----

### 7.1 Philosophy

A Constellation character sheet is not a document — it is a node in a
queryable knowledge graph with a living relationship to everything else
in the story. Every relationship is an edge. Every lore connection is
an edge. The character’s arc is a series of state notes attached to
timeline events. What the character knows at any point in the story is
derivable from their knowledge edges filtered by discourse position.

The question “what does Michael know at the end of Act 2?” has a real,
computable answer — not because someone maintained a spreadsheet, but
because the graph holds the information structurally.

**The two properties that make this character sheet genuinely different
from every other tool:**

1. **Visibility per field.** Not just for the whole character but for
   individual attributes. Michael’s fear of open water is Author-only
   throughout — it shapes his behavior in every harbor scene without
   ever being named. Tracking visibility at the field level makes the
   AI significantly smarter about what to surface in Scene Context View
   and what to hold in the background.
1. **The character as a graph node.** Relationships are edges, not text
   blocks. Lore connections are edges. Arc changes are state notes
   attached to timeline events. The character sheet is always current
   because the graph is always current.

-----

### 7.2 Field structure

Character sheet fields are divided into four types based on how they
are stored and how they behave in the graph:

**Type A — Scalar attributes** (stored on the character node itself,
not as separate nodes)

These are properties that are unlikely to grow, connect to other
things independently, or be referenced by other parts of the graph.
Fast to fill in, low graph overhead.

- Name
- Age (or approximate age / era)
- Gender / pronouns
- Physical appearance (brief — striking features, build, presence)
- Distinguishing marks or physical details
- Archetype (Protagonist / Antagonist / Supporting / Other / Complex)
- Narrative function (what role does this character serve in the plot)
- Visibility (Reader-known / Author-only / Partially revealed —
  applies to the character’s existence in the story, not individual
  fields)

**Type B — Rich text fields** (stored as permanent nodes with edges
back to the character)

These are substantial enough that they may grow, evolve over multiple
sessions, connect to other nodes (themes, lore, other characters), or
be referenced independently. Each becomes a permanent node with a
COLLECTS edge from the character node.

- *Core wound* — the formative damage that drives behavior. Often the
  most important single field and the most likely to connect to lore
  nodes via EXPLAINS edges.
- *Desire* — what the character consciously wants.
- *Need* — what the character actually needs (often in tension with
  desire).
- *Fear* — what they are avoiding. Shapes avoidance behavior in scenes.
- *Internal contradiction* — the tension inside the character that
  produces dramatic irony. “Michael wants connection but behaves in
  ways that isolate him.”
- *Backstory summary* — a narrative overview of formative history.
  Distinct from lore backstory nodes (which are causal world-building);
  this is the character’s experienced history in their own terms.
- *Voice and speech patterns* — how they talk, what they reveal and
  conceal in language, vocabulary level, what they say vs. what they
  mean. Particularly useful for writers who struggle with characters
  sounding alike.
- *Physicality* — how they move, occupy space, gesture, carry
  themselves. Not just appearance but presence.
- *Author instructions* — craft notes to the writer about this
  character. “Vincent should never read as sympathetic in scenes where
  Michael is present.” “Michael’s tell when lying: looks at light
  sources.” These are not facts about the character — they are
  instructions to the writer. A distinct field type, visually
  differentiated from character facts in the sheet UI.

**Type C — Relationship edges** (stored as typed edges to other
character nodes, location nodes, or lore nodes)

In a standard character sheet these are a “relationships” text block.
In Constellation they are edges — queryable, typed, annotated with
why the relationship exists and what the character knows about it.

- Character-to-character relationships: edge type carries semantic
  meaning (SUPPORTS, CONTRADICTS, ANALOGOUS_TO, INSPIRED_BY between
  characters). Edge note explains the relationship.
- Visibility per edge: “Michael doesn’t know about the
  Ian/Vincent college connection” is a visibility flag on that edge,
  not a separate field. The relationship exists in the graph; it’s
  just outside Michael’s knowledge at a given point.
- Location attachments: characters have meaningful connections to
  places (grew up in, works at, avoids). These are edges to location
  nodes, not text.
- Lore connections: the character’s backstory often connects to lore
  nodes via EXPLAINS edges. Vincent’s core wound connects to the lore
  note about his history with Ian. Keeping these as edges means the
  lore is cross-referenceable — the Ian/Vincent connection is both
  character backstory and a secret that affects the plot.

**Type D — Corpus connections** (edges to nodes outside the story
project entirely)

The character in dialogue with the writer’s broader knowledge base.

- ANALOGOUS_TO edges to research permanents (Jung’s shadow archetype,
  historical figures with similar psychological profiles)
- INSPIRED_BY edges to literature notes (a character from another
  work, a real person who inspired this one)
- ELABORATES edges to philosophical permanents that theorize this
  type of person

These connections surface in Bridges and Ask queries. They are what
make Constellation’s character sheets intellectually alive in a way
no dedicated writing tool can offer.

-----

### 7.3 Visibility per field

Every Type B rich text field and every Type C relationship edge carries
an individual visibility flag:

- **Author-only** — the writer knows this; it shapes everything; it
  never surfaces explicitly in the text. Michael’s fear of open water.
  Vincent’s specific wound. The AI uses this in context assembly but
  does not present it as reader-known information.
- **Reader-inferred** — a careful reader figures this out; it’s never
  stated directly. The tension between Vincent and Ian is inferable
  from their scenes together before the revelation.
- **Reader-known** — the reader learns this during the story. Michael
  and Leon’s first meeting. The revelation of the college connection.
- **Revealed at** — for fields that transition from hidden to known at
  a specific story moment, an optional edge to the event or act where
  the reveal happens.

The AI uses visibility flags in Scene Context View to determine what
to surface prominently (reader-known fields for the current story
position) vs. what to hold in the background (author-only fields that
are context but not content).

-----

### 7.4 Arc tracking (Option A — arc notes as timeline edges)

Character sheets are static snapshots; stories are dynamic. Characters
change. Michael in Act 1 is not the same person by Act 3.

**The approach:** arc notes are permanent nodes attached to the
character with edges to specific timeline events where the change
occurs.

Example: “After the harbor scene, Michael loses his certainty about
Ian. His trust trait shifts from active to damaged.” This is a
permanent node with:

- A COLLECTS edge from the Michael character node
- An edge to the harbor scene event node (the change is anchored to
  the moment)
- A `trust` tag linking it to the relevant trait
- A temporal position (Act 2, Scene 4) so it’s queryable by story
  position

**The character sheet arc view:** the base state (all fields as of
story start) plus a chronological list of arc notes. The arc notes
form a timeline of who this character becomes.

**The “who is Michael at Act 2 end?” query:** filter arc notes by
discourse position ≤ Act 2 end. The base state plus all arc notes up
to that point is the answer. No manual state management required —
the graph derives it.

**Future direction (Option B — versioned states):** explicit character
state snapshots keyed to acts, enabling richer “character at point X”
queries. Significantly more complex. Deferred until Option A’s
limitations become a bottleneck in practice.

-----

### 7.5 Character sheet UI

**Capture flow (fast path):**
Name + archetype + one-line role description. That’s enough to place
the character in events on the timeline. Everything else is filled in
during character-building sessions.

**Character sheet layout:**

- Header: name, archetype tag, narrative function, visibility
- Scalar attributes section: age, appearance, distinguishing marks
  (compact, attribute-style display)
- Core fields section: core wound, desire, need, fear, internal
  contradiction — these are the heart of the sheet, given the most
  space
- Voice and physicality section
- Author instructions section: visually distinct from character
  facts — different background color or left border treatment to
  signal “this is for the writer, not about the character”
- Relationships section: edge list with character name, edge type,
  visibility flag, and edge note. Add relationship inline via the
  NodeInteractionPopup or the edge creation UI
- Arc notes section: chronological list of state changes with event
  anchors
- Corpus connections section: ANALOGOUS_TO, INSPIRED_BY, ELABORATES
  edges to the broader knowledge graph

**From Scene Context View:** the character sheet opens in the center
panel on click. Core wound, desire, fear, and author instructions are
always visible. Other sections are collapsible. The most relevant arc
notes for the current scene position (based on discourse order) are
surfaced at the top of the arc section — the writer sees who this
character is *right now in the story*, not who they started as.

-----

### 7.6 The con – capture path for character notes

Character insights often arrive outside of formal sessions. The
terminal and mobile capture paths should support structured character
note creation:

```bash
# Add a character note (lands in character's pending notes)
con --project fire-stoker --character michael   "Recurring tell: looks at light sources when lying to himself"

# Add a relationship
con --project fire-stoker --character michael   --relates-to ian --edge-type SUPPORTS   "Michael trusts Ian implicitly at story start — this is the trust
   that makes Ian's death devastating"
```

Both land as pending additions visible in the character sheet on next
session open. The writer reviews, promotes to the appropriate field
or edge, or discards. Low friction at capture time; deliberate
integration at organization time.

-----

### 7.7 Design principles for character sheets

- **Familiar fields, graph-native structure.** Every field is
  recognizable from standard character sheet templates. What changes
  is how they’re stored and connected — not what they contain.
- **Rich fields are nodes, scalar fields are attributes.** The line:
  anything that could grow, connect to something else, or be referenced
  independently deserves to be a node. Everything else is an attribute.
- **Author instructions are a first-class field type.** Visually
  distinct from character facts. The writer’s notes to themselves about
  how to handle this character are not character biography — they are
  craft guidance.
- **Visibility per field, not per character.** Individual attributes
  and relationships carry their own visibility flags. The AI uses these
  to calibrate what to surface in Scene Context View.
- **Arc notes are the character over time.** The base sheet is a
  starting point, not a fixed description. Arc notes attached to
  timeline events record who the character becomes.
- **Relationships are edges.** A “relationships” text block is
  unqueryable. Typed edges with visibility flags and context notes are
  the structure that makes “what does Michael know about Vincent at
  Act 2?” answerable.

-----

## Revision history

|Date      |Change                                                                                                                                                                                                                                                                                                          |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|2026-05-16|Initial document created from design conversation                                                                                                                                                                                                                                                               |
|2026-05-16|Added §3.2 Use case 5 (structured learning checks) and §3.3 (learning history and learner profile), including schema sketch and recommendation generation philosophy                                                                                                                                            |
|2026-05-16|Marked §3.5 workspace mode decision as resolved: Option A confirmed, mode sets defaults not gates, cross-mode feature sharing explicit                                                                                                                                                                          |
|2026-05-16|Added Part III.B — Intentional Work Sessions: session lifecycle, explicit-first start with 15-minute implicit safety net, session history as project journal, next-session brief, schema                                                                                                                        |
|2026-05-16|Expanded §IIIb.6 schema: added session_nodes and session_edges join tables; added session bypass mechanism (opt-out toggle, –no-session CLI flag, session_tagged column rationale); added §IIIb.7 creation timeline view                                                                                        |
|2026-05-16|Added Part V — Session 1 Profiles: full three-mode profiles, cross-mode comparison table, five open problems (including critical source material problem for learning mode), session 1 design decisions                                                                                                         |
|2026-05-16|Resolved all five open problems in §5.6: source materials (ADR-070), manuscript handling (ADR-071), Ask scope toggle (ADR-068), session fleeting synthesis (ADR-069), act spans (ADR-072)                                                                                                                       |
|2026-05-16|Added Part VI — Lore and Scene Context View: lore categories, fields, capture flow, organization pass, lore library, EXPLAINS edge type, Scene Context View (live graph assembly, “never research your own work”), NodeInteractionPopup (universal component), narrative workspace navigation, design principles|
|2026-05-16|Added Part VII — Character Sheets: field structure (scalar/rich/edge/corpus types), visibility per field, arc tracking (Option A confirmed), character sheet UI, con capture path, design principles                                                                                                            |

*Update this table when significant sections are added or revised.*