# Sources

Managing external references linked to literature notes.

---

## Overview

A **Source** is a record for any external reference: a book, datasheet, article, paper, video, or podcast. Literature notes always link to exactly one source. Sources give your literature notes context — who wrote it, when, where to find the original — and allow you to group all your notes from a single reference together.

---

## Creating a source

Sources can be created two ways:

**From the sources page** (`/sources`): Use the full creation form, which includes title, author, type, URL, and publication date.

**Inline during capture**: When using the intentional capture dialog (`Shift+Ctrl+K`) to create a literature note, expand the **New source** section. This mini-form (title, type, URL) creates the source without navigating away, so your in-progress note draft is preserved. Author and publication date can be filled in later from the sources page.

---

## Source types

`datasheet`, `manual`, `book`, `article`, `video`, `podcast`, `other`

---

## Opening a source

From the source detail page, the **Open** button calls `GET /sources/{id}/open`, which invokes `xdg-open` on the URL or file path. This launches your system's default application — a browser for URLs, a PDF viewer for `file://` paths, etc.

This is a Linux-only feature. macOS and Windows are not currently supported.

---

## Importing a document

The `con import` subcommand ingests a local markdown file as a source and generates candidate literature notes from its content:

```bash
con import ~/documents/attention-is-all-you-need.md
```

The pipeline:

1. Creates a source record for the file
2. Chunks the document by H2/H3 heading boundaries
3. Calls Claude on each chunk to generate candidate literature note titles and content
4. Stores the candidates in `pending_ingests` for 7 days
5. Prints a review URL: `http://localhost:3000/ingest?source_id=<uuid>`

Open the review URL in your browser to see all candidates grouped by chunk. Select the ones worth keeping and click **Accept selected** — each accepted candidate is created as a literature note linked to the source.

If you don't open the review UI, the pending record expires after 7 days with no action required.

---

## Browsing your sources

The **Sources** page (`/sources`) lists all your sources. Click any to open the detail view, which shows the source metadata and all literature notes linked to it.
