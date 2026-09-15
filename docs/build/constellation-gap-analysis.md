# Constellation Gap Analysis — Current System vs. Direction Pack

**Snapshot:** 2026-09-15, commit `8d51ca5`.
**Inputs:** `docs/build/current-system-map.md` (where we are) and
`docs/direction/` (where we are going).
**Output consumed by:** `docs/build/direction-roadmap.md`.

The direction pack reframes Constellation from "personal zettelkasten" to an
**authoritative creative + software workspace** with (a) a shared
proposal-before-truth workflow core, (b) explicit story-domain context
builders, and (c) an MCP tool surface so multiple AI clients operate on the
same durable state. This document maps every direction-pack concept to what
exists today, sized as: ✅ exists, 🔶 partial/adaptable, ❌ missing.

---

## 1. Concept-by-concept map

### 1.1 Shared workflow core (direction pack Phase 1)

| Concept | Current state | Gap |
|---|---|---|
| **Project** | ✅ Project hub = structure node (`is_project_hub`) + `project_scopes` sidecar; modes `research`/`narrative`/`learning` | Mode vocabulary differs from pack's (`deep_narrative`/`standard_narrative`/`rapid_short_form`/`software`) — additive mapping, not a rebuild |
| **Proposal** | 🔶 Four ad-hoc flows (pending_ingests, bridge classify, decomposition/suggest flows, builder doc promote) — no shared model, statuses, or lifecycle | New `proposals` table + status machine (`captured→proposed→under_review→accepted/rejected/superseded/archived`) unifying the pattern the app already lives by |
| **Decision** | 🔶 Software decisions: `docs/decisions.md` ADR log (authoritative, per pack ADR-006 this *stays* in the repo). Story decisions: nothing first-class | New `decisions` table for in-project (story) decisions with supersession chain |
| **Revision** | 🔶 `production_docs` are versioned (builder); nodes/proposals are not — PATCH overwrites | New `revisions` table (object_type + object_id + snapshot), applied first to proposals |
| **Relationship** | ✅ `edges`: 32 typed verbs, directional, per-edge "why" note, resolved-state, AI rationale | Edges have no accepted/proposed status and no provenance link — see decision D2 in §3 |
| **ProvenanceRecord** | ❌ Closest thing is `classifier_rationale` on edges | New `provenance_records` table (actor_type, client_name, session/conversation refs) |
| **ActivityEvent** | 🔶 `GET /activity` derives a feed from timestamps | New append-only `activity_events` table + emission from write paths; feed and `get_recent_changes` (cursor-based) read from it |

### 1.2 Story domain (Phase 2)

The pack lists explicit objects (Character, Scene, Location, Theme, StoryArc,
TimelineEvent, WorldRule, DevelopmentNote, OpenThread). The repo already
represents **all of them** on the universal node substrate:

| Pack object | Current representation |
|---|---|
| Character / Theme / Location / WorldRule (lore) | permanent nodes + reserved `narrative:*` role tags (assembled by `timeline_repo` scene-context, NarrativeRoleList UI) |
| Scene / TimelineEvent | story-event nodes (`is_story_event`, `story_time`, `prose_status`) + `event_timeline_positions` (parallel timelines, crossover scenes) + `act_spans` |
| StoryArc | arc notes as permanent nodes with edges to events (Phase 10 handoff, Option A decided) |
| OpenThread | unresolved `CONTRADICTS`/`QUESTIONS` edges + `/canon/open-threads` view |
| DevelopmentNote | fleeting/permanent notes (no provenance yet) |
| Relationship types (appears-in, occurs-at, expresses, precedes…) | 32-verb edge vocabulary incl. the 13 Canon symbolic verbs (ADR-077) covers the semantics under different names |

**Tension:** the pack says "avoid arbitrary untyped nodes"; the repo *is* a
typed-by-flag/tag node substrate — and its integration plan explicitly permits
keeping a generic pattern **if the repo already follows it and the tradeoff is
reviewed** (`docs/direction/07_REPOSITORY_INTEGRATION_PLAN.md`). Replacing the
substrate with per-type tables would break timeline, scene context, RAG, canon
views, and the graph — i.e., trip the pack's own stop clause about breaking
existing views. → **Keep the substrate; formalize the role vocabulary.**
Decision D1 in §3.

**Context builders:** 🔶 `build_scene_context` effectively exists
(`/projects/{hub_id}/scene-context/{event_id}`, live assembly). Missing:
`build_character_dossier`, `build_story_project_context`,
`build_recent_changes_context`, and the versioned context envelope
(`context_type`/`context_version`/accepted-vs-proposed separation) from
`docs/direction/06_WORKFLOW_AND_STATE_MODEL.md`.

### 1.3 MCP surface (Phases 3–4)

❌ **Entirely greenfield.** No MCP dependency, server, transport, tools, or
config anywhere. The pack's layering (MCP adapter → application service →
repository, no SQL in tools) matches the repo's existing service/repository
discipline, so the adapter layer drops on top cleanly.

**Stop-clause check (pack master prompt):** *"authentication or project
isolation is missing in a way that would make MCP writes unsafe"* — **true
today.** There is no auth at all. Remediation is scoped in the roadmap (token
auth + read/write scopes land with the MCP server, before any write tool).

### 1.4 Production model (Phase 6)

✅ **Strong match already.** The Builder Pipeline is the pack's production
model under different names: `productions`+`production_stage_runs` ≈
ProductionJob (append-only attempts = restartability), `production_docs`
versions ≈ ArtifactVersion, `prompt_specs` frozen context ≈ "production
consumes a frozen input version", explicit promote ≈ "accepted state never
silently rewritten". `generation_jobs`/`assets` schema ≈
ProductionOutput. Missing: ValidationResult, stages B1–B4, media adapters —
all already planned in `docs/builder-pipeline-build-plan.md`. **The builder
track continues as-is; it needs no redesign to fit the pack.**

### 1.5 Rapid short-form mode (Phase 7)

🔶 Builder intake (idea → CreativeBrief) is exactly the rapid pipeline's front
half. Project modes currently lack a `rapid_short_form`-style mode; "mode sets
defaults, not gates" is the governing rule and is compatible with the pack's
"project mode changes context-builder behavior, not data integrity".

### 1.6 Software-development domain (Phase 8) & coding-agent workflow (Phase 9)

❌ Nothing in-app. Note the repo *process* already implements the spirit:
ADR-first workflow, phase docs, direction handoffs. Pack ADR-006 (repository
remains authoritative for executable software; Constellation syncs) matches
the current reality and should be kept. Deferred to late roadmap phases.

### 1.7 Cross-cutting

| Pack requirement | Current state |
|---|---|
| Structured error model (`error.code`, retryable) | ❌ FastAPI default `detail` strings; frontend parses `"${status}: ${body}"` |
| Auth + scopes | ❌ none |
| Rate limits / audit logs on MCP | ❌ (follows from no MCP) |
| Additive migrations | ✅ house style (13 forward-only migrations) |
| Migration rollback (AT-041) | ❌ forward-only by design — recorded deviation, see §4 |
| Proposal inbox / review UI | 🔶 Ingest review + bridge apply + builder promote exist as separate UIs; no unified inbox, no provenance/revision display |
| Frontend UI test net for new review surfaces | ❌ zero component tests (known Phase 10 priority) |

---

## 2. What must NOT be undone (regression floor)

Everything below is working, in daily use, and protected (or should be):

1. The graph substrate + 32-verb edge vocabulary + resolved-edge state.
2. Hybrid search, edge-aware RAG (incl. contradiction preservation), dedup.
3. Capture → process → link workflows; ingest review; discover surfaces.
4. Project workspace: scopes, drafts, sessions, coverage, learning maps.
5. Narrative timeline (parallel lanes, act spans, crossover), Story Dump,
   **live** Scene Context assembly ("order of creation is invisible" — pytest-protected).
6. Canon uncertainty metadata + `/canon` views + open threads.
7. Builder B0 (intake/interpretation, versioned docs, explicit promote).
8. Guarded principles: *mode sets defaults, not gates*; *everything lands in
   the graph*; *AI output is never canon automatically*.

The pack's own acceptance test AT-040 demands exactly this. All roadmap work
is **additive**: new tables, new services, new routes, new UI surfaces.

---

## 3. Design decisions the roadmap must settle (user approval required)

Drafted with recommendations in `direction-roadmap.md` §5; to be recorded as
ADR-083+ in `docs/decisions.md` when approved.

- **D1 — Entity representation.** Keep the node+flag+role-tag substrate as the
  story domain model (formalizing role tags as the typed vocabulary) vs.
  introducing per-type tables. *Recommendation: keep substrate.*
- **D2 — Proposed relationships.** Store AI-proposed links inside the proposal
  payload and materialize real edges only on acceptance (keeps `edges` 100%
  accepted-truth, satisfies AT-002) vs. adding a status column to `edges`.
  *Recommendation: payload-until-accept.*
- **D3 — MCP topology.** Run MCP in-process with the FastAPI app (shares the
  single DB connection, one lifecycle, tools call services directly) vs. a
  separate process. *Recommendation: in-process (streamable-HTTP mount).*
- **D4 — MCP auth.** Static per-client bearer tokens in `.env` with
  client-name → provenance binding and read/write scopes. *Recommendation: yes
  for v1; project-level authorization enforced in services.*
- **D5 — DevelopmentNote mapping.** AI-created development notes become real
  nodes with `canon_status='speculative'` + provenance + activity event
  (honors "everything lands in the graph" while keeping them out of canon) vs.
  notes-as-proposals-only. *Recommendation: node with speculative status.*
- **D6 — Proposal acceptance semantics.** On accept, the proposal service
  performs the typed materialization (create/update node, create edges) in one
  path shared with the UI — and the existing builder **promote** flow is
  eventually re-expressed as a proposal acceptance (unification deferred until
  the workflow core is stable).
- **D7 — Project modes.** Extend the mode enum additively later
  (`software`, rapid short-form) rather than renaming existing modes.

## 4. Recorded deviations from the direction pack

1. **AT-041 (migration rollback):** the repo is deliberately forward-only.
   Mitigation: additive-only migrations + the documented SQLite backup step
   before upgrade. Accepted deviation unless the user says otherwise.
2. **Explicit object tables:** see D1 — the pack's own integration plan
   sanctions the substrate given explicit review.
3. **Multi-user auth:** the pack implies client identity, not multi-tenancy.
   V1 stays single-user with per-client tokens for provenance + scoping.
4. **Suggested folder tree** (`app/workflow/`, `app/story/`…): the pack says
   "adapt names to the current repository". We keep the existing flat
   `models/ repositories/ services/ api/v1/` layout and add modules in place;
   MCP gets its own `app/mcp/` package.

## 5. Biggest risks

| Risk | Mitigation |
|---|---|
| Workflow core turns into a parallel architecture nobody uses | Unify the four existing proposal-like flows onto it *incrementally*, starting with net-new MCP writes; never block existing flows on it |
| MCP write surface without auth | Auth + scopes land in the same slice as the server, before any write tool is registered |
| Review UI ships without regression net | Frontend testing infra slice (`@testing-library/react`) precedes the proposal inbox |
| Single DB connection under a second client | In-process MCP (D3) keeps one writer; SQLite WAL already handles interleaved awaits |
| Doc drift misleads future sessions | C0 hygiene: README/CLAUDE.md refresh, build-plan historical banner, this document set |
| Builder B1 collides with workflow-core work | Different tables/modules; roadmap sequences the shared surface (project workspace UI) explicitly |
