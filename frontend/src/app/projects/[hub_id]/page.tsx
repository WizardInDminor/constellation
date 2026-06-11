"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  attachNodeToSession,
  createFleetingNode,
  getDraft,
  getProject,
  listSessions,
  patchSession,
  putDraft,
  startSession,
} from "@/lib/api";
import type {
  Draft,
  ProjectDetail,
  ProjectMode,
  ProjectScope,
  RagResponse,
  WorkSession,
} from "@/lib/api";
import { AskBar } from "./AskBar";
import { SessionDialog } from "./SessionDialog";
import { SessionCloseDialog } from "./SessionCloseDialog";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { ResumeBriefing } from "./ResumeBriefing";
import { LearningMapPanel } from "./LearningMapPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ThreadsPanel } from "./ThreadsPanel";
import { StoryDumpPanel } from "./StoryDumpPanel";
import { NarrativeRoleList } from "./NarrativeRoleList";
import { NoteContent } from "@/components/NoteContent";
import { NARRATIVE_TAGS } from "@/lib/api";

const MODE_ACCENT: Record<ProjectMode, { dot: string; chip: string }> = {
  research: {
    dot: "bg-blue-500",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
  },
  narrative: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
  },
  learning: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

type CenterTab =
  | "write"
  | "notes"
  | "synthesize"
  | "timeline"
  | "threads"
  | "learning-map"
  | "story-dump"
  | "characters"
  | "world-lore"
  | "locations"
  | "themes"
  | "symbols"
  | "factions"
  | "open-questions";

const DEFAULT_TAB: Record<ProjectMode, CenterTab> = {
  research: "write",
  narrative: "timeline",
  learning: "learning-map",
};

// Tab list is the same in every mode (mode sets defaults, not gates —
// build-plan philosophy). `DEFAULT_TAB` decides which one opens first.
// A research-mode project can still open the Timeline or Learning map tab;
// a narrative-mode project can still open Write or Synthesize.
const ALL_TABS: { id: CenterTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "notes", label: "Notes" },
  { id: "synthesize", label: "Synthesize" },
  { id: "timeline", label: "Timeline" },
  { id: "threads", label: "Threads" },
  { id: "learning-map", label: "Learning map" },
  { id: "story-dump", label: "Story Dump" },
  { id: "characters", label: "Characters" },
  { id: "world-lore", label: "World / Lore" },
  { id: "locations", label: "Locations" },
  { id: "themes", label: "Themes" },
  { id: "symbols", label: "Symbols" },
  { id: "factions", label: "Factions" },
  { id: "open-questions", label: "Open questions" },
];

const DRAFT_DEBOUNCE_MS = 2000;
const IMPLICIT_SESSION_PROMPT_MS = 15 * 60 * 1000; // 15 minutes

export default function WorkspacePage() {
  const params = useParams<{ hub_id: string }>();
  const hubId = params.hub_id;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<CenterTab>("write");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionCloseOpen, setSessionCloseOpen] = useState(false);
  const [askResponse, setAskResponse] = useState<{
    response: RagResponse;
    outOfScopeIds: Set<string>;
  } | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  // 15-minute implicit-session prompt state — not persisted.
  const firstActivityRef = useRef<Date | null>(null);
  const [implicitPromptDismissed, setImplicitPromptDismissed] = useState(false);
  const [showImplicitPrompt, setShowImplicitPrompt] = useState(false);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hubId) return;
    Promise.all([getProject(hubId), listSessions(hubId)])
      .then(([p, s]) => {
        setProject(p);
        setSessions(s);
        setTab(DEFAULT_TAB[p.scope.mode]);
        if (!p.active_session) {
          firstActivityRef.current = new Date();
        }
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, [hubId]);

  // ── Responsive ─────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setLeftOpen(false);
        setRightOpen(false);
      } else {
        setLeftOpen(true);
        setRightOpen(true);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── 15-minute implicit-session prompt ──────────────────────────────────
  useEffect(() => {
    if (!project || project.active_session || implicitPromptDismissed) return;
    const start = firstActivityRef.current?.getTime() ?? Date.now();
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, IMPLICIT_SESSION_PROMPT_MS - elapsed);
    const timer = setTimeout(() => setShowImplicitPrompt(true), remaining);
    return () => clearTimeout(timer);
  }, [project, implicitPromptDismissed]);

  const refresh = useCallback(async () => {
    if (!hubId) return;
    try {
      const [p, s] = await Promise.all([
        getProject(hubId),
        listSessions(hubId),
      ]);
      setProject(p);
      setSessions(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    }
  }, [hubId]);

  const handleScopeChanged = useCallback(
    (next: ProjectScope) => {
      if (!project) return;
      setProject({ ...project, scope: next });
    },
    [project],
  );

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <div className="alert-error">{error}</div>
        <Link
          href="/projects"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-6 space-y-3" aria-busy="true">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-full max-w-md" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const mode = project.scope.mode;
  const accent = MODE_ACCENT[mode];
  const activeSession = project.active_session ?? null;
  const tabs = ALL_TABS;

  async function handleImplicitConfirm() {
    if (!hubId || !firstActivityRef.current) return;
    // Backdate the session's started_at; the API doesn't currently expose
    // started_at as an input, so we create with current intent placeholder
    // and the user can refine via the regular dialog. For Slice 2 we open
    // the SessionDialog with the field pre-filled.
    setShowImplicitPrompt(false);
    setSessionDialogOpen(true);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] bg-gray-50">
      {/* Topbar */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Link
          href="/projects"
          className="btn btn-ghost btn-sm shrink-0"
          aria-label="Back to projects"
          title="Back to projects"
        >
          ←
        </Link>
        <h1 className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
          {project.hub.title}
        </h1>
        <span
          className={`badge shrink-0 border uppercase tracking-wide ${accent.chip}`}
        >
          {mode}
        </span>
        {activeSession ? (
          <button
            onClick={() => setSessionCloseOpen(true)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${accent.chip}`}
            title="Click to end session"
            aria-label={`End session: ${activeSession.intent}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
            <span className="truncate max-w-[260px]">
              {activeSession.intent}
            </span>
            <span className="text-gray-400" aria-hidden="true">
              ·
            </span>
            <span className="text-gray-500">end</span>
          </button>
        ) : (
          <button
            onClick={() => setSessionDialogOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            Start session
          </button>
        )}
      </div>

      {/* Ask bar */}
      <AskBar
        primaryTagId={project.scope.primary_tag_id ?? null}
        onResult={(payload) => {
          setAskResponse(payload);
          setAskError(null);
        }}
        onError={(e) => {
          setAskError(e);
          setAskResponse(null);
        }}
        onClear={() => {
          setAskResponse(null);
          setAskError(null);
        }}
      />

      {(askResponse || askError) && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 max-h-[40vh] overflow-y-auto scrollbar-thin flex-shrink-0">
          {askError && <div className="alert-error">{askError}</div>}
          {askResponse && (
            <AskResultPanel
              response={askResponse.response}
              outOfScopeIds={askResponse.outOfScopeIds}
              onDismiss={() => setAskResponse(null)}
            />
          )}
        </div>
      )}

      {/* Three-panel body */}
      <div
        className="flex-1 grid gap-0 min-h-0 overflow-hidden transition-[grid-template-columns] duration-200"
        style={{
          gridTemplateColumns: isMobile
            ? "1fr"
            : `${leftOpen ? "260px" : "44px"} 1fr ${rightOpen ? "280px" : "44px"}`,
        }}
      >
        {!isMobile && (
          <aside className="border-r border-gray-200 bg-white overflow-y-auto overflow-x-hidden scrollbar-thin relative">
            <PanelCollapseButton
              open={leftOpen}
              side="left"
              onClick={() => setLeftOpen((o) => !o)}
            />
            {leftOpen ? (
              <LeftPanel
                project={project}
                onScopeChanged={handleScopeChanged}
              />
            ) : null}
          </aside>
        )}

        <section className="bg-white overflow-y-auto scrollbar-thin min-w-0 min-h-0">
          <div
            role="tablist"
            className="border-b border-gray-200 px-4 flex items-center gap-1 overflow-x-auto scrollbar-thin sticky top-0 bg-white z-10"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap px-3 py-2 text-xs transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-indigo-500 text-indigo-700 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === "write" && (
              <WriteTab hubId={hubId} activeSession={activeSession} />
            )}
            {tab === "notes" && (
              <NotesTabPlaceholder pinnedIds={project.scope.pinned_node_ids} />
            )}
            {tab === "synthesize" && (
              <SynthesizeTab
                scope={project.scope}
                activeSession={activeSession}
                onScopeChanged={handleScopeChanged}
              />
            )}
            {tab === "timeline" && <TimelinePanel scope={project.scope} />}
            {tab === "threads" && <ThreadsPanel scope={project.scope} />}
            {tab === "learning-map" && (
              <LearningMapPanel scope={project.scope} />
            )}
            {tab === "story-dump" && <StoryDumpPanel scope={project.scope} />}
            {tab === "characters" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.CHARACTER}
                roleLabel="Character"
                roleLabelPlural="Characters"
                nodeKind="structure"
              />
            )}
            {tab === "world-lore" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.LORE_WORLD_RULE}
                roleLabel="Lore note"
                roleLabelPlural="World / Lore"
                nodeKind="permanent"
                categoryTags={[
                  {
                    value: NARRATIVE_TAGS.LORE_WORLD_RULE,
                    label: "World rule",
                  },
                  { value: NARRATIVE_TAGS.LORE_HISTORY, label: "History" },
                  { value: NARRATIVE_TAGS.LORE_POWER, label: "Power" },
                  { value: NARRATIVE_TAGS.LORE_FABRIC, label: "Fabric" },
                  {
                    value: NARRATIVE_TAGS.LORE_BACKSTORY,
                    label: "Backstory",
                  },
                  { value: NARRATIVE_TAGS.LORE_SECRET, label: "Secret" },
                  { value: NARRATIVE_TAGS.LORE_ABILITY, label: "Ability" },
                  {
                    value: NARRATIVE_TAGS.LORE_ARTIFACT,
                    label: "Artifact / Text",
                  },
                ]}
              />
            )}
            {tab === "locations" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.LOCATION}
                roleLabel="Location"
                roleLabelPlural="Locations"
                nodeKind="structure"
              />
            )}
            {tab === "themes" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.THEME}
                roleLabel="Theme"
                roleLabelPlural="Themes"
                nodeKind="structure"
              />
            )}
            {tab === "symbols" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.SYMBOL}
                roleLabel="Symbol"
                roleLabelPlural="Symbols"
                nodeKind="structure"
              />
            )}
            {tab === "factions" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.FACTION}
                roleLabel="Faction"
                roleLabelPlural="Factions"
                nodeKind="structure"
              />
            )}
            {tab === "open-questions" && (
              <NarrativeRoleList
                tagName={NARRATIVE_TAGS.OPEN_QUESTION}
                roleLabel="Open question"
                roleLabelPlural="Open questions"
                nodeKind="permanent"
              />
            )}
          </div>
        </section>

        {!isMobile && (
          <aside className="border-l border-gray-200 bg-white overflow-y-auto overflow-x-hidden relative">
            <PanelCollapseButton
              open={rightOpen}
              side="right"
              onClick={() => setRightOpen((o) => !o)}
            />
            {rightOpen ? (
              <RightPanel
                scope={project.scope}
                sessions={sessions}
                pinnedIds={project.scope.pinned_node_ids}
                tagIds={project.scope.tag_ids}
              />
            ) : null}
          </aside>
        )}
      </div>

      {sessionDialogOpen && (
        <SessionDialog
          projectMode={mode}
          onClose={() => setSessionDialogOpen(false)}
          onConfirm={async (data) => {
            await startSession(hubId, data);
            await refresh();
            setSessionDialogOpen(false);
            setImplicitPromptDismissed(true);
          }}
        />
      )}

      {sessionCloseOpen && activeSession && (
        <SessionCloseDialog
          hubId={hubId}
          session={activeSession}
          onClose={() => setSessionCloseOpen(false)}
          onClosed={async () => {
            await refresh();
            setSessionCloseOpen(false);
            firstActivityRef.current = new Date();
          }}
        />
      )}

      {showImplicitPrompt && !activeSession && (
        <ImplicitSessionToast
          onConfirm={handleImplicitConfirm}
          onDismiss={() => {
            setShowImplicitPrompt(false);
            setImplicitPromptDismissed(true);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Write tab — free-writing pad with debounced autosave + session attribution
// ---------------------------------------------------------------------------

function WriteTab({
  hubId,
  activeSession,
}: {
  hubId: string;
  activeSession: WorkSession | null;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotionState, setPromotionState] = useState<{
    title: string;
    pending: boolean;
  } | null>(null);
  const initial = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getDraft(hubId)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setContent(d.content);
        initial.current = true;
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load draft");
      });
    return () => {
      cancelled = true;
    };
  }, [hubId]);

  useEffect(() => {
    if (!initial.current || draft === null) return;
    if (content === draft.content) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await putDraft(hubId, content);
        setDraft(saved);
        setSavedAt(new Date());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, draft, hubId]);

  async function handlePromoteSelection() {
    const textarea = document.querySelector<HTMLTextAreaElement>("#draft-pad");
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end).trim() || content.trim();
    if (!selected) return;

    const firstLine = selected.split("\n")[0].slice(0, 80);
    setPromotionState({ title: firstLine, pending: true });
    try {
      const node = await createFleetingNode(firstLine, selected);
      // Attach to active session for the wrap counts + session-fleetings flag
      if (activeSession) {
        await attachNodeToSession(hubId, activeSession.id, node.id, true);
      }
      // Optimistically remove the promoted text from the draft if a selection
      // existed; if no selection, clear the whole pad.
      const remainder =
        start === end ? "" : content.slice(0, start) + content.slice(end);
      setContent(remainder);
      // Force-write so autosave doesn't beat us
      await putDraft(hubId, remainder);
      setDraft({
        project_id: hubId,
        content: remainder,
        updated_at: new Date().toISOString(),
      });
      setPromotionState(null);
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promotion failed");
      setPromotionState(null);
    }
  }

  // Mermaid live preview (Slice 3) — show when the pad contains a fence;
  // collapsible so it doesn't crowd writing when not needed.
  const hasMermaidFence = /```mermaid\b/.test(content);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>
          Free-writing pad — autosaves to draft, not the graph.
          {activeSession && " Captures credit the active session."}
        </span>
        <span>
          {saving ? (
            "Saving…"
          ) : error ? (
            <span className="text-red-500">{error}</span>
          ) : savedAt ? (
            `Saved ${savedAt.toLocaleTimeString()}`
          ) : draft ? (
            "Synced"
          ) : (
            ""
          )}
        </span>
      </div>
      <div
        className={`grid gap-3 ${hasMermaidFence ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        <textarea
          id="draft-pad"
          aria-label="Free-writing pad"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          placeholder="Start writing… nothing here is committed to the graph until you promote it."
          className="textarea font-mono"
        />
        {hasMermaidFence && <DraftMermaidPreview content={content} />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          Select text and click → promotes to a fleeting note (auto-attaches to
          the active session). If nothing is selected, the whole pad is
          promoted.
        </p>
        <button
          onClick={handlePromoteSelection}
          disabled={promotionState?.pending}
          className="btn btn-primary btn-sm shrink-0"
        >
          {promotionState?.pending ? "Promoting…" : "Promote selection"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free-writing pad — mermaid live preview (debounced, collapsible)
// ---------------------------------------------------------------------------

function DraftMermaidPreview({ content }: { content: string }) {
  const [debounced, setDebounced] = useState(content);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(content), 800);
    return () => clearTimeout(t);
  }, [content]);

  if (collapsed) {
    return (
      <div className="flex items-start justify-end">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[11px] text-indigo-600 hover:text-indigo-700"
        >
          Show Mermaid preview ▾
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">
          Mermaid preview
        </p>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[11px] text-gray-400 hover:text-gray-600"
        >
          hide
        </button>
      </div>
      <div className="prose prose-sm max-w-none">
        <NoteContent content={debounced} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes & Synthesize tabs
// ---------------------------------------------------------------------------

function NotesTabPlaceholder({ pinnedIds }: { pinnedIds: string[] }) {
  return (
    <div className="text-xs text-gray-500 space-y-2">
      <p>
        Project-scoped Notes view lands when the Notes filter UI gains a project
        filter. For now: this tab will list the {pinnedIds.length} pinned note
        {pinnedIds.length === 1 ? "" : "s"} plus everything carrying a project
        tag.
      </p>
      <Link href="/notes" className="text-indigo-600 hover:underline">
        Open Notes view →
      </Link>
    </div>
  );
}

function SynthesizeTab({
  scope,
  activeSession,
  onScopeChanged,
}: {
  scope: ProjectScope;
  activeSession: WorkSession | null;
  onScopeChanged: (next: ProjectScope) => void;
}) {
  return (
    <ResumeBriefing
      scope={scope}
      activeSession={activeSession}
      onScopeChanged={onScopeChanged}
    />
  );
}

// ---------------------------------------------------------------------------
// Ask result panel + collapse button + implicit-session toast
// ---------------------------------------------------------------------------

function AskResultPanel({
  response,
  outOfScopeIds,
  onDismiss,
}: {
  response: RagResponse;
  outOfScopeIds: Set<string>;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="section-label">Answer</p>
        <button onClick={onDismiss} className="btn btn-ghost btn-sm">
          Dismiss
        </button>
      </div>
      <div className="prose prose-sm max-w-none text-sm">
        <NoteContent content={response.answer} />
      </div>
      {response.provenance.length > 0 && (
        <div className="text-xs">
          <p className="section-label mb-1.5">
            Sources ({response.provenance.length})
          </p>
          <ul className="space-y-0.5">
            {response.provenance.map((p) => {
              const out = outOfScopeIds.has(p.node_id);
              return (
                <li key={p.node_id} className="flex items-center gap-2">
                  <Link
                    href={`/nodes/${p.node_id}`}
                    className="text-indigo-600 hover:underline truncate"
                  >
                    {p.title}
                  </Link>
                  {out && (
                    <span className="badge shrink-0 bg-amber-100 text-amber-800">
                      out of scope
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function PanelCollapseButton({
  open,
  side,
  onClick,
}: {
  open: boolean;
  side: "left" | "right";
  onClick: () => void;
}) {
  const arrow = open
    ? side === "left"
      ? "‹"
      : "›"
    : side === "left"
      ? "›"
      : "‹";
  return (
    <button
      onClick={onClick}
      className={`absolute top-1 ${side === "left" ? "right-1" : "left-1"} text-gray-300 hover:text-gray-600 text-xs px-1 z-10`}
      aria-label={open ? "Collapse panel" : "Expand panel"}
    >
      {arrow}
    </button>
  );
}

function ImplicitSessionToast({
  onConfirm,
  onDismiss,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="card fixed bottom-4 right-4 z-40 max-w-sm border-indigo-200 px-4 py-3 shadow-lg">
      <p className="text-sm text-gray-800 mb-2">
        You've been working for 15 minutes — log this as a session?
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onDismiss} className="btn btn-ghost btn-sm">
          Not now
        </button>
        <button onClick={onConfirm} className="btn btn-primary btn-sm">
          Start session
        </button>
      </div>
    </div>
  );
}
