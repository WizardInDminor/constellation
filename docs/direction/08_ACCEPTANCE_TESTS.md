# Acceptance Tests

## Foundation lifecycle

### AT-001 Create proposal

Given an authenticated actor with proposal-write permission  
When the actor creates a story proposal  
Then the proposal is stored with status `proposed`  
And provenance is recorded  
And an activity event is created.

### AT-002 AI output is not canon

Given an AI client creates a scene proposal  
When the proposal is retrieved  
Then it is not returned as an accepted scene  
And proposed relationships do not appear as accepted canonical relationships.

### AT-003 Review and accept

Given a proposed scene  
When the user accepts it through the UI  
Then the accepted story object is created or updated according to the proposal type  
And the proposal is marked accepted  
And the resolution records the approving actor  
And a revision is created  
And a recent-change event is visible.

### AT-004 Reject proposal

Given a proposal  
When the user rejects it  
Then no accepted story object is changed  
And the rejected proposal remains queryable.

### AT-005 Supersede accepted decision

Given an accepted decision  
When a new approved decision supersedes it  
Then the old decision remains queryable  
And the new decision references the old decision  
And current-context builders return the new active decision.

## Context builders

### AT-010 Character dossier stability

Given a character with scenes, themes, an arc, notes, and proposals  
When the character dossier is built  
Then it returns stable object identifiers  
And accepted and proposed information are clearly separated  
And the result contains a context version.

### AT-011 Scene context neighborhood

Given a scene with timeline neighbors  
When scene context is built  
Then the preceding and following events are included according to configured limits  
And the builder does not query unrelated project data without cause.

## MCP

### AT-020 Read permission

Given a client with story-read permission  
When it calls `get_scene_context`  
Then it receives the same authoritative scene state as the internal application service.

### AT-021 Write permission denied

Given a read-only client  
When it calls `create_story_proposal`  
Then the request is denied  
And no proposal or activity event is created.

### AT-022 Provenance required

Given a write-capable client  
When it submits a proposal without required provenance fields  
Then validation fails.

### AT-023 No direct canon acceptance

Given a general AI client  
When it attempts to set proposal status to accepted  
Then the transition is denied.

### AT-024 Recent changes cross-client

Given Client A creates a proposal  
When Client B calls `get_recent_changes` using a cursor from before creation  
Then Client B receives the proposal-created event.

## UI

### AT-030 Proposal inbox

Given unresolved proposals exist  
When the user opens the proposal inbox  
Then proposals are grouped or filterable by type and status  
And title, source, related objects, and age are visible.

### AT-031 Proposal provenance

Given a proposal was created through MCP  
When the user opens it  
Then the UI shows the client name and source session or conversation reference when available.

### AT-032 Edit before accept

Given a proposal  
When the user edits it and accepts the edited version  
Then the accepted object reflects the edited version  
And both the original and edited revisions remain queryable.

## Regression protection

### AT-040 Existing story behavior

Given the existing Constellation story views  
When the foundation migration is applied  
Then current storyboard, timeline, and entity views continue to function.

### AT-041 Migration rollback

Given the new migration  
When rollback is executed in a development environment  
Then the prior schema is restored without corrupting preexisting data.
