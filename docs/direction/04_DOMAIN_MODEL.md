# Domain Model

## Shared workflow core

### Project

Represents an isolated workspace.

Fields:

- `id`
- `name`
- `slug`
- `project_type`
- `project_mode`
- `status`
- `created_at`
- `updated_at`

Suggested project modes:

- `deep_narrative`
- `standard_narrative`
- `rapid_short_form`
- `software`

### Proposal

Represents a suggested change or new object awaiting resolution.

Fields:

- `id`
- `project_id`
- `proposal_type`
- `title`
- `summary`
- `payload`
- `status`
- `created_by_actor_id`
- `source_provenance_id`
- `created_at`
- `updated_at`
- `resolved_at`
- `resolution_note`

Statuses:

- `captured`
- `proposed`
- `under_review`
- `accepted`
- `rejected`
- `superseded`
- `archived`

### Decision

Represents an explicit accepted choice.

Fields:

- `id`
- `project_id`
- `decision_type`
- `statement`
- `rationale`
- `implications`
- `status`
- `supersedes_decision_id`
- `provenance_id`
- timestamps

### Revision

Represents a durable version of mutable content.

Fields:

- `id`
- `object_type`
- `object_id`
- `revision_number`
- `snapshot`
- `change_summary`
- `created_by_actor_id`
- `provenance_id`
- `created_at`

### Relationship

Use explicit typed relationships, not arbitrary labels.

Fields:

- `id`
- `project_id`
- `source_type`
- `source_id`
- `relationship_type`
- `target_type`
- `target_id`
- `status`
- `metadata`
- provenance and timestamps

### ProvenanceRecord

Fields:

- `id`
- `actor_type`
- `actor_id`
- `client_type`
- `client_name`
- `source_session_id`
- `source_conversation_id`
- `source_message_reference`
- `request_id`
- `created_at`

Actor types:

- `human`
- `ai_client`
- `system`
- `import`

### ActivityEvent

Records meaningful project changes.

Fields:

- `id`
- `project_id`
- `event_type`
- `object_type`
- `object_id`
- `summary`
- `metadata`
- `provenance_id`
- `created_at`

## Story domain

### Character

Minimum fields:

- identity and aliases;
- role;
- summary;
- goals;
- beliefs;
- fears;
- contradictions;
- arc summary;
- status.

### Scene

Minimum fields:

- title;
- summary;
- status;
- timeline position;
- location;
- POV;
- characters present;
- objective;
- entry state;
- exit state;
- plot function;
- estimated duration;
- draft text or artifact references.

### Theme

Minimum fields:

- name;
- statement;
- description;
- status;
- caution or misuse notes.

### StoryArc

Minimum fields:

- name;
- arc type;
- subject object;
- beginning state;
- desired end state;
- status.

### TimelineEvent

Minimum fields:

- title;
- summary;
- absolute or relative placement;
- certainty;
- status.

### WorldRule

Minimum fields:

- statement;
- explanation;
- scope;
- exceptions;
- certainty;
- status.

### OpenThread

Minimum fields:

- title;
- question;
- status;
- priority;
- target resolution point;
- related objects.

### DevelopmentNote

Minimum fields:

- title;
- body;
- note type;
- status;
- related objects;
- provenance.

### Optional later story objects

- Symbol
- Organization
- Chapter
- Setup
- Payoff
- DialogueFragment
- StoryBeat
- Prop
- AssetSpecification

## Software-development domain

### Feature

- title;
- objective;
- status;
- scope;
- non-goals;
- related requirements;
- acceptance criteria.

### Requirement

- statement;
- type;
- priority;
- status;
- source;
- verification method.

### ArchitectureDecision

- title;
- context;
- decision;
- alternatives;
- consequences;
- status;
- repository document path.

### ImplementationTask

- title;
- scope;
- status;
- assigned agent;
- repository areas;
- dependencies.

### TestCase

- title;
- preconditions;
- steps;
- expected result;
- automation status;
- related requirement.

### ImplementationReport

- summary;
- files changed;
- tests run;
- results;
- limitations;
- conflicts;
- commit or branch reference.

## Production domain

### ProductionJob

- source object and source revision;
- production type;
- builder;
- status;
- context package;
- acceptance criteria;
- timestamps.

### ProductionOutput

- job id;
- artifact type;
- storage reference;
- version;
- metadata;
- created at.

### ValidationResult

- job or implementation target;
- validator;
- check type;
- status;
- details;
- evidence reference.

## Domain invariants

1. AI-created story material cannot default to accepted canon.
2. Accepted decisions must preserve provenance.
3. Superseded records remain queryable.
4. Production jobs consume a fixed input revision.
5. Relationships to proposed objects must not appear as accepted canonical links.
6. Deleting historical decisions, proposals, or revisions should be strongly restricted.
7. Derived context packages are never the sole source of truth.
