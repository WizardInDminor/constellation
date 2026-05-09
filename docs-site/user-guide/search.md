# Search

Finding notes across your knowledge graph.

---

## Overview

Constellation offers three search modes, accessible at `/search`. Each mode is suited to a different retrieval intent. The mode toggle is a single click — start with hybrid (the default) and switch when you know what you need.

---

## Hybrid search (default)

Hybrid search fuses vector similarity and keyword search using Reciprocal Rank Fusion (RRF). A note ranks well if it scores highly in either or both channels. This is the best starting point for most queries because it catches:

- Notes that match your keywords exactly
- Notes that are conceptually related but don't share your exact vocabulary

The backend fetches the top 10 results from each channel, fuses them with RRF (k=60), and returns the top unified ranking.

---

## Semantic search

Semantic search embeds your query into a 1024-dimensional vector and finds the nearest notes by cosine similarity. Use this when:

- You want to find notes that *mean* the same thing regardless of what words they use
- You're exploring a conceptual neighborhood rather than looking for a specific note

Semantic search always makes an API call to your embedding provider (Voyage AI by default).

---

## Fulltext search

Fulltext search uses SQLite's FTS5 engine with prefix matching. Use this when:

- You know a specific word or phrase that appears in the note
- Your embedding provider is unavailable or you want a completely offline search
- You want deterministic, reproducible results

FTS5 search is fast, requires no API call, and works even if the embedding provider is down.

---

## When to use each

| You want to find... | Best mode |
|--------------------|-----------|
| Notes related to a concept, any phrasing | Semantic |
| Notes containing a specific term | Fulltext |
| Best coverage across both | Hybrid |
| Offline / no API key | Fulltext |

---

## Search vs. Ask

Search returns a list of matching notes that you browse manually. **Ask** (see [Asking Your Notes](asking.md)) retrieves relevant notes, walks the graph, assembles context, and synthesizes an answer via Claude. Use search when you want to find and read notes; use Ask when you want a synthesized answer drawn from across your graph.
