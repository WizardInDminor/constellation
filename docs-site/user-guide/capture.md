# Capture

Getting thoughts into the system with minimum friction.

---

## Overview

Constellation offers three capture modes, each suited to a different context. All modes create notes through the same backend endpoint (`POST /api/v1/nodes/fleeting` for quick captures, or the appropriate typed endpoint for intentional captures), so every note lands in the same graph regardless of how it was created.

---

## Quick capture — `Ctrl+K`

Press **`Ctrl+K`** anywhere in the web app to open the quick capture dialog. Type a title (and optionally a brief note), press Enter. The note is created as a `fleeting` note and lands in the inbox immediately.

Quick capture is intentionally minimal. The goal is zero friction — capture the thought before it disappears, process it later. Don't try to write a perfect permanent note here; that's what the processing workflow is for.

---

## Intentional capture — `Shift+Ctrl+K`

Press **`Shift+Ctrl+K`** to open the full intentional capture dialog. This mode is for when you know what kind of note you're creating:

- **Permanent** — an atomic, processed idea in your own words
- **Literature** — a note from an external source (requires selecting or creating a Source record)
- **Structure** — a Map of Content that collects other notes

The intentional capture dialog supports tag assignment and, for literature notes, inline source creation so you never have to navigate away mid-capture.

---

## Terminal capture — `con`

After `uv sync`, the `con` CLI tool is available in the backend virtualenv. It posts a fleeting note directly to the running backend.

```bash
# One-liner: first argument becomes the title
con "Lamport clocks don't give wall-clock ordering"

# Explicit flags
con -t "Title" -c "Content of the note"

# Interactive mode: run with no arguments
con
# → prompts for title, then content (blank line ends input)
```

The interactive mode (no args) makes `con` useful from a keyboard launcher (rofi, dmenu, etc.) where you can't easily type flags before the command.

`con` requires the backend to be running. If the server is unreachable, it prints a clear error to stderr and exits non-zero — no silent failures.

---

## Document import — `con import`

For importing existing documents (e.g., notes from another tool, a PDF you've converted to markdown, a long article), use `con import`:

```bash
con import path/to/document.md
con import path/to/document.md --source-id <existing-source-uuid>
```

The import pipeline:

1. Chunks the markdown file by H2/H3 heading boundaries
2. Sends each chunk to Claude, which generates candidate literature note titles and content
3. Persists the candidates to `pending_ingests` (valid for 7 days)
4. Prints a review URL — open it in the browser to accept or reject individual candidates

See [Sources](sources.md) for detail on the import review workflow.

---

## Systemd service

If you run the backend as a systemd user service, `con` is available immediately after login without manually starting uvicorn:

```bash
cp backend/constellation.service ~/.config/systemd/user/
systemctl --user enable --now constellation
```

Add the venv `bin/` directory to your `PATH` (in `.bashrc` or `.zshrc`) to use `con` without a full path:

```bash
export PATH="$HOME/dev/constellation/backend/.venv/bin:$PATH"
```
