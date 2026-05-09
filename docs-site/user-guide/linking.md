# Linking

Building the knowledge graph through typed, directional edges.

---

## Overview

Links in Constellation are not bookmarks — they are semantic assertions. Every edge has a type that describes the *relationship* between two notes, and an optional free-text note explaining *why* that relationship holds. The edge type vocabulary is fixed and small, which keeps AI prompts well-scoped and prevents the graph from fragmenting into idiosyncratic personal taxonomies.

---

## Edge types

| Type | Direction & meaning |
|------|---------------------|
| **SUPPORTS** | A → B: A provides evidence or argument for B |
| **CONTRADICTS** | A → B: A is in tension with or disagrees with B |
| **ELABORATES** | A → B: A zooms in on a specific aspect of B |
| **ANALOGOUS_TO** | A ↔ B: structural similarity, often across domains |
| **QUESTIONS** | A → B: A raises a problem with or about B |
| **INSPIRED_BY** | A → B: looser creative or associative connection |
| **COLLECTS** | A → B: A is a structure note (Map of Content) that includes B |

Every edge has a source and a target. Directionality matters: "A SUPPORTS B" is a different claim than "B SUPPORTS A."

---

## Creating an edge manually

1. Open a permanent, literature, or structure note
2. In the **Connections** panel, click **Add connection**
3. Type a few characters in the node picker — it uses FTS5 prefix search and returns up to 50 matching notes (fleeting notes are excluded; see below)
4. Select the target note, choose an edge type, and optionally write a context note
5. Save

The edge appears immediately in the Connections panel, grouped by type.

---

## AI link suggestions

On any permanent, literature, or structure note, click **Suggest connections** to ask Claude to find candidate edges:

1. Constellation runs a hybrid search to find semantically related notes
2. Claude evaluates each candidate and proposes an edge type with a one-sentence rationale
3. Review the suggestions — accept to create the edge, dismiss to skip

Suggestions are not persisted. If you navigate away and return, clicking **Suggest connections** again will regenerate them (takes 3–5 seconds).

---

## Why fleeting notes are excluded

Fleeting notes are transient. They may be decomposed into multiple permanents, rewritten substantially, or discarded entirely during processing. A link to a fleeting note would become meaningless or misleading once the note is processed. The graph is built from stable, atomic permanent notes.

---

## The "why" note

The optional free-text note on each edge is often the most valuable part of a connection. Six months from now, the fact that two notes are linked is less useful than knowing *why* you made that connection in the first place. Write the "why" note at creation time while the reasoning is fresh.

---

## Browsing the graph from a note

On any note's detail page, the Connections panel shows:

- **Outgoing edges** grouped by type (edges *from* this note)
- **Incoming edges** grouped by type (edges *to* this note)

Click any connected note title to navigate to it and continue walking the graph.
