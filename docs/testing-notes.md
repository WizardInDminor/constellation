# Constellation — Testing Observations & Notes

Running log of observations, feature requests, and insights from real use.
Add new entries under the appropriate section with a date.

---

## Phase 3 Testing (2026-05-08)

### UX Observations

**Fleeting capture flow is solid.**
Ctrl+K → type → submit is fast enough to use reflexively. The "get the idea down, get back to work, process later" loop works as intended. No changes needed to the capture flow.

**The processing enriches, not just atomizes.**
A fleeting note about using a footswitch for recording control and strums for tempo entry came back with a suggested permanent that added meaningful language about envelope thresholds for timing triggers — synthesizing a concrete implementation approach that wasn't explicit in the original note. The AI didn't just detect "two separate ideas to split" — it improved the content without over-elaborating.

This is a more powerful capability than expected. The system isn't just a thought-organizer; it can act as a thinking partner that completes half-formed ideas with domain-appropriate detail. **The processing step is generative, not just organizational.** This has implications for how we write the system prompt as the corpus grows — giving Claude more domain context (embedded systems, music/CV) may improve enrichment quality further.

---

## Phase 5 Testing (2026-05-09)

### RAG Query Results

**First real query — "Which SPI is used on the discovery board for STM32?"**
Returned a grounded, technically accurate answer with 4 inline citations, correct pin numbers (PB12/PB13/PB15), the LIS3DSH accelerometer conflict, the schematic tracing tip, and the 42MHz vs 20MHz clock comparison across two different notes. Provenance panel showed 8 notes used.

**Second real query — "What are some things to look out for when implementing CV generation using STM32 and MCP4922?"**
Returned a comprehensive, structured technical reference covering SPI configuration, hardware wiring, command word construction, and CV calibration. Used 20 notes (8 direct + 12 via graph expansion) and 20 edge traversals. The connections traversed section showed domain-accurate rationales for each edge. The MIDI-to-DAC formula and 1V/oct calibration bench test surfaced from notes not directly matched by the query — pulled in via graph edges.

**Key finding:** Graph expansion is adding genuine retrieval value beyond vector similarity. Notes connected via typed edges surface in answers even when they wouldn't score high in direct semantic search.

---

## Import Pipeline Testing (2026-05-09)

### Observation — Imported notes are disconnected by default

After importing 16 notes from a dotfiles document, all notes are scattered in the graph with no edges between them and no visible connection to the source document. Two related needs were identified and both are now implemented (Phase X).

**Auto-tag on ingest** — ✅ Implemented. "Tag all accepted notes with:" field in the collapsible "Import options" section on the ingest review page. Resolves an existing tag by name (case-insensitive) or creates it fresh. Applied to all accepted literature notes at creation time.

**Sources as first-class graph nodes** — ✅ Implemented. Source records appear in the graph as teal nodes (`type="source"`). Synthetic `CITES` edges run from each literature note to its source, derived from the `nodes.source_id` FK. Implemented as a computed view in `GET /graph/data` (no schema changes — see ADR-034). Clicking a source node in the graph opens a side panel with source metadata and an "Open source →" link to `/sources/{id}`.

**Auto-hub structure note** — ✅ Implemented. "Import options" section includes a "Create a hub note for this import?" checkbox (default: checked) with an editable title pre-filled from the source title. On accept: creates a structure note with content "Notes imported from: {source.title}" and `COLLECTS` edges to all accepted literature notes. Hub creation is best-effort; literature notes are saved even if hub creation fails (ADR-035).

---

## General UX Gaps (2026-05-09)

**No delete UI for nodes** — ✅ Implemented (Phase X).

- Inbox view: "Discard" button per fleeting note card. Click → inline confirm ("Discard this note? / Yes, discard / Cancel"). On confirm: calls `DELETE /api/v1/nodes/{id}`, removes the card from the list without a page reload.
- Note detail view (`/nodes/[id]`): "Delete note" button in the header (right side). Click → inline confirm ("Delete this note? This cannot be undone."). On confirm: deletes and redirects to `/notes`.
- Graph view: no change needed — deleted nodes are already excluded from `GET /graph/data` via `deleted_at IS NULL`.

---

## Design Clarification — Structure Notes vs Source Nodes (2026-05-09)

These two concepts are complementary, not competing. They answer different questions:

**Source node** → "where did this come from?" Provenance. The i3 config file is the source. Permanent and unchanging.

**Structure note** → "how do I think about this?" Organization. "i3 Window Manager — Personal Setup" is the mental model. Evolves over time — notes may be reorganized across multiple structure notes as understanding deepens.

At import time they look the same. Over time they diverge: a note about keybindings might be COLLECTS-ed by both "i3 Keybindings" and "Keyboard-First Workflow" structure notes, while its source (the i3 config file) never changes.

**Implemented behavior for import pipeline:**
1. Source record created during ingest (already implemented prior to Phase X).
2. Auto-generated hub structure note created at accept time — user-editable title before creation, pre-populated with COLLECTS edges to all accepted notes. Starting hub, not permanent organization. ✅ Phase X.
3. Source appears as a teal graph node with CITES edges from all literature notes — permanent provenance layer. ✅ Phase X. Implemented as virtual nodes computed in `GET /graph/data` rather than as a schema change (see ADR-034). Sources are metadata, not content; they are not embedded and do not participate in search or RAG.

---

## Deferred Features Tracker

### ✅ Completed during build phases

| Feature | Completed |
|---|---|
| Tags — creation, assignment, filtering | Phase 4 |
| Process page draft state (sessionStorage) | Phase 3.5 |
| Source creation UI with file:// path support | Phase 5 |
| Local source file linking (xdg-open) | Phase 5 |
| Browse/filter notes by tag | Phase 4 |
| RAG query interface with provenance | Phase 5 |
| Terminal CLI capture (`con "thought"`) | Phase 3.5 |
| Intentional capture mode (Ctrl+Alt+K) | Phase 4 |
| Graph visualization | Phase 6 |
| Document import pipeline | Between Phase 6 and 7 |
| MkDocs documentation site | Between Phase 6 and 7 |
| Delete UI (inbox discard + note detail delete) | Phase X |
| Auto-tag on ingest | Phase X |
| Sources as first-class graph nodes (virtual, teal, CITES edges) | Phase X |
| Auto-hub structure note on import acceptance | Phase X |
| Tags included in RAG context blocks | Phase X |

### 🔲 Still outstanding

| Feature | Priority | Notes |
|---|---|---|
| README refresh | High | Still reflects Phase 0 skeleton. Needs current feature list, screenshot of graph view, updated quick-start. |
| Processing modes / system prompt selection | Low — defer | Enrich / summarize / audit / etc. Wait for real use to reveal which modes are actually needed. Don't design speculatively. |
| System prompt addenda (per-note instructions) | Low — defer | Powerful but speculative until usage patterns emerge. |
| Phase 7 — Local provider (Ollama) | Deferred | No immediate need — Voyage free tier covers embedding, Anthropic costs are negligible at personal scale. Revisit when offline or privacy use becomes a real need. |

---

## Open Questions

- Should the system prompt be given domain context (e.g. "this user works in embedded systems and music/CV synthesis") to improve enrichment quality? Or keep it domain-agnostic and let the corpus speak for itself?

  *Partially answered: tags are now included in RAG context blocks, giving Claude topical signal without hard-coding domain assumptions into the system prompt. Watch whether this is sufficient as the corpus grows.*

- ~~What's the right chunking strategy for importing existing markdown docs?~~ Resolved: heading-based H2/H3 splitting with paragraph fallback, 2400-char / 4 token estimate cap. See ADR-028.

---

*Add new observations below with a date header.*

5/10/26 - Observations
- When in the inbox, if I enter the edit view to make a change or add a tag I now can no longer process without navigating back to the inbox.  There should be a way to process a fleeting note from the node/[id] page.
- Home page is currently pretty empty.  Might be cool to do some sort of dashboard with basic graph stats, can be basic numbers, or could have some llm thematic analysis option as well.
- Need to have hover pop-over in the node/[id] (note) page so that when adding connections I can see what the actual node I am about to select has for a note.
- Direction of connections, and the differences between when to use some (supports vs elaborates) are a little vague to the user right now.  Need to make these more easily seen and understood, without being annoying about it for users who have the workflow down.
- +1 on needing to show the direction of connections being made.  Not intuitive for telling which note supports which when adding the connections.
- Need to add a way to edit and or remove sources.  I am having issues with file paths and have 3 sources all attempting to point to a specific file, but I am unable to try and update so I am forced to continue to generate new sources.
- Need to determine how to properly handle file paths and opening source files from the app.
