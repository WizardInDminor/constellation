# Initial Architecture Decision Records

These should be split into individual ADR files if the repository already follows an ADR convention.

---

## ADR-001: Use a shared workflow core with explicit domains

### Status

Accepted direction.

### Context

Story development and software development share proposal, decision, revision, provenance, production, and validation mechanics. Their domain objects and semantics remain different.

### Decision

Implement reusable workflow infrastructure while preserving explicit story and software object types.

### Consequences

Positive:

- less duplicated lifecycle code;
- consistent audit and review behavior;
- easier multi-agent orchestration.

Negative:

- requires careful boundaries;
- shared abstractions can become too generic if not controlled.

---

## ADR-002: AI-created story content defaults to proposal or development status

### Status

Accepted direction.

### Context

Creative discussions contain possibilities, interpretations, rejected directions, and actual decisions. Treating all generated content as canon destroys trust.

### Decision

General AI clients cannot write directly into accepted canon. They create proposals, notes, or other reviewable objects.

### Consequences

- stronger authorial control;
- visible review queue;
- additional workflow steps;
- cleaner provenance.

---

## ADR-003: MCP adapters call application services

### Status

Accepted direction.

### Context

Direct database tools would duplicate business rules and expose unsafe capabilities.

### Decision

MCP tools validate, authorize, and delegate to application services or context builders. They do not execute arbitrary SQL or own domain logic.

### Consequences

- one authoritative behavior path;
- easier testing;
- safer permissions;
- some additional adapter code.

---

## ADR-004: Context builders own AI-facing data shapes

### Status

Accepted direction.

### Context

Different tasks require different context. Letting each client independently gather records leads to inconsistent behavior and excessive data access.

### Decision

Implement task-specific context builders in the application layer. MCP and UI workflows consume the same builders.

### Consequences

- predictable context;
- stronger data governance;
- easier prompt and workflow testing;
- builders require versioning and maintenance.

---

## ADR-005: Separate authoring state from production outputs

### Status

Accepted direction.

### Context

Stories may produce prose, comics, animation, audio, or software artifacts. Generated outputs should not silently alter their source structure.

### Decision

Production jobs consume fixed source revisions and create versioned outputs.

### Consequences

- reproducibility;
- replaceable renderers;
- clear regeneration behavior;
- additional storage and version management.

---

## ADR-006: Repository remains authoritative for executable software

### Status

Accepted direction.

### Context

Constellation may coordinate product design and implementation, but software behavior ultimately exists in code, migrations, tests, and version control.

### Decision

Accepted implementation-critical decisions are synchronized into repository documentation. Coding agents operate against repository state and report results back to Constellation.

### Consequences

- avoids database-only architectural knowledge;
- supports normal review and CI;
- introduces synchronization responsibilities.

---

## ADR-007: Begin with one complete vertical slice

### Status

Accepted direction.

### Decision

The first implementation will prove search, context retrieval, proposal creation, UI review, resolution, provenance, and recent-change retrieval for one story object type.

### Consequences

- faster validation;
- controlled scope;
- delays broad schema coverage;
- establishes patterns before expansion.
