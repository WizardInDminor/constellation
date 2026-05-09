# API Reference

Constellation's backend exposes a REST API under `/api/v1/`. All routes accept and return JSON. The full interactive specification is served by the running backend.

---

## Live docs

With the backend running on the default port, the OpenAPI documentation is available at:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI JSON**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

These are always up-to-date with the running code and are the authoritative API reference.

---

## Frontend type codegen

TypeScript types for all API request and response shapes are generated from the OpenAPI spec:

```bash
cd frontend
pnpm types   # requires the backend to be running on :8000
```

This writes to `frontend/src/lib/api-types.ts`. Never hand-write API types — always regenerate after backend changes.

---

## Route summary

### Nodes (`/api/v1/nodes`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/nodes/fleeting` | Quick capture — minimal fields |
| `GET` | `/nodes/inbox` | List unprocessed fleeting notes |
| `POST` | `/nodes/process/{id}` | AI-assisted fleeting → permanent |
| `POST` | `/nodes/permanent` | Create permanent directly |
| `POST` | `/nodes/literature` | Create literature note (requires `source_id`) |
| `POST` | `/nodes/structure` | Create structure (Map of Content) note |
| `GET` | `/nodes` | Paginated list with type/tag filters |
| `GET` | `/nodes/{id}` | Node detail with edges and neighbors |
| `PATCH` | `/nodes/{id}` | Update fields |
| `DELETE` | `/nodes/{id}` | Soft delete |
| `GET` | `/nodes/search` | FTS5 prefix search for the node picker |

### Edges (`/api/v1/edges`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/edges` | Create edge with type and optional note |
| `DELETE` | `/edges/{id}` | Delete edge |
| `GET` | `/nodes/{id}/neighbors` | All connected nodes |

### Sources (`/api/v1/sources`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sources` | List all sources |
| `POST` | `/sources` | Create source |
| `GET` | `/sources/{id}` | Source detail with linked literature notes |
| `PATCH` | `/sources/{id}` | Update source metadata |
| `DELETE` | `/sources/{id}` | Delete source |
| `GET` | `/sources/{id}/open` | Launch `xdg-open` on the source URL/path |

### Search (`/api/v1/search`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/search/hybrid` | RRF fusion of vector + FTS5 (default) |
| `POST` | `/search/semantic` | Pure vector similarity |
| `POST` | `/search/fulltext` | FTS5 keyword search |

### RAG (`/api/v1/rag`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rag/query` | Full RAG: retrieval + traversal + generation |
| `POST` | `/rag/suggest-links/{id}` | AI suggests candidate edges for a node |
| `POST` | `/rag/suggest-permanent/{id}` | AI decomposes fleeting into atomic permanents |

### Ingest (`/api/v1/ingest`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/document` | Upload markdown file, generate literature note candidates |
| `GET` | `/ingest/pending/{source_id}` | Retrieve pending candidate notes for review |

### Config (`/api/v1/config`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config` | Current provider settings |
| `PATCH` | `/config` | Update provider; triggers re-embedding if needed |
| `GET` | `/config/embedding-jobs` | Background re-embedding job queue status |

### Graph (`/api/v1/graph`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/graph/data` | Full graph as nodes + edges for visualization |
