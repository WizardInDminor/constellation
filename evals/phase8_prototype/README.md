# Phase 8.0 — Prototype gate

Authoritative gate spec: `docs/ux-build-plan.md` §4.

## Purpose

Demonstrate that the typed-edge labels already present in RAG context (assembled
by `backend/app/services/rag_service.py:_build_context`) can be made semantically
load-bearing by an **edge-aware system prompt** — i.e. that adding explicit
instructions on what to do with the `Connections:` annotations changes Ask
output in a meaningful, disciplined way compared to the current prompt.

If the gate passes, write **ADR-058 — Edge semantics in RAG context assembly**
and proceed with Phase 8.1.

## Why the gate's question was reframed after v0

**The v0 run (2026-05-15) showed the default prompt was already using edge
information aggressively** — sometimes citing edge labels verbatim in answers.
A heavy 500-word edge-aware candidate prompt produced substantively equivalent
output to the default across all three fixtures.

The conclusion is not that the strategic bet is wrong, but that the gate's
original question was too coarse. The reframed question:

> *Does a tight, minimal-additive block of edge-interpretation instruction
> change the model's behaviour in a more disciplined direction — given that
> the model is already reading the `Connections:` labels?*

That is what `candidate_v1` tests. `candidate_v0` is retained for the run-log
artifact only.

## Phase 8.2 is conditionally deferred

The v0 retrieval probe (`probe_retrieval.py`) tested the parallel hypothesis —
that edge-type-aware ranking when truncating to `_MAX_NEIGHBOR_NODES` would
change context. On this corpus:

- F1 (CONTRADICTS): cap binds, but the high-signal edges are already kept by
  discovery order. The dropped neighbours are dominated by COLLECTS.
- F2 / F3: cap doesn't bind at all.
- Every CONTRADICTS/SUPPORTS edge in retrieval has endpoint cosine similarity
  ≥0.66, well above the 0.6 threshold — meaning the edges connect notes that
  are already similarity-discoverable.

Per `docs/ux-build-plan.md` §4 Phase 8.2, retrieval-side work is **deferred
but reactivatable**. `probe_retrieval.py` is the standing diagnostic. Phase 8.2
reactivates when the probe shows the neighbour cap binding on
CONTRADICTS or SUPPORTS edges on **≥2 fixtures** where the connected notes
have **cosine similarity below 0.6** — that's the signal that cross-domain
typed-edge relationships exist whose endpoints are not similarity-discoverable.

Re-run periodically — after material corpus growth, or after Phase 9 introduces
cross-domain edges between thematic/character/event nodes.

## Why the fixture set is broader than "3 CONTRADICTS pairs"

The build plan §4 originally called for "3 query/CONTRADICTS-pair fixtures."
Inspection on 2026-05-15 found exactly **one** `CONTRADICTS` edge in the live
corpus (and one `QUESTIONS` edge); the SUPPORTS / ELABORATES / ANALOGOUS_TO
families are densely populated, with 95% of non-COLLECTS edges carrying an
authored `note` field. The strategic bet from walkthrough finding #21 was
always broader than CONTRADICTS — it's that *all* typed edges are decoratively
included in context but never used by the model.

Fixtures:

- **F1 — CONTRADICTS** (philosophy: consciousness as biological sensor vs
  as field-interpretation). The single real CONTRADICTS pair. Also drives the
  soft-delete experiment.
- **F2 — SUPPORTS-family** (embedded systems: MCP4922 SPI configuration on
  STM32F407). Dense SUPPORTS + ELABORATES neighbourhood with rich edge notes.
- **F3 — ANALOGOUS_TO** (looper / hands-free timing capture). Tests whether
  the model recognises cross-domain structural parallels.

## Acceptance criteria (reframed)

1. The harness produces side-by-side outputs for each fixture: same retrieval,
   same context, only the system prompt differs.
2. On at least **2 of 3** fixtures, the v1 candidate's output is judged
   net-better than the default by human review. Net-better means at least one
   of:
   - Names a typed-edge relationship more explicitly or accurately than the
     default did.
   - Uses an edge `note` field's content in a load-bearing way the default
     did not.
   - Avoids a failure mode the default exhibits (smoothing a contradiction,
     treating SUPPORTS edges as parallel claims, missing an analogy).
3. **Soft-delete experiment (F1).** Re-run the v1 candidate with the single
   `CONTRADICTS` edge filtered out of the context's edges list. Compare to the
   v1 with-edge output. A different observable shape of reasoning about
   tension is the success signal; an identical answer is the failure signal.

If criterion 2 fails or criterion 3 shows zero effect, the gate fails.

## What the harness does

`run.py`:

1. Opens the live database (`backend/data/constellation.db`) and instantiates
   the Voyage + Anthropic providers from the same config table the FastAPI
   app uses.
2. For each fixture: embeds the query, runs hybrid search + graph expansion
   exactly as `rag_service.query` does, then calls `_build_context` **once**
   to assemble a shared context.
3. Calls the generation provider twice against that shared context: once with
   the current `_DEFAULT_PROMPT`, once with the candidate prompt selected by
   `--label`.
4. For F1, runs a third call with the `CONTRADICTS` edge filtered out of the
   edges list before `_build_context`. No database mutation; edges flow
   through `_build_context` as a parameter.
5. Writes a Markdown side-by-side per fixture under
   `runs/YYYY-MM-DD-<label>/fixture_NN.md` plus a `summary.md`.

Holding retrieval constant across prompts isolates the prompt's effect — the
gate is about what the model does with edge information, not whether different
prompts change retrieval.

## How to run

```bash
cd backend
# Re-run v1 (current candidate; default --label):
uv run python /home/matt/dev/constellation/evals/phase8_prototype/run.py
# Or pin a specific candidate label:
uv run python /home/matt/dev/constellation/evals/phase8_prototype/run.py --label v0
# Standing diagnostic for Phase 8.2 reactivation:
uv run python /home/matt/dev/constellation/evals/phase8_prototype/probe_retrieval.py
```

`.env` must have `VOYAGE_API_KEY` and `ANTHROPIC_API_KEY` set (same keys the
FastAPI app uses). The harness reads the live database the same way the app
does and uses the providers named in the `config` table.

Run cost: 3 fixtures × 2 generation calls + 1 soft-delete generation = 7
Anthropic calls + 3 Voyage embeddings. Sonnet 4.6 at ~2k output tokens per
call ≈ pennies.

## Iteration loop

The candidate prompt is `evals/phase8_prototype/prompts.py:CANDIDATE_PROMPT_V1`.
To iterate further:

1. Add `CANDIDATE_PROMPT_V2` to `prompts.py` and register it in
   `PROMPTS_BY_LABEL` as `candidate_v2`.
2. Re-run with `--label v2`; output lands in `runs/YYYY-MM-DD-v2/`.
3. Compare against the previous run's outputs.

The committed run artifacts are the human-review record. Whichever version is
named in ADR-058 becomes the seed for Phase 8.1's `rag_service._SYSTEM_PROMPT`
update.

## After the gate

- **Gate passes:** write ADR-058 referencing the winning prompt and the
  soft-delete result, capture the Phase 8.2 reactivation criterion concretely
  in the ADR, then begin Phase 8.1.
- **Gate fails:** retain run artifacts as evidence; escalate. The bet may be
  right on a future corpus shape but wrong on this one; Phase 8.3/8.4/8.5 are
  independently valuable and unaffected.
