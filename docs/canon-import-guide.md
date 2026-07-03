# Canon Import & Uncertainty Guide

How to bring *Canon* into Constellation without flattening exploratory story
material into static wiki facts. This documents the uncertainty metadata
(ADR-076), the symbolic edge vocabulary (ADR-077), and a safe import order.

Companion to `docs/canon-readiness-audit.md` (the "why"). This is the "how".

---

## The one principle

**Constellation now supports "not yet knowing" as a queryable, visible,
AI-usable state.** Preserve that. When something is uncertain, *record the
uncertainty* — don't round it up to a fact or down to a deletion.

---

## Uncertainty metadata (fields)

Every note carries five optional fields, editable on the node detail page under
**Canon status** and settable at import time:

| Field | Values | Use it for |
|---|---|---|
| `canon_status` | `canon` · `provisional` · `speculative` · `discarded` · `image_only` | Where an idea sits on the fixed↔speculative axis. `image_only` = a charged image with no assigned meaning yet. `discarded` keeps a set-aside idea instead of deleting it. |
| `node_status` | `emerging` · `stable` · `contradicted` · `retired` · `unresolved` | The development lifecycle of the idea itself. |
| `charge` | `low` · `medium` · `high` · `goosebump` | Emotional / symbolic energy. `goosebump` is the top tier — the felt-sense signal. |
| `do_not_name_yet` | boolean | A protected flag. The idea is load-bearing *because* it's unresolved; naming it now would collapse it. |
| `confidence` | 0–100 | How settled you feel. Absent = unrated (not the same as low). |

These power the **Canon** views (nav → Canon) and the `/canon` API. The AI sees
them on every retrieved note (a `Status:` line) and is told to respect them —
notably, it will not resolve or over-define a `do_not_name_yet` node.

### When to use a tag vs. a field

- **Fields** = the *epistemic state* of a note (how sure, how charged, how open).
  Use them when you want to *filter or browse* by that state or have the AI reason
  over it. There is exactly one of each per note.
- **Tags** = *classification and membership*. Use freeform tags for node "kind"
  and book relevance, which can stack:
  - `kind:image`, `kind:symbol`, `kind:motif`, `kind:scene-seed`,
    `kind:open-question`, `kind:mystery`, `kind:primary-symbolic-node`, …
  - `book:Canon`, `book:Propagat`, `book:Zeitgeist`, `book:trilogy-wide`
  - the reserved narrative roles used by the workspace: `narrative:character`,
    `narrative:theme`, `narrative:location`, `narrative:lore-*`

Rule of thumb: if you'd want a saved view of it and there's one value per note,
it's a field; if it's a category or can stack, it's a tag.

### When to use an edge type vs. an edge note

- **Edge type** = the *kind* of relationship, when you'll want to filter on it
  ("show every `FORESHADOWS` edge"). Canon adds thirteen symbolic verbs
  (ADR-077): `HOLDS_OPEN`, `REFUSES_TO_NAME`, `CARRIES_CHARGE_FOR`, `FORESHADOWS`,
  `MIRRORS`, `INVERSION_OF`, `PROTOTYPE_OF`, `AMPLIFIES`, `CORRUPTS`,
  `DESTABILIZES`, `STABILIZES`, `PROTECTS`, `THREATENS` — alongside the existing
  `CONTRADICTS`, `QUESTIONS`, `ANALOGOUS_TO`, `INSPIRED_BY`, `EXPLAINS`, etc.
- **Edge note** = *why this connection matters*, in your own words. This is where
  nuance lives and is often more load-bearing than the type. It's stored, shown,
  and fed to the AI. Use it on every non-obvious edge.

Don't try to type every possible relation — pick the verb that you'll filter on
and put the rest in the note.

---

## Worked examples

**The Stained Glass Cathedral** — an image that arrives before its meaning:

- `kind:image` (tag), `book:trilogy-wide` (tag)
- `charge = goosebump`
- `canon_status = image_only`
- `do_not_name_yet = true`
- No edges required yet. A charged image with no scene is *valid* — it will show
  up under **Canon → Images Carrying Charge** and, because it has no scene, in the
  AI's answer to "what high-charge images have no scene yet?"

**Give the Shape a Name** — a primary symbolic node still taking shape:

- `kind:primary-symbolic-node` (tag)
- `node_status = emerging`
- `canon_status = provisional`
- Appears under **Canon → Emerging Truths**; the AI attributes it as developing,
  not as fact.

**Michael → HOLDS_OPEN → Final Shared Moment** — a typed symbolic edge with a note:

- Edge type `HOLDS_OPEN`
- Edge note: *"Michael does not create the Place or project truth; he sustains
  openness against collective collapse pressure."*
- Filterable as a `HOLDS_OPEN` edge; the note is what the AI reads to understand
  the relationship.

**The Clearing → PROTOTYPE_OF → Final Shared Moment** — an early, smaller instance
of the later thing. Edge type `PROTOTYPE_OF`, note explaining the prefiguration.

---

## Recommended import order

1. **Taxonomy first.** Pre-create the reserved tags before bulk import:
   `book:Canon|book:Propagat|book:Zeitgeist|book:trilogy-wide`, the `kind:*` set,
   and the `narrative:*` roles. Tag discipline at import is what makes every later
   filter and view work.
2. **One project per book; shared symbols trilogy-wide.** Three project hubs
   (Canon / Propagat / Zeitgeist), each with its own timeline(s). Put trilogy-wide
   symbols, motifs, and metaphysical rules in `book:trilogy-wide` so cross-book
   echoes stay visible.
3. **Charged-first, edges-later.**
   - (a) Seed the high-priority nodes as `permanent`/`structure` with `charge` and
     `canon_status` set *before* wiring edges — preserve the images first. A
     charged image with no plot explanation is fine: set `canon_status=image_only`,
     `do_not_name_yet=true`, leave it edgeless.
   - (b) Then add edges (typed verb + note).
   - (c) Then run **Discover** (Bridges/Triangles) and the suggest-links
     accept/reject flow to surface connections you didn't hand-draw.
4. **Use Story Dump for transcripts.** Paste constellation-state documents and
   session addenda through the workspace **Story Dump** to extract
   scene/character/theme candidates instead of retyping; accept node-by-node.
5. **Don't pre-resolve tensions.** Import contradictory character readings as two
   nodes joined by an unresolved `CONTRADICTS` edge and leave it open. Mark
   `do_not_name_yet` on load-bearing mysteries so no synthesis pass quietly closes
   them.
6. **Snapshot on entry.** After the first import, run a **Resume Briefing** to
   write the inaugural state-of-the-constellation artifact; each return adds
   another, building the history of where the story was still becoming.

---

## The Canon views & AI queries

Nav → **Canon** gives five deterministic saved-views (pure SQL filters, no AI
guessing):

- **Images Carrying Charge** — `charge ∈ {high, goosebump}`
- **Emerging Truths** — `node_status=emerging` or `canon_status=provisional`
- **Do Not Name Yet** — `do_not_name_yet=true`
- **Speculative** — `canon_status=speculative`
- **Open Threads** — unresolved `CONTRADICTS`/`QUESTIONS` edges + `node_status=unresolved`

Each view has a **Narrate with AI** button (`POST /canon/ask`) that summarizes the
*deterministically-selected* node set with `[Note N]` citations — so:

- "What should I not define yet?" → the Do-Not-Name-Yet set, described without
  being resolved.
- "What is still speculative?" → the Speculative set, cited.
- "What high-charge images have no scene yet?" → charged images with no edge to a
  story event.

The AI never infers these from prose; it reads the structured fields.
