# Direction Roadmap — From Current System to Direction-Pack Target

**Status:** approved by the user 2026-09-15 ("run with this"); Track C
Phases C0–C5 implemented the same day (see commits on PR #18 and
ADR-082…090). D1–D7 were settled in ADR-086 (D1), ADR-084 (D2), ADR-089
(D3/D4), ADR-090 (D5); D6/D7 remain deferred as planned. The ADR numbers
below were provisional; the ledger in §7 records the final assignments.
Phases C6+ remain to be planned in detail.
**Inputs:** `docs/build/current-system-map.md`, `docs/build/constellation-gap-analysis.md`, `docs/direction/` (the target).
**Governing principle** (from the pack): *share lifecycle and orchestration
infrastructure, but preserve domain-specific language and behavior.*
**House rules that bind every phase:** additive migrations only; ADR before
implementation; nothing breaks the regression floor (gap analysis §2); AI
output never becomes canon automatically; mode sets defaults, not gates.

---

## 1. Shape of the plan

Two tracks run in parallel and stay deliberately decoupled until Phase C6:

- **Track B — Builder Pipeline** (`docs/builder-pipeline-build-plan.md`,
  slices B1–B4). Already planned, already in flight. It *is* the direction
  pack's production model (gap analysis §1.4). **This roadmap does not modify
  it.** Continue B1 next as planned.
- **Track C — Collaboration core** (this document): the shared workflow core,
  story context builders, MCP surface, and review UI — the pack's Phases 0–4,
  which the pack itself names as the recommended immediate sprint.

The tracks touch different tables and modules. The one shared surface is the
project-workspace UI (B1 adds a Builder tab; C4 adds a proposal inbox) —
sequence those two frontend slices in either order, but not simultaneously.

Milestone for Track C (the pack's definition of done):

> From an MCP conversation, create a proposed scene or development note
> connected to existing story objects, review it in Constellation, and
> retrieve the accepted or rejected result from another client.

---

## 2. Phase C0 — Alignment & hygiene *(this PR + one follow-up PR)*

**Goal:** shared, accurate ground truth before any code.

Done in this PR:
- Direction pack imported verbatim → `docs/direction/`.
- `docs/build/current-system-map.md`, `constellation-gap-analysis.md`, this
  roadmap.
- ADR-082 (adoption of the direction pack + this document set) in
  `docs/decisions.md`.
- Trivial fixes: `docs/handbook/01_Architectural_Principles` → `.md`; delete
  stray `docs/testin-notes.md`; historical banner on `docs/build-plan.md`;
  `CLAUDE.md` pointer to this directory.

Follow-up hygiene PR (after roadmap approval, before C1):
- Rewrite `README.md` and refresh `CLAUDE.md` to the current reality
  (workspace, canon, builder, collaboration direction).
- Annotate the duplicate ADR-034/035 headings in `docs/decisions.md`
  (e.g. suffix `-a`/`-b`) and fix the stale ADR citation in
  `frontend/src/components/MarkdownTextarea.tsx` (034 → 073).
- Decide whether to commit the OpenAPI spec (or generated
  `src/lib/api-types.ts`) so a fresh checkout typechecks.

**Exit:** user has approved this roadmap and the D1–D7 recommendations (§5).

---

## 3. Track C phases

### Phase C1 — Shared workflow core (backend only)

**Goal:** one proposal/provenance/revision/activity model, usable internally.
Implements pack Phase 1; acceptance tests AT-001…AT-005.

| Piece | Exact location |
|---|---|
| Migration `0014_workflow_core.sql` | `backend/migrations/` — `provenance_records`, `proposals` (status CHECK per pack lifecycle, `payload` JSON, `project_hub_id` FK to nodes, `source_provenance_id`, `resolution_note`, `resolved_at`), `proposal_revisions` (snapshot per edit), `decisions` (statement/rationale/implications, `supersedes_decision_id`), `activity_events` (append-only, indexed on `(project_hub_id, id)`) |
| Models | `backend/app/models/proposal.py`, `provenance.py`, `decision.py`; extend `models/activity.py`; register in `models/__init__.py` |
| Repositories | `backend/app/repositories/proposal_repo.py`, `provenance_repo.py`, `decision_repo.py`, `activity_repo.py` |
| Services | `backend/app/services/proposal_service.py` (creation, edit-with-revision, **transition policy** exactly as `docs/direction/06_WORKFLOW_AND_STATE_MODEL.md`, typed acceptance materialization per D6), `services/activity_service.py` (emit + cursor-paged `recent_changes`) |
| Routes | `backend/app/api/v1/proposals.py` (CRUD + transition actions + revisions), `api/v1/decisions.py`; extend `api/v1/activity.py` with `GET /activity/changes?cursor=` |
| Event emission | Instrument existing write paths minimally: node create/update/delete (`api/v1/nodes.py` or `node_repo`), edge create/resolve (`edge_repo`), builder promote (`director_service`) → `activity_service.emit(...)` |
| Structured errors | `backend/app/core/errors.py` — the pack's `{error: {code, message, retryable, details}}` envelope + exception handlers in `main.py`; **new** routes use it, existing routes migrate opportunistically |
| Tests | `backend/tests/test_proposal_repo.py`, `test_proposal_service.py` (every allowed/forbidden transition; rejected→accepted forbidden; provenance required), `test_routes_proposals.py`, `test_activity_events.py`; shared story fixture per `docs/direction/07…` §Development fixtures added to `conftest.py` |
| ADRs | ADR-083 (workflow core schema), ADR-084 (proposed-links-in-payload, D2), ADR-085 (activity event emission strategy) |

**Exit:** a proposal created through the service can be linked to existing
nodes, edited (revision kept), and resolved; every step visible in
`recent_changes`. 528 existing tests still green.

### Phase C2 — Story context builders (backend only)

**Goal:** AI-ready, versioned context envelopes. Pack Phase 2; AT-010/011.

| Piece | Exact location |
|---|---|
| Service | `backend/app/services/context_builder_service.py` — `build_character_dossier` (role-tagged node + edges + scene appearances via `event_timeline_positions` + themes + notes + open threads + proposals + decisions), `build_story_project_context` (hub + scope + active decisions + role rosters + open threads + recent changes), `build_scene_context` (wrap the existing `timeline_repo` scene-context assembly in the envelope — **do not reimplement it**), `build_recent_changes_context` |
| Envelope | `backend/app/models/context.py` — `context_type`, `context_version`, `accepted` / `development` / `proposed` sections strictly separated (AT-010), warnings, `generated_at`; shapes per `docs/direction/12_EXAMPLE_DATA_CONTRACTS.md` |
| Routes | `backend/app/api/v1/context.py`: `GET /projects/{hub_id}/context`, `/context/character/{node_id}`, `/context/scene/{event_id}`, `/context/changes` |
| Role vocabulary | Formalize the reserved `narrative:*` tag names as the typed story vocabulary (constant module + docs) — this is D1 made concrete; ADR-086 |
| Tests | `test_context_builders.py` against the shared fixture; assert accepted/proposed separation and live assembly (extend the existing "order of creation is invisible" guarantee) |

**Exit:** dossier and project context stable, versioned, and identical whether
called by a route, the UI, or (later) an MCP tool.

### Phase C3 — Proposal inbox UI (frontend)

**Goal:** the human review surface, before any external client can write.
Pack Phase 4 UI half; AT-030/031/032.

- **C3.0 — testing infra first:** add `@testing-library/react` + jsdom setup
  to `frontend/` (the long-standing Phase 10 priority). New surfaces in this
  phase ship with component tests.
- `frontend/src/app/proposals/page.tsx` — inbox: filter by type/status/source,
  show title, source client, related objects, age.
- `frontend/src/app/proposals/[id]/page.tsx` — detail: payload view, related
  object links (NotePreviewPopover reuse), revision history, provenance
  display, actions **edit / accept / reject / supersede** (accept-of-edited
  keeps both revisions, AT-032).
- Nav item in `frontend/src/components/AppShell.tsx`; badge count of open
  proposals; workspace `RightPanel` gets a per-project pending-proposals line.
- `src/lib/api.ts`: proposal functions; `pnpm types` regen.
- Styling per ADR-074/075 (`globals.css` primitives), content via
  `NoteContent`.

**Exit:** a proposal created via API is reviewable end-to-end in the UI with
audit trail. This is the pack's Phase 1+4 exit criterion, pre-MCP.

### Phase C4 — MCP server, read-only

**Goal:** external AI clients read authoritative state. Pack Phase 3; AT-020.

| Piece | Exact location |
|---|---|
| Dependency | `mcp` (official Python SDK) in `backend/pyproject.toml` |
| Package | `backend/app/mcp/` — `server.py` (FastMCP, **mounted in-process** on the FastAPI app per D3, sharing lifespan + the single DB connection), `auth.py` (bearer tokens from `.env` via `pydantic-settings`, token → client_name + scopes; D4), `tools/read.py` |
| Tools v1 | `get_server_info`, `list_projects` (→ `project_repo`), `search_story` (→ `search_service.hybrid`, filtered to project scope), `get_story_project_context`, `get_character_dossier`, `get_scene_context`, `get_recent_changes`, `list_open_threads` (→ `canon_service`) — **every tool delegates to a C1/C2 service; zero SQL in `app/mcp/`** (pack ADR-003) |
| Guardrails | structured error mapping, per-token rate limit, audit line per call (client, tool, project) into `activity_events` metadata or log |
| Tests | `backend/tests/test_mcp_tools.py` — schema, service delegation (assert no repo/DB imports in tools), scope enforcement, parity with HTTP routes (AT-020) |
| ADRs | ADR-087 (MCP topology + auth, D3/D4) |

**Exit:** two different MCP clients (e.g. Claude Code + one other) retrieve
identical project state over the network with tokens.

### Phase C5 — Controlled MCP writes ★ *milestone*

**Goal:** the full collaboration loop. Pack Phase 4; AT-021…AT-024.

- `backend/app/mcp/tools/write.py`: `create_development_note` (node with
  `canon_status='speculative'` + provenance, per D5), `create_story_proposal`,
  `link_proposal_to_objects` (payload-links per D2), `update_proposal`
  (creates revision), `record_story_decision` (**scope-gated, off by
  default**; never inferred from decisive-sounding text).
- Write scope separation enforced in `auth.py`; provenance required on every
  write (AT-022); status `accepted` unreachable from MCP (AT-023).
- ADR-088 (write-tool permission model).

**Exit — Track C definition of done:** proposal created from an MCP
conversation → visible in the inbox → user resolves it → second client sees
the resolution via `get_recent_changes`. Nothing existing regressed (AT-040).

---

## 4. Later phases (outline only — plan in detail when C5 ships)

| Phase | Pack ref | Content | Notes |
|---|---|---|---|
| C6 — Workbench workflows | Phase 5 | Task-shaped builders (`build_scene_planning_context`, `build_continuity_review_context`, `build_theme_network_context`…) consumed identically by UI and MCP | Continuity review is scoped Ask over lore — already half-exists |
| C7 — Production unification | Phase 6 | Re-express builder **promote** as proposal acceptance; add `ValidationResult`; expose builder status via MCP read tools | Only after B2+ lands; D6 |
| C8 — Rapid short-form mode | Phase 7 | New project mode; builder intake as the rapid front-end; templates/defaults | Mode = defaults, never gates |
| C9 — Software domain | Phase 8 | Feature/Requirement/ImplementationTask objects on the workflow core; `get_feature_spec`, `record_implementation_result`… MCP tools; ADR sync repo⇄DB per pack ADR-006 | Constellation starts managing its own development |
| C10 — Agent production workflows | Phases 9–10 | Coding-agent packages, media adapters as builder workers, validation loop | Builder B3/B4 provide the adapter substrate |

Phase-10-handoff items (character sheet UI, learning checks, lore library,
claim-node primitive, session-history timeline) are **not displaced** — they
remain the workspace track and slot in alongside Track C as capacity allows;
the claim-node/theme primitive should be designed against the C1 workflow
core so stances and proposals compose.

---

## 5. Decision points needing user sign-off (D1–D7)

Full context in gap analysis §3. Recommendations: **D1** keep node+role-tag
substrate (ADR-086); **D2** proposed links live in proposal payload,
materialize on accept (ADR-084); **D3** MCP in-process with FastAPI (ADR-087);
**D4** static per-client bearer tokens + read/write scopes (ADR-087); **D5**
dev notes = speculative nodes with provenance (ADR-088-adjacent); **D6**
builder promote unifies with proposal acceptance *later* (C7); **D7** extend
mode enum additively, never rename. Also: accept the AT-041 forward-only
deviation (gap analysis §4.1).

Approve, amend, or reject each — C1 starts once D1/D2 are settled (D3–D5 can
wait until C4).

---

## 6. Sequencing at a glance

```text
C0 alignment (this PR + hygiene PR)
   │
   ├─ Track B: B1 director+script (+ Builder tab UI) ── B2 ── B3 ── B4
   │
   └─ Track C: C1 workflow core ─ C2 context builders ─ C3 inbox UI ─ C4 MCP read ─ C5 MCP write ★
                                                        ▲
                                    (C3.0 frontend test infra — first UI slice either track touches)
```

- Backend phases C1/C2 can interleave freely with B1 (disjoint modules).
- Coordinate C3 with B1's Builder tab (same workspace UI, one at a time).
- Each phase = 1–2 PRs, ADRs written before code, tests in the same PR,
  `docs/architecture.md` + this map updated at phase end (house rule).

## 7. Numbering ledger

- Migration `0014_workflow_core.sql` — landed (C1). Next migration: `0015`.
- ADRs as landed: 082 (adoption), 083 (committed api-types), 084 (workflow
  core, D2), 085 (activity log), 086 (node substrate, D1), 087 (context
  envelopes), 088 (frontend component testing), 089 (MCP topology + auth,
  D3/D4), 090 (MCP write tools, D5). Next ADR: **091**.
- Acceptance tests AT-xxx refer to `docs/direction/08_ACCEPTANCE_TESTS.md`.
- Phase status: C0 ✅ · C1 ✅ · C2 ✅ · C3 ✅ · C4 ✅ · C5 ✅ (milestone) ·
  C6+ pending detailed planning. Known carried limitations: corpus-wide
  search/open-threads scoping (→ C6), builder promote unification (→ C7,
  D6), Phase 9 UI surfaces still lack component tests (backfill).
