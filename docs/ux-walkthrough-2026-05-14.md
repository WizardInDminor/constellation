# Constellation: three-scenario UX walkthrough

*Captured 2026-05-14. A roleplay exercise: imagine being a long-time user
six months in, with ~600 permanents, ~150 literature notes attached to
~80 sources, ~25 structure notes, ~40 tags, and edges in the low thousands.*

---

## Scenario 1 — A normal day of use

### What I do

7:30 AM, on the phone over a coffee. Idea hits → iOS Shortcut **Capture Idea**
→ lands in inbox. Good. No friction.

8:30 AM, at the laptop. I open `localhost:3000`. Home dashboard shows tile
counts and "Last processed: 14h ago." I see the Inbox tile is amber: 6 items.
Click into **Inbox**. Six fleeting cards, oldest at top. I pick one, click into
**Process** (`/inbox/process/[id]`), read Claude's 2–3 suggested permanent
candidates, accept one with a small edit, regenerate once, then mark
processed. Repeat for two more inbox items, then bail because grinding through
six is fatiguing.

I switch to my project hub. To find it I either remember the title and type
into **Notes** filter, or use **Search**. Let's say I go to Notes, filter by
`structure` type — eight structure notes, no other context. I click the right
one. From its detail page, I follow the **Outgoing edges** sidebar into linked
permanents.

While reading, I hit **Ctrl+K** to capture a fleeting thought. Modal up, type,
submit, dismiss. Five seconds. This is the sharpest interaction in the app.

Later: I want richer context on a thought. **Ctrl+Shift+Space** → intentional
capture modal. Tag, attach a source, save as permanent. Heavier (a dozen
fields), correct for the moment.

Mid-afternoon I open **Graph** to look at shape. Force-directed layout, type
filters in the bar. I hover nodes for previews, shift-click two and apply a
tag to both. I press **E** on a node and click its target to make an
`ELABORATES` edge.

End of day: **Discover** → **Bridges** tab. Three pairs flagged as semantically
close but unlinked. Click a pair; slide-out shows both notes; ask Claude to
classify the relationship; apply the suggestion as an edge.

### Inefficiencies and UX pains

1. **No "today" view.** Home is a static dashboard. I never see "What did I
   capture today / this week? Which notes did I touch? Which were linked?"
   Inbox shows un-processed fleeting only — not yesterday's permanents.
2. **No project surface.** Structure notes are *implicitly* projects, but the
   app doesn't let me work *inside* a project. I bounce between Notes (filter
   by tag), Graph (filter by tag), Synthesize (scope-build by tag), each
   rebuilding the same membership.
3. **Capture has no project context.** Ctrl+K is title+content only. If I'm in
   a 90-minute focus block on the Eurorack build, every fleeting needs the
   same tag later. A "current project" session would eliminate that.
4. **Inbox is FIFO.** No grouping, no bulk actions, no "show me only the
   captures about Eurorack." Six items feels like grinding; thirty feels like
   a chore.
5. **Edge creation from outside the graph is slow.** From `/nodes/[id]`:
   + Edge → NodePicker search → pick type → note → submit. ~5 interactions.
   Graph's `E`-then-click is faster but only when both nodes are already on
   screen together.
6. **No keyboard nav beyond two shortcuts.** No quick-switcher (`Ctrl+P`–style),
   no `g i` → inbox, no `j/k` walking.
7. **Tags are flat strings.** No hierarchy. So I either invent compound tags
   (`eurorack-seq`, `eurorack-firmware`) or accept noise.
8. **Discover is reactive.** It surfaces orphans/stale/bridges only when I
   open it. A morning push ("you have 3 ripe bridges today") would close the
   loop.

### Wishlist

- A **"today/this week" timeline** on Home: captures, links, processed,
  last-touched notes.
- **Project sessions**: a persistent "currently working on X" pill that
  auto-tags subsequent captures and pre-scopes Search/Ask/Synthesize.
- **Inbox grouping** (by content similarity or by suggested tag) and bulk
  discard.
- **Inline edge suggestions** while editing a note ("this looks related to
  X — link?").

---

## Scenario 2 — Coming back to the Eurorack build after 3 weeks

I have ~80 notes tagged `eurorack`: permanents (DSP theory, sequencer state
machines, ADC choices), literature notes attached to datasheets, two
structure notes (hub + open-questions log).

I want a briefing. I try three paths.

**Path A — Search.** `/search` hybrid, query "eurorack sequencer." 15 results,
mixed types and ages, snippet+hover preview. Useful for *finding* but not
*re-orienting*. I'd be re-reading my own notes cold.

**Path B — Ask.** `/ask`. Question: *"Where did I leave off on the Eurorack
sequencer? List open decisions and unfinished work."* RAG runs, returns a
markdown answer with `[Note N]` citations and a provenance panel. Reasonable.
But:

- **Not project-scoped.** Retrieval is global; if a non-eurorack permanent has
  high semantic similarity, it can crowd out a more relevant project note.
  There's no "ask, scoped to tag `eurorack`."
- **Depth=1 only.** If my structure note edges to permanents that edge to
  literature, that literature may not appear unless query similarity reaches
  it directly.
- **No control over output shape.** Ask has no custom-prompt field. To get
  "Decisions / Open Questions / Next Steps" sections, I need Synthesize.

**Path C — Synthesize.** `/synthesize`. Filter pool by tag `eurorack`.
Recency=Any. Pool shows ~47 of my 80 notes (capped at 200 most-recent across
all types). "Add all to scope." Question + custom prompt for structured
output. Generate, save as note.

This is the right tool, but the friction is real:

- **Pool is recency-truncated to 200 across all types.** A 3-month-old
  permanent that hasn't been touched might be excluded *before* the tag filter
  narrows it. Risk: silent omission.
- **No scope templates.** Tomorrow I'll want this scope again for a different
  ask; today I have to rebuild it.
- **Sources are invisible to RAG.** A literature note links to a datasheet,
  but the datasheet's *text* isn't pulled in — only the note about it. If the
  note was thin, the answer is thin.
- **I had to know Synthesize was the right tool, not Ask.** A first-time user
  reaches for the verb "Ask."

### Verdict for Scenario 2

The app *can* re-orient me, but only via Synthesize, and only if I'm willing
to be the carpenter every time. **The inputs and outputs make sense for
one-off knowledge questions; they're under-fitted for project resumption.**

The missing primitive is "**Resume project**": one click that loads a saved
scope, runs a templated briefing prompt, surfaces captures-since-last-visit
+ open-questions structure notes + Discover bridges narrowed to this project.

---

## Scenario 3 — Sci-fi-horror short story

Themes: modern physics + classical mysticism + a recent short story I read.

### What I'd try

1. **Project hub** via `+ Structure note`. Title: *"Short story: entropy and
   the listener at the bottom of the well."* OK.
2. **Inspirations as sources.** The story I read isn't in my corpus.
   Intentional capture has inline source creation — I create a Source
   ("Borges, *The Garden of Forking Paths*", type=book), then a literature
   note about it. Works.
3. **Themes as one-line permanents** tagged `creative-writing`,
   `short-story-draft`: "entropy as judgment", "wavefunction collapse as
   ritual", "the listener archetype." These feel like *prompts*, not
   knowledge — atomic notes don't fit cleanly.
4. **Synthesize a scene.** Scope = the hub + theme notes + literature about
   Borges + a physics permanent on decoherence. Custom prompt: *"Draft a
   600-word opening scene. Tone: dread. Surface the listener motif. Don't
   explain."* Generate. Save.

That last move actually works. Synthesize is, accidentally, the closest thing
the app has to a creative workspace.

### Where it breaks down

- **No free-writing surface.** Prose drafts longer than a paragraph want a
  real editor, ideally side-by-side with the source palette. The node
  `content` textarea is an editor in name only.
- **Atomic notes resist mood.** "Tone: dread" doesn't decompose into
  permanents. I end up with cargo notes — permanents that exist only to feed
  Synthesize prompts.
- **No iterative loop.** Synthesize is single-shot. "Regenerate just paragraph
  3" or "given this draft, write the next scene" — gone.
- **Drafts have no home.** The output of Synthesize is a permanent note (via
  "Save as note"), but a *draft* isn't a permanent — it's a work-in-progress.
  Where does it live?
- **Themes ≠ tags.** A motif is closer to a structural element than a
  category. Tags are blunt for this.

### Do we need another surface?

**Yes — a Project Workspace.** Sketch:

```
┌─ Project: Short story — entropy & the listener ──────────┐
│  [Hub note: live outline + status]                       │
│                                                           │
│  ┌── Pinned scope ───────┐  ┌── Free-writing pad ─────┐ │
│  │ • Hub note            │  │ [markdown editor]        │ │
│  │ • 4 theme permanents  │  │ - autosaves              │ │
│  │ • 2 literature notes  │  │ - "Promote to permanent" │ │
│  │ • 1 source (Borges)   │  │ - "Save as source"       │ │
│  │ [Edit scope]          │  │ - "Synthesize with this  │ │
│  └───────────────────────┘  │   as the seed"           │ │
│                              └──────────────────────────┘ │
│  ┌── Recent in project ──┐  ┌── Bridges within scope ─┐ │
│  │ Captures, edits, …    │  │ Pairs to consider       │ │
│  └───────────────────────┘  └──────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

What this would unlock:

- **Saved scope** (solves Scenario 2's biggest friction).
- **A real writing surface** (solves Scenario 3's missing affordance).
- **Promotion paths** (free-writing → permanent / source / synthesis),
  inverting the Inbox→Process model for prose.
- **Project-scoped Ask/Synthesize/Discover** without rebuilding membership.

The primitives already exist — structure notes, tags, COLLECTS edges, scoped
synthesize, saved answers. **What's missing is the assembly into one coherent
surface.**

---

## Cross-cutting findings

| # | Theme | Where it shows up |
|---|---|---|
| 1 | **Project context is implicit, not first-class** | Scenarios 1, 2, 3 — every flow rebuilds project membership from tags |
| 2 | **Ask is good; project-scoped Ask is missing** | Scenarios 2, 3 |
| 3 | **No free-writing / draft surface** | Scenario 3 |
| 4 | **Inbox is FIFO and lonely** | Scenario 1 |
| 5 | **Source *content* is invisible to RAG; only notes-about-sources are in context** | Scenario 2 |
| 6 | **Discover is reactive, never push** | Scenario 1 |
| 7 | **Keyboard nav stops after Ctrl+K / Ctrl+Shift+Space** | Scenario 1 |
| 8 | **Tags are flat; themes/sub-projects want hierarchy** | Scenarios 1, 3 |

---

## Recommendations, tiered

**Tier 1 — small, leveraged (each ~half-day):**

- Add **tag/recency scope to Ask** (mirror Synthesize's scope-builder,
  collapse by default).
- Add a **scope filter to Discover/Bridges** (tag selector).
- Add **"Recently captured / edited" sections to Home** (last 7 days, by
  type).
- **Quick-switcher** (Cmd+P) over all notes + structure notes.

**Tier 2 — new surface (multi-day, high payoff):**

- **Project Workspace** at `/projects/[hub-id]` (a structure note with a
  scope sidecar). Includes saved scope, project-scoped Ask/Synthesize/
  Discover, project-recent timeline.

**Tier 3 — bigger (re-shapes the model):**

- **Free-writing pad** with promotion paths (draft → permanent | source |
  synthesis). Probably belongs inside the Project Workspace, not as a
  separate top-level surface.
- **Inbox grouping** (suggested tag clusters; bulk discard/tag).
- **Push surfacing**: morning email/notification with bridges + stale + open
  questions.
- **Source content into RAG**: when a literature note's source is a
  markdown/text file, optionally include source excerpts in the RAG context.

---

*Caveat: this is the view from inside daily use. Some pains may be one-edit
fixes that I'm overestimating; some "small" wins may have backend implications
I haven't traced.*
