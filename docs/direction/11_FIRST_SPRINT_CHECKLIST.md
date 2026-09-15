# First Sprint Checklist

## Reconnaissance

- [ ] Create a checkpoint branch.
- [ ] Read repository instructions.
- [ ] Map current frontend and backend.
- [ ] Locate story entities and persistence.
- [ ] Locate existing timeline, relationships, notes, and storyboard code.
- [ ] Document service/repository boundaries.
- [ ] Produce gap analysis.
- [ ] Select first object type for the vertical slice.

## Shared workflow core

- [ ] Proposal model.
- [ ] Provenance model.
- [ ] Activity event model.
- [ ] Revision support.
- [ ] Status-transition policy.
- [ ] Additive migrations.
- [ ] Domain tests.

## Application services

- [ ] Create proposal.
- [ ] Update proposal.
- [ ] Resolve proposal.
- [ ] Link proposal to existing objects.
- [ ] Get recent changes.
- [ ] Build first story context package.
- [ ] Service tests.

## API

- [ ] Proposal endpoints.
- [ ] Recent changes endpoint.
- [ ] Context endpoint.
- [ ] Validation and structured errors.
- [ ] Authorization.
- [ ] API tests.

## UI

- [ ] Proposal inbox.
- [ ] Proposal detail.
- [ ] Edit action.
- [ ] Accept action.
- [ ] Reject action.
- [ ] Supersede action.
- [ ] Related object links.
- [ ] Provenance display.
- [ ] Revision display.

## MCP

- [ ] Server bootstrap.
- [ ] Authentication.
- [ ] Read/write scopes.
- [ ] `get_server_info`.
- [ ] `search_story`.
- [ ] first context tool.
- [ ] `get_recent_changes`.
- [ ] `create_story_proposal`.
- [ ] Integration tests.

## Definition of done

- [ ] Proposal created through MCP.
- [ ] Proposal visible in UI.
- [ ] User resolves proposal.
- [ ] State and provenance persist.
- [ ] Second client retrieves the result.
- [ ] Existing application behavior remains functional.
