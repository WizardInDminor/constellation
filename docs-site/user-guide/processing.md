# Processing

Turning raw fleeting notes into permanent knowledge.

---

## Overview

The processing workflow is the heart of the zettelkasten discipline: taking rough, unprocessed captures and refining them into atomic, self-contained permanent notes. In Constellation, Claude assists with this step — it reads your fleeting note and proposes 1–3 candidate permanent notes, each focused on a single idea.

---

## The inbox

Navigate to **Inbox** (`/inbox`) to see all unprocessed fleeting notes, sorted oldest-first. The inbox is the queue you work from. Notes stay in the inbox until they are either processed into permanents or explicitly discarded.

---

## Processing a fleeting note

1. Click a note in the inbox to open it
2. Click **Process** to enter the processing workflow (`/inbox/process/[id]`)
3. Claude is called immediately on page load — a spinner shows while the AI is working
4. Claude suggests candidate permanent notes: typically one focused idea per candidate, rewritten in your own words (as much as it can infer), with a proposed title
5. For each candidate:
   - Edit the title and content as needed — the suggestions are starting points, not final text
   - Accept to create it as a permanent node (embedding happens automatically)
   - Reject to discard that candidate
6. Navigate back to the inbox when done

!!! info "Draft state persists"
    Your edits to candidates are saved to `sessionStorage` as you type. If you navigate away accidentally, the draft is restored when you return to the same process page. Accepting or discarding a note clears its draft.

---

## After processing

Each accepted candidate becomes a permanent note and is:

- Embedded immediately (vector written to `vec_nodes`) — available for semantic search
- Indexed in FTS5 — available for keyword search
- Visible in the graph and node detail views

The original fleeting note is marked as processed (`processed_at` is set) and no longer appears in the inbox. It is not deleted — soft delete only.

---

## When not to use AI suggestions

Processing is a thinking exercise, not a transcription task. If Claude's suggestions don't match your intent, ignore them and write the permanent note yourself using the **New note** flow (`Shift+Ctrl+K` → Permanent). The AI suggestions are scaffolding, not the output.
