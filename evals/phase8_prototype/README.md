# Phase 8.0 — Prototype gate

Authoritative gate spec: `docs/ux-build-plan.md` §4.

## Purpose

Demonstrate that the typed-edge labels already present in RAG context (assembled by
`backend/app/services/rag_service.py:_build_context`) can be made semantically
load-bearing by the system prompt alone — i.e. that an edge-aware prompt
materially changes Ask output when typed edges are present, and stops changing
output when those edges are removed.

If the gate passes, write **ADR-058 — Edge semantics in RAG context assembly** and
proceed with Phase 8.1. If it fails, escalate and reconsider the strategic bet.

## Why the gate's scope is broader than the build plan's literal text

The build plan §4 calls for "3 query/CONTRADICTS-pair fixtures from the existing
corpus." Inspection on 2026-05-15 found exactly **one** `CONTRADICTS` edge in the
live corpus (and one `QUESTIONS` edge); the SUPPORTS / ELABORATES / ANALOGOUS_TO
families are densely populated, with 95% of non-COLLECTS edges carrying an
authored `note` field.

The strategic bet from the UX walkthrough finding #21 was always broader than
CONTRADICTS — it's that *all* typed edges are decoratively included in context but
never used by the model. The CONTRADICTS-only framing was a specific instantiation
that assumed a corpus shape we don't currently have.

The gate is therefore **broadened** to test the edge vocabulary the corpus
actually exercises:

- **F1 — CONTRADICTS** (philosophy: consciousness as biological sensor vs as
  field-interpretation). The single real `CONTRADICTS` pair. Doubles as the
  soft-delete experiment (acceptance #4) since it's the only such pair available.
- **F2 — SUPPORTS-family** (embedded systems: MCP4922 SPI configuration on
  STM32F407). Dense SUPPORTS + ELABORATES neighbourhood with rich edge notes.
- **F3 — ANALOGOUS_TO** (looper / hands-free timing capture). Tests whether the
  model recognises cross-domain structural parallels when the edge type names them.

Three different edge types, three different reasoning shapes (tension /
evidence-aggregation / pattern-transfer). Acceptance is recast accordingly:
the edge-aware prompt's output should, on at least two of three fixtures, use
typed-edge context to shape the answer in a way the default prompt does not.

## Acceptance criteria (gate)

1. The harness produces side-by-side outputs for each fixture: same retrieval,
   same context, only the system prompt differs.
2. On at least **2 of 3** fixtures, the edge-aware output is judged net-better
   by human review. Net-better means at least one of:
   - Surfaces a typed-edge relationship explicitly in prose (names the
     CONTRADICTS tension, treats SUPPORTS as evidence-of, recognises
     ANALOGOUS_TO as parallel-pattern transfer).
   - Uses the user-authored edge `note` text in a load-bearing way.
   - Avoids a failure mode visible in the default-prompt output (averaging
     contradictions, treating supporting evidence as decorative, missing
     a cross-domain analogy).
3. **Soft-delete experiment (F1).** Re-run F1's candidate prompt with the single
   `CONTRADICTS` edge filtered out of the context's edges list. The output must
   change observably — the candidate prompt is using the edge, not just including
   it. (Today's default prompt does not change in this scenario; that's the
   finding #21 baseline.)

If criterion 2 fails, the gate fails. If criterion 3 fails, the gate fails.

## What the harness does

`run.py`:

1. Opens the live database (`backend/data/constellation.db`) and instantiates the
   Voyage + Anthropic providers from the same config table the FastAPI app uses.
2. For each fixture: embeds the query, runs hybrid search + graph expansion
   exactly as `rag_service.query` does, then calls `_build_context` **once** to
   assemble a shared context.
3. Calls the generation provider twice against that shared context: once with the
   current `_DEFAULT_PROMPT`, once with the candidate `_CANDIDATE_PROMPT`.
4. For F1, runs a third call with the `CONTRADICTS` edge filtered out of the
   edges list before `_build_context`. No database mutation; edges flow through
   `_build_context` as a parameter.
5. Writes a Markdown side-by-side per fixture under
   `runs/YYYY-MM-DD-vN/fixture_NN.md` plus a `summary.md` with the soft-delete
   diff.

Holding retrieval constant across prompts isolates the prompt's effect — the
gate is about what the model does with edge information, not whether different
prompts change retrieval.

## How to run

```bash
cd backend
uv run python ../evals/phase8_prototype/run.py            # default label v0
uv run python ../evals/phase8_prototype/run.py --label v1 # iterate
```

`.env` must have `VOYAGE_API_KEY` and `ANTHROPIC_API_KEY` set (same keys the
FastAPI app uses). The harness reads the live database the same way the app does
and uses the providers named in the `config` table.

Run cost: 3 fixtures × 2 generation calls + 1 soft-delete generation = 7 Anthropic
calls + 3 Voyage embeddings. Sonnet 4.6 at ~2k output tokens per call ≈ pennies.

## Iteration loop

The candidate prompt is `evals/phase8_prototype/prompts.py:_CANDIDATE_PROMPT`. To
iterate:

1. Edit the prompt.
2. Re-run with `--label v1` (or `v2`, …); output lands in `runs/YYYY-MM-DD-v1/`.
3. Compare against the previous run's outputs.

The committed run artifacts are the human-review record. Whichever version is
named in ADR-058 becomes the seed for Phase 8.1's `rag_service._SYSTEM_PROMPT`
update.

## After the gate

- **Gate passes:** write ADR-058 referencing the winning prompt and the
  soft-delete result, then begin Phase 8.1.
- **Gate fails:** retain run artifacts as evidence; escalate. The strategic bet
  may be right with a different implementation shape (e.g. edge-aware retrieval
  ranking before prompt-side semantics), or it may be wrong and Phase 8 needs
  reconsideration.
