# Workflow and State Model

## Common lifecycle

```text
captured
→ proposed
→ under_review
→ accepted
```

Alternative terminal or branch states:

```text
rejected
superseded
archived
```

## Allowed proposal transitions

- captured → proposed
- captured → archived
- proposed → under_review
- proposed → rejected
- proposed → superseded
- under_review → accepted
- under_review → rejected
- under_review → superseded
- accepted → superseded
- rejected → archived
- superseded → archived

Do not allow:

- rejected → accepted without creating a new revision or renewed proposal;
- archived → accepted directly;
- AI clients to bypass review unless a deliberately configured workflow permits it.

## Story workflow

```text
conversation
→ capture
→ structured proposal
→ object links
→ human review
→ accepted story state
→ optional production job
→ validation
→ artifact review
```

## Software workflow

```text
conversation
→ feature proposal
→ requirements and ADR links
→ approval
→ implementation package
→ coding agent
→ code and tests
→ implementation report
→ human review
→ merge
```

## Shared production workflow

```text
queued
→ context_assembled
→ in_progress
→ output_produced
→ validating
→ review_required
→ accepted
```

Failure and branch states:

- `blocked`
- `failed`
- `rejected`
- `superseded`
- `cancelled`

## Context-builder contract

Every builder should define:

- task type;
- authoritative objects included;
- derived summaries included;
- inclusion limits;
- ordering;
- provenance;
- context version;
- truncation behavior.

Example shape:

```json
{
  "context_type": "scene_planning",
  "context_version": "1.0",
  "project_id": "project-1",
  "primary_object": {},
  "authoritative_context": {},
  "derived_context": {},
  "constraints": [],
  "open_questions": [],
  "provenance": {},
  "generated_at": "..."
}
```

## Conflict handling

When an agent encounters a conflict between:

- an accepted decision;
- an accepted domain object;
- an approved feature specification;
- the current repository implementation;

it should stop the affected change and create a structured conflict report.

It should not silently reinterpret the accepted intent.
