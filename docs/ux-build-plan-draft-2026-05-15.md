# Constellation: calibrated build-plan draft

*Draft, 2026-05-15. Companion to `ux-walkthrough-2026-05-14.md`.*

> This document is a **calibration pass** on the walkthrough's tiered
> recommendations, not a final build plan. It re-buckets Tier 1 by
> honest cost and dependency, identifies items that are actually
> Tier 2, lists items whose value is gated behind unbuilt Tier 2/3
> work, and names the decisions that need ADRs before sequencing.
>
> Reasoning behind each cost estimate and bucket assignment is
> marked explicitly so a downstream planner can audit or override.
> **Bucket assignments are normative recommendations, not facts.**

---

## 1. Purpose and scope

The walkthrough produced ~24 Tier 1 items, ~14 Tier 2 items, and ~15
Tier 3 items across twelve scenarios. Its persona repeatedly caveats
its own bias:

> "*I'm closer to the code than a real long-term user would be, so
> some of these pains may be one-edit fixes I'm overestimating, and
> the positive observations may be more important than I've credited.*"
> — Addendum, 2026-05-14
>
> "*Some pains may be one-edit fixes overestimated and some positives
> may be under-credited.*" — Second addendum, 2026-05-15

The bias is real and **consistent in one direction**: under-counting
the cost of items that need a real UI surface (the "Compare to corpus"
panel, the Quick-switcher, the Tag-scoped Ask scope-builder) while
estimating accurately on items that are genuinely small. This
calibration's job is to separate the two cases before the final
build plan sequences anything.

**In scope:**

- Re-estimating Tier 1 cost honestly
- Identifying Tier 1 items that are actually Tier 2
- Identifying items whose value is gated behind dependencies
- Naming ADRs needed before sequencing

**Out of scope:**

- Sequencing into phases with acceptance criteria — that's the
  final-plan job
- Picking between the two strategic Tier 2 bets (Project Workspace
  vs. edge-semantics-into-RAG)
- Re-evaluating Tier 2/3 broadly — most of those are honestly
  estimated already

---

## 2. How to read this doc

Each item carries (a) the walkthrough's original claim, (b) my
recalibrated estimate, and (c) a **Reasoning** callout when those
differ meaningfully. The reasoning is the *delta* from the walkthrough's
position, not a fresh derivation.

Cross-references to walkthrough findings use `#N` notation matching
the consolidated findings table at the end of the walkthrough.

**The final-plan Claude should:**

1. Read the walkthrough for context.
2. Read this calibration for cost.
3. Override anything where the reasoning doesn't hold up against the
   actual code. This doc cites no specific file paths; the persona
   does, and is occasionally wrong about them — verify before
   committing to estimates.
4. Sequence into phases with acceptance criteria in a separate doc.

---

## 3. Calibration assumptions

These shape every estimate below. Override or revise as needed.

- **Pace.** Cost estimates assume one engineer working at the Phase C
  multi-PR rhythm. Pair work, review, and ADR writing are included.
  "Half-day" = 4h focused. "Day" = 8h including UI integration and
  one test. "2–3 days" = cross-layer touch (backend + frontend +
  tests) without iOS or Shortcuts.
- **iOS Shortcut work** is materially slower than backend or frontend
  work — different dev environment, no automated tests,
  user-upgrade-gated. Budget ~2× normal effort. Risk lives on the
  delivery side, not the implementation side.
- **Persona bias direction.** Under-estimates anything that needs a
  real surface (modal-inside-modal, side-by-side panel, keyboard
  modal). Accurate on schema migrations, enum additions, and one-line
  service patches. Reasoning marks call out the specific persona
  claim where I'm overriding.
- **ADRs are work too.** The repo enforces "record decisions as they
  are made" (CLAUDE.md). Any item involving a contract semantics
  change, threshold definition, or new endpoint shape carries an ADR
  cost. Folded into the estimate where applicable.
- **Tier boundaries are leverage × cost, not just cost.** A half-day
  fix that unlocks three downstream features stays Tier 1; a half-day
  fix that's decorative slides to Bucket D.

---

## 4. Top-line recommendation

1. **Ship Bucket A as a single "small wins" PR** (~5–7 working days).
   Doesn't commit to a strategic bet. Builds momentum, shakes out
   the small-migration and test patterns the bigger work will need.
2. **Schedule Bucket B as ~3-day stand-alone PRs**, one at a time.
   Real Tier 1 features but they don't bundle cleanly.
3. **Pick one of the two strategic Tier 2 bets** (edge-semantics-
   into-RAG or Project Workspace) and build a phase plan against it.
   Bucket C items belong inside that phase plan, not in this
   calibration.
4. **Hold Bucket D** until the strategic bet decision is made;
   shipping the hollow items alone would be decorative.

---

## 5. Bucket A — Small wins (single PR, ~5–7 working days)

Ten items. Each genuinely half-day to a day. None depend on each
other. None gate the strategic bets.

| # | Item | Cost | Walkthrough finding |
|---|---|---|---|
| A1 | Use `CITES` (not `COLLECTS`) for `save-answer` auto-edges | 30 min + ADR | #12, #17 |
| A2 | Capture timestamp in inbox display | 1 hour | #28 |
| A3 | `?ids=a,b,c` URL param on `/graph` | 4h | #19 |
| A4 | Cross-tag-domain filter on Discover/Bridges | 4h | Sc 6 pain #2 |
| A5 | Union-mode tag selection in Synthesize scope | 4h | Sc 6 pain #3 |
| A6 | Literature-shaped edge types (`BUILDS_ON`, `APPLIES_TO`, …) | 4h | #11 |
| A7 | `NotePreviewPopover` inside `NodePicker` | 4h | #26 |
| A8 | Persist classifier rationale on edge | 8h | Sc 9 pain #6 |
| A9 | `mode=brief` flag on `/ask` | 8h | #30 |
| A10 | Critic-mode prompt on `/ask` or `/nodes/[id]` | 8h | Sc 5 pain #4 |

**Implementation total:** ~46h + ~8h of ADRs + review = **5–7 working
days end-to-end**.

**Reasoning — items where my estimate differs from the walkthrough:**

> **A9 (`mode=brief` flag):** walkthrough implies tiny prompt-engineering
> fix. The branching flag and request-model change are 1–2 hours;
> the rest of the day is prompt-testing across query types to make
> sure advocacy mode doesn't degrade factual-mode behavior. A day
> is honest.

> **A10 (Critic mode):** same pattern. Branching prompt is trivial;
> getting the questions to be sharp rather than generic is real
> prompt-engineering work and benefits from real-corpus iteration.

> **A8 (Classifier rationale):** walkthrough says "tiny schema
> migration, compounding value." Tiny migration is half-day; the UI
> surface in the slide-out (or wherever the edge meta is displayed)
> is the other half. Honest at a day.

**Sequencing inside Bucket A:**

- **A1 ships first** so subsequent ADRs in the PR can reference the
  edge-vocabulary precedent.
- A6 (literature-stance verbs) ships in this PR; D1 (evolution-stance
  verbs) does *not* — they're hollow without Tier 2 backing.
- A4, A5 are pure UI; A3, A7 are mixed; A2, A8 are display/migration.
  Mix them in any order.

**ADRs required for Bucket A:**

- **A1:** edge-type semantics for syntheses — `CITES` is a contract
  change for any consumer reading `save-answer` output.
- **A6:** expanded EdgeType enum (literature-stance verbs).
- **A9:** minor ADR on the advocacy-mode prompt semantics — at
  minimum a note that Ask now has two modes and what governs which
  is appropriate. Could be deferred and folded into the strategic-bet
  ADR if the full edge-semantics-into-RAG plan supersedes it.

---

## 6. Bucket B — Real Tier 1, sequenced not bundled

Five items. Each 2–3 days. Don't bundle — they touch overlapping but
distinct subsystems and benefit from independent review.

| # | Item | Cost | Walkthrough finding |
|---|---|---|---|
| B1 | "Recently captured/edited/linked" sections on Home | 2 days | Sc 1 wishlist |
| B2 | Schema-level Notes filters (no-summary, no-edges, …) | 2–3 days | #19 |
| B3 | Batch suggest-links endpoint + review UI | 3 days | #9 |
| B4 | Triangle-completion Discover tab | 2–3 days | Sc 6 pain #6 |
| B5 | Negative-finding framing on `/ask` | 2 days | #25 |

**Reasoning — why these aren't Bucket A:**

> **B1:** walkthrough estimates Home recency sections as "small."
> Reality: three queries (capture this week, edit this week, link
> this week), a Home component with three sections, sorting, and
> the small UX choice of what "this week" means relative to local
> time / last-visit. 2 days realistic.

> **B2:** walkthrough estimates as "one chip row over the existing
> repository layer." Each predicate ("no summary," "no outgoing
> edges," "no edges either," "edge-count = 0," "summary length < N")
> is a one-line repo method, a chip, a test, and an API contract
> addition. With ~5 predicates that's ~15h plus the chip UI pattern
> and a contract ADR for composability with existing tag/type/age
> filters. 2.5 days.

> **B3:** walkthrough estimates as "compresses 20-minute grind to
> 30-second review." The endpoint (parallel per-node calls + server-
> side dedup of (source, target) as undirected pairs) is ~1 day. The
> review UI — accept-all, per-edge accept/reject, edge-type override
> on each proposed edge — is the larger half at 2 days. The persona
> under-counts review-UI work consistently throughout the walkthrough
> (Sc 4, Sc 7, Sc 12 all assume "list of cards, three buttons" takes
> negligible time).

> **B4:** SQL for A-C-B with A↔B missing is ~1 day. Tab UI is the
> size of the existing Bridges tab — ~1 day. Hidden cost: the
> ranking ADR. Which triangles surface first — pure structural count,
> similarity-weighted, recency-weighted? Without that decision the
> implementation is unprincipled.

> **B5:** walkthrough estimates as "first-pass fix … prepend the
> answer with hedge text." Real: needs an ADR on what counts as
> "low retrieval confidence" — max similarity, mean of top-K, per-
> sub-claim. Without that the threshold is hand-tuned and the
> behavior drifts. Land the ADR first, then ~0.5d for the prompt
> branch + ~1d for testing across query types. 2 days end-to-end.

**ADRs required for Bucket B:**

- **B2:** composable Notes-filter API contract.
- **B4:** triangle-completion ranking semantics.
- **B5:** low-confidence retrieval threshold (likely a per-claim
  max-similarity cutoff, but requires data).

---

## 7. Bucket C — Mis-tiered: these are actually Tier 2

Six items the walkthrough placed in Tier 1 that are honestly Tier 2
in scope. They should slot into the strategic-bet phase plan, not the
small-wins or sequenced-Tier-1 work.

| # | Item | Cost | Walkthrough finding |
|---|---|---|---|
| C1 | Tag/recency scope on Ask | 4–5 days | Sc 2 Path B |
| C2 | Quick-switcher (Cmd+P) | 4–5 days | Sc 1 pain #6 |
| C3 | "Compare to corpus" on capture modal | 1–2 weeks | #24 |
| C4 | Verbatim flag on iOS Shortcut + inbox marker | ~3 days + iOS risk | #28 |
| C5 | `--tag` / `--project-context` prompts on iOS Shortcut | ~2 days iOS-side | #27 |
| C6 | Save-time typed-edge suggestion in capture modal | 0.5d on top of C3 | Sc 10 pain #7 |

**Reasoning — why these are Tier 2:**

> **C1:** matches Synthesize's scope-builder architecture exactly.
> Backend: `ScopedRagQuery` Pydantic model + retrieval pipeline that
> respects scope filter. Frontend: scope-builder UI in `/ask`,
> collapsed by default. The Synthesize scope-builder is a substantial
> piece of UI work; mirroring it for Ask is the same magnitude. If
> Synthesize's scope-builder lived at Tier 2 when first built (which
> it implicitly did), so does Ask's.

> **C2:** walkthrough estimates as "Cmd+P over notes + structure
> notes + sources." The keyboard chord + modal is a day; the fuzzy
> across entity types + the keyboard nav within results + the
> action-row (recent / commands / search-as-you-type) is real
> product polish. Tools like this *feel* one-off but the polish
> budget is high.

> **C3:** walkthrough calls this "highest-leverage Tier 1." The
> leverage claim is accurate; the cost estimate is wrong by a wide
> margin. Components needed:
> - `POST /search/dedup` endpoint that takes draft text, embeds it,
>   runs vector + FTS5, returns top-K with similarity scores and
>   diff hints.
> - Frontend side-by-side panel inside the capture modal (which is
>   already non-trivial Floating UI work — modal-inside-modal or
>   expand-on-blur transitions).
> - Empty-state, latency-state, "no candidates found" handling.
> - C6 (the "Save AND create edge" extension) is the natural pair
>   and adds another half-day.
>
> Honest estimate: 1–2 weeks. It's the right strategic move; it's
> just not Tier 1.

> **C4, C5:** iOS Shortcut work spans a different dev environment.
> Without a known Shortcut versioning/distribution story, the risk
> is on the delivery side. Implementation is 1–3 days; testing and
> rollout can stretch significantly.

> **C6:** depends on C3 existing. Half-day on top.

**Recommendation:** the strategic-bet phase plan should fold C1, C3,
C6 in differently depending on which lead bet is picked:

- **If lead is Project Workspace:** C1, C3, C6 fit the "unified
  scope-aware surfaces" theme directly. Ship them inside the
  workspace phase, not before.
- **If lead is edge-semantics-into-RAG:** C1 becomes nearly free
  once edge-aware retrieval exists (the scope-builder is then a
  thin UI layer over the same retrieval pipeline). C3 becomes more
  powerful since dedup checks can use edge-graph context, but
  ships independently.

The final-plan Claude makes this call.

---

## 8. Bucket D — Hollow without backing Tier 2/3 work

| # | Item | Walkthrough finding | Gate |
|---|---|---|---|
| D1 | Evolution-shaped edge types (`SUPERSEDED_BY`, `SCOPED_TO`, `REGIME_OF`, `RESOLVES`) | #11, #22 | Needs `resolved_at` / `resolved_by` columns (Tier 2) + merge/supersede UI (Tier 3) to be non-decorative |

**Reasoning:**

> Enum additions are half-day. But users who can name a `SUPERSEDED_BY`
> relationship without any UI to act on it, no resolved-edge state,
> and no RAG-pipeline awareness of the relationship are no better off
> than they were before. Shipping the enums alone creates a
> confusing partial feature: "the type exists but nothing happens
> when I apply it."
>
> Recommend: hold until the strategic bet decides. Both bets affect
> what these enums end up doing:
> - **Project Workspace** would use `SUPERSEDED_BY` for prose drafts
>   growing past their predecessors and for hub-note evolution.
> - **Edge-semantics-into-RAG** would use it to weight context-
>   assembly retrieval (older superseded notes drop in priority).
>
> Different behaviors; picking the wrong target wastes the schema
> room.

**Contrast with A6 (literature-shaped edge types):** literature
verbs (`BUILDS_ON`, `APPLIES_TO`, etc.) ship in Bucket A because
they're descriptive on existing edges and improve search/filter
immediately even without RAG-pipeline awareness. Different shape.

---

## 9. ADRs required before sequencing

Six decisions need writing-down before the corresponding work
sequences:

1. **CITES vs COLLECTS for save-answer** (A1) — required by the
   CLAUDE.md ADR rule on contract changes.
2. **Expanded EdgeType enum (literature-stance verbs)** (A6).
3. **Notes-filter API contract** (B2) — how new predicates compose
   with existing tag/type/age/search filters.
4. **Triangle-completion ranking** (B4).
5. **Low-confidence retrieval threshold for Ask** (B5).
6. **Edge semantics into RAG context assembly** (strategic bet) —
   prototyping-required ADR; how edge type maps to retrieval weight
   or prompt-side framing. **The final-plan Claude should treat
   this as a research task with a prototype gate before committing
   to a phase plan against the edge-semantics bet.**

ADRs 1–5 are routine and can ship inside the relevant PR. ADR 6 is
gating: the strategic bet's phase plan depends on the prototype
result.

---

## 10. Out of scope for this calibration

**Tier 2** (Project Workspace, synthesis iteration, coverage-density
overlay, transcript-aware chunker, community detection, long-form
editor, batch classify, scaffold, stale-edges, plumb-edge-semantics,
resolved-edge state, inbox content-type taxonomy, claim-node primitive,
argument audit, gap-analysis, mobile Shortcut redesign): the
walkthrough's estimates are mostly honest. The strategic-bet decision
determines which of these ship and in what order.

**Tier 3** is mostly genuinely big (free-writing pad, hierarchical
tags, voice profile, paragraph-level provenance, Discover-as-default
re-shape). One exception worth noting: **monthly corpus-health
digest** is cron + email template — a ~2-day item that the walkthrough
placed in Tier 3 because the digest *content* depends on Tier 2
maintenance signals (stale-edges endpoint, summary-coverage metric,
edges-per-node trend). Once those exist, the digest itself is cheap
and opportunistic.

---

## 11. Open questions for the final-plan Claude

1. **Which strategic Tier 2 bet leads?** Walkthrough §"Recommendations,
   tiered — updated." The strategic-bet decision determines the
   shape of Bucket C and the value of Bucket D.
2. **Bucket A before or after the strategic bet pick?** My
   recommendation: before. Doesn't commit, builds momentum, shakes
   out test/migration patterns. The downside is ~5–7 days of clock
   time before the strategic work starts.
3. **iOS Shortcut dev story.** C4, C5 estimates assume the
   infrastructure exists. If not, those items inherit the cost of
   building it.
4. **Bucket D commitment.** Does the roadmap commit to the Tier 2
   backing work that gives evolution-shaped edge types value? If
   not, D1 stays held permanently.
5. **Calibration drift.** This doc assumes the persona's bias is
   one-directional (under-estimating surface-y items). If a real
   user differs from the persona in some other systematic way, the
   bucket assignments shift. Worth a sanity check against the actual
   product backlog before sequencing.

---

*Calibration captured 2026-05-15. This doc is a draft. The final
build plan should sequence Bucket A into a single PR with attached
ADRs, schedule Bucket B as standalone PRs, fold Bucket C into the
strategic-bet phase plan, and decide Bucket D's fate alongside the
strategic bet. The walkthrough is the source of truth for findings;
this doc is the source of truth for cost. Disagree freely; cite the
reasoning when overriding.*
