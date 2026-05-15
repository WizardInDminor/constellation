# Constellation

A personal zettelkasten built as a typed knowledge graph with first-class AI integration.

---

## What is Constellation?

Constellation is a digital slip-box built on Luhmann's zettelkasten principles — but modernized. Notes are atomic. Relationships between notes are typed and directional: a note doesn't just *link to* another, it **supports**, **contradicts**, **elaborates on**, **questions**, or **is inspired by** it. That semantic layer is what makes AI integration meaningful rather than superficial.

The system does two things that most note tools don't:

- **Finds non-obvious connections** between your notes automatically via AI link suggestion
- **Answers questions grounded in your own writing** — RAG queries that synthesize across your knowledge graph and cite the specific notes that contributed

Everything is stored in a single SQLite file. Cloud AI (Voyage for embeddings, Anthropic Claude for generation) handles the intelligence layer. A local Ollama fallback is planned for offline mode.

---

## Core concepts

| Concept | What it is |
|---------|-----------|
| **Fleeting note** | Raw capture — inbox. The friction-free entry point. Not yet processed. |
| **Permanent note** | An atomic, fully processed idea in your own words. The real Zettel. |
| **Literature note** | A note from an external source, always linked to a Source record. |
| **Structure note** | A Map of Content — a curated entry point into a domain. |
| **Edge** | A typed, directional relationship between two notes. Carries an optional "why" note. |
| **Source** | An external reference (book, datasheet, article, video) that literature notes link to. |

---

## Feature overview

### Capture

- **Quick capture** from the browser (`Ctrl+K`) or terminal (`con "thought"`) drops a fleeting note into the inbox instantly
- **Intentional capture** (`Shift+Ctrl+K`) opens a full dialog for permanent and literature notes with tag assignment and inline source creation
- **`con import`** ingests a local markdown file — Claude chunks it by heading and generates candidate literature notes for review
- **Mobile capture** via Tailscale + iOS Shortcuts — three Shortcuts (manual, share-sheet, voice/Siri) post directly to the same inbox from the iPhone

### Process

- Inbox view shows unprocessed fleeting notes oldest-first
- Claude decomposes each fleeting note into 1–3 candidate atomic permanent notes
- Draft state is persisted to `sessionStorage` so navigating away doesn't lose work

### Link

- Typed, directional edges with an optional free-text explanation of *why* the link exists
- AI link suggestions: Claude finds semantically related candidate notes and proposes an edge type with reasoning
- Node detail view groups incoming and outgoing edges by type; click any to walk the graph

### Search

- **Hybrid** (default): Reciprocal Rank Fusion over vector similarity + FTS5 keyword search
- **Semantic**: pure vector similarity — finds conceptually related notes regardless of shared keywords
- **Fulltext**: FTS5 keyword search — fast, works offline, no API call needed

### Ask your notes

- `POST /rag/query` embeds the question → hybrid search → graph expansion → context assembly → Claude synthesis
- Answers include `[Note N]` inline citations that link back to the source notes
- Provenance panel shows every note that contributed and every graph edge traversed

### Graph visualization

- Force-directed canvas graph at `/graph` via `react-force-graph-2d`
- Node color by type, edge color by relationship type (7 types)
- Client-side filters for node type, edge type, tag, and isolated-node visibility
- Click any node or edge to open a detail side panel

---

## Screenshot placeholder

> _Screenshots to be added once the UI is stable._

---

## Project status

Core system feature-complete and in daily use. Two UX iterations (Bucket A + Bucket B) shipped after Phase 6, adding the bridge classifier, Ask mode selector + critic mode, Home recent-activity, schema filters on Notes, cluster suggest-links, triangle discovery, and a low-confidence hedge on Ask. The next major task is the Phase 8 prototype gate (edge-semantics-into-RAG).

!!! note "User guide is mid-refresh"
    Pages for `/discover` (orphans, stale, bridges, triangles), `/synthesize`, `/cluster-links`, plus the Ask mode selector and graph focus mode, are not yet documented here. See `docs/ux-build-plan.md` and the `docs/decisions.md` ADR log for the current shipped state. The pages below describe the surfaces that *are* covered.

| Phase | Status | Delivered |
|-------|--------|-----------|
| 0 — Foundation | ✅ | Repo skeleton, DB, migrations, dev servers |
| 1 — Core CRUD | ✅ | Full data layer, all repository and API routes |
| 2 — Embeddings | ✅ | Provider abstraction, auto-embed on write, job queue |
| 3 — Capture & process | ✅ | Fleeting capture, inbox, AI-assisted decomposition |
| 3.5 — CLI | ✅ | `con` terminal tool, systemd service, draft persistence |
| 3.6 — Mobile capture | ✅ | Tailscale + iOS Shortcuts (manual, share-sheet, voice) |
| 4 — Linking | ✅ | Edge creation UI, AI link suggestions, neighbor browsing |
| 5 — Search & RAG | ✅ | Hybrid search, `/ask` UI, source management |
| 6 — Visualization | ✅ | Force-directed graph, filters, side panels |
| 6.5 — Admin dashboard | ✅ | Embedding job status, drain controls, rate-aware worker |
| UX Bucket A | ✅ | Bridge classifier, expanded edge vocab, classifier rationale, Ask mode selector + critic |
| UX Bucket B | ✅ | Home recent activity, Notes schema filters, cluster suggest-links, Triangles tab, Ask low-confidence hedge |
| 8.0 — Phase 8 gate | ⏳ | Prototype: do typed edges materially change Ask output? |
| 8 — Edge semantics in RAG | 📋 | Prompt-aware edge types; resolved-edge state; D1 evolution edges |
