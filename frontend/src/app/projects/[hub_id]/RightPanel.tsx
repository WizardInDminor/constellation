"use client";

/**
 * Right panel — bridges (project-scoped, cross-tag), recent activity, open
 * questions placeholder, and session history. Slice 2 adds the bridges
 * panel and wires NodeInteractionPopup into rows.
 */

import { useEffect, useState } from "react";
import { getActivity, listBridges } from "@/lib/api";
import type {
  ActivityFeed,
  BridgeCandidate,
  ProjectScope,
  WorkSession,
} from "@/lib/api";
import { useNodeInteraction } from "@/components/NodeInteractionPopup";

interface Props {
  scope: ProjectScope;
  sessions: WorkSession[];
  pinnedIds: string[];
  tagIds: string[];
}

export function RightPanel({ scope, sessions, pinnedIds, tagIds }: Props) {
  return (
    <div className="px-3 py-4 space-y-5 text-xs">
      <BridgesPanel pinnedIds={pinnedIds} tagIds={tagIds} />
      <ActivityPanel />
      <SessionHistoryPanel sessions={sessions} />
      <OpenQuestionsPlaceholder />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bridges — Discover bridges filtered to project scope members (hide if empty)
// ---------------------------------------------------------------------------

function BridgesPanel({
  pinnedIds,
  tagIds,
}: {
  pinnedIds: string[];
  tagIds: string[];
}) {
  const [bridges, setBridges] = useState<BridgeCandidate[] | null>(null);

  useEffect(() => {
    // Pull bridges with cross-tag filter on (A4 / Bucket A default).
    // For project scoping we filter client-side: include only bridges where
    // at least one endpoint is a project member (pinned or tagged-with-project-
    // tag). Reuses the existing /discover/bridges endpoint as-is.
    listBridges({ limit: 50, crossTag: true })
      .then((bs) => setBridges(bs))
      .catch(() => setBridges([]));
  }, []);

  // Filter to project membership. We don't have a synchronous
  // tag-membership map; the pinned set is a fast subset, and the bridges
  // endpoint already returns NodeRefs. For Slice 2 we restrict to bridges
  // whose endpoints are pinned. (Tag-based membership filtering needs a
  // batched node→tags lookup the existing endpoints don't expose; leaving
  // that as a follow-up rather than fetching every node detail here.)
  const pinSet = new Set(pinnedIds);
  const scoped = (bridges ?? []).filter(
    (b) => pinSet.has(b.node_a.id) || pinSet.has(b.node_b.id),
  );

  // Hide-when-empty per session-1 design.
  if (bridges === null) {
    return (
      <Section label="Bridges in scope">
        <div className="space-y-1.5" aria-busy="true">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </Section>
    );
  }
  if (scoped.length === 0) return null;

  return (
    <Section label="Bridges in scope">
      <ul className="space-y-1.5">
        {scoped.slice(0, 8).map((b) => (
          <BridgeRow key={`${b.node_a.id}-${b.node_b.id}`} bridge={b} />
        ))}
      </ul>
      <p className="text-[10px] text-gray-300 mt-1">
        Cross-tag bridges only. Restricted to pinned-note endpoints.
      </p>
    </Section>
  );
}

function BridgeRow({ bridge }: { bridge: BridgeCandidate }) {
  const a = useNodeInteraction(bridge.node_a.id);
  const b = useNodeInteraction(bridge.node_b.id);
  return (
    <li className="text-[11px]">
      <div className="flex items-center gap-1">
        <span
          {...a.anchorProps}
          className="truncate text-gray-700 hover:text-indigo-600 cursor-pointer flex-1"
          title={`${bridge.node_a.title} (Ctrl+click to edit)`}
        >
          {bridge.node_a.title}
        </span>
        <span className="text-gray-300 shrink-0">⇌</span>
        <span
          {...b.anchorProps}
          className="truncate text-gray-700 hover:text-indigo-600 cursor-pointer flex-1"
          title={`${bridge.node_b.title} (Ctrl+click to edit)`}
        >
          {bridge.node_b.title}
        </span>
      </div>
      <p className="text-[10px] text-gray-300 mt-0.5">
        sim {bridge.similarity.toFixed(2)}
      </p>
      {a.popup}
      {b.popup}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityPanel() {
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  useEffect(() => {
    getActivity(7)
      .then(setActivity)
      .catch(() => {});
  }, []);
  return (
    <Section label="Recent activity (corpus, 7d)">
      {activity === null ? (
        <div className="space-y-1.5" aria-busy="true">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      ) : (
        <ul className="space-y-1 text-gray-500">
          <Row label="Captured" value={String(activity.captured.length)} />
          <Row label="Edited" value={String(activity.edited.length)} />
          <Row label="Linked" value={String(activity.edges.length)} />
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Session history
// ---------------------------------------------------------------------------

function SessionHistoryPanel({ sessions }: { sessions: WorkSession[] }) {
  if (sessions.length === 0) {
    return (
      <Section label="Session history">
        <p className="text-gray-400">No sessions yet.</p>
      </Section>
    );
  }
  return (
    <Section label="Session history">
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
                      : s.status === "partial"
                        ? "bg-amber-400"
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
            {s.next_session_intent && s.status !== "active" && (
              <div className="text-[10px] text-gray-500 mt-0.5 italic truncate">
                next: {s.next_session_intent}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Open questions placeholder (deferred to Phase 10 per build plan)
// ---------------------------------------------------------------------------

function OpenQuestionsPlaceholder() {
  return (
    <Section label="Open questions">
      <p className="text-gray-400 italic">
        One-line append input lands when QUESTIONS-edge-tracking ships (Phase
        10).
      </p>
    </Section>
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
      <p className="section-label mb-1.5">{label}</p>
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
