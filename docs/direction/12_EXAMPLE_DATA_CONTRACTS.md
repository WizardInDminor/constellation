# Example Data Contracts

These are reference shapes, not mandatory names. Adapt them to the repository's conventions.

## Proposal DTO

```json
{
  "id": "proposal_01",
  "project_id": "project_canon",
  "proposal_type": "scene",
  "title": "Michael confronts Vincent's sincerity",
  "summary": "A proposed scene exploring Vincent's genuine belief in controlled narrative.",
  "payload": {
    "scene_objective": "Reveal Vincent's sincere doctrine without vindicating his methods.",
    "suggested_timeline_position": "after_event_17",
    "characters": ["character_michael", "character_vincent"]
  },
  "status": "proposed",
  "related_objects": [
    {
      "object_type": "character",
      "object_id": "character_michael",
      "relationship_type": "concerns"
    },
    {
      "object_type": "theme",
      "object_id": "theme_truth_vs_stability",
      "relationship_type": "expresses"
    }
  ],
  "provenance": {
    "actor_type": "ai_client",
    "client_name": "ChatGPT",
    "source_conversation_id": "optional-external-reference"
  },
  "created_at": "2026-07-14T23:00:00Z"
}
```

## Character dossier

```json
{
  "context_type": "character_dossier",
  "context_version": "1.0",
  "project_id": "project_canon",
  "character": {},
  "accepted": {
    "relationships": [],
    "scene_appearances": [],
    "arcs": [],
    "themes": [],
    "timeline_events": [],
    "decisions": []
  },
  "development": {
    "notes": [],
    "open_threads": []
  },
  "proposed": {
    "proposals": [],
    "relationships": []
  },
  "warnings": [],
  "generated_at": "..."
}
```

## Recent changes response

```json
{
  "project_id": "project_canon",
  "events": [
    {
      "id": "activity_001",
      "event_type": "proposal.created",
      "object_type": "proposal",
      "object_id": "proposal_01",
      "summary": "Scene proposal created",
      "actor": {
        "actor_type": "ai_client",
        "client_name": "ChatGPT"
      },
      "created_at": "..."
    }
  ],
  "next_cursor": "opaque-cursor"
}
```

## Implementation package

```json
{
  "feature": {},
  "requirements": [],
  "acceptance_criteria": [],
  "architecture_decisions": [],
  "repository_areas": [],
  "constraints": [],
  "non_goals": [],
  "known_conflicts": [],
  "context_version": "1.0"
}
```
