# Constellation Readiness Audit — Canon

*Can Constellation function as a living creative substrate for the Canon trilogy —
a graph that preserves charged images, holds uncertainty open, tracks emerging
truths, and helps the author return to where the story is still becoming?*

This report audits the **implemented** system (schema, services, UI) against the
way Canon wants to be developed. It is grounded in the code, not the design docs —
where the Phase 9 design briefs promise more than the migrations deliver, the
report follows the migrations.

---

## 1. Executive verdict — **Nearly ready**

Constellation is an unusually good fit for Canon at the *structural* level and a
poor fit at the *epistemic* level, and both halves of that sentence matter.

**Why it fits.** The app is already mid-pivot toward exactly this use case. Phase 9
added a narrative workspace with a timeline canvas, character/theme/location/lore
roles, a live **Scene Context** assembler, **work sessions** that capture intent and
hand off to the next session, a **Story Dump** that extracts scene/character/theme
candidates from freeform text, and a **Resume Briefing** that reconstitutes a
project's state on return. Underneath, every edge carries a free-text *"why this
connection matters"* note that is stored, displayed, and fed to the AI; tensions
(`CONTRADICTS` / `QUESTIONS`) are first-class and can be marked *resolved* or left
open; and the RAG layer is citation-grounded and **edge-aware** — it preserves
contradictions instead of synthesizing them away. That is most of "a living map of
resonance" already built.

**Why it doesn't (yet).** Canon's core demand is that **uncertainty be a
first-class object** — "appears to be…", "emerging truth", "load-bearing mystery",
"image carrying charge", "do not overdefine yet." The implemented schema has **no
field for any of this**: no `status` (emerging/stable/contradicted), no
`confidence`, no `canon_status` (canon/provisional/speculative/image-only), no
`charge`, no "do-not-name-yet" flag. Today the only place that nuance can live is
inside a node's prose or as ad-hoc tags — which means you cannot *filter* to "all
high-charge images with no scene" or "everything still speculative," and the
proposed signature views (Images Carrying Charge, Emerging Truths, Do-Not-Name-Yet)
have nothing to query against. A graph that cannot represent "not yet decided" as a
queryable state will, over a trilogy, quietly flatten Canon into the static wiki the
author explicitly wants to avoid.

The gap is real but **narrow and additive**: a handful of nullable metadata columns,
one saved-view convention, and an edge-vocabulary decision. None of it fights the
architecture; most of it extends patterns the app already uses (the `is_story_event`
flag, the `narrative:*` reserved tags, the `prose_status` enum). Hence *nearly*
ready — you can begin importing Canon now with tag-based approximation, but a short,
well-scoped pre-import pass would prevent rework and stop the flattening before it
starts.

| | |
|---|---|
| **Structural substrate** (graph, edges, narrative timeline, sessions) | ✅ Strong |
| **Grounded AI / discovery** (cited RAG, bridges, triangles, edge-aware tension) | ✅ Strong |
| **Uncertainty as first-class object** (charge, canon-status, emergence) | ❌ Missing — the blocking gap |
| **Symbolic / resonance edge vocabulary** | ⚠️ Approximate (fixed vocab + edge notes) |
| **Cross-project resonance** | ❌ Not implemented |

---

## 2. Strengths — what Constellation already does well for Canon

1. **Edges carry meaning, not just connection.** Every edge has an optional `note`
   (the author's "why") *and* a `classifier_rationale` (the AI's reason, frozen at
   creation). Both are stored, shown in the EdgePanel, and injected into RAG context.
   This is the single most Canon-aligned feature in the app: `Michael →
   holds_open → Final Shared Moment` with a paragraph of reasoning is fully
   supported *as an edge note today* — only the verb label is constrained.

2. **Tension is first-class and need not be resolved.** `CONTRADICTS` and
   `QUESTIONS` edges can be left open indefinitely or marked *resolved* — optionally
   pointing at the synthesis note that supersedes them (`resolved_by_node_id`). The
   RAG prompt is explicitly instructed to *name the tension, not collapse it*, and
   annotates resolved edges as historical. Contradictory character interpretations
   can coexist (stress test #3 passes structurally).

3. **A genuine narrative workspace, not a bolted-on tag.** Projects are
   structure-note hubs with persistent scope (pinned notes, tags, briefing prompt,
   mode). Narrative mode surfaces: a **timeline canvas** with parallel lanes, act
   spans, story-time and discourse-order axes, prose-status tracking, and
   auto-`FOLLOWS_FROM` chaining; **narrative roles** (character/theme/location/lore)
   via reserved `narrative:*` tags with quick-create UI; and a **Scene Context**
   view that re-assembles a scene's characters, themes, location, explaining lore,
   and arc notes *live from the graph on every open* ("never research your own work").

4. **Creative-state capture across time.** **Work sessions** record `intent`,
   `progress_notes`, `blockers`, `closing_notes`, and `next_session_intent`, and
   attribute every node/edge created during the session. The **Resume Briefing**
   runs a saved prompt against the saved scope and writes a dated snapshot note with
   `CITES` edges — an accumulating record of "the state of the constellation each
   time I returned." This is the closest thing to Canon's "return to a prior creative
   state."

5. **Frictionless capture with in-flow linking.** Quick capture (Ctrl+K → fleeting),
   intentional capture (Ctrl+Shift+Space) with a **dedup panel** that shows similar
   existing notes and lets you link inline before saving, a free-writing pad with
   debounced autosave and **promote-to-node**, and a CLI (`con --project`). You can
   preserve an image first and decide its ontology later.

6. **Grounded, edge-aware AI.** Ask uses hybrid retrieval (vector + FTS via RRF) plus
   graph BFS to depth 2, and answers with `[Note N]` citations backed by a
   provenance list and the actual edges traversed. It does not hallucinate freely —
   thin coverage triggers an explicit hedge. A **critic** mode enumerates the
   questions a careful reader would ask (useful for interrogating an emerging truth).

7. **Structural discovery of hidden relationships.** **Bridges** surface pairs with
   high embedding similarity but no edge (with an optional cross-tag-domain filter to
   force "across-boundary" candidates), and **Triangles** surface pairs sharing ≥2
   graph neighbors but no direct edge. Both are exactly the "resonance between
   distant nodes" Canon wants — within a project.

8. **Story Dump as artifact extraction.** Paste a session transcript or freeform
   brain-dump, pick `story-arc | character | themes`, and the AI proposes candidate
   nodes you accept one at a time (themes come with a canonical-usage note). Stress
   test #5 (add a session artifact and extract nodes) is a built workflow.

---

## 3. Gaps — what would limit Canon development

**G1 — Uncertainty is not representable as data (the blocking gap).** No
`status`, `confidence`, `canon_status`, `charge`, `development_stage`, or
`do_not_name_yet` field exists on a node. Canon's entire vocabulary of provisional
knowing has nowhere to live except prose. Consequences: you cannot *filter or browse*
by charge / canon-status / emergence; the Images-Carrying-Charge, Emerging-Truths,
and Do-Not-Name-Yet views are unbuildable as anything but saved tag searches; and
the AI cannot answer "what is still speculative?" or "what should I not overdefine
yet?" except by reading prose, which it was not told to treat specially.

**G2 — Symbolic/resonance edge verbs are absent and the vocabulary is closed.**
The 19 edge types are research-flavored (`SUPPORTS`, `MEASURES`, `BUILDS_ON`,
`REFINES`…). Of Canon's ~40 desired verbs, only a handful map cleanly:
`symbolizes`→`EXPLAINS`-ish, `echoes`/`mirrors`→`ANALOGOUS_TO`, `contrasts_with`→
`CONTRADICTS`, `asks`→`QUESTIONS`, `emerges_from`→`INSPIRED_BY`, `belongs_to`/
`appears_in`→`COLLECTS`, `evolves_into`→`SUPERSEDED_BY`/`FOLLOWS_FROM`. The
distinctively Canon ones — `foreshadows`, `carries_charge_for`, `holds_open`,
`refuses_to_name`, `corrupts`, `amplifies`, `destabilizes`, `inversion_of`,
`prototype_of` — have **no typed equivalent**, and ADR-007 makes the vocabulary a
*hard rule* (fixed, not user-defined). You can still encode these as an edge *note*
on a generic edge, but you lose typed filtering ("show every `foreshadows` edge").

**G3 — No cross-project resonance.** Bridges/Triangles/Ask are single-corpus and,
in the workspace, single-project-scoped. The "this resembles a note from another
project / this symbol appears elsewhere" suggestion — with accept/reject and
confidence — does **not** exist. For Canon's intended bleed-through to philosophy,
psychology, dreams, and old fragments, this is a missing capability (and the
accept/reject guard that would keep it from polluting Canon with noise is also
missing).

**G4 — No aggregated "open threads" / contradiction surfaces.** Open questions and
contradictions exist *per node* (as `QUESTIONS`/`CONTRADICTS` edges) but there is no
dashboard that lists *all* open questions or *all* unresolved tensions grouped by
book/character/metaphysics. The Open-Threads and contradiction-matrix views would
have to be built; the data is there, the aggregation query and UI are not.

**G5 — Search cannot disambiguate senses.** One embedding per note (title+content)
means a search for *"light"* returns semantic neighbors of the whole token, with no
separation of natural light / artificial light / star / fire / stained glass /
illumination (stress test #6 *partially* fails — they're retrievable together,
not distinguishable). Distinguishing senses depends on the author having tagged or
node-typed them; the engine won't do it alone.

**G6 — No node merge, no hub/over-connection analytics, no node-from-selection.**
Duplicate nodes can be detected at capture (dedup panel) but not *merged* after the
fact. Orphans and thin notes are surfaced (Discover + Notes filters), but
**over-connected gravitational hubs are not** — there is no centrality/degree view.
You cannot create a node from highlighted text in an external page.

**G7 — Narrative role coverage is uneven (Phase 10 pending).** Characters and
locations attach to scenes (`COLLECTS`), and lore explains them, but the **theme
attachment editor** and **per-character sheets** are explicitly deferred to Phase 10;
theme presence currently shows only as density dots. Manuscript export does not
exist (only `manuscript_location` pointers).

---

## 4. High-priority fixes — must-have before a major Canon import

These are ordered by how directly they protect Canon's "don't flatten it" principle.
All are additive (nullable columns / conventions), none violate ADR-001/002/005.

1. **Add uncertainty metadata to nodes (closes G1).** Nullable columns, following
   the `prose_status` precedent (CHECK-enum, NULL = "not applicable"):
   - `canon_status` ∈ `canon | provisional | speculative | discarded | image_only`
   - `node_status` ∈ `emerging | stable | contradicted | retired | unresolved`
   - `charge` ∈ `low | medium | high | goosebump`
   - `do_not_name_yet` boolean flag (mirrors `is_story_event`)
   - `confidence` (optional small int or enum)
   Add partial indexes (as the schema already does for `is_story_event`) so the
   signature views are single indexed scans.

2. **Decide the edge-vocabulary policy and write the ADR (closes/contains G2).**
   Two viable paths — pick one before import, because it determines how edges are
   created at scale:
   - **(a) Extend the enum** with a Canon set (`FORESHADOWS`, `MIRRORS`,
     `CARRIES_CHARGE_FOR`, `HOLDS_OPEN`, `REFUSES_TO_NAME`, `INVERSION_OF`,
     `CORRUPTS`, `AMPLIFIES`, `DESTABILIZES`, `PROTOTYPE_OF`) via the same
     table-recreate migration used by 0004/0006/0010. Preserves typed filtering;
     costs a new ADR amending ADR-007.
   - **(b) Keep the vocabulary fixed** and standardize on a generic edge type plus a
     structured edge note (e.g. a leading `foreshadows:` token) — zero schema change,
     but no typed filtering. *Recommendation: (a)* — Canon's symbolic web is the
     point, and typed verbs are what make the Symbol Web / Resonance Map filterable.

3. **Make uncertainty legible to the AI (depends on #1).** Once the fields exist,
   feed them into RAG context assembly and add intents for "what is still
   speculative?" and "what should I not overdefine yet?" (filter to
   `canon_status='speculative'` / `do_not_name_yet=1` and have the model reason over
   them rather than guess from prose). This is what makes stress test #8 pass.

4. **Aggregated Open-Threads + unresolved-tension views (closes G4).** A query that
   lists all `QUESTIONS`/unresolved-`CONTRADICTS` edges and `node_status='unresolved'`
   nodes, grouped by book tag / character / theme. Mostly a new endpoint + page over
   existing data.

5. **Import-time tagging discipline (see §10).** Before bulk import, fix the
   `narrative:*` tag taxonomy and a `book:Canon|book:Propagat|book:Zeitgeist` scheme
   so node "types" and book-relevance are filterable from day one.

---

## 5. Nice-to-have improvements — useful but not blocking

- **Cross-project resonance suggestions** with confidence + accept/reject (closes G3).
  Reuse the Bridges machinery, drop the same-project filter, add a dismissed-suggestion
  table (the pattern already exists: `dismissed_corpus_suggestions`).
- **Node merge** with edge re-pointing and soft-retire of the loser (closes part of
  G6); preserves older interpretations rather than overwriting (Canon stress goal).
- **Over-connected hub view** (degree/centrality) alongside the existing orphan view.
- **Theme attachment editor + per-character sheets** (G7 / Phase 10) — turns
  Character Constellation and Symbol Web from "filter the graph" into first-class views.
- **Sense-aware tagging helper** for polysemous symbols (light/fire/glass) so search
  and the Symbol Web can separate senses (G5).
- **Versioned interpretations** — keep prior readings of a node without overwriting
  (Canon wants "preserve older interpretations"); today this leans on `SUPERSEDED_BY`
  edges, which works but isn't a true history.
- **Create-node-from-selection** in capture.

---

## 6. Suggested node schema

Keep the 4 base types (`fleeting | literature | permanent | structure`) and the
Phase 9 `is_story_event` flag — **do not** add 24 node types (it would fight ADR-006
and bloat every component). Instead, model Canon's node types as **structure/permanent
nodes + a reserved `kind:` tag**, exactly as the app already does for
`narrative:character`. Add the **uncertainty columns from §4.1** to every node.

**Type → representation map:**

| Canon node type | Representation |
|---|---|
| Character | structure + `narrative:character` (exists) |
| Scene / Scene Fragment | permanent + `is_story_event=1` (+ `kind:scene-seed` for fragments) |
| Image Carrying Charge | permanent + `kind:image` + `charge` field |
| Emerging Truth | permanent + `kind:emerging-truth` + `node_status=emerging` |
| Open Question | permanent + `kind:open-question` + `QUESTIONS` edges |
| Symbol / Motif | structure + `narrative:theme` (+ `kind:symbol`/`kind:motif`) |
| Artifact (session snapshot) | `artifact_type=artifact` (exists) |
| Dream Sequence | permanent + `kind:dream` |
| Metaphysical Rule / Worldbuilding | permanent + `narrative:lore-world-rule` (exists) |
| Book / Act / Chapter | structure hub + timeline + `act_spans` (exists) |
| Relationship | edge (not a node) — or structure + `kind:relationship` if it needs its own page |
| Fear / Wound, Philosophy, Ritual, Institution/Regime, Phrase/Core Line, Reader Goal, External Influence, Writing Process Note | permanent/structure + matching `kind:` tag |
| Unresolved Mystery | permanent + `kind:mystery` + `do_not_name_yet=1` |

**Recommended fields per node:** the existing `summary`, `tags`, `story_time`,
`prose_status`, `manuscript_location`, plus the new `canon_status`, `node_status`,
`charge`, `do_not_name_yet`, `confidence`. Express *book relevance*, *spoiler level*,
*aliases*, and *reader-experience-goal* as tags (`book:Canon`, `spoiler:high`,
`alias:…`) until/unless one earns a column.

---

## 7. Suggested edge schema

**Behavior is already right; vocabulary is the question.** Edge notes are stored,
displayed, queryable, and fed to the AI — so the example
`Michael → holds_open → Final Shared Moment` with its reasoning works *today* on any
edge type (stress test #4 passes). Recommendation: **extend the enum (path 6.2a)**
with a focused Canon set and *keep notes as the place nuance lives*:

- Resonance/symbol: `SYMBOLIZES`, `ECHOES`, `MIRRORS`, `FORESHADOWS`, `INVERSION_OF`,
  `PROTOTYPE_OF` (and reuse `ANALOGOUS_TO`, `CONTRADICTS`/contrasts).
- Force/dynamics: `AMPLIFIES`, `CORRUPTS`, `DESTABILIZES`, `STABILIZES`, `THREATENS`,
  `PROTECTS`, `HOLDS_OPEN`, `REFUSES_TO_NAME`, `CARRIES_CHARGE_FOR`.
- Psychology: `WOUNDS`, `FEARS`, `DESIRES`, `MOTIVATES` (or keep these as
  character-attribute nodes + generic edges if you prefer fewer verbs).
- Reuse for structure: `appears_in`/`belongs_to`→`COLLECTS`, `asks`→`QUESTIONS`,
  `answers_partially`→a note on `SUPPORTS`, `evolves_into`→`SUPERSEDED_BY`,
  `emerges_from`→`INSPIRED_BY`, `depends_on`→`FOLLOWS_FROM`/`SCOPED_TO`.

Don't try to type *every* one of the ~40 verbs — pick the ~12 that you will actually
filter by, and let the rest ride as edge notes. Amend ADR-007 to record that the
narrative project may extend the vocabulary, and keep `QUESTIONS`/`CONTRADICTS` as
the resolvable tension types.

---

## 8. Suggested UI views — most valuable for Canon

Built or near-built (reuse): **Character Constellation** (graph focus-mode on a
character + Scene Context), **Book Structure** (project hub + timeline + act spans),
**Resonance Map** (Bridges + Triangles), **Artifact Archive** (`artifact_type` +
Resume-Briefing snapshots), **Scene Seed Board** (Notes filtered to
`is_story_event` / `kind:scene-seed`).

To add (each is a saved filter over the new metadata, plus a page):
1. **Images Carrying Charge** — gallery of `charge ∈ {high, goosebump}`, sorted,
   with "has no scene yet" subset (the `no_edges`/no-`appears_in` filter already
   exists).
2. **Open Threads Dashboard** — all open `QUESTIONS` + unresolved `CONTRADICTS` +
   `node_status=unresolved`, grouped by `book:` / character / theme (§4.4).
3. **Emerging Truths** — `node_status=emerging` / `canon_status=provisional`.
4. **Symbol Web** — `narrative:theme` nodes + their symbolic edges, filterable by
   sense; depends on the theme-attachment editor (Phase 10) for full value.
5. **Do-Not-Name-Yet** — `do_not_name_yet=1`, a deliberately protected zone the AI
   is told to treat as load-bearing mystery.
6. **Charge/Canon-status legend on the graph** — color or badge nodes by
   `canon_status` so fixed canon is visually distinct from speculative emergence
   (the graph already color-codes by type; add a toggle for canon-status).

---

## 9. Suggested AI workflows

The retrieval substrate (cited, edge-aware, scoped) already supports most of Canon's
target questions *once the metadata exists*. Concretely:

- **"What is still speculative?" / "What should I not overdefine yet?"** → add intents
  that pre-filter to `canon_status='speculative'` / `do_not_name_yet=1` and have the
  model summarize, citing the nodes (don't make it infer from prose). Passes stress
  test #8.
- **"What high-charge images have no scene yet?"** → `charge>=high` ∩ no `appears_in`
  edge; a deterministic query the AI narrates.
- **"What unresolved questions touch Rubello?"** → graph BFS from the Rubello node
  filtered to `QUESTIONS`/unresolved edges (Ask already traverses edges; scope by node).
- **"Where does the clearing echo the cathedral?"** → Bridges/Triangles between the
  two symbol nodes, or Ask scoped to `narrative:theme`.
- **"What contradictions exist in the current metaphysics?"** → the Open-Threads
  aggregation (§4.4) filtered to `narrative:lore-world-rule`.
- **Cross-project "what does my corpus know about X I haven't used?"** → needs the
  cross-project resonance feature (§5) to reach beyond Canon into the philosophy/
  psychology notes.
- **Keep the critic mode** for interrogating an emerging truth before promoting it to
  canon.

The non-negotiable that the app *already* honors: answers cite nodes/edges and hedge
on thin coverage — so the AI references the underlying graph rather than inventing.

---

## 10. Import strategy — bringing Canon in without a mess

1. **Land the §4 metadata + edge-vocabulary decision first.** Importing before the
   `canon_status`/`charge`/`do_not_name_yet` columns exist means a second pass to
   backfill them by hand on hundreds of nodes. Do it once, up front.
2. **Fix the taxonomy before bulk import.** Pre-create the reserved tags:
   `book:Canon|book:Propagat|book:Zeitgeist|book:trilogy-wide`, the `kind:*` set from
   §6, and the `narrative:*` roles. Tag discipline at import is what makes every later
   filter and view work.
3. **One project per book; symbols/metaphysics shared.** Three project hubs (Canon,
   Propagat, Zeitgeist), each with its own timeline(s) and act spans, but put
   trilogy-wide symbols, motifs, and metaphysical rules in `book:trilogy-wide` so
   cross-book echoes remain visible (the workspace allows a node to live in multiple
   scopes via tags).
4. **Import in passes, charged-first.** (a) Seed the high-priority nodes from the
   prompt (Give the Shape a Name, The Clearing, Michael-as-Amplifier, the Z.E.N.
   Initiative, …) as `permanent`/`structure` with `charge` and `canon_status` set,
   *before* wiring edges — preserve the images first (stress test #1: a charged image
   with no plot explanation is valid; just set `canon_status=image_only`,
   `do_not_name_yet=1`, leave it edgeless). (b) Then add edges with notes. (c) Then
   run Bridges/Triangles to surface the connections you didn't hand-draw, and the
   suggest-links accept/reject flow to confirm them.
5. **Use Story Dump for session transcripts.** Paste existing constellation-state
   documents and addenda through Story Dump (`story-arc`/`character`/`themes`) to
   extract candidates rather than retyping; accept node-by-node.
6. **Don't pre-resolve tensions.** Import contradictory character readings as two
   nodes joined by `CONTRADICTS` and leave them *unresolved* — the app is built to
   hold that open (stress test #3). Mark `do_not_name_yet` on the load-bearing
   mysteries so no future synthesis pass quietly closes them.
7. **Snapshot on entry.** After the first import, run a Resume Briefing to write the
   inaugural state-of-the-constellation artifact; every return adds another, building
   the history of where the story was still becoming.

---

## Stress-test scorecard

| # | Test | Result |
|---|------|--------|
| 1 | High-charge image, no plot explanation, no forced categorization | ✅ structurally (edgeless node is fine) — ⚠️ "charge" is a tag until §4.1 lands |
| 2 | Open question connected to six themes, stays unresolved & useful | ✅ (QUESTIONS edges, left open) |
| 3 | Character with contradictory interpretations, both preserved | ✅ (two nodes + unresolved CONTRADICTS) |
| 4 | Edge with a nuanced note, visible & queryable | ✅ (edge `note` stored, shown, fed to RAG) |
| 5 | Add a session artifact and extract nodes | ✅ (Story Dump review/accept) |
| 6 | Search "light" distinguishes natural/artificial/star/fire/glass | ⚠️ retrievable together, **not** sense-separated (G5) |
| 7 | Search "Michael" shows him as therapist/amplifier/painter/fugitive without flattening | ✅ if facets are separate nodes/tags; ⚠️ one node = one blob |
| 8 | AI: "what should I not define yet?" identifies load-bearing mysteries | ❌ today (no field to query) → ✅ after §4.1 + §4.3 |

---

## Guiding-principle check

Constellation will *not* force Canon to become a static encyclopedia **provided the
uncertainty layer lands**. The bones of "a living map of resonance" — typed edges
that carry their own reasoning, tensions held open, a live scene assembler, session
hand-offs, grounded discovery — are already here. What's missing is the vocabulary
of *not-yet-knowing*. Add that, and the app behaves like the place where the story is
still becoming. Skip it, and the graph will keep working but will slowly harden every
"appears to be…" into a fact. The recommendation is to spend the short pre-import pass
in §4 first.
