# Asking Your Notes

Synthesizing answers from your knowledge graph via RAG.

---

## Overview

The **Ask** page (`/ask`) is where Constellation's AI integration delivers its highest value: instead of returning a list of notes for you to read, it reads them for you, synthesizes a grounded answer, and tells you exactly which notes contributed. The answer is only as good as your graph — which is the point.

---

## How it works

When you submit a query, the backend runs a five-step pipeline:

1. **Embed** — your question is embedded into a 1024-dim vector using the active embedding provider
2. **Hybrid search** — the vector is used for semantic search; the query text is used for FTS5 keyword search; results are fused via RRF into a ranked candidate list
3. **Graph expansion** — the top candidates' immediate neighbors (depth-1 BFS) are fetched, filtered by edge type if desired
4. **Context assembly** — top-ranked seed notes receive their full content; neighbor notes receive a summary or excerpt; edge annotations between notes in context are included
5. **Generation** — Claude synthesizes an answer using the assembled context, with instructions to cite notes as `[Note N]`

The response includes:

- The answer text with inline `[Note N]` citations that link back to the source notes
- A **Provenance** panel listing every note that contributed
- The graph edges traversed during expansion

---

## Reading the answer

Inline citations like `[Note 3]` are rendered as links. Click them to open the source note in a new tab and read the original text in context.

The provenance panel is always populated, even for notes the model didn't explicitly cite — it reflects every note that entered the context window, not just the ones Claude mentioned.

---

## Modes

A segmented control above the question input lets you swap the system prompt for three response styles. Default is `Balanced`.

| Mode | What it does |
|------|--------------|
| **Balanced** | Default behaviour. Preserves nuance, cites notes, hedges when the corpus is thin. |
| **Brief** | Advocacy mode — argue the case for the question directly. No "on the other hand…" hedging unless asked. Use when you explicitly want a one-sided brief. |
| **Critic** | Enumerate the questions a careful reader would ask. Output is a numbered list of 3–6 specific reader-questions, not prose. |

The same `Critic` mode is also available as a button on any non-fleeting note's detail page (`/nodes/[id]`) — it fires against that note's title + content directly, no need to retype the query.

See ADRs 053 (Ask mode contract) and the build plan §2 (A9/A10) for the design rationale.

---

## Low-confidence framing

When retrieval is genuinely weak — the closest semantic match in your corpus falls below ~0.55 cosine similarity to your query — Balanced mode prepends a hedge telling Claude to lead with "your knowledge base doesn't directly cover this question," then draw on the closest related notes without inventing detail.

This is a retrieval-side signal, not a model judgment. It triggers when seeds *exist* but are weak; the existing "(No relevant notes found.)" sentinel still handles the zero-seed case. Brief and Critic modes bypass the hedge — they have their own retrieval-resistant prompts.

See ADR-057 for the threshold and metric.

---

## When Ask works well

- Your graph has good coverage of the topic (many relevant permanent notes)
- Your notes are atomic — each one makes one claim clearly
- Node summaries are populated (the AI uses summaries for neighbor context)

---

## When Ask struggles

- Your graph is sparse on a topic — the system can only synthesize from what's there
- Notes are long and unfocused — harder to assemble clean context
- The question requires information that isn't in your graph at all

If Ask returns a thin or uncertain answer, the provenance panel will show which notes it found. Use that as a signal to go add more notes on the topic. The low-confidence hedge above is the system's first-line response — but a sparse graph stays sparse until you fill it.

---

## Provenance and citations

Every RAG response is grounded — it cannot generate from knowledge outside your graph. If Claude makes a claim, it comes from a note in the provenance list. If you see a claim without a matching citation, that's a model formatting issue, not hidden knowledge.
