# Target Architecture

## System shape

```text
┌──────────────────────┐      ┌──────────────────────┐
│ Constellation Web UI │      │ AI Clients           │
│                      │      │ ChatGPT / Claude /    │
│ Human authoring      │      │ Codex / local agents │
└──────────┬───────────┘      └──────────┬───────────┘
           │ HTTP/API                     │ MCP
           ▼                              ▼
┌─────────────────────────────────────────────────────┐
│                  Application Layer                  │
│                                                     │
│ Story services      Workflow services               │
│ Context builders    Proposal/decision services      │
│ Production services Product-development services    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                     Domain Layer                    │
│                                                     │
│ Story domain       Shared workflow core             │
│ Software domain    Production model                 │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│               Repositories / Persistence            │
└─────────────────────────────────────────────────────┘
```

## Layer responsibilities

### Presentation layer

Includes:

- Next.js pages and components;
- review queues;
- timeline and graph views;
- story workbenches;
- production status views.

It may orchestrate user interactions but must not own domain rules.

### MCP adapter layer

Includes:

- tool registration;
- input validation;
- authentication and authorization;
- conversion between MCP schemas and application DTOs;
- safe error handling;
- audit metadata capture.

It must not:

- query the database directly;
- determine canon status;
- assemble complex context;
- contain story logic.

### Application layer

Owns use cases:

- create proposal;
- accept proposal;
- build character dossier;
- link story objects;
- record decision;
- create production job;
- assemble coding-agent context.

### Domain layer

Owns:

- lifecycle invariants;
- allowed transitions;
- relationship semantics;
- canon/proposal distinction;
- production version rules;
- validation semantics.

### Repository layer

Owns persistence only.

## Suggested backend structure

Adapt names to the current repository rather than forcing a rewrite.

```text
app/
├── core/
│   ├── auth/
│   ├── audit/
│   └── errors/
├── workflow/
│   ├── domain/
│   ├── services/
│   ├── repositories/
│   └── dtos/
├── story/
│   ├── domain/
│   ├── services/
│   ├── context_builders/
│   ├── repositories/
│   ├── routes/
│   └── dtos/
├── production/
│   ├── domain/
│   ├── services/
│   ├── adapters/
│   └── repositories/
├── software/
│   ├── domain/
│   ├── services/
│   └── context_builders/
└── integrations/
    └── mcp/
        ├── server.py
        ├── auth.py
        ├── schemas/
        └── tools/
```

## Suggested frontend structure

```text
src/
├── app/
│   └── projects/[projectId]/
├── features/
│   ├── story/
│   ├── proposals/
│   ├── timeline/
│   ├── relationships/
│   ├── production/
│   └── software-development/
├── components/
│   ├── cards/
│   ├── forms/
│   └── layout/
└── lib/
    ├── api/
    └── types/
```

## Shared state boundaries

### Authoritative

- accepted story objects;
- accepted decisions;
- project configuration;
- proposal status;
- revision history;
- production input versions;
- validation records.

### Derived

- dossiers;
- workbench context packages;
- graph projections;
- continuity reports;
- summaries;
- search indexes.

Derived data must be rebuildable.

## Deployment topology

For development:

```text
Next.js UI
FastAPI API
MCP endpoint
SQLite or current development database
```

For production:

```text
Next.js UI
FastAPI application service
MCP endpoint behind HTTPS
managed relational database
object storage for generated assets
worker queue for production jobs
```

The production queue and object storage are later-phase concerns.
