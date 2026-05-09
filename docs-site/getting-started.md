# Getting Started

Everything you need to get Constellation running and capture your first note.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Python 3.11+** | Used by the backend |
| **Node.js 20+ and pnpm** | Used by the frontend |
| **[uv](https://astral.sh/uv)** | Python dependency manager — `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **SQLite 3.41+** | Modern Linux/macOS installs are fine |
| **Voyage AI API key** | Sign up at [voyageai.com](https://www.voyageai.com) |
| **Anthropic API key** | Get one at [console.anthropic.com](https://console.anthropic.com) |
| **Ollama** (optional) | For local provider mode — [ollama.com](https://ollama.com) |

---

## Installation

### 1. Clone and configure

```bash
git clone <repo-url> constellation
cd constellation
cp .env.example .env
```

Open `.env` and fill in your API keys:

```dotenv
VOYAGE_API_KEY=your-voyage-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 2. Start the backend

```bash
cd backend
uv sync           # installs Python deps including the `con` CLI tool
uv run uvicorn app.main:app --reload
```

The backend starts on **http://localhost:8000**. On first start, database migrations run automatically — the `constellation.db` file is created in `backend/data/`.

!!! tip "Run as a system service"
    If you want the backend to start automatically on login, copy the included systemd unit:

    ```bash
    cp backend/constellation.service ~/.config/systemd/user/
    systemctl --user enable --now constellation
    ```

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
pnpm install
pnpm types    # generates TypeScript types from the running backend — requires backend up
pnpm dev
```

The frontend starts on **http://localhost:3000**.

---

## Your first note

### Quick capture from the browser

1. Open **http://localhost:3000**
2. Press **`Ctrl+K`** anywhere on the page
3. Type a thought — even one sentence is enough
4. Press **Enter** to save

The note lands in the inbox as a `fleeting` note. Fleeting notes are unprocessed — they're meant to be raw and fast. You'll refine them later.

### Quick capture from the terminal

After `uv sync`, the `con` command is available inside the virtual environment:

```bash
# Add the venv bin directory to your PATH (add this to .bashrc or .zshrc)
export PATH="$HOME/dev/constellation/backend/.venv/bin:$PATH"

# Then capture from anywhere
con "distributed systems reading log — Lamport clocks"
con -t "Attention is Not Explanation" -c "Jain et al. find that attention weights don't align with gradient-based feature importance. This is important for interpretability work."
```

On success, the command prints the note title and its UUID — enough to verify the capture and copy the ID if you want to reference it.

---

## Processing your first fleeting note

1. Navigate to **Inbox** in the top nav (or go to `/inbox`)
2. Click any fleeting note to open it
3. Click **Process** — this opens the processing workflow
4. Claude suggests 1–3 atomic permanent note candidates based on your raw capture
5. Edit the suggestions, accept the ones you want, reject the rest
6. Accepted notes become permanent notes and are immediately embedded for search

---

## Creating your first link

1. Open any permanent note (click from search, inbox, or graph)
2. In the **Connections** panel, click **Add connection**
3. Type a few characters — the node picker uses fast FTS5 prefix matching
4. Select the target note and choose an edge type:
   - **SUPPORTS** — this note provides evidence for the other
   - **CONTRADICTS** — tension or disagreement
   - **ELABORATES** — zooms in on one aspect
   - **ANALOGOUS_TO** — structural similarity across domains
   - **QUESTIONS** — raises a problem about the other
   - **INSPIRED_BY** — loose creative or associative link
   - **COLLECTS** — structure notes use this to gather others into a Map of Content
5. Optionally add a brief note explaining *why* this edge exists — this context is often the most valuable part six months later

---

## Asking your notes a question

1. Navigate to **Ask** in the top nav (or go to `/ask`)
2. Type a question in your own words
3. Constellation embeds the question, runs a hybrid search over your graph, expands graph neighbors one hop out, assembles context, and calls Claude
4. The answer cites specific notes with `[Note N]` links — click them to jump to the source

---

## What's next

- [Capture](user-guide/capture.md) — all the ways to get notes into the system
- [Processing](user-guide/processing.md) — the inbox → permanent workflow in detail
- [Linking](user-guide/linking.md) — edge types, AI suggestions, and building the graph
- [Search](user-guide/search.md) — hybrid, semantic, and fulltext modes
- [Graph view](user-guide/graph.md) — navigating the force-directed visualization
