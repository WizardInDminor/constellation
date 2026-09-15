# Finalized Phased Build Guide

## Phase 0 — Repository and domain reconnaissance

### Goal

Understand the current Constellation codebase before introducing a new architecture.

### Work

- map existing frontend routes, components, backend modules, services, repositories, and schemas;
- identify current story entities and persistence models;
- locate any existing Canon-specific assumptions;
- identify existing project, timeline, note, relationship, and storyboard functionality;
- document where application services end and direct database access begins;
- create an implementation checkpoint branch;
- produce a gap analysis against this package.

### Deliverables

- `docs/current-system-map.md`
- `docs/constellation-gap-analysis.md`
- an initial implementation plan tied to actual repository paths;
- no major refactor unless required to make the first vertical slice possible.

### Exit criteria

Claude Code can identify the exact files that will own:

- project identity;
- story object persistence;
- proposal lifecycle;
- provenance;
- MCP transport;
- review UI.

---

## Phase 1 — Shared workflow foundation

### Goal

Create the reusable lifecycle used by both story and software domains.

### Core objects

- Project
- Proposal
- Decision
- Revision
- Relationship
- ProvenanceRecord
- ActivityEvent

### Required capabilities

- create a proposal;
- connect it to one or more domain objects;
- edit a proposal while preserving revision history;
- accept, reject, supersede, or archive it;
- record source client and source conversation/session;
- retrieve recent changes.

### Constraints

- do not build production jobs yet;
- do not create a generic arbitrary node system;
- do not allow MCP clients to write accepted canon directly.

### Exit criteria

A proposal created through an internal service can be reviewed and resolved in the UI with an audit trail.

---

## Phase 2 — Story domain foundation

### Goal

Establish the minimum explicit story graph.

### Initial story objects

- StoryProject
- Character
- Scene
- Location
- Theme
- StoryArc
- TimelineEvent
- WorldRule
- DevelopmentNote
- OpenThread

### Initial relationship types

- character appears in scene;
- scene occurs at location;
- scene advances arc;
- scene expresses theme;
- event precedes event;
- note concerns object;
- thread concerns object;
- object contradicts object;
- proposal targets object.

### Context builders

Implement explicit application services:

- `build_character_dossier`
- `build_scene_context`
- `build_story_project_context`
- `build_recent_changes_context`

These builders should own the AI-ready data shape. MCP tools must not assemble domain context independently.

### Exit criteria

The application can create, retrieve, and connect core story objects and produce stable character and scene context bundles.

---

## Phase 3 — Read-only MCP server

### Goal

Make Constellation available to external AI clients without granting write access.

### Initial tools

- `get_server_info`
- `list_projects`
- `search_story`
- `get_story_project_context`
- `get_character_dossier`
- `get_scene_context`
- `get_recent_changes`
- `list_open_threads`

### Architecture

```text
MCP transport
→ MCP tool adapter
→ application service/context builder
→ repository
→ database
```

The MCP layer must not contain business logic or direct SQL.

### Security

- authenticated access;
- project-level authorization;
- read scopes;
- structured logs;
- rate limits;
- sanitized error responses.

### Exit criteria

At least two MCP-compatible clients can independently retrieve the same authoritative story state.

---

## Phase 4 — Controlled MCP capture

### Goal

Complete the first bidirectional collaboration loop.

### Initial write tools

- `create_development_note`
- `create_story_proposal`
- `link_proposal_to_objects`
- `update_proposal`
- `record_story_decision`

### Rules

- all AI-created story material defaults to `proposed` or `development`;
- MCP clients cannot promote content to accepted canon;
- accepted decisions may be recorded only if the request explicitly represents a user-approved decision and the configured permission allows it;
- all writes require provenance.

### UI work

Create or complete:

- proposal inbox;
- proposal detail view;
- related-object links;
- revision history;
- accept/reject/edit/supersede actions;
- source/provenance display.

### Exit criteria

A conversation can create a proposal, the user can resolve it in the UI, and another client can retrieve the final state.

---

## Phase 5 — Story workbench workflows

### Goal

Move from isolated objects to task-oriented creative workflows.

### Workflows

- character development;
- scene planning;
- chapter planning;
- continuity review;
- theme exploration;
- setup/payoff tracking;
- timeline reconciliation;
- short-form concept generation.

### New context builders

- `build_character_review_context`
- `build_scene_planning_context`
- `build_continuity_review_context`
- `build_theme_network_context`
- `build_short_form_generation_context`

### Design rule

Workflow tools should request task-shaped context, not raw database exports.

### Exit criteria

The app and MCP clients can launch the same workflow against the same authoritative objects and see each other's resulting proposals and decisions.

---

## Phase 6 — Production model

### Goal

Introduce a reusable production pipeline for story outputs.

### Shared production objects

- ProductionJob
- ProductionInput
- ProductionOutput
- ValidationResult
- ArtifactVersion

### Initial production types

- prose draft;
- storyboard;
- comic page;
- animatic;
- screenplay;
- audio draft.

### Lifecycle

```text
queued
→ context_assembled
→ in_progress
→ output_produced
→ validating
→ review_required
→ accepted | rejected | superseded
```

### Constraints

- authoring state and production output remain separate;
- production consumes a frozen input version;
- regeneration creates a new artifact version;
- accepted story state is never silently rewritten by a renderer.

### Exit criteria

One accepted scene can produce a versioned storyboard or prose artifact and preserve the exact source state used to generate it.

---

## Phase 7 — Short-form rapid pipeline

### Goal

Support fast, playful projects without requiring the full Canon-depth workflow.

### Project modes

- deep narrative;
- standard narrative;
- rapid short-form.

### Rapid pipeline

```text
conversation
→ concept brief
→ characters and setting
→ beat sheet
→ scene sequence
→ storyboard
→ animatic or comic
```

### Requirements

- defaults and templates reduce required fields;
- missing deep-theme fields do not block production;
- project mode changes context-builder behavior, not core data integrity;
- a rapid project can later be promoted to a deeper mode.

### Exit criteria

A small concept can move from conversation to a reviewable storyboard with minimal manual data entry.

---

## Phase 8 — Software-development domain

### Goal

Use the same shared workflow foundation for Constellation's own product development.

### Software objects

- Feature
- Requirement
- ArchitectureDecision
- ImplementationTask
- RepositoryArea
- TestCase
- Bug
- Release
- ImplementationReport

### MCP tools

- `get_project_charter`
- `get_feature_spec`
- `get_active_build_plan`
- `get_architecture_decisions`
- `get_acceptance_criteria`
- `record_implementation_result`
- `record_test_result`
- `report_design_conflict`
- `create_bug_report`

### Repository synchronization

Accepted ADRs and implementation-critical specifications should also be written into version-controlled repository documents.

### Exit criteria

Claude Code or Codex can retrieve an approved feature package, implement it, and record results without the user manually relaying the design.

---

## Phase 9 — Codex and coding-agent workflow

### Goal

Add a specialized production workflow for code implementation.

### Pipeline

```text
approved feature
→ implementation context builder
→ coding agent
→ repository changes
→ tests
→ implementation report
→ review
→ merge
```

### Required controls

- explicit repository scope;
- branch isolation;
- stop clauses for architectural conflicts;
- test requirements;
- no silent schema redesign;
- no direct production deployment;
- human review before merge.

### Exit criteria

A coding agent can complete a scoped feature, exercise Constellation through its test MCP environment, and report outcomes into Constellation.

---

## Phase 10 — Multi-agent production and rendering adapters

### Goal

Connect replaceable specialized builders.

### Candidate adapters

- image generation;
- character turnaround generation;
- voice synthesis;
- music and sound generation;
- video/animation generation;
- Codex;
- Claude Code;
- local models;
- continuity reviewer;
- style reviewer.

### Architectural rule

Every adapter receives a versioned production package and returns versioned outputs plus validation metadata.

### Exit criteria

Renderers can be replaced without changing the story graph or authoring workflows.

---

## Recommended immediate sprint

Build only Phases 0 through 4.

The first milestone should be:

> From an MCP conversation, create a proposed scene or development note connected to existing story objects, review it in Constellation, and retrieve the accepted or rejected result from another client.
