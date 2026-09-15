# Constellation Direction Pack

This package defines the target architecture and phased build plan for Constellation as a shared creative and software-development workspace.

Constellation is not modeled as an AI writing application. It is an authoritative project system that:

- stores structured creative and product-development knowledge;
- exposes controlled tools through MCP;
- allows ChatGPT, Claude Code, Codex, local agents, and the Constellation UI to operate on the same durable state;
- separates proposals from accepted truth;
- preserves provenance, decisions, revisions, and validation results;
- supports multiple production pipelines, including prose, comics, animation, and software implementation.

## Recommended reading order

1. `01_PRODUCT_CHARTER.md`
2. `02_PHASED_BUILD_GUIDE.md`
3. `03_TARGET_ARCHITECTURE.md`
4. `04_DOMAIN_MODEL.md`
5. `05_MCP_TOOL_CONTRACT.md`
6. `06_WORKFLOW_AND_STATE_MODEL.md`
7. `07_REPOSITORY_INTEGRATION_PLAN.md`
8. `08_ACCEPTANCE_TESTS.md`
9. `09_ADR_SET.md`
10. `10_CLAUDE_CODE_MASTER_PROMPT.md`

## Governing principle

> Share lifecycle and orchestration infrastructure, but preserve domain-specific language and behavior.

A scene and a feature are not the same domain object. They can, however, share proposal, decision, revision, provenance, production, and validation infrastructure.

## Initial implementation boundary

The first release should prove one complete shared workflow:

1. Create or retrieve a story project.
2. Search story objects.
3. Retrieve a character or scene dossier.
4. Create a development note or proposal through MCP.
5. Review the proposal in the Constellation UI.
6. Accept, reject, edit, or supersede it.
7. Retrieve the resulting change through `get_recent_changes`.

Do not begin with automated animation, Codex orchestration, a generic node editor, or direct writes to accepted canon.
