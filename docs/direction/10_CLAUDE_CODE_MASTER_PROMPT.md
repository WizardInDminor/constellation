# Claude Code Master Prompt

You are working in the existing Constellation repository.

Your task is to help evolve Constellation into a shared creative and software-development workspace with a human UI and a controlled MCP tool surface.

Read all files in this direction pack before proposing implementation work.

## Core architectural direction

Constellation is the authoritative system of record.

It will support:

- structured story projects;
- proposals, decisions, revisions, provenance, and activity history;
- task-specific context builders;
- MCP access for ChatGPT, Claude, Codex, and local agents;
- later production pipelines for prose, comics, animation, and software implementation.

AI-created story material must default to proposed or development status. Do not implement direct AI writes into accepted canon.

The MCP layer must call application services. It must not query the database directly or duplicate business logic.

Share lifecycle and orchestration infrastructure, but preserve domain-specific objects such as Scene, Character, Theme, Feature, ADR, and TestCase.

## Required first action: inspect, do not immediately refactor

Before changing code:

1. inspect the repository structure;
2. identify frontend and backend frameworks and conventions;
3. map existing story, project, timeline, note, relationship, storyboard, and persistence code;
4. locate existing service and repository boundaries;
5. identify existing migrations and test patterns;
6. identify any Canon-specific assumptions;
7. read `AGENTS.md` and repository documentation if present;
8. create:
   - `docs/build/current-system-map.md`
   - `docs/build/constellation-gap-analysis.md`
   - `docs/build/phase-1-implementation-plan.md`

The implementation plan must reference exact existing file paths.

Do not create a parallel architecture merely because the target documents use different names. Adapt the design to the repository.

## Initial build target

Implement the smallest vertical slice that proves:

1. a story proposal can be created through an application service;
2. provenance is recorded;
3. the proposal can reference existing story objects;
4. the proposal appears in a review UI;
5. the user can edit, accept, reject, or supersede it;
6. revision history is preserved;
7. a recent-changes service exposes the resulting events;
8. existing Constellation functionality does not regress.

Prefer Scene or DevelopmentNote as the first integrated story object, depending on which best fits the current repository.

## Required implementation qualities

- typed DTOs and schemas;
- explicit status transitions;
- additive database migrations;
- service-layer business logic;
- repository-layer persistence;
- stable identifiers;
- structured errors;
- tests at domain, service, API, and UI levels where the repository supports them;
- no arbitrary SQL tool;
- no universal untyped node model;
- no automatic canon acceptance;
- no large unrelated redesign.

## MCP work

Do not begin MCP implementation until the internal service path is stable.

Then add a minimal MCP server with:

- `get_server_info`
- `search_story`
- `get_scene_context` or the equivalent first object context
- `get_recent_changes`
- `create_story_proposal`

MCP tools must delegate to the same services used by the normal application.

Implement read and write permission separation.

## Stop clauses

Stop implementation and provide a detailed conflict report instead of making an unapproved architectural decision if any of the following occurs:

- the current persistence model makes proposal/canon separation impossible without a destructive migration;
- the repository has two competing authoritative models for the same story objects;
- authentication or project isolation is missing in a way that would make MCP writes unsafe;
- implementing the plan would require breaking existing storyboard, timeline, or story views;
- a major schema change is needed that is not described in the approved plan;
- you discover that a proposed shared abstraction would force domain objects into arbitrary metadata;
- the actual repository contradicts a foundational assumption in the direction pack.

A conflict report must include:

- the discovered condition;
- affected files;
- why it blocks the approved plan;
- at least two viable options;
- tradeoffs;
- your recommended decision;
- the smallest safe next step.

## Completion report

At the end of each implementation unit, report:

- files added;
- files changed;
- migrations added;
- tests added;
- commands run;
- tests and builds passed or failed;
- unresolved limitations;
- deviations from the plan;
- next recommended unit of work.

Do not claim a behavior works unless it was tested or directly verified.
