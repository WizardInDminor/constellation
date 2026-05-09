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

## When Ask works well

- Your graph has good coverage of the topic (many relevant permanent notes)
- Your notes are atomic — each one makes one claim clearly
- Node summaries are populated (the AI uses summaries for neighbor context)

---

## When Ask struggles

- Your graph is sparse on a topic — the system can only synthesize from what's there
- Notes are long and unfocused — harder to assemble clean context
- The question requires information that isn't in your graph at all

If Ask returns a thin or uncertain answer, the provenance panel will show which notes it found. Use that as a signal to go add more notes on the topic.

---

## Provenance and citations

Every RAG response is grounded — it cannot generate from knowledge outside your graph. If Claude makes a claim, it comes from a note in the provenance list. If you see a claim without a matching citation, that's a model formatting issue, not hidden knowledge.
