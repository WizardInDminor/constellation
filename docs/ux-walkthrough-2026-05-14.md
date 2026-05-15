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
│                                                          │
│  ┌── Pinned scope ───────┐  ┌── Free-writing pad ─────┐  │
│  │ • Hub note            │  │ [markdown editor]        │ │
│  │ • 4 theme permanents  │  │ - autosaves              │ │
│  │ • 2 literature notes  │  │ - "Promote to permanent" │ │
│  │ • 1 source (Borges)   │  │ - "Save as source"       │ │
│  │ [Edit scope]          │  │ - "Synthesize with this  │ │
│  └───────────────────────┘  │   as the seed"           │ │
│                             └──────────────────────────┘ │
│  ┌── Recent in project ──┐  ┌── Bridges within scope ─┐  │
│  │ Captures, edits, …    │  │ Pairs to consider       │  │
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

---

## Scenario 4 — Literature review sprint (phase-locked loops)

I've spent two days reading on PLLs — relevant to the Eurorack project's clock
recovery. Five sources in my queue, all as markdown: Razavi's 1996 JSSC paper
on CMOS phase noise, Gardner's 1980 TCOM paper on charge-pump PLLs, a 30-page
chapter from Best's *Phase-Locked Loops* textbook, an Analog Devices AN-1001
app note, and the PLL section of the AD9959 datasheet that I'd extracted by
hand into a clean markdown file.

### What I do

Terminal:

```
$ con import phase-noise-razavi.md \
    --source-title "A Study of Phase Noise in CMOS Oscillators" \
    --source-type article --source-author "B. Razavi"
```

`POST /ingest/document` hits the chunker (`doc_chunker.py`, H2/H3 boundaries,
MAX_CHARS=2400). Browser opens to `/ingest?source_id=…`. ~5-7s end-to-end for
a 12-page paper. The review wizard renders ~8 candidate cards: editable
title, content, summary, default-on Accept checkbox.

I uncheck the abstract and conclusion. I rename one chunk from the chunker's
generic "Phase Noise Model" to "Leeson's equation — physical intuition." One
candidate is 2380 chars and is really two ideas; I'd love to split it but the
UI only edits content, doesn't re-chunk. I paste half into the title-editing
of a sibling candidate. Lossy.

In the **Import options** section: auto-tag `pll`, hub note checkbox on, hub
title pre-filled from source title. I rename the hub to "Razavi 1996 — phase
noise." Click Accept. ~4-6s: source row, ~5 literature notes, hub structure
note, COLLECTS edges. The hub note's content is empty by default — it's just
a parent in the COLLECTS topology, with no TOC, no narrative.

Repeat for Gardner, Best, AN-1001, AD9959. ~40 minutes total. The AN-1001 was
a messy PDF→markdown conversion; the chunker split on stray figure-caption
headings, producing one 4-line chunk and one over-long chunk. I lump-accept
and tell myself I'll clean it later. I won't.

Final state: ~22 new literature notes, 5 sources, 5 hub structure notes,
~22 COLLECTS edges. All tagged `pll`. Zero cross-source edges yet.

**Linking pass.** Open one Razavi note. Click **Suggest links**. ~7-8s Claude
call. Returns 5 suggestions: 2 to other Razavi notes, 2 to Gardner notes, 1
to a year-old permanent of mine on phase detectors. Accept 4. Repeat on ~10
nodes — every call takes ~7-8s, the second pass on Gardner-A surfaces a link
to Gardner-B that I already accepted from Gardner-B's pass. Net: lots of API
time, lots of mental dedup.

For the rest I use the graph. `/graph`, filter `pll`, layout settles in ~2s
at 22+pre-existing nodes (fine at this scale). Press `E`, click target,
ConnectPanel opens — pick edge type, optional note, submit. ~3 clicks per
edge. I add ~15 manual edges this way.

**Edge type vocabulary friction.** Trying to link Gardner's charge-pump
architecture to Razavi's analysis of charge-pump noise. What edge type fits?
SUPPORTS feels too strong (Razavi doesn't *defend* Gardner; he analyzes the
topology Gardner introduced). ELABORATES is too generic. ANALOGOUS_TO is
plain wrong. INSPIRED_BY is closest in spirit but the word feels off for a
direct technical descendant. I pick ELABORATES and move on, but the edge is
under-described.

**Synthesize.** /synthesize, tag=`pll`, recency=Any. Pool of 22, under the
200 cap. Add all to scope. Search-add 4 pre-existing signal-processing
permanents. Final scope: 26. Question: *"Summarize what I now know about
PLLs — fundamentals, noise sources, charge-pump architecture, and a practical
design approach."* Custom prompt: *"Use sections: Fundamentals → Noise model
→ Charge-pump topology → Stability trade-offs → Practical walk-through. Cite
[Note N] freely. ~1500 words."*

~12s. **The output is genuinely good.** Coherent, well-organized, citations
dense in the technical sections, 19 of 26 scope notes cited. I save as note.
The save creates the synthesis as a permanent and auto-links it via
`COLLECTS` edges to each cited node (`rag.py` `save_answer`).

### Inefficiencies and UX pains

1. **Suggest-links is per-node; there's no cluster mode.** Importing a
   22-note cluster, the natural action is "find probable edges within this
   set." Today: ~22 sequential ~7-8s calls with significant overlap. A
   `POST /rag/suggest-links/cluster` taking a list of node IDs (or a tag),
   running once, deduplicating internally, and returning a flat list of
   proposed edges would compress this 20-minute grind to a 30-second review.

2. **Chunker quality is locked at import time.** A chunk that's too long
   (two ideas in one) or too short (a figure caption) can't be re-split or
   merged in the review UI — only the content edited in-place. For PDF
   conversions, this is a frequent failure mode. The fix is a "split here"
   button on the candidate (insert a new candidate with the after-cursor
   content) and a "merge with next" button.

3. **Edge vocabulary is author-stance, not literature-stance.** SUPPORTS /
   CONTRADICTS / ELABORATES describe what one *claim* does to another. For
   literature relationships, the natural verbs are different: BUILDS_ON,
   APPLIES_TO, MEASURES, EXTENDS, REFINES, GENERALIZES. I forced ELABORATES
   and INSPIRED_BY repeatedly, knowing they undercount the relationship.

4. **Hub notes are empty containers.** The auto-created hub is a structure
   note with COLLECTS edges but no content. Ideal would be: Claude proposes
   a TOC ordered by inferred narrative ("start with fundamentals, then
   topology, then noise…"), with a one-line annotation per child note. I
   end up writing this scaffold by hand or leaving the hub empty.

5. **No coverage-density visualization.** After 22 notes I want a glance-view
   answer to "what's covered, what's thin?" The graph shows topology but
   doesn't *label* density. Edges-per-node within a tag, or a heatmap by
   sub-topic, would directly target where to study or import next.

6. **Synthesize over a dense, freshly-imported cluster is a quiet win.**
   When coverage is dense and tag-scoped, retrieval noise collapses and the
   output is consistently coherent. This is the workflow Synthesize is
   *actually* great at. The whole grindy linking + tagging investment pays
   off here in one move.

7. **The saved synthesis has COLLECTS edges to its sources — but the verb is
   wrong.** `save-answer` correctly inserts edges from the new node back to
   each cited node, but uses `COLLECTS` (the structure-note collection
   relationship). A synthesis isn't a collection; it's a *derivation*. The
   verb mismatch muddies graph views: a permanent that "collects" 19 nodes
   looks like a structure-note in topology terms. A DERIVES_FROM or CITES
   edge type would model the relationship more honestly.

8. **No iteration on synthesis.** "Same scope, emphasize noise more and
   topology less" — easy re-prompt. "Regenerate just the noise section" or
   "given this draft, write a 300-word abstract" — impossible. One-shot
   only.

### What this revealed

Dense, freshly-imported, tag-scoped clusters are where Synthesize shines.
The pain is in *getting* to the dense cluster — the import-and-link grind.
Speeding up cluster-building (batch suggest-links, re-chunkable candidates,
literature-shaped edge vocabulary) compounds across every subsequent
synthesis. **The marginal value of new linking primitives is higher than
the marginal value of new generation primitives at my corpus scale.**

---

## Scenario 5 — Writing a blog post on RAG for a smart non-specialist

This is the topic I have the densest coverage on. ~18 permanents on
embedding similarity, RRF merging, FTS5 sanitization, graph expansion,
citation grounding, hallucination control, plus 3 structure notes (RAG
decisions log, RAG pipeline overview, post-mortems). Goal: ~1500 words
of flowing prose, narrative arc, my voice. Audience: knows ML basics,
not RAG.

### What I do

Open `/notes`, filter `rag`. 18 results. Hover-preview a few to refresh
memory. I notice the orphan note "Why we don't stream RAG responses" — six
months old, never linked to anything. Useful flag from the Notes filter
alone.

**Audit pass.** Open `/graph`, filter tag=`rag`. ~18 nodes, ~25 edges. The
layout settles in ~1.5s at this scale. I can read the visual: two tight
clusters (retrieval, generation), three loose outliers, one orphan. The
retrieval cluster has 7 nodes and ~10 internal edges — dense, mature. The
generation cluster has 5 nodes and ~3 edges — same node count, half the
connectivity. I read this as "thinner mental model for generation" — but
that's me eyeballing. The app doesn't tell me.

**Draft via Synthesize.** Add all 18 + the 2 structure notes to scope.
Question: *"Draft a 1500-word blog post for a smart reader who knows ML
basics but not RAG specifically. Use a narrative arc: motivation → mechanics
→ why it works → trade-offs. Flowing prose, no bullet lists. Cite [Note N]
freely."*

~15s. Output: 1820 words. Reads coherently. Citations dense in the retrieval
section, sparse in the generation section — Claude is silently filling in
the thin parts from general RAG knowledge. **I can't tell where my notes
stop and Claude's training takes over** without paragraph-by-paragraph
cross-check against the provenance panel. The provenance is at the
note-level, not the paragraph-level.

Save as note. Open in `/nodes/[id]`. Read.

**Voice mismatch.** My notes are written for memory: "RRF k=60: 60 is an
internet default. Tested k=10,30,60,100 — no meaningful difference at our
scale." The draft reads textbook: "Reciprocal Rank Fusion uses a smoothing
constant k, conventionally set to 60." Accurate, but anodyne. To pull my
voice through I'd need either (a) prose-style notes in scope as voice
samples, or (b) an explicit custom-prompt instruction ("blunt, opinionated,
first-person"). Option (b) works partially — gets the diction closer but
not the rhythm.

**Reader-perspective check.** I want to ask: *"What would a reader find
confusing in this draft?"* The natural verb is `/ask`. But Ask is RAG over
my corpus — it can't ingest "this draft" because the draft only just
exists. So I detour back to `/synthesize`, scope = [the freshly saved
draft note] + 4 foundational permanents, custom prompt: *"Read the draft.
List 8 questions a reader unfamiliar with RAG would have. Don't answer
them — just list them."*

Actually useful output. Questions like *"What does 'hybrid' mean here —
both run, or one with fallback? "*, *"Why FTS5 and not BM25?"*, *"How big
is the corpus you're testing on?"* — questions I'd genuinely want to
address. **But the workflow is a hack.** A "stress-test this note from a
reader's perspective" affordance should be native.

**Iteration.** I want to expand the trade-offs section to address the new
questions. Synthesize is single-shot. Options:
- Manually rewrite the section in-place. The `/nodes/[id]` editor is the
  `EditableField` blur-to-save textarea — usable for one paragraph, painful
  for an 800-word section.
- Re-run Synthesize with a more focused prompt: *"Write only the
  trade-offs section as 400 words, addressing these questions: …"* —
  works, but I have to copy-paste back into the saved draft manually.
- Copy the draft out to `$EDITOR` (vim), edit, paste back via the
  `EditableField` (which has no autosave on programmatic-paste behavior
  I trust).

I do option C. Lossy. The round-trip would be smoother if there were a
"send to $EDITOR" affordance or a real markdown editor mode on
`/nodes/[id]`.

### Inefficiencies and UX pains

1. **Voice mismatch is a soft-but-real failure.** Atomic notes are
   memory-shorthand; Claude defaults to neutral-textbook prose. Custom
   prompts mitigate partially. A "voice profile" mechanism — a structure
   note tagged `voice-sample` that's always included in scope when
   drafting — could be a one-edit fix.

2. **No paragraph-level provenance.** The provenance panel shows nodes
   used; it can't tell me which *paragraph* of the output came from notes
   vs. Claude's general knowledge. For drafting where you publish, this
   is the difference between "my view" and "Claude's view." A
   confidence-or-citation gloss on each output paragraph would help.

3. **No coverage-density audit (again).** The graph hints at cluster
   density visually but doesn't label it. A simple metric (edges/node
   within tag, or median pairwise similarity within tag) shown on Notes
   or Graph would directly target where to study before drafting.

4. **No reader-perspective lens.** "What would confuse a reader?" requires
   hacking through Synthesize with the draft as scope. A native "critic
   mode" on `/ask` (or on `/nodes/[id]`) would be obvious and useful.

5. **No iteration on synthesis.** Single-shot. Confirmed again — this is
   the same finding as Scenario 4, and it bites harder for writing than
   for summarization because writing is intrinsically multi-turn.

6. **The `EditableField` blur-to-save is wrong for long-form editing.**
   It's optimized for one-line edits and short summaries. For an
   800-word section it's painful: no preview while editing markdown, no
   undo across saves, no autosave checkpointing. A node-detail "edit
   long content" mode that drops into a proper textarea + markdown
   preview would help, even before any free-writing-pad work.

7. **Notes-for-self ≠ notes-for-readers.** Confirms Scenario 3's finding.
   The atomic-note discipline is right for personal recall, wrong for
   explaining-to-others without a translation layer. The translation
   layer today is Synthesize + custom prompting; it's better than
   nothing, much less than enough.

### Verdict

Three categories of friction surface: (a) voice (a prompt-engineering and
context-shaping problem), (b) coverage diagnostics (a visualization gap),
(c) iteration (a missing primitive). Of these, **iteration is the
deepest**. Single-shot synthesis is fine for *answering*; it's wrong for
*writing*. Until writing becomes a multi-turn workflow inside the app,
prose-for-readers will keep being a round-trip task.

---

## Scenario 6 — Deep serendipity session (no agenda)

The app's premise — Luhmann + RAG — promises serendipity. This scenario
tests that directly. No agenda; I want to find a connection between two
notes from genuinely unrelated parts of the corpus.

### What I do

Open `/graph`. No filters. ~855 nodes total (~600 permanents + ~150
literature + ~25 structure + ~80 source virtual nodes). The
force-directed layout takes ~6-8s to settle with `cooldownTime=1500`,
and the visual is a hairball: dense central blob, peripheral tendrils.
Hovering nodes is sluggish — 300ms `NotePreviewPopover` delay + the
lazy `getNode` round-trip (~150-250ms) on top of a render with 855
hover targets stacked. Toggling literature off thins to ~625 and
helps, but I still can't see *topical* communities — only structural
ones.

I shift-click 4 nodes that look like a peripheral cluster — they
turn out to be cooking notes (I have ~12 on baking technique, gluten
development, fermentation). The BatchPanel opens — useful for
*tagging* but irrelevant to what I'm doing now. I close.

**Switch to `/discover/bridges`.** This is where the AI bridge
classifier lives (Phase C). Pairs sorted by similarity descending.
The top 10 are mostly within-domain near-misses: two RAG notes I
forgot to link, two PLL notes I forgot to link. Useful as hygiene,
boring as serendipity.

I scroll down past the obvious pairs. The interesting band is
mid-similarity — visually around row 30-60, similarity ~0.55-0.70.
The pairings get weirder. One catches: **"Aliasing as a moral
parable"** (a permanent I wrote a year ago, riffing on Nyquist:
"information below the sampling threshold is *gone*, not noisy —
the threshold is sharp; below it the world is invisible to the
sampler") paired with **"Bergson — perception as filtering"** (a
literature note from a philosophy reading sprint: "perception is
subtractive; the mind filters most of reality, and the unconscious
of perception isn't noise — it's everything not selected").

Click the pair. Slide-out opens, both NodeDetails lazy-fetched via
`Promise.all`. Read side-by-side. Click **Ask Claude to classify
this pair**. ~5s. Returns:

> `edge_type: ANALOGOUS_TO`
> *"Both notes treat informational loss as a fundamental rather
> than incidental phenomenon. Aliasing is the mathematical ceiling
> on what a sampler can perceive; Bergson's filtering is the
> experiential floor on what a mind can perceive. The two notes
> frame perception (sampler-sense and mind-sense) as selection —
> with what is excluded being categorically gone, not merely
> degraded."*

**This is the app doing exactly what its premise promises.** Click
**Apply suggestion**. EdgeForm prefills. I edit the note ("aliasing
↔ filtering: both as selection, exclusion as categorical loss"),
submit.

I want another. Scroll Discover, find a second mid-similarity pair:
**"Bread dough autolyse — gluten develops without kneading"** and
**"Embedded init code: let the oscillator settle before the
clock-divider engages."** Click classify. ~5s. Returns
`NO_CONNECTION` with rationale: "Both involve a passive waiting
period before active processing, but the analogy is too shallow —
many physical systems require settling. The pair doesn't warrant
an edge."

**Honest negative.** The classifier didn't force a link. Good signal.

I keep scrolling. Find a third pair, borderline within-domain. The
classifier returns ANALOGOUS_TO with a weak rationale. I apply
anyway because the rationale at least gives me language.

**~25 minutes in. Two cross-domain edges made. The friction is
scroll-and-judge on Discover.**

**Try `/ask` speculatively.** Query: *"What unexpected connections
exist between my DSP notes and my philosophy notes?"* RAG embeds
the query, retrieves seeds (likely notes that explicitly mention
both, of which there's now exactly one — the pair I just linked,
plus generic mentions). Graph-expansion fills out. Answer: thin.
~400 words speculating about possible connections, citing 8 nodes,
only 2 of which directly matched. Claude says: *"It's possible the
discipline of signal filtering shares conceptual ground with
theories of perception…"* — speculative, ungrounded. **Ask is bad
at this query shape** because RAG retrieval rewards on-topic
matching, not cross-domain ideation.

**Try Synthesize.** Toggle tag `dsp` (~30 notes), then tag
`philosophy` (~22 notes). Add all from each in sequence (no union
mode — two passes). Scope = 52. Question: *"What thematic patterns
or analogies emerge across these two sets? Be speculative. List
5-10 specific cross-pollinations, each citing notes from both
sides."* ~18s.

**Much better.** 7 cross-pollinations, each with concrete dual-side
citations. Three are forced ("both DSP and Buddhism value
impermanence" — eh). Four are genuinely surprising and immediately
useful for thinking. The output works because the scope manually
forces cross-domain context into the retrieval window — bypassing
the same-topic bias of vector search.

But I had to invent this workflow. The app doesn't say "use
Synthesize for cross-domain ideation with this prompt template."

### Inefficiencies and UX pains

1. **The graph at full scale is a hairball.** ~855 nodes, no
   community detection, no cross-domain edge highlighting, no
   semantic-density coloring. The force-graph cooldown is 1.5s but
   convergence takes longer; hover-preview latency stacks
   `NotePreviewPopover`'s 300ms delay onto `getNode`'s round-trip.
   Pretty, exploratorily weak.

2. **Bridges over-weights within-domain hygiene.** Top similarity
   pairs are "you forgot to link these." The *serendipitous* pairs
   sit in the mid-similarity band (~0.55-0.70). The single
   highest-leverage Discover enhancement would be a **"hide
   pairs that share a tag" toggle** — i.e., surface only
   cross-domain-by-tag pairs.

3. **No cross-domain scope shortcut in Synthesize.** Building a
   "tag X UNION tag Y" scope requires two toggle-and-add passes.
   A union mode (multi-select tags, OR by default) would make
   cross-domain ideation a 2-click setup instead of a 4-click one.

4. **Ask is bad at speculative queries.** RAG retrieval is a
   same-topic matcher. Speculative cross-domain prompts get thin
   retrieval and Claude confabulates plausibly. Synthesize-with-
   explicit-scope is the workaround, but the user has to know
   this. A small banner on `/ask` ("For cross-domain or
   speculative questions, build an explicit scope on Synthesize")
   would route correctly.

5. **No serendipity push.** Discover requires me to remember to
   look. A "10 surprising bridges this week" digest on Home, or a
   weekly notification, would surface this without me reaching.

6. **No triangle-completion discovery.** If A links C and B links
   C but A↔B doesn't exist, the triangle is a strong serendipity
   signal — and one that vector similarity often misses (the
   missing edge is structural, not semantic). `graph_service`
   already has BFS expansion; a "missing-edge triangles" query
   could be a fourth Discover tab and would likely surface
   different pairs than Bridges.

7. **Tags are flat — again.** With ~40 tags, `philosophy` sweeps
   in both philosophy-of-mind and ethics notes, different
   sub-topics. Hierarchical tags (`philosophy/mind`,
   `philosophy/ethics`) would let me build sharper scopes for
   cross-domain ideation. Confirms Scenario 1 finding from a new
   angle.

8. **Classify is per-pair.** For exploring serendipity at scale,
   "classify the top 50 mid-similarity pairs, show me the ones
   the classifier rated as cross-domain with high confidence"
   would compress hours of scroll-and-click into one review pass.
   The endpoint is a per-pair `POST /discover/bridges/classify`;
   a batch variant + a confidence sort would unlock the workflow.

### Verdict — on the app's premise

The constellation thinker framing implies *"the graph reveals
patterns you didn't see."* Today, the graph is more *record* than
*revelation*. The actual revelation engine is Discover/Bridges +
the AI classifier — that pairing genuinely produces moments of
insight. Every cross-domain edge I've made in the last two months
came from Discover, not from staring at the graph.

If serendipity is a core value of the project, the implication is
clear: invest in Discover (cross-domain filtering, triangle
completion, batch classification, push surfacing). Keep the graph
as a navigation and audit tool, but stop expecting it to drive
discovery at corpus scale. **The graph visualizes what you have;
Discover finds what you're missing.**

---

## Scenario 7 — The graph as maintenance tool

The previous cross-cut framed the graph as audit/navigation, not discovery.
Today I test the audit half directly. Three maintenance goals: (a) find
orphan permanents — nodes with no edges in or out — that drifted loose
when their originating fleeting was processed; (b) find edges whose
endpoints have drifted (the source or target was substantially edited
after the edge was made); (c) find permanents with no `summary` field.

### What I do

Open `/graph`. Default load: ~855 nodes. The force layout takes ~7s to
settle. Toggle off literature (~625 visible). Toggle off the source
virtual nodes (~545). Still a hairball. The filter bar offers: type
chips (permanent/literature/structure), a single-tag chip, a recency
range. It does *not* offer "has no outgoing edges," "has no `summary`,"
or "has no edges of any kind."

I try the closest visual proxy. Filter type=`permanent`, tag cleared.
The graph *shows* orphans implicitly — they sit on the periphery,
drifting outside the dense central blob. But I can't *select* them as
a set. I shift-click ~6 obvious-looking peripheral nodes; the
BatchPanel opens — Tag, Delete, Group, Export. None of those is "open
for side-by-side review." For maintenance, batch-review is the
operation; batch-tag is the wrong primitive.

Bail to `/notes`. Filter bar: type / tag / age / search string. Sort:
created_at, updated_at, title. **No "orphan" filter. No "no summary"
filter. No "no outgoing edges" filter. No edge-count sort.** Right —
Notes is a *list*, not a maintenance dashboard.

Open a terminal. Drop into the SQLite file directly:

```sql
SELECT id, title FROM nodes
WHERE deleted_at IS NULL
  AND type = 'permanent'
  AND id NOT IN (SELECT source_id FROM edges WHERE deleted_at IS NULL)
  AND id NOT IN (SELECT target_id FROM edges WHERE deleted_at IS NULL)
ORDER BY created_at DESC LIMIT 200;
```

23 rows. Now I have my orphan list — but I had to bypass the app
entirely. The repository layer is there, the schema is there, the
predicates are one-line filters; the abstraction is missing at the
API + UI boundary.

For "no summary" — same story, different one-liner:

```sql
SELECT id, title FROM nodes
WHERE deleted_at IS NULL
  AND (summary IS NULL OR summary = '')
  AND type = 'permanent'
ORDER BY created_at;
```

87 rows. Most are old; my early-month notes skipped `summary` because
I hadn't internalized it as a field yet. **One Notes-filter checkbox
("summary missing") would expose all of them — it doesn't exist.**

For stale edges — the trickiest of the three — the signal I want is
`edge.created_at < min(source.updated_at, target.updated_at) - 60d`:

```sql
SELECT e.id, e.edge_type, s.title, t.title
FROM edges e
JOIN nodes s ON s.id = e.source_id
JOIN nodes t ON t.id = e.target_id
WHERE e.deleted_at IS NULL
  AND e.created_at < datetime(
        CASE WHEN s.updated_at < t.updated_at
             THEN s.updated_at ELSE t.updated_at END,
        '-60 days');
```

71 candidate stale edges. I sample 10 — 4 are genuinely outdated (the
source note shifted scope and the edge no longer applies); 6 are still
accurate. **A "review stale edges" surface would land — and the
underlying signal is one SQL view away from being first-class.**

Back to the graph for the actual cleanup. I have a list of 23 orphan
node IDs and would love to *open exactly these in the graph*, walk
each, drag-suggest a nearby cluster, and link. But the URL accepts
`?focus=<id>` for a single node — it doesn't accept `?ids=a,b,c` for
a set. **The graph isn't addressable for a result set.** My options:
(a) add a shared one-off tag to all 23 and filter by it (pollutes the
tag taxonomy), (b) walk each through `/nodes/[id]` instead. I do (b).
Each orphan: open detail, click **Find related**, accept 1–2 Suggest
links suggestions, move on. ~3 minutes per node. **70 minutes for 23
orphans — and the graph never enters the loop.** The whole reason I
opened the graph was to use it for the cleanup it visually suggested
existed.

### Inefficiencies and UX pains

1. **Notes has no schema-level filters.** "No summary," "no outgoing
   edges," "no edges either," "edge-count=0," "summary length <50,"
   "created with no edits since" — each is a one-line predicate against
   the existing repository layer. They'd replace a dozen ad-hoc SQL
   queries with one chip row.

2. **The graph isn't addressable for an arbitrary result set.** A
   `?ids=a,b,c` URL param would make the graph *composable* with Notes
   ("run a Notes query, open these IDs in graph"). Today, addressing
   a custom set requires temporary tag pollution.

3. **The graph's visual vocabulary commits entirely to topology.** No
   coloring by "has summary y/n," no edge-thickness by recency, no
   dimming of stale edges. Attributes have no visual channel.
   **Confirms finding #13 from a new angle: the graph is well-fitted
   to "what's near what?" questions and ill-fitted to "what's old,
   thin, dangling?" questions. Two scenarios in agreement now.**

4. **BatchPanel is for tagging, not for review.** Tag/Delete/Group/
   Export. No "open in side-by-side review," no "queue into a process
   flow," no "run Suggest links on all selected." For maintenance,
   the verb is *review*.

5. **The "stale edge" concept isn't first-class.** It's derivable in
   one SQL query, but no service surfaces it. A
   `GET /maintenance/stale-edges?threshold=60` endpoint plus a
   Discover-side tab ("Hygiene") would unlock the workflow with very
   little code.

6. **I dropped into raw SQL three times in one maintenance pass.**
   That's the diagnostic. The data is there; the API surface and the
   UI are not. **Confirms finding #10 (coverage density / data
   quality unmeasured) for a third time — flagged.**

7. **No periodic maintenance prompt.** I went looking today because
   something else reminded me. A monthly corpus-health digest —
   orphan count, summary-coverage %, stale-edge count, edges-per-node
   trend — would push the maintenance moment instead of waiting on me
   to remember to pull it.

### Verdict

**Confirmed: the graph is well-fitted to navigation and ill-fitted to
maintenance.** The maintenance surface is missing wholesale — Notes is
a list, the graph is a navigator, the SQL shell is the actual
maintenance tool. The leverage is in expressing maintenance predicates
as first-class Notes filters and graph overlays, not in building a
new surface. The fixes are small; the absence is large.

---

## Scenario 8 — Onboarding control theory from zero

I've just gotten interested in control theory — tangentially relevant
to the Eurorack work (envelope shaping, feedback) and to a robotics
side-project I'm noodling on. Goal today: go from zero notes on the
topic to a usable first foothold in the graph in one session.

Sources on disk:

1. `astrom-feedback-ch2.md` — 18pp, Åström & Murray *Feedback Systems*
   Ch. 2, clean H2/H3 conversion.
2. `mit-6302-lecture-notes.md` — 32pp, lecture-notes PDF→MD; some
   figure captions promoted to headings by the converter.
3. `pid-survey-2018.md` — 14pp, survey paper, clean.
4. `wikipedia-pid-controller.md` — 8pp, pasted from Wikipedia.
5. `podcast-rodney-brooks-feedback.md` — 22-minute podcast transcript I
   extracted by hand from a recording app. No headings, just paragraphs.

### What I do

**Imports.** One by one.

```
$ con import astrom-feedback-ch2.md \
    --source-title "Feedback Systems, Ch. 2: System Modeling" \
    --source-type book --source-author "Åström & Murray"
```

~6s. 11 candidates. I uncheck the chapter summary, rename two generic
titles ("State Space Description" → "State-space form — the matrix
recipe and what it preserves"). Auto-tag: `control-theory`. Hub note on,
hub title pre-filled. Source row, 10 literature notes, hub structure
note, 10 COLLECTS edges.

`mit-6302-lecture-notes.md`. ~9s. 24 candidates. Five chunks split on
figure captions ("Fig. 3.2 — Closed-loop transfer function") because
the PDF converter promoted bold-italic captions to H3s. Two of the
resulting chunks are 4 lines long. I lump-accept anyway — same auto-tag,
same hub. 22 literature notes.

`pid-survey-2018.md`. Clean. 9 candidates, 8 accepted.

`wikipedia-pid-controller.md`. Clean. 6 candidates, 5 accepted.

`podcast-rodney-brooks-feedback.md`. The painful one.

```
$ con import podcast-rodney-brooks-feedback.md \
    --source-title "Rodney Brooks on feedback in robotics (podcast)" \
    --source-type article --source-author "Brooks"
```

The chunker sees no H2/H3 anywhere. It falls back to MAX_CHARS=2400
cuts. 4 candidates appear, each ~2400 chars, each containing 3–4
distinct ideas the speaker raised. **The review UI lets me edit
content in-place but not split a card.** I can't take "Brooks-Chunk-1"
and break out the four ideas inside it. Choices: (a) accept four
chunky, multi-idea cards and live with bad atomicity, (b) paste back
to `$EDITOR`, insert H3 headings between ideas, re-import.

I do (b). ~8 minutes of manual heading insertion. Re-import. ~7s. 11
candidates. Accept 9. **Confirms finding #16 with new evidence: the
chunker's failure mode is predictable on transcripts, podcasts, blog
posts, any prose without sub-headings — and the review UI does
nothing to recover from it.**

Final state of the new domain: 1 tag, 5 sources, 5 hub structure
notes, ~54 literature notes, ~54 COLLECTS edges, zero cross-source
edges, zero connections to my existing 850-node corpus.

**Tagging.** With 54 notes I'd naturally carve sub-topics: ~10 on
classical PID, ~12 on state-space, ~8 on stability, ~6 on system
identification, ~10 on robotics-applied, ~8 on background math. Six
natural sub-tags. The flat-tag model forces a choice: (a) keep
`control-theory` as the sole tag and lose sub-topic resolution, (b)
invent prefixed tags `control-theory-pid`, `control-theory-ss`, …
(tag bloat: 40 → 46, with no enforced parent relationship), (c) use
only sub-tags and lose the cross-cutting topical tag. I pick (a) and
already regret it before the session is over. **Confirms finding #8
(tags want hierarchy) for the third time — flagged.**

**Linking pass.** I run Suggest links on the 5 hub notes. Each call
~7–8s. Suggestions are entirely within the new cluster — Åström-state-
space ↔ MIT-state-space, Wikipedia-PID ↔ survey-PID-tuning. Zero
suggestions back to my existing 850-node corpus. That's correct
(my corpus has no control-theory priors), but it means Suggest links
provides no cross-corpus seeding. **If I were to run it on all 54
notes, that's ~54 × ~8s ≈ 7 minutes of API time with massive
within-cluster redundancy (Razavi-A → Razavi-B suggestion appearing
again as Razavi-B → Razavi-A on the reverse pass).** Confirms
finding #9 (no cluster mode) with a second data point — the case for
a `POST /rag/suggest-links/cluster` taking a tag and deduplicating
internally compounds across two scenarios.

I add ~25 manual within-cluster edges via the graph: `/graph`, filter
`control-theory`, `E`-key, click target. ~3–4 minutes for 25 edges.
This part is cheap and pleasant.

**First synthesis.** `/synthesize`. tag=`control-theory`, recency=Any.
Pool: 54 (under cap). Add all to scope. Question: *"Give me a coherent
introduction to control theory: PID, state-space, stability, system
identification. Show me the canonical structure of the field — what
should I learn next?"* Custom prompt: *"Sections: Vocabulary → PID →
State-space → Stability → System identification → Open problems for
further study. Cite [Note N] freely. ~1500 words."*

~14s. Output is good — *structurally*. Sections flow, citations are
dense, 41 of 54 scope notes are cited. **But I cannot evaluate the
accuracy.** With the PLLs scenario (Sc 4) and the RAG-post scenario
(Sc 5), I had domain priors — I could tell when Claude was right vs.
confabulating. Here I'm a newcomer. The output asserts things like
*"Ziegler-Nichols tuning is widely regarded as a starting heuristic
but underdamps modern processes"* — is that coming from my notes or
from Claude's training? Each line cites a [Note N], but to verify
~19 claims paragraph-by-paragraph I'd need to read all 54 notes I
just imported. **This is the silent-confabulation failure mode named
in Sc 5, sharpened: the lower my prior knowledge, the more I need
paragraph-level provenance, the more "Note N + confidence" gloss on
each output line matters. Confirms finding #14 for a second time
and complicates it — the failure mode is monotonic in corpus
thinness, not just in notes-per-claim density.**

**First Ask.** `/ask`. *"What's the difference between PID and state-
space control?"* — a canonical newcomer question. ~9s. 350 words. 6
citations including [3] (Wikipedia) and [22] (MIT). Reading cold, I
can't tell which sentences are paraphrasing my Wikipedia note and
which are Claude generalizing. Retrieval is grounded; prose is
blended. Same failure mode at smaller scale.

**The workflow I want and the app doesn't offer.** After importing 54
notes from 5 sources on a fresh topic, the first thing I'd actually
want is a *guided foothold*: Claude proposes "here's the canonical
sub-topic structure of this field, here's how your imports map onto
it, here are the gaps." That's a *structural* output, not a 1500-word
essay. Synthesize approximates it via custom prompt, but the output
is prose, not a structural map. **A `POST /synthesize/scaffold` taking
a tag and emitting a canonical TOC + per-node coverage labels +
gap list is the workflow this scenario wants. New finding.**

### Inefficiencies and UX pains

1. **No "domain scaffolding" affordance for fresh corpora.** When the
   corpus is empty, the first synthesis you want isn't a 1500-word
   essay — it's a structural map. The app forces prose. **New
   finding.**

2. **Chunker fails predictably on transcripts and conversational
   prose.** The podcast import lost atomicity because H2/H3-or-
   MAX_CHARS doesn't work on heading-less prose. A transcript-aware
   mode (segment by speaker turn, paragraph cluster, or topic shift
   via embedding distance) would address this. The user-side
   workaround (insert headings in `$EDITOR`, re-import) is fine
   occasionally and terrible if podcasts/blogs are the bulk of one's
   reading. **Confirms finding #16 from new evidence.**

3. **Suggest-links cost is linear in cluster size with significant
   redundancy.** Same evidence as Sc 4, second scenario. **Confirms
   finding #9.**

4. **Flat tags force a binary between resolution and tag-bloat.**
   Six natural sub-topics in `control-theory` can't be expressed
   without prefixed-tag dance. **Confirms finding #8 a third time —
   flagged.**

5. **Silent confabulation is monotonic in corpus thinness.**
   New-domain users have no priors and are the worst-positioned
   reviewers of generated text — and they're exactly the users who
   most need the synthesis to be reliable. **Confirms finding #14
   with sharpened evidence.**

6. **Import is per-source; no "bundle" mode.** Five sources, five
   wizard rounds, ~25 minutes total in the wizards. A `con import-dir`
   taking a directory + a single auto-tag + per-file source metadata
   (sidecar `.json` or YAML frontmatter) would compress this to ~5
   minutes. One afternoon's CLI work.

7. **No post-import cross-domain bridges pass.** After importing 54
   control-theory notes, I'd want Discover to run once over (new
   cluster × existing 850 nodes) and flag mid-similarity pairs. Today,
   Discover ranks all pairs together; the 54 new notes will dominate
   top-rank within-domain pairs and any cross-domain pair will be
   buried far down the list. A "post-import bridges" flow that
   explicitly cross-products new × old, sorted by mid-similarity,
   would invert the bias.

### Verdict

The app is built for *enriching an existing corpus*, not for *seeding
a new one*. The primitives carry me a long way — import, synthesize,
link — but the curve from zero to first foothold has more friction
than the curve from foothold to expert. Scaffolding, transcript-
friendly chunking, batch suggest-links, bundle import, and post-import
cross-domain bridges are all missing pieces of the same shape. **The
marginal value of new-domain onboarding affordances is high precisely
because the app's strength — dense-cluster Synthesize (finding #18) —
is unavailable until you've reached density.** Sc 4 said this strength
exists; Sc 8 says how much it costs to get there from zero.

---

## Scenario 9 — A contradiction across a year of notes

Two notes I have, in tension:

- **N1** (2025-10-12): *"Voltage-controlled filters — thermal drift
  requires session calibration. Most VCFs drift 5–30 cents/°C; expect
  to retune the cutoff every 30–60 min during a session, especially
  if the room is warming up. Practical rule: trim the bias resistor
  warm, then offset by 0.7%/°C from cold."*
- **N2** (2026-04-28): *"Modern VCF designs use temperature-compensated
  current sources and trimmer-free architectures. Drift across 0–50°C
  falls below the 1-cent threshold on production silicon (e.g., SSM2024
  successors, AS3320). Calibration-free at session scale."*

These contradict at the surface. N1 is implicitly scoped to through-hole
/ discrete-transistor VCFs; N2 to modern integrated ASIC VCFs. I didn't
notice the contradiction when I wrote N2 — I was reading a datasheet,
took the note, moved on. Today I walk the full lifecycle: notice,
model, query, resolve.

### (a) Noticing — does the app help?

`/discover/bridges`. Top pairs sorted by cosine similarity descending.
N1 and N2 share heavy terminology (VCF, drift, calibration, cents,
temperature). They should be high-similarity-and-unlinked. They appear
at rank 17, similarity ~0.74. Click. Slide-out: both NodeDetails
side-by-side, lazy-fetched via `Promise.all`. Click **Ask Claude to
classify this pair**. ~5s. Returns:

> `edge_type: CONTRADICTS`
> *"N1 describes legacy through-hole / discrete-transistor VCF circuits
> where bias-resistor calibration compensates for transistor thermal
> drift. N2 describes modern integrated VCF ASICs with on-die
> temperature compensation that obviates session-scale calibration.
> The two notes make incompatible claims about whether VCFs require
> calibration — but the apparent contradiction is resolved by
> recognizing that 'VCF' refers to different circuit families in each.
> Recommend: model as CONTRADICTS, with explicit scope-narrowing notes
> on each."*

**The classifier nailed it.** Not just "these contradict" but the
underlying scope mismatch. **Confirms finding #6 a third time —
flagged — and adds positive evidence: the classifier reasons well
about scope.**

### (b) Modeling — does the edge type carry the meaning?

Click **Apply suggestion**. EdgeForm prefills: source=N1, target=N2,
type=CONTRADICTS, note=empty. I write: *"N1 is through-hole / discrete
designs; N2 is integrated ASICs. The 'contradiction' is real but each
note's scope is narrower than its prose admits."* Submit.

Edge created. The graph now shows a CONTRADICTS arrow between N1 and
N2 carrying my one-line note. But:

- N1's content still reads as a *universal claim*: "VCFs drift." A
  reader opening N1 cold has no signal there's a contradicting newer
  note unless they scroll the **Outgoing edges** sidebar.
- N2 has the same problem from the other side.
- The right model isn't "N1 ↔ CONTRADICTS ↔ N2" alone. The right
  model is: N1 SCOPED_TO `through-hole VCFs`, N2 SCOPED_TO `ASIC
  VCFs`, with a synthesis note N3 covering both regimes and
  SUPERSEDES on the originals.

**The EdgeType enum has SUPPORTS, CONTRADICTS, ELABORATES,
ANALOGOUS_TO, INSPIRED_BY, COLLECTS, CITES — but no SUPERSEDED_BY,
SCOPED_TO, REGIME_OF, RESOLVES.** Sc 4 said edge vocabulary is
author-stance and missing literature-stance verbs (BUILDS_ON,
APPLIES_TO…). Sc 9 says it's missing knowledge-evolution-stance verbs
too. **Complicates finding #11 in a third direction.**

### (c) Querying — does Ask honor the typed edge?

`/ask`: *"Do voltage-controlled filters need periodic recalibration
during a session?"* ~8s. ~280 words:

> *"Whether VCFs need recalibration depends on the design. Through-
> hole and discrete-transistor VCFs exhibit thermal drift on the
> order of 5–30 cents/°C and benefit from periodic retuning during
> long sessions [Note 14]. Modern integrated VCF designs use
> temperature-compensated current sources and remain stable below the
> 1-cent threshold over typical operating temperatures, eliminating
> practical recalibration needs [Note 87]. In practice, builders
> running discrete designs should plan to retune every 30–60 minutes;
> builders specifying modern ASIC VCFs (SSM/AS-series) can largely
> skip this step."*

Provenance: 6 nodes including both N1 and N2.

**The answer is correct, but the correctness is accidental.** Why?

- Retrieval pulled both N1 and N2 because both have high similarity to
  the question. Claude read both, noticed the surface tension, and
  *resolved it from the prose itself* — inferring "through-hole vs
  ASIC" from N1 and N2's content.
- The CONTRADICTS edge I just added was **not used as a signal
  anywhere in the answer pipeline.** RAG context assembly retrieves by
  similarity + graph-expansion (BFS, edge-type-agnostic). Edge
  semantics don't influence what gets surfaced or how it's framed.

**Test the inverse.** Soft-delete the CONTRADICTS edge. Re-run the
same Ask query. **Same retrieval, same 6 citations, same answer
prose.** The edge had literally zero effect on the output. **New
finding: typed edges are structurally present but semantically
invisible to the RAG pipeline.**

(I re-add the edge.)

This is a major gap if the typed-edge model is meant to deliver on
the adversarial-knowledge promise. The point of CONTRADICTS as a
modeled relationship — vs. just "two semantically-close notes" — is
that *generation should treat the pair specially*: surface both
viewpoints, flag the tension explicitly, prefer the resolution if
one exists. None of that happens.

### (d) Resolving — when the contradiction is structural

I write N3, a synthesis: *"VCF calibration — regime-dependent.
Through-hole / discrete VCF designs (pre-2010 hobbyist circuits,
classical Moog/ARP topologies) require session-scale calibration;
see N1. Modern integrated VCF ASICs (SSM2024, AS3320, et al.) are
calibration-free over 0–50°C; see N2. The 'contradiction' in older
notes is a scope omission, not a factual disagreement."*

Save as permanent. Tag `eurorack` and `electronics`. Now I'd like
the graph to reflect:

- N1 SUPERSEDED_BY N3 (or REGIME_NARROWED_BY)
- N2 SUPERSEDED_BY N3 (same)
- N3 SUPPORTS N1 (within its through-hole scope)
- N3 SUPPORTS N2 (within its ASIC scope)
- The original N1↔N2 CONTRADICTS edge marked *resolved-by N3* — still
  present as a historical record, but no longer "live."

The model lets me do half of this. SUPPORTS edges N3→N1 and N3→N2:
fine, two clicks each. SUPERSEDED_BY: doesn't exist; closest is
ELABORATES, which doesn't capture "this newer note supersedes the
old one's scope." A "mark this edge resolved" affordance on the
existing CONTRADICTS edge: doesn't exist. **Edges have
`created_at`/`updated_at` but no `resolved_at` / `resolved_by_node_id`.
The schema can't model knowledge evolution as a first-class event.**

I fall back to a structure note "Contradiction resolution log" with
COLLECTS edges to {N1, N2, N3}. But the structure-note pattern is
for *collections of related notes*, not for *time-ordered resolution
traces*. The semantics don't fit, and a reader navigating the graph
to N1 or N2 still won't see "this has been resolved."

### Inefficiencies and UX pains

1. **Typed edges are dead weight in the RAG pipeline.** The
   CONTRADICTS edge had zero effect on Ask. Edge semantics are stored
   but not honored. A first-pass fix: when retrieval surfaces N, also
   surface CONTRADICTS-linked neighbors and tag the pair in the
   prompt context ("these notes are in tension — present both and
   the resolution if one exists"). SUPPORTS could co-elevate; CITES
   could weight downstream synthesis appropriately. **New finding —
   the single biggest miss in the typed-edge model.**

2. **Edge vocabulary missing knowledge-evolution verbs.**
   SUPERSEDED_BY, SCOPED_TO, REGIME_OF, RESOLVES — none exist.
   They're the natural verbs when notes evolve over time.
   **Complicates finding #11 in a third direction. Author-stance
   (#11 original), literature-stance (Sc 4 addition), and
   evolution-stance (Sc 9 addition) verbs are all under-covered.**

3. **Edges can't carry "resolved" state.** A `resolved_at` +
   `resolved_by_node_id` pair on edges would let CONTRADICTS edges
   age into "historical" status without being deleted — preserving
   the corpus history while signaling "this tension has been worked
   through." Soft-delete is too coarse; the resolution is information
   I want to keep.

4. **Notes inherit a universal voice they shouldn't.** N1 says "VCFs
   drift"; what it means is "through-hole VCFs drift." This is a
   writing-discipline problem more than a tool problem — but the tool
   could help. A subtle save-time prompt ("does this claim hold
   universally, or under a narrower scope?") or a Discover-driven
   nag ("this note conflicts with a more recent note; reconsider both")
   would shape behavior over time.

5. **Discover is the contradiction-noticing engine.** N1 and N2 sat
   in my corpus unrelated for seven months; Bridges surfaced them
   the first time I scrolled past rank 17. **Finding #6 confirmed a
   third time — flagged.** The combination of similarity-ranking +
   AI classifier is doing exactly what it should.

6. **The classifier rationale is discarded.** The slide-out shows
   Claude's reasoning ("the apparent contradiction is resolved by
   recognizing that 'VCF' refers to different circuit families…")
   but only at classification time. Once the edge is applied, the
   rationale is gone. Storing it as a structured `classifier_rationale`
   field on the edge would let graph traversal carry the reasoning
   forward — into Ask context, into future Synthesize scopes, into
   the slide-out next time the pair is revisited. **A small schema
   addition with compounding value.**

### Verdict

Discover catches the contradiction; the classifier reasons well about
scope; the edge model lets me write down CONTRADICTS. **But the
contradiction never reaches the answer pipeline, and the schema can't
model resolution as a first-class event.** The typed-edge promise —
that the graph *means something* to retrieval and generation — is
half-fulfilled: edges are stored but not honored. The single
highest-leverage fix is plumbing edge semantics (at minimum
CONTRADICTS, SUPPORTS, CITES, and the new SUPERSEDED_BY) into RAG
context assembly. Until that happens, typed edges are a graph-
topology feature pretending to be a knowledge-modeling feature.

---

## Cross-cutting findings — consolidated after scenarios 4–9

Findings marked **★ 3×** are now confirmed across three or more scenarios.

| # | Theme | Where it shows up |
|---|---|---|
| 1 | **Project context is implicit, not first-class** | Scenarios 1, 2, 3 — and 4 (hub notes are empty containers, no narrative scaffolding) |
| 2 | **Ask is narrow** — no scope, no iteration, no reader-mode, no speculative-mode | Scenarios 2, 5, 6 |
| 3 | **No free-writing surface; no iteration on synthesis** | Scenarios 3, 5 — confirmed and sharpened |
| 4 | **Inbox is FIFO and lonely** | Scenario 1 |
| 5 | **Source content is invisible to RAG; literature notes are the only entry point** | Scenarios 2, 4 — confirmed |
| 6 | **★ 3× Discover is the actual serendipity *and* contradiction-noticing engine** | Scenarios 1, 6, 9 — Sc 9 sharpens further: AI classifier reasons well about scope mismatch on contradictions |
| 7 | **Keyboard nav stops at two shortcuts** | Scenarios 1, 4 (link curation), 7 (maintenance click work) |
| 8 | **★ 3× Tags are flat; sub-topics, themes, projects, sub-domains all want hierarchy** | Scenarios 1, 3, 6, 8 — confirmed four times |
| 9 | **Linking is per-node; no cluster operations (batch suggest-links, dedup)** | Scenarios 4, 8 — second data point, redundancy bites worse at higher cluster size |
| 10 | **★ 3× Coverage density / data quality / maintenance signals aren't visualized or filterable anywhere** | Scenarios 4, 5, 7 — Sc 7 sharpens: I dropped into raw SQL three times in one pass |
| 11 | **Edge-type vocabulary is one-dimensional — author-stance only; missing literature-stance (BUILDS_ON, APPLIES_TO, MEASURES) *and* evolution-stance (SUPERSEDED_BY, SCOPED_TO, RESOLVES) verbs** | Scenarios 4, 9 — complicated in a third direction by Sc 9 |
| 12 | **Saved syntheses use the *wrong* edge verb (COLLECTS instead of CITES/DERIVES_FROM)** | Scenario 4 |
| 13 | **Graph at corpus scale is a hairball; visual vocabulary commits to topology, ill-fitted to maintenance** | Scenarios 6 (discovery), 7 (maintenance) — same shortfall from two angles |
| 14 | **Silent confabulation in synthesis; failure mode is monotonic in corpus thinness** | Scenarios 5, 8 — Sc 8 sharpens: new-domain users have no priors and are the worst-positioned reviewers |
| 15 | **`EditableField` blur-to-save is wrong for long-form editing** | Scenario 5 |
| 16 | **Import chunker locked at import time; fails predictably on transcripts/prose-without-headings** | Scenarios 4, 8 — Sc 8 confirms with a new failure mode (podcast transcripts) |
| 17 | **`save-answer` works (auto-edges, embed-inline) — a quiet win** | Scenario 4 — positive |
| 18 | **Synthesize-over-dense-cluster is a quiet win — *but unavailable until density is reached*** | Scenario 4 (positive); Sc 8 (inverse: cost of getting to density from zero) |
| 19 | **No maintenance filters/predicates in Notes; graph isn't addressable for an arbitrary result set** | Scenario 7 — new |
| 20 | **No "domain scaffolding" affordance for fresh corpora — Synthesize forces prose where a structural map is wanted** | Scenario 8 — new |
| 21 | **Typed edges are structurally present but semantically invisible to the RAG pipeline (CONTRADICTS has zero effect on Ask)** | Scenario 9 — new; the single biggest miss in the typed-edge model |
| 22 | **Schema has no knowledge-evolution model: no SUPERSEDED_BY edges, no `resolved_at`/`resolved_by_node_id` on edges, classifier rationale discarded after apply** | Scenario 9 — new |
| 23 | **AI bridge classifier reasons well about scope mismatch and gives honest negatives — positive** | Scenarios 6 (NO_CONNECTION on shallow analogies), 9 (correct scope-mismatch read on the VCF contradiction) — positive, twice |

---

## Recommendations, tiered — updated

**Tier 1 — small, leveraged (each ~half-day to a day):**

- **Tag/recency scope on Ask** (mirror Synthesize's scope-builder,
  collapse by default).
- **Cross-tag-domain filter on Discover/Bridges** ("hide pairs that
  share a tag") — single highest-leverage Discover enhancement.
- **"Recently captured / edited / linked" sections on Home** (last 7
  days, by type).
- **Quick-switcher** (Cmd+P over notes + structure notes + sources).
- **Batch suggest-links endpoint** (`POST /rag/suggest-links/cluster`
  taking a list of node IDs or a tag, returning deduped proposed
  edges). From Sc 4; now compounded by Sc 8.
- **Triangle-completion tab on Discover** (A-C-B paths where A↔B
  missing). The BFS engine already exists in `graph_service`. From Sc 6.
- **Union-mode tag selection in Synthesize scope-builder** (multi-tag
  OR). From Sc 6.
- **Literature-shaped edge types** (BUILDS_ON, APPLIES_TO, MEASURES,
  EXTENDS, REFINES) added to the EdgeType enum + the type chips. From Sc 4.
- **Evolution-shaped edge types** (SUPERSEDED_BY, SCOPED_TO, REGIME_OF,
  RESOLVES) added to the EdgeType enum + the type chips. New, from Sc 9.
- **Use `CITES` (not `COLLECTS`) for `save-answer` auto-edges.** Tiny
  patch to `rag.py:268`; meaningful for graph semantics. From Sc 4.
- **"Critic mode" on `/ask` or `/nodes/[id]`** that takes the current
  note as input and lists likely reader questions. Largely a custom
  prompt + a button. From Sc 5.
- **Schema-level Notes filters**: "no summary," "no outgoing edges,"
  "no edges either," "edge-count = 0," "summary length < N." One chip
  row over the existing repository layer. New, from Sc 7.
- **`?ids=a,b,c` URL param on `/graph`** to make the graph composable
  with an arbitrary result set (run a Notes query, open these in
  graph). New, from Sc 7.
- **Persist classifier rationale on the edge.** Add a
  `classifier_rationale` TEXT column to edges; show it in the side
  panel next time the pair is revisited. Tiny schema migration,
  compounding value. New, from Sc 9.

**Tier 2 — multi-day, high payoff:**

- **Project Workspace at `/projects/[hub-id]`** (saved scope sidecar,
  project-scoped Ask/Synthesize/Discover, project-recent timeline).
- **Synthesis iteration / multi-turn mode** — "expand section N",
  "regenerate paragraph N", "given this draft, write the next 200
  words." Probably needs a small state machine + UI; the underlying
  RAG service already supports custom prompts. From Sc 4, 5.
- **Coverage-density overlay on Graph and Notes** — edges/node within
  a tag, or median pairwise similarity. Visual: cluster heatmap or
  density chip on tag chips. From Sc 4, 5, 7 (now ★ 3×).
- **Re-chunkable candidates on `/ingest`** — "split here" and "merge
  with next" buttons on candidate cards. From Sc 4; sharpened by
  Sc 8 (podcast transcript failure mode).
- **Transcript-aware chunker mode** for sources without H2/H3 structure
  (segment by speaker turn, paragraph cluster, or topic shift via
  embedding distance). New, from Sc 8.
- **Community detection on the graph** (Louvain or Leiden, colored
  overlay, toggle "show only cross-community edges"). From Sc 6.
- **Long-form editor mode on `/nodes/[id]`** — drop the `EditableField`
  for content fields ≥500 chars, render a real textarea + live
  markdown preview, autosave on debounce. From Sc 5.
- **Batch classify on Discover/Bridges** — "classify the top N
  mid-similarity pairs, show me the ones rated cross-domain with high
  confidence." Endpoint exists per-pair; needs a batch wrapper and a
  confidence sort. From Sc 6.
- **`POST /synthesize/scaffold`** — given a tag, emit a canonical
  sub-topic TOC + per-node coverage labels + gap list. The "fresh
  domain" workflow. New, from Sc 8.
- **`GET /maintenance/stale-edges`** + a Discover "Hygiene" tab.
  Surfaces edges whose endpoints have drifted past a configurable
  threshold. New, from Sc 7.
- **Plumb edge semantics into RAG context assembly.** When retrieval
  surfaces N, also surface CONTRADICTS-linked neighbors and tag the
  pair in the prompt ("these notes are in tension — present both and
  the resolution if one exists"). SUPPORTS / CITES could weight
  downstream synthesis similarly. New, from Sc 9 — the single biggest
  miss in the typed-edge model.
- **`resolved_at` + `resolved_by_node_id` on edges** + UI for the
  resolved-edge state. Lets CONTRADICTS edges age into "historical"
  without being deleted. New, from Sc 9.

**Tier 3 — bigger; re-shapes the model:**

- **Free-writing pad** with promotion paths (draft → permanent | source
  | synthesis). Best home is inside the Project Workspace, not a
  separate top-level surface.
- **Inbox grouping** (suggested tag clusters; bulk discard/tag).
- **Weekly serendipity digest** — Home banner or email: top
  cross-domain bridges, triangle-completion suggestions, stale notes
  worth revisiting. Push the discovery surface rather than waiting for
  user pull.
- **Monthly corpus-health digest** — orphan count, summary-coverage %,
  stale-edge count, edges-per-node trend. Push the maintenance moment
  the same way the serendipity digest pushes discovery. New, from Sc 7.
- **Source content into RAG** — when a literature note's source is a
  markdown/text file, optionally include source excerpts in the RAG
  context. Embeddings on chunks already exist via the import pipeline;
  the gap is plumbing into context assembly.
- **Hierarchical tags** (`philosophy/mind`, `philosophy/ethics`,
  `eurorack/firmware`, `eurorack/dsp`, `control-theory/pid`,
  `control-theory/state-space`). ★ 3× across Sc 1, 3, 6, 8.
- **Voice profile mechanism** — a structure note tagged `voice-sample`
  always included as context when drafting. From Sc 5.
- **Paragraph-level provenance** in synthesis output — annotate each
  paragraph with confidence or with the specific cited notes that
  produced it, so I can tell where my coverage stops and Claude's
  training takes over. From Sc 5; failure mode now ★ 2× sharpened by
  Sc 8 (worst-positioned reviewers are new-domain users).
- **Edge semantics broadly honored in RAG** (not just CONTRADICTS —
  also SUPPORTS, BUILDS_ON, SUPERSEDED_BY). Generation should
  *behave differently* in the presence of typed edges, not just
  retrieve and ignore. New, from Sc 9 — the deeper version of the
  Tier-2 plumbing recommendation.
- **A Discover-as-default model** — if Discover is the actual
  serendipity *and* contradiction-noticing engine, it deserves more
  prime real estate. Move it earlier in the nav, surface its content
  on Home, treat the graph as an audit/navigation surface rather than
  the discovery surface. From Sc 6, ★ 3× confirmed by Sc 9 — biggest
  re-shape of all.
- **`con import-dir` bundle import** — drop a directory of MD files
  with a single auto-tag and per-file source metadata (sidecar
  `.json` or YAML frontmatter); one CLI invocation, one wizard pass.
  Useful for new-domain onboarding. New, from Sc 8.
- **Post-import cross-domain bridges pass** — after importing a new
  cluster, Discover runs (new × existing) only, sorted by
  mid-similarity. Inverts the within-domain dominance bias that buries
  cross-corpus pairs at the bottom of the Bridges list. New, from Sc 8.

---

*Addendum captured 2026-05-14, same session as the original walkthrough.
Three scenarios deeper, the same biases probably apply: I'm closer to
the code than a real long-term user would be, so some of these pains
may be one-edit fixes I'm overestimating, and the positive observations
(`save-answer` auto-edges, dense-cluster Synthesize, the AI classifier
on Bridges) may be more important than I've credited.*

*Second addendum captured 2026-05-15, the next day. Three more scenarios
deeper. The pattern holds: positive observations keep adding up — the
AI bridge classifier reasoning correctly about scope mismatch in Sc 9
(a real moment), and Discover catching the year-old VCF contradiction
that I'd never noticed. The biggest new finding is the gap between
the typed-edge model and the answer pipeline (#21): the graph stores
semantics that the RAG layer doesn't use. That's a half-finished
promise sitting in plain sight. Second pattern: maintenance and
new-domain onboarding are both materially under-served by surfaces
that work fine in the steady-state-enrichment case — Notes is a list,
the graph is a navigator, Synthesize forces prose. Three findings are
now ★ 3× confirmed (Discover-is-the-engine, flat-tag-hierarchy-needed,
data-quality-not-visualized); each was named earlier but only after
Sc 7–9 is the evidence broad enough to treat as settled. The original
caveat carries forward: as the author of these scenarios I see the
code beneath the surface, so some pains may be one-edit fixes
overestimated and some positives may be under-credited.*
