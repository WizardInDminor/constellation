# Repository Integration Plan

## First instruction to Claude Code

Do not begin by creating the entire target folder tree.

First inspect the repository and produce:

1. current architecture map;
2. relevant file list;
3. reusable existing models and services;
4. migration risks;
5. proposed exact file changes for Phase 1;
6. any assumptions that would materially change the design.

Then implement the smallest vertical slice that respects the existing repository.

## Recommended repository documents

Create or update:

```text
AGENTS.md
docs/
├── architecture/
│   ├── constellation-direction.md
│   ├── domain-model.md
│   └── mcp-boundary.md
├── adrs/
│   ├── 0001-shared-workflow-core.md
│   ├── 0002-proposal-before-canon.md
│   ├── 0003-mcp-calls-application-services.md
│   └── 0004-context-builders-own-ai-shapes.md
└── build/
    ├── current-system-map.md
    ├── gap-analysis.md
    └── phase-1-plan.md
```

## Suggested first implementation slice

### Backend

- shared proposal model and migration;
- provenance model and migration;
- activity event model and migration;
- proposal service;
- proposal repository;
- proposal API routes;
- recent changes service;
- one story object adapter, preferably Scene or DevelopmentNote.

### Frontend

- proposal inbox;
- proposal detail;
- related object display;
- status actions;
- provenance display.

### MCP

After the internal service and API are stable:

- read-only server bootstrap;
- `get_server_info`;
- `search_story`;
- `get_scene_context`;
- `get_recent_changes`;
- `create_story_proposal`.

## Migration strategy

Prefer additive migrations.

Do not:

- replace existing story tables merely to match this document;
- collapse all entities into one generic table unless the repository already follows that pattern and the tradeoff is explicitly reviewed;
- migrate all existing Canon material during the first slice;
- break existing storyboard or timeline behavior.

## Testing layers

### Domain tests

- lifecycle transitions;
- provenance requirements;
- supersession behavior;
- accepted/proposed separation.

### Service tests

- proposal creation;
- proposal resolution;
- context-builder output;
- recent-change retrieval.

### API tests

- request validation;
- authorization;
- response schemas;
- error model.

### MCP tests

- tool schema;
- service delegation;
- permission enforcement;
- stable identifiers;
- no direct repository/database calls.

### UI tests

- proposal visibility;
- status actions;
- revision display;
- source display.

## Development fixtures

Create a small test project with:

- two characters;
- one location;
- two scenes;
- one theme;
- one open thread;
- one accepted decision;
- one proposed scene.

This fixture should be reusable by API, MCP, and UI integration tests.
