# Constellation Product Charter

## Product purpose

Constellation is a durable creative and project-development environment that sits between human intent and specialized production tools.

It provides two complementary interaction surfaces:

- a human-facing visual application for understanding, editing, reviewing, and organizing structured project state;
- an AI-facing MCP tool surface for searching, retrieving, proposing, connecting, validating, and reporting against that same state.

Constellation is the source of truth. AI clients are collaborators operating through explicit permissions and workflows.

## Primary use cases

### Long-form narrative development

Examples:

- Canon trilogy development;
- characters, themes, arcs, scenes, world rules, symbols, chronology, and continuity;
- preservation of author decisions and rejected directions;
- scene planning, prose development, and revision support.

### Rapid short-form creation

Examples:

- comedy sketches;
- five-minute cartoons;
- comic strips;
- illustrated stories;
- one-off speculative concepts.

These projects use a lighter schema and faster proposal-to-production flow without requiring deep thematic analysis.

### Visual production

Examples:

- storyboard generation;
- comic panel generation;
- animatics;
- character and location asset generation;
- voice, music, sound, and final video assembly.

### Software development

Examples:

- feature proposals;
- requirements;
- architecture decisions;
- implementation tasks;
- Codex or Claude Code build packages;
- test and validation reporting;
- linkage between design intent and repository implementation.

## Product principles

1. **Authoritative structured state**
   - Accepted project truth lives in Constellation.
   - Chat histories and agent sessions are sources, not the final system of record.

2. **Proposal before truth**
   - AI-created material defaults to proposed or developmental status.
   - Accepted canon and approved product requirements require explicit review.

3. **Domain-specific objects**
   - Characters, scenes, themes, features, ADRs, and tests remain explicit types.
   - Avoid reducing the product to arbitrary untyped nodes and metadata.

4. **Shared workflow core**
   - Proposals, decisions, revisions, relationships, tasks, provenance, production jobs, and validation are reusable across domains.

5. **Replaceable producers**
   - Rendering and implementation systems are adapters.
   - The story graph and product graph remain valuable if models or vendors change.

6. **Traceability**
   - Every material change records who created it, where it came from, and what it superseded.

7. **Human authority**
   - AI may suggest, assemble, implement, and validate.
   - The user remains the author, architect, and final approval authority.

## Non-goals for the first release

- fully autonomous book generation;
- one-click finished animation;
- a universal workflow engine for every industry;
- automatic promotion of AI output into canon;
- direct arbitrary SQL access;
- replacing repository documentation with database-only records;
- live synchronization of opaque memory between AI products.

## Success criteria for the foundation release

The foundation is successful when:

- ChatGPT or another MCP client can search Constellation;
- the client can retrieve structured story context;
- the client can create a proposal or development note;
- the proposal appears in the UI;
- the user can review and resolve it;
- provenance and revision history are preserved;
- a second client can retrieve the updated state without manual transcription.
