# MCP Tool Contract

## Design rules

1. Tools represent domain actions or useful retrieval tasks.
2. Tools call application services.
3. Tools do not expose arbitrary SQL or unrestricted file access.
4. Tools return stable identifiers.
5. Write tools require provenance.
6. Tool names should be explicit and unsurprising.
7. Read and write permissions should be separable.
8. Errors should be structured and safe.

## Version 1 read tools

### `get_server_info`

Returns:

- server name;
- version;
- supported domains;
- available capabilities;
- authenticated actor summary.

### `list_projects`

Input:

- optional project type;
- optional status.

Returns project summaries.

### `search_story`

Input:

```json
{
  "project_id": "string",
  "query": "string",
  "object_types": ["character", "scene"],
  "statuses": ["accepted", "proposed"],
  "limit": 20
}
```

Returns:

- object id;
- type;
- title;
- summary;
- status;
- relevance;
- updated timestamp.

### `get_story_project_context`

Returns:

- project summary;
- project mode;
- accepted decisions;
- active characters;
- current arcs;
- open threads;
- recent changes;
- unresolved warnings.

### `get_character_dossier`

Input:

- project id;
- character id;
- optional inclusion flags.

Returns:

- authoritative character record;
- relationships;
- scene appearances;
- arcs;
- themes;
- timeline events;
- notes;
- proposals;
- open threads;
- relevant decisions.

### `get_scene_context`

Returns:

- scene record;
- characters;
- location;
- timeline neighborhood;
- linked arcs and themes;
- setups and payoffs;
- continuity constraints;
- development notes;
- proposals.

### `get_recent_changes`

Input:

- project id;
- timestamp or cursor;
- optional object types;
- limit.

Returns activity events and a continuation cursor.

### `list_open_threads`

Returns open questions and related objects.

## Version 1 controlled write tools

### `create_development_note`

Required:

- project id;
- title;
- body;
- note type;
- related object references;
- provenance.

Default status: `development`.

### `create_story_proposal`

Required:

- project id;
- proposal type;
- title;
- summary;
- payload;
- related object references;
- provenance.

Default status: `proposed`.

### `link_proposal_to_objects`

Creates proposed relationships only.

### `update_proposal`

Updates mutable proposal fields and creates a revision.

### `record_story_decision`

Use only when permissions allow and the caller explicitly represents a user-approved decision.

The tool must not infer approval merely because a statement sounds decisive.

## Later software-development tools

- `get_project_charter`
- `get_feature_spec`
- `get_active_build_plan`
- `get_architecture_decisions`
- `get_acceptance_criteria`
- `record_implementation_result`
- `record_test_result`
- `report_design_conflict`
- `create_bug_report`

## Error model

Return structured errors:

```json
{
  "error": {
    "code": "OBJECT_NOT_FOUND",
    "message": "The requested character does not exist in this project.",
    "retryable": false,
    "details": {
      "object_type": "character"
    }
  }
}
```

Suggested codes:

- `AUTHENTICATION_REQUIRED`
- `PERMISSION_DENIED`
- `PROJECT_NOT_FOUND`
- `OBJECT_NOT_FOUND`
- `INVALID_STATUS_TRANSITION`
- `VALIDATION_FAILED`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## Permission scopes

Initial:

- `constellation.projects.read`
- `constellation.story.read`
- `constellation.proposals.write`
- `constellation.notes.write`

Later:

- `constellation.decisions.write`
- `constellation.production.execute`
- `constellation.software.read`
- `constellation.software.report`

Avoid granting direct canon-write or unrestricted admin permissions to general AI clients.
