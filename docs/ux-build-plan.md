# Constellation: final UX build plan

*Captured 2026-05-15. Source documents: `ux-walkthrough-2026-05-14.md` (findings) and `ux-build-plan-draft-2026-05-15.md` (cost calibration). This document is the authoritative sequencing plan; the walkthrough remains the source of truth for findings, the calibration for cost reasoning where it isn't overridden here.*

---

## 1. Summary

**Strategic bet chosen: edge-semantics-into-RAG** (Phase 8). The walkthrough's finding #21 — typed edges are stored but the RAG pipeline doesn't use their semantics — is confirmed ★ 2× across both generation surfaces and is the most compounding payoff available. Code verification revealed that edge type and `note` are *already* injected into prompt context (`backend/app/services/rag_service.py:59-66`); the system prompt just never tells the model how to use them. The prototype gate is therefore cheap, which is what lets us commit to this bet without first building a multi-week prototype.

**Sequencing:**

1. **Bucket A** — ten small-but-leveraged items, broken into four independent slices. Includes the first CHECK-constraint migration (A1 + A6 combined) which de-risks Phase 8's resolved-edge migration.
2. **Bucket B** — five standalone PRs, ~3 days each, run sequentially. ~3 weeks of clock.
3. **Phase 8 — edge-semantics-into-RAG** — multi-week, gated by a 1-week prototype. Folds in C1, the resolved-edge schema, and D1.
4. **Bucket C / Bucket D placement:** see §5/§6.

**Total effort, Buckets A + B: ~4 working weeks of one-engineer time, end-to-end.**

**Status as of 2026-05-15:**

- ✅ **Slice 1 — A1 + A6 shipped** in commit `b5cf251`. ADR-051 and ADR-052 landed; ADR-036 superseded. 304 backend tests + 26 frontend tests pass.
- ✅ **Slice 2 — A8 shipped** 2026-05-15. Migration `0005_classifier_rationale.sql`; rationale plumbed through models / repo / graph endpoint; graph EdgePanel displays it as a distinct block; bridge Apply no longer overwrites `note`. 308 backend tests + 26 frontend tests pass. No ADR (mechanical schema add).
- ✅ **Slice 3 — A2 + A3 + A4 + A5 + A7 shipped** 2026-05-15 across five commits (`395050a`, `2bd5c02`, `63ba87e`, `aec350f`, `7925ce8`). Inbox hover-time, NodePicker preview wiring + 300ms delay, graph `?ids=` focus + Open-in-graph from Notes, cross-tag bridge toggle, AND/OR tag mode in Synthesize. 311 backend tests + 39 frontend tests. No ADRs.
- ✅ **Slice 4 — A9 + A10 shipped** 2026-05-15. `RagRequest.mode` accepts `default|brief|critic`; `rag_service` dispatches via `_system_prompt_for(mode)`; /ask gains a `Balanced/Brief/Critic` segmented control; /nodes/[id] gains a `CriticPanel` that renders reader-questions inline. ADR-053 marked accepted+shipped, broadened from `{default,brief}` to `{default,brief,critic}`. 316 backend tests + 39 frontend tests.

**Bucket A complete.** Up next: Bucket B (sits between Bucket A and the Phase 8 prototype gate).

---

## 2. Bucket A — Small wins (four slices, ~5–7 working days total)

Originally scoped as one PR; broken into four independent slices during execution since the items naturally group by subsystem. Three ADRs (ADR-051, ADR-052, ADR-053) are pre-drafted in `docs/decisions.md`.

**Slice plan:**

- **Slice 1** — A1 + A6 (one migration). ✅ Shipped 2026-05-15.
- **Slice 2** — A8 alone (independent column-add migration). ✅ Shipped 2026-05-15.
- **Slice 3** — A2 + A3 + A4 + A5 + A7 (pure frontend, order-independent). ✅ Shipped 2026-05-15.
- **Slice 4** — A9 + A10 (Ask mode-selector pattern, shares ADR-053). ✅ Shipped 2026-05-15.

### A1 — Save-answer auto-edges use `CITES`, not `COLLECTS` ✅ shipped (b5cf251)

- **Description:** `POST /rag/save-answer` writes `COLLECTS` edges from the synthesis note to each cited source (`backend/app/api/v1/rag.py:268-279`). Replace with `CITES`. Requires expanding the EdgeType enum (sibling work to A6, shared migration).
- **Cost:** Half-day (2h impl, 1h ADR superseding ADR-036, 1h test).
- **Override:** Calibration estimated 30 min + ADR; the table-recreate migration and the ADR-036 supersedure push it to half-day.
- **Acceptance:** Save an /ask answer with provenance to ≥2 notes; verify in DB or graph viz that the new edges are typed `CITES` and the synthesis note has no `COLLECTS` outgoing edges to those sources.
- **ADR required:** **ADR-051 — Saved syntheses use `CITES` (supersedes ADR-036).**

### A6 — Literature-shaped edge types ✅ shipped (b5cf251)

- **Description:** Add `BUILDS_ON`, `APPLIES_TO`, `MEASURES`, `EXTENDS`, `REFINES` to EdgeType. **Combine with A1 into one migration** (`0004_expanded_edge_types.sql`) — the SQLite CHECK constraint can only be modified by table recreate, so we pay that ceremony once for both items.
- **Cost:** Half-day on top of A1 — 4h (most of it is `frontend/src/lib/edgeTypes.ts` color + label + description for the 5 new types, plus prompt updates in `rag.py:_SUGGEST_LINKS_SYSTEM` and `discover_service.py:_CLASSIFY_BRIDGE_SYSTEM`).
- **Acceptance:** EdgeForm shows the new types in its picker; create one `BUILDS_ON` edge via UI; verify it persists and renders correctly on node detail.
- **ADR required:** **ADR-052 — Expanded EdgeType vocabulary (literature stance).**

### A2 — Capture timestamp in inbox display ✅ shipped 2026-05-15

- **Description:** `GET /nodes/inbox` already returns `created_at` (`node_repo.list_inbox`). Surface it in the inbox UI as relative time (`3h ago`) with a hover-title tooltip showing the absolute timestamp.
- **Cost:** 1 hour. Pure frontend.
- **Acceptance:** Inbox page shows a relative-time chip on each card; hover reveals absolute timestamp. Mobile captures (per Phase 3.6) show their actual capture time, not just date.
- **ADR required:** None.

### A3 — `?ids=a,b,c` URL param on `/graph` ✅ shipped 2026-05-15

- **Description:** Graph page accepts a comma-separated `ids` query param; on load, the graph filters to only those nodes (plus their incident edges and the neighbor nodes those edges touch). Enables "open in graph" composition from Notes/Search.
- **Cost:** Half-day. Filter logic exists in `frontend/src/app/graph/filterGraph.ts`; need URL → state → filter wiring + an "Open in graph" action on Notes results.
- **Acceptance:** Run a Notes filter producing ≥3 results; click "Open in graph" or navigate to `/graph?ids=a,b,c`; only those 3 nodes (+ neighbors) appear.
- **ADR required:** None.

### A4 — Cross-tag-domain filter on Discover/Bridges ✅ shipped 2026-05-15

- **Description:** Discover Bridges tab currently lists pairs by similarity descending with no scope filter. Add a "hide same-tag pairs" toggle — `cross_tag=true` query param on the bridges endpoint, frontend toggle that defaults to off.
- **Cost:** Half-day. SQL clause + chip UI.
- **Acceptance:** Toggle on → only pairs where the two nodes share no tags appear; toggle off → all pairs as before. Result count updates.
- **ADR required:** None.

### A5 — Union-mode tag selection in Synthesize scope ✅ shipped 2026-05-15

- **Description:** Synthesize scope-builder filters notes by tag using AND semantics today. Add a mode toggle: OR (any tag matches) vs. AND (all tags must match). Default to OR since user feedback says intersection is hardly ever wanted.
- **Cost:** Half-day. Pool-query SQL + chip UI.
- **Acceptance:** Add two tags to the scope; switch between AND/OR; verify pool size changes consistently with the toggle.
- **ADR required:** None.

### A7 — `NotePreviewPopover` inside `NodePicker` ✅ shipped 2026-05-15

- **Description:** `NodePicker` is title-only. `NotePreviewPopover` already exists (`frontend/src/components/`, ADR-039) and lazily fetches `NodeDetail`. Wire it into NodePicker rows on hover.
- **Cost:** Half-day. Component reuse; the lazy-fetch and portal logic are already correct.
- **Acceptance:** In a NodePicker (capture modal "related" field, EdgeForm target picker, or graph ConnectPanel), hover a result row → popover appears within ~300 ms showing title/content excerpt/tags. Stops on un-hover.
- **ADR required:** None.

### A8 — Persist classifier rationale on edge ✅ shipped 2026-05-15

- **Description:** When the AI bridge classifier (ADR-049) recommends an edge, its rationale is shown in the slide-out banner but discarded on apply. Add `classifier_rationale TEXT` to `edges`; populate it when the user clicks "Apply suggestion" in the bridge slide-out; render it on the EdgePanel and EdgeForm "note" hint when re-viewing.
- **Cost:** 1 day. Migration (column add — straightforward, no CHECK rewrite), bridge-classifier route plumbing, EdgeForm prefill, EdgePanel display.
- **Acceptance:** Open a bridge, classify, apply → reopen the same edge later → the classifier rationale is visible on the EdgePanel as "Classifier rationale: …" distinct from the user-authored `note` field.
- **ADR required:** None (mechanical schema add; the design decision is "store it" which doesn't need a tradeoffs writeup).

### A9 — `mode=brief` flag on `/ask` ✅ shipped 2026-05-15

- **Description:** Add an optional `mode` field on `RagRequest`. When `mode="brief"`, swap in an advocacy-mode system prompt ("the user has explicitly asked for a one-sided brief; do not introduce counterarguments unless asked"). UI: small mode selector on `/ask`.
- **Cost:** 1 day. Half is the flag and request-model addition; half is prompt iteration against real queries to make sure brief mode is genuinely committed but doesn't fabricate.
- **Acceptance:** Run the same query in default and brief modes; the brief-mode answer should be visibly more committed (no "on the other hand…" hedging).
- **ADR required:** **ADR-053 — Ask supports `mode={default,brief}`.** Notes the prompt semantics in case the Phase 8 work supersedes it. (Could be folded into Phase 8's ADR but writing it now keeps Phase 8 unblocked from Bucket A.)

### A10 — Critic mode on `/ask` or `/nodes/[id]` ✅ shipped 2026-05-15

- **Description:** Button on the node detail view (or a third `/ask` mode) that takes the current note as input and asks Claude to enumerate the questions a careful reader would ask. Output is a list, not prose.
- **Cost:** 1 day. Same shape as A9: branching prompt is trivial, prompt iteration to make the questions sharp is the real work.
- **Acceptance:** Run critic mode on any permanent note; output is 3–6 reader-questions that are specific to that note's content (not generic).
- **ADR required:** None (subsumed by A9's mode-selector decision once both ship).

**Bucket A totals:**

- Implementation: ~46h.
- ADRs (3): ~6h.
- Tests, review, polish: ~8h.
- **End-to-end: 5–7 working days.**

**Sequencing inside Bucket A:** A1 + A6 ship together (single migration). A8's migration is independent. Everything else is order-independent.

---

## 3. Bucket B — Real Tier 1, sequenced (5 standalone PRs)

One at a time, ~3 days each. ADRs ship inside the relevant PR.

### B1 — "Recently captured / edited / linked" sections on Home ✅ shipped 2026-05-15

- **Description:** Home gets three sections: notes captured this week, notes edited this week, edges created this week. Each section is a small card list with a "see all" link.
- **Cost:** 2 days. Three queries (capture, edit, edge-creation), one Home component, sorting, the "this week" semantics (last 7 days or since-last-visit — settle in implementation).
- **Acceptance:** Open Home → see three sections, each with ≤10 items, dated within the chosen window. Empty states render correctly when a section has zero items.
- **ADR required:** **ADR-054 — "Recent activity" windowing semantics.** Probably "last 7 days, no last-visit tracking" but worth recording.

### B2 — Schema-level Notes filters ✅ shipped 2026-05-15

- **Description:** Add chip filters on `/notes`: "no summary," "no outgoing edges," "no edges either," "edge-count = 0," "summary length < N." Backend: composable filter API on `node_repo.list_nodes`. Frontend: chip row that combines with the existing tag/type/recency filters.
- **Cost:** 2.5 days. ~15h backend (filter composition framework + 5 predicates + tests) + chip UI + composable-filter ADR.
- **Acceptance:** Apply "no summary" + tag `eurorack` together; result list shows only eurorack-tagged notes with NULL summary. Clear filter → list resets.
- **ADR required:** **ADR-055 — Notes-filter API contract.** How new predicates compose with existing tag/type/age/search filters; whether filters AND or OR within a category.

### B3 — Batch suggest-links endpoint + review UI ✅ shipped 2026-05-15

- **Description:** `POST /rag/suggest-links/cluster` takes a list of node IDs (or a tag) and returns deduped edge proposals. Parallel per-node calls with undirected-pair dedup. Review UI: accept-all, per-edge accept/reject, per-edge edge-type override.
- **Cost:** 3 days. ~1 day backend (asyncio.gather + dedup), ~2 days review UI.
- **Acceptance:** Tag 5 notes with the same tag, run cluster suggest-links → see a list of ≤20 proposed edges, no duplicates from different source perspectives, ability to accept all or override individual types.
- **ADR required:** None (compositional, no novel tradeoffs).
- **Sequencing:** After B2, since the cluster endpoint can take a `node_filter` arg that uses the same filter contract as B2.

### B4 — Triangle-completion Discover tab ✅ shipped 2026-05-15

- **Description:** A new Discover tab "Triangles" listing A-C-B paths where A↔B is missing. SQL is straightforward (self-join on edges); ranking is the hard part — pure structural count? similarity-weighted? recency-weighted? Decided by ADR.
- **Cost:** 2.5 days. ~1 day SQL + endpoint, ~1 day tab UI mirroring the Bridges tab pattern, ~0.5 day ranking ADR.
- **Acceptance:** Open Discover → Triangles → ≥5 candidate triangles surfaced; clicking one opens the slide-out showing A, C, B and offering an edge-creation action.
- **ADR required:** **ADR-056 — Triangle-completion ranking semantics.**

### B5 — Negative-finding framing on `/ask`

- **Description:** When retrieval confidence (max raw cosine similarity from `vec_nodes`) for the top seed falls below a threshold, prepend the Ask answer with *"Your notes don't directly cover this; here's general background, then the closest related notes."* Plumb distances through `embedding_service.search_similar` (currently discarded).
- **Cost:** 2 days. ~0.5d plumbing + ~1d prompt iteration + ~0.5d ADR for the threshold.
- **Acceptance:** Run a query the corpus genuinely doesn't cover ("what do my notes say about quantum gravity?"); the answer leads with the hedge, not training-grade prose.
- **ADR required:** **ADR-057 — Low-confidence retrieval threshold for Ask.** Names the metric (likely max-similarity over top-K) and the threshold value; flags that this is data-tuned and revisitable.

**Bucket B totals:** ~12 working days = ~3 weeks of clock at one PR a week.

**Bucket B sequencing:**

- B1 first (independent, low risk, builds the "windowed query" pattern).
- B2 second (sets the filter-composition pattern that B3 leans on).
- B3 third (uses B2's filter contract).
- B4 fourth (independent, but newer Discover tab benefits from B3's link-creation pattern when triangle-completion offers to create the missing edge).
- B5 fifth (independent; placed last only because Phase 8 may supersede some of its prompt work).

---

## 4. Phase 8 — Edge-semantics-into-RAG

### Goal

Typed edges become semantically load-bearing in retrieval and generation. CONTRADICTS-linked neighbors are surfaced with priority and labeled in context; SUPPORTS-linked neighbors weight context priority; CITES anchors provenance. Resolved-edge state (`resolved_at`, `resolved_by_node_id`) ages CONTRADICTS edges into "historical" status. Evolution edge types (D1) become non-decorative.

### Phase structure

**Phase 8.0 — Prototype gate (1 week).**
A working prototype demonstrating that edge type and edge `note` materially change Ask output when present. Acceptance:

1. Pick 3 query/CONTRADICTS-pair fixtures from the existing corpus.
2. Run each fixture with the current system prompt and a candidate edge-aware prompt.
3. Show that the edge-aware output (a) surfaces both viewpoints, (b) explicitly names the tension, (c) reads as net-better in human review on at least 2 of 3 fixtures.
4. Soft-delete one edge and confirm the edge-aware prompt's output changes (whereas today it doesn't — Sc 9 verified this).

If the prototype gate passes, write ADR-058 (full Phase 8 design) and commit. If it doesn't, escalate and reconsider — possibly the strategic bet is wrong, possibly the bet is right but the implementation shape needs work.

**Phase 8.1 — Prompt-side edge semantics.**
Update `rag_service._SYSTEM_PROMPT` to instruct the model on edge types. The existing `_build_context` already includes edge labels; the prompt just needs to tell the model what to do with them. Targeted to Ask and Synthesize.

**Phase 8.2 — Retrieval-side edge expansion.**
Bias `graph_service.expand` to surface CONTRADICTS and SUPPORTS neighbors with higher priority when they connect to seed nodes. `expansion_depth` interaction: depth=1 still surfaces direct neighbors, but edge-type-aware ranking decides which to keep when the neighbor budget (`_MAX_NEIGHBOR_NODES=12`) is exceeded.

**Phase 8.3 — Resolved-edge state + D1.**
Migration `0005_resolved_edges.sql` adds `resolved_at`, `resolved_by_node_id` to `edges`. Add `SUPERSEDED_BY`, `SCOPED_TO`, `REGIME_OF`, `RESOLVES` to `EdgeType` (D1). EdgePanel UI exposes a "mark resolved" action. RAG context-assembly down-weights resolved CONTRADICTS edges.

**Phase 8.4 — Tag/recency scope on Ask (C1).**
Now nearly free since edge-aware retrieval already supports custom scope. Add a `ScopedAskRequest` with optional `tag_filter`, `recency_filter`, and have `query()` route through the same context-assembly pipeline.

**Phase 8.5 — C3 (compare to corpus) + C6 (typed-edge suggestion at save).**
Highest-leverage capture-time affordance. New endpoint `POST /search/dedup` returning raw distances (the current `/search/semantic` rank-normalizes — see §code-verification notes in the upstream calibration). Capture modal grows a side panel showing top-K matches; "Save AND edge" becomes the natural pair action via the edge-aware prompt scaffolding.

### Acceptance criteria for Phase 8

- Prototype gate (8.0) passes per its own criteria.
- Soft-delete a CONTRADICTS edge between two notes that are both in Ask's retrieval set → output changes observably (i.e., the prompt is using the edge, not just including it as decoration).
- C1: `/ask` accepts a tag filter; the returned provenance is restricted to nodes carrying that tag.
- C3: capture modal shows top-K candidate matches with raw similarity scores ≥0.7; user can save-and-link in one action.
- D1: SUPERSEDED_BY edges visibly down-weight the superseded note in Ask context (verifiable by provenance comparison).

### ADRs required

- **ADR-058 — Edge semantics in RAG context assembly.** Phase-design ADR; documents the prompt-vs-retrieval-vs-priority breakdown and the prototype-gate outcome.
- **ADR-059 — Resolved-edge state.** Schema design for `resolved_at` / `resolved_by_node_id`; what "resolution" means semantically.
- **ADR-060 — Evolution edge types (D1).** Adds SUPERSEDED_BY, SCOPED_TO, REGIME_OF, RESOLVES; supersedes the "hold" decision.
- **ADR-061 — Scoped Ask.** API contract for `ScopedAskRequest`; relationship to existing `query_scoped`.
- **ADR-062 — `/search/dedup` endpoint contract.** Raw distance vs. rank-normalized score; threshold defaults.

### Definition of done

Phase 8 is done when:

1. The strategic-bet acceptance criteria above pass.
2. Bucket C items C1, C3, C6 are absorbed and shipped within Phase 8 (C2 explicitly NOT — see §5).
3. D1 ships with at least one observable downstream behavior change (Ask weighting).
4. All five ADRs above are written and merged.
5. The walkthrough's finding #21 can be marked "settled — addressed by Phase 8" in the next round of UX walkthroughs.

---

## 5. Bucket C placement

Given edge-semantics-into-RAG as the strategic bet:

| Item | Placement | Reasoning |
|---|---|---|
| **C1 — Tag/recency scope on Ask** | **In scope: Phase 8.4** | Nearly free once edge-aware retrieval ships; calibration §7 says so. Don't ship before Phase 8 — pre-Phase-8 work would have to be redone. |
| **C2 — Quick-switcher (Cmd+P)** | **Deferred (post-Phase 8)** | High polish budget; doesn't depend on or benefit from the strategic bet. Worth scheduling as its own multi-week effort after Phase 8 lands. Not deferred permanently — it's real Tier 1 value, just orthogonal. |
| **C3 — "Compare to corpus" on capture** | **In scope: Phase 8.5** | Per the walkthrough Sc 10 verdict, this is the highest-leverage pre-commit affordance. Edge-semantics makes it more powerful (dedup checks can consider edge-graph context). |
| **C4 — Verbatim flag on iOS Shortcut** | **Held** | iOS dev story doesn't exist; the Tier 2 "mobile Shortcut redesign — descriptive elicitation" path may obsolete this entirely. Decision deferred to that redesign. |
| **C5 — `--tag` / `--project-context` prompts on iOS Shortcut** | **Held** | Same reasoning as C4. Plus: project context is precisely what Phase 8 + Phase 9 (Project Workspace) will make first-class; building Shortcut field-expansion now bets against that. |
| **C6 — Save-time typed-edge suggestion** | **In scope: Phase 8.5** | The natural pair of C3, ships with it. Half-day on top once C3 exists. |

---

## 6. Bucket D decision

**D1 (SUPERSEDED_BY, SCOPED_TO, REGIME_OF, RESOLVES): ships in Phase 8.3.**

Reasoning:

- Calibration's gating concern was right: shipping the enums alone is decorative. The Tier 2 backing work — resolved-edge state + RAG-pipeline awareness — is exactly Phase 8.
- D1 is the natural pair of Phase 8.3's resolved-edge schema work; they share a migration (one `0005`-prefixed migration covering both adds the new edge types and the resolved-edge columns in one trip).
- Without committing to Phase 8 as the strategic bet, D1 would stay held permanently. With Phase 8 picked, D1 has the gating context it needs.

ADR-060 is D1's formal commit.

---

## 7. ADR index

| # | Title | Trigger | Pre-work or inline? |
|---|---|---|---|
| **ADR-051** | Saved syntheses use `CITES` (supersedes ADR-036) | Bucket A — A1 | ✅ landed in commit b5cf251 |
| **ADR-052** | Expanded EdgeType vocabulary (literature stance) | Bucket A — A6 | ✅ landed in commit b5cf251 |
| **ADR-053** | Ask supports `mode={default,brief}` | Bucket A — A9 | Drafted in `docs/decisions.md`; awaiting A9 implementation (Slice 4) |
| **ADR-054** | "Recent activity" windowing semantics on Home | Bucket B — B1 | Inline with B1 PR |
| **ADR-055** | Notes-filter API contract | Bucket B — B2 | Inline with B2 PR |
| **ADR-056** | Triangle-completion ranking semantics | Bucket B — B4 | Inline with B4 PR |
| **ADR-057** | Low-confidence retrieval threshold for Ask | Bucket B — B5 | Inline with B5 PR |
| **ADR-058** | Edge semantics in RAG context assembly | Phase 8 — core | **Pre-work: written after prototype gate (8.0) passes, before 8.1 starts** |
| **ADR-059** | Resolved-edge state | Phase 8.3 | Inline with 8.3 PR |
| **ADR-060** | Evolution edge types (D1) | Phase 8.3 | Inline with 8.3 PR (kept separate from ADR-059 for clarity) |
| **ADR-061** | Scoped Ask | Phase 8.4 | Inline with 8.4 PR |
| **ADR-062** | `/search/dedup` endpoint contract | Phase 8.5 | Inline with 8.5 PR |

---

## 8. What stays out of scope

From Tier 2 (walkthrough's updated tiered recommendations):

- **Synthesis iteration / multi-turn mode.** High value but its own surface; not the leverage point of the strategic bet. Schedule after Phase 8.
- **Coverage-density overlay on Graph and Notes.** Maintenance feature; defer until corpus health is the bottleneck (currently isn't).
- **Re-chunkable candidates on `/ingest` + transcript-aware chunker.** Real workflow improvements but they touch the import pipeline, which is orthogonal to the strategic bet. Bundle into a "Phase X.5 — Import resilience" later.
- **Community detection on the graph.** Pretty but the graph is already navigable. Defer.
- **Long-form editor mode on `/nodes/[id]`.** Real fix for `EditableField` blur-to-save; defer until Phase 9 (Project Workspace), where the free-writing pad will need it anyway.
- **Batch classify on Discover/Bridges.** Useful but discretionary; the per-pair classifier (ADR-049) already meets the daily-use threshold.
- **`POST /synthesize/scaffold`.** Fresh-domain workflow; defer until new-corpus onboarding is a frequent need.
- **`GET /maintenance/stale-edges` + Discover Hygiene tab.** Pairs with the corpus-health digest (Tier 3); defer.
- **Inbox content-type taxonomy + branched Process flow.** Significant new shape on the most-used flow; defer to a dedicated phase post-Phase-8.
- **Claim-node primitive + batch-tag-against-target UI.** High value (Sc 12: 11 min → 90 s). A natural follow-on to Phase 8 — pair it with the SUPPORTS-edge-weighting work. Schedule as Phase 8.6 if scope permits or Phase 10 if not.
- **Synthesis "argument audit" pass.** Subsumed by Phase 8's edge-semantics work (the audit is exactly the "self-aware about CONTRADICTS-linked counterarguments" behavior Phase 8 enables). Defer until Phase 8 ships and re-evaluate.
- **Gap-analysis affordance on a scope.** Same reasoning as audit; subsumed by Phase 8 + B5 (low-confidence framing).
- **Mobile Shortcut redesign — descriptive elicitation.** Pairs with C4/C5 decision. Schedule alongside the iOS dev-story question.

From Tier 3: most stay out (free-writing pad → Phase 9; hierarchical tags → no plan; voice profile → no plan; paragraph-level provenance → no plan; Discover-as-default re-shape → no plan; weekly serendipity digest → no plan; source content into RAG → no plan; bundle import → no plan; merge/supersede as first-class operations → Phase 8.3 picks up the schema side, UI side deferred).

Explicit deferrals are not rejections — they're prioritization. The strategic bet's payoff is what determines whether each deferred item gets pulled forward.

---

*This document is the authoritative sequencing plan as of 2026-05-15. Update it when the strategic-bet prototype outcome is known and Phase 8's shape is final. The walkthrough remains the source of truth for findings.*
