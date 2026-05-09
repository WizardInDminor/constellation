# Graph View

Visualizing the structure of your knowledge.

---

## Overview

The **Graph** page (`/graph`) renders your entire knowledge graph as a force-directed canvas visualization using `react-force-graph-2d`. Nodes are colored by type; edges are colored by relationship type. The graph auto-fits to the viewport after the force simulation settles, and every node and edge is clickable.

---

## Node colors

| Color | Node type |
|-------|-----------|
| Blue | Permanent |
| Orange | Fleeting |
| Green | Literature |
| Purple | Structure |

---

## Edge colors

Each of the seven edge types has a distinct color so you can visually distinguish argument chains (SUPPORTS, CONTRADICTS), elaboration trees (ELABORATES), analogical bridges (ANALOGOUS_TO), and structural organization (COLLECTS) at a glance.

---

## Interacting with the graph

**Click a node** to open a side panel showing:

- The note's title and type
- A summary or excerpt
- An **Open note →** link to the full detail page

**Click an edge** to open a side panel showing:

- The edge type and optional context note
- Links to both endpoint notes

**Zoom and pan** with the mouse wheel and drag. The **Fit to screen** button re-fits the entire graph to the viewport.

---

## Filters

The filter bar above the graph lets you narrow what's visible:

| Filter | Effect |
|--------|--------|
| Node type toggles | Show/hide fleeting, permanent, literature, or structure nodes |
| Edge type toggles | Show/hide any of the seven edge types |
| Tag filter | Show only nodes that have a specific tag |
| Hide isolated | Remove nodes with no visible edges from the canvas |
| Title search | Highlight nodes whose title matches a search string |

All filtering is client-side — the full graph is loaded once and filters apply instantly without a server round trip.

---

## Performance note

The entire graph is fetched in a single payload on page load. At personal tool scale (hundreds to low thousands of notes), this is fast. If the graph becomes very large, the force simulation may slow on lower-end hardware; the filter controls help by reducing the rendered node count significantly.
