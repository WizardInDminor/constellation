"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getActivity,
  getDraft,
  getNode,
  getProject,
  listSessions,
  patchSession,
  putDraft,
  startSession,
} from "@/lib/api";
import type {
  ActivityFeed,
  Draft,
  NodeRef,
  ProjectDetail,
  ProjectMode,
  RagResponse,
  WorkSession,
} from "@/lib/api";
import { AskBar } from "./AskBar";
import { SessionDialog } from "./SessionDialog";

const MODE_ACCENT: Record<ProjectMode, { dot: string; chip: string; text: string }> = {
  research: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 border-blue-200", text: "text-blue-700" },
  narrative: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-700" },
  learning: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700" },
};

// Mode → which center-panel tab opens first. "Mode sets defaults, not gates" —
// all three tabs are accessible from every mode.
const DEFAULT_TAB: Record<ProjectMode, CenterTab> = {
  research: "write",
  narrative: "write",
  learning: "notes",
};

type CenterTab = "write" | "notes" | "synthesize";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "notes", label: "Notes" },
  { id: "synthesize", label: "Synthesize" },
];

const DRAFT_DEBOUNCE_MS = 2000;

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
  const [askResponse, setAskResponse] = useState<{
    response: RagResponse;
    outOfScopeIds: Set<string>;
  } | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hubId) return;
    Promise.all([getProject(hubId), listSessions(hubId)])
      .then(([p, s]) => {
        setProject(p);
        setSessions(s);
        setTab(DEFAULT_TAB[p.scope.mode]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [hubId]);

  // ── Responsive: collapse side panels by default on mobile ──────────────
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

  const refreshSessions = useCallback(async () => {
    if (!hubId) return;
    try {
      setSessions(await listSessions(hubId));
      const p = await getProject(hubId);
      setProject(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    }
  }, [hubId]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/projects" className="text-sm text-indigo-600 hover:underline mt-2 block">
          ← Back to projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-sm text-gray-400">Loading workspace…</div>;
  }

  const mode = project.scope.mode;
  const accent = MODE_ACCENT[mode];
  const activeSession = project.active_session;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] bg-gray-50">
      {/* Topbar: project title + mode + session pill */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Link
          href="/projects"
          className="text-xs text-gray-400 hover:text-gray-600"
          title="Back to projects"
        >
          ←
        </Link>
        <h1 className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
          {project.hub.title}
        </h1>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${accent.chip}`}
        >
          {mode}
        </span>
        {activeSession ? (
          <ActiveSessionPill
            session={activeSession}
            onEnd={async () => {
              await patchSession(hubId, activeSession.id, { close: true });
              await refreshSessions();
            }}
            accent={accent}
          />
        ) : (
          <button
            onClick={() => setSessionDialogOpen(true)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
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

      {/* Ask result panel (collapsible-by-presence) */}
      {(askResponse || askError) && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 max-h-[40vh] overflow-y-auto flex-shrink-0">
          {askError && (
            <p className="text-xs text-red-600">{askError}</p>
          )}
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
        className={`flex-1 grid gap-0 min-h-0 overflow-hidden transition-[grid-template-columns] duration-200`}
        style={{
          gridTemplateColumns: isMobile
            ? "1fr"
            : `${leftOpen ? "240px" : "44px"} 1fr ${rightOpen ? "260px" : "44px"}`,
        }}
      >
        {/* Left panel */}
        {!isMobile && (
          <aside className="border-r border-gray-200 bg-white overflow-y-auto overflow-x-hidden">
            <PanelCollapseButton
              open={leftOpen}
              side="left"
              onClick={() => setLeftOpen((o) => !o)}
            />
            {leftOpen ? (
              <LeftPanel project={project} />
            ) : (
              <div className="text-xs text-gray-400 text-center mt-10">
                <div title="Pinned scope">⊞</div>
              </div>
            )}
          </aside>
        )}

        {/* Center panel */}
        <section className="bg-white overflow-y-auto min-w-0 min-h-0">
          <div className="border-b border-gray-200 px-4 flex items-center gap-1 sticky top-0 bg-white z-10">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs ${
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
            {tab === "write" && <WriteTab hubId={hubId} />}
            {tab === "notes" && (
              <NotesTabPlaceholder pinnedIds={project.scope.pinned_node_ids} />
            )}
            {tab === "synthesize" && <SynthesizePlaceholder />}
          </div>
        </section>

        {/* Right panel */}
        {!isMobile && (
          <aside className="border-l border-gray-200 bg-white overflow-y-auto overflow-x-hidden">
            <PanelCollapseButton
              open={rightOpen}
              side="right"
              onClick={() => setRightOpen((o) => !o)}
            />
            {rightOpen ? (
              <RightPanel sessions={sessions} />
            ) : (
              <div className="text-xs text-gray-400 text-center mt-10">
                <div title="Activity">◷</div>
              </div>
            )}
          </aside>
        )}
      </div>

      {sessionDialogOpen && (
        <SessionDialog
          projectMode={mode}
          onClose={() => setSessionDialogOpen(false)}
          onConfirm={async (data) => {
            await startSession(hubId, data);
            await refreshSessions();
            setSessionDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel — pinned scope (read-only in Slice 1)
// ---------------------------------------------------------------------------

function LeftPanel({ project }: { project: ProjectDetail }) {
  const [pinned, setPinned] = useState<NodeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const pinnedIds = project.scope.pinned_node_ids;

  useEffect(() => {
    let cancelled = false;
    if (pinnedIds.length === 0) {
      setPinned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      pinnedIds.map((id) =>
        getNode(id)
          .then((n) => ({ id: n.id, title: n.title, type: n.type }) as NodeRef)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setPinned(results.filter((x): x is NodeRef => x !== null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pinnedIds]);

  return (
    <div className="px-3 py-4 space-y-5 text-xs">
      <Section label="Scope">
        <div className="space-y-1 text-gray-500">
          <Row label="Pinned" value={`${pinnedIds.length}`} />
          <Row label="Tags" value={`${project.scope.tag_ids.length}`} />
          <Row
            label="Last visit"
            value={relativeOrNever(project.scope.last_visited_at ?? null)}
          />
        </div>
      </Section>

      <Section label="Pinned notes">
        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : pinned.length === 0 ? (
          <p className="text-gray-400">
            No pinned notes yet. (Scope editing arrives in the next slice.)
          </p>
        ) : (
          <ul className="space-y-1">
            {pinned.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/nodes/${n.id}`}
                  className="block truncate text-gray-700 hover:text-indigo-600"
                  title={n.title}
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {project.scope.tag_ids.length > 0 && (
        <Section label="Tags">
          <div className="flex flex-wrap gap-1">
            {project.scope.tag_ids.map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
              >
                #{t.slice(0, 8)}
              </span>
            ))}
          </div>
        </Section>
      )}

      {project.scope.primary_tag_id === null && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-800">
          No primary tag set. The Ask scope toggle and{" "}
          <code className="font-mono text-[10px]">con --project</code> need
          one. Scope editing lands in Slice 2.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — recent activity (Slice 1 stub; Slice 2 expands it)
// ---------------------------------------------------------------------------

function RightPanel({ sessions }: { sessions: WorkSession[] }) {
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  useEffect(() => {
    getActivity(7)
      .then(setActivity)
      .catch(() => {});
  }, []);

  return (
    <div className="px-3 py-4 space-y-5 text-xs">
      <Section label="Recent activity (corpus, 7d)">
        {activity === null ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <ul className="space-y-1 text-gray-500">
            <Row label="Captured" value={String(activity.captured.length)} />
            <Row label="Edited" value={String(activity.edited.length)} />
            <Row label="Linked" value={String(activity.edges.length)} />
          </ul>
        )}
      </Section>

      <Section label="Session history">
        {sessions.length === 0 ? (
          <p className="text-gray-400">No sessions yet.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id} className="border-l-2 border-gray-200 pl-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-700">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      s.status === "active"
                        ? "bg-emerald-500"
                        : s.status === "blocked"
                          ? "bg-rose-400"
                          : "bg-gray-300"
                    }`}
                  />
                  <span className="truncate">{s.intent}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {s.mode} · {s.status}
                  {s.duration_seconds !== null &&
                    s.duration_seconds !== undefined && (
                      <> · {Math.round(s.duration_seconds / 60)}m</>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Open questions">
        <p className="text-gray-400 italic">
          One-line append input lands in Slice 2.
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Write tab — free-writing pad with debounced autosave
// ---------------------------------------------------------------------------

function WriteTab({ hubId }: { hubId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Debounced autosave — fires DRAFT_DEBOUNCE_MS after the last keystroke.
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>Free-writing pad — autosaves to draft, not the graph.</span>
        <span>
          {saving
            ? "Saving…"
            : error
              ? <span className="text-red-500">{error}</span>
              : savedAt
                ? `Saved ${savedAt.toLocaleTimeString()}`
                : draft
                  ? "Synced"
                  : ""}
        </span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={18}
        placeholder="Start writing… nothing here is committed to the graph until you promote it."
        className="w-full rounded border border-gray-200 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
      />
      <p className="text-[11px] text-gray-400">
        Promotion to a permanent note: select text and use Ctrl+Shift+Space to
        open the intentional capture dialog with your selection prefilled.
        (Auto-add-to-pinned-scope lands in Slice 2.)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholders for Slice 1 — Notes / Synthesize tabs
// ---------------------------------------------------------------------------

function NotesTabPlaceholder({ pinnedIds }: { pinnedIds: string[] }) {
  return (
    <div className="text-xs text-gray-500 space-y-2">
      <p>
        Project-scoped Notes view ships in Slice 2. For now: this tab will list
        the {pinnedIds.length} pinned note{pinnedIds.length === 1 ? "" : "s"}{" "}
        plus everything carrying a project tag.
      </p>
      <Link href="/notes" className="text-indigo-600 hover:underline">
        Open Notes view →
      </Link>
    </div>
  );
}

function SynthesizePlaceholder() {
  return (
    <div className="text-xs text-gray-500 space-y-2">
      <p>
        Project-scoped Synthesize ships in Slice 2 alongside Resume briefing.
      </p>
      <Link href="/synthesize" className="text-indigo-600 hover:underline">
        Open Synthesize →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ask result panel
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
        <p className="text-xs text-gray-500">Answer</p>
        <button
          onClick={onDismiss}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          dismiss
        </button>
      </div>
      <div className="prose prose-sm max-w-none text-sm">
        <p className="whitespace-pre-wrap">{response.answer}</p>
      </div>
      {response.provenance.length > 0 && (
        <div className="text-xs">
          <p className="text-gray-400 mb-1">
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
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
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

// ---------------------------------------------------------------------------
// Topbar pieces
// ---------------------------------------------------------------------------

function ActiveSessionPill({
  session,
  onEnd,
  accent,
}: {
  session: WorkSession;
  onEnd: () => void;
  accent: { dot: string; chip: string; text: string };
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${accent.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
      <span className="truncate max-w-[260px]" title={session.intent}>
        {session.intent}
      </span>
      <span className="text-gray-400">·</span>
      {confirming ? (
        <>
          <button
            onClick={() => {
              setConfirming(false);
              onEnd();
            }}
            className="text-rose-700 hover:underline"
          >
            confirm end
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            cancel
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-gray-500 hover:text-gray-700"
        >
          end
        </button>
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
      className={`absolute top-1 ${side === "left" ? "right-1" : "left-1"} text-gray-300 hover:text-gray-600 text-xs px-1`}
      style={{ position: "sticky", top: 4, zIndex: 1 }}
      aria-label={open ? "Collapse panel" : "Expand panel"}
    >
      {arrow}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-mono">{value}</span>
    </div>
  );
}

function relativeOrNever(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
