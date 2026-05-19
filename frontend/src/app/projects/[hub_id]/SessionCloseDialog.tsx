"use client";

/**
 * Session close dialog — captures closing notes, next-session intent, and
 * status; PATCHes the session with close=true; shows the wrap summary
 * after close.
 */

import { useEffect, useState } from "react";
import {
  getSessionWrap,
  patchSession,
} from "@/lib/api";
import type {
  SessionStatus,
  SessionWrapCounts,
  WorkSession,
} from "@/lib/api";

const STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "partial", label: "Partial" },
  { value: "blocked", label: "Blocked" },
];

interface Props {
  hubId: string;
  session: WorkSession;
  onClose: () => void;
  onClosed: (closed: WorkSession) => void;
}

export function SessionCloseDialog({
  hubId,
  session,
  onClose,
  onClosed,
}: Props) {
  const [closingNotes, setClosingNotes] = useState(session.closing_notes ?? "");
  const [nextIntent, setNextIntent] = useState(
    session.next_session_intent ?? "",
  );
  const [status, setStatus] = useState<SessionStatus>("completed");
  const [saving, setSaving] = useState(false);
  const [wrap, setWrap] = useState<SessionWrapCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<WorkSession | null>(null);

  // Show wrap counts even before the user confirms close, so they see what
  // they accomplished while writing closing notes.
  useEffect(() => {
    getSessionWrap(hubId, session.id)
      .then(setWrap)
      .catch(() => setWrap(null));
  }, [hubId, session.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await patchSession(hubId, session.id, {
        close: true,
        closing_notes: closingNotes,
        next_session_intent: nextIntent,
        status,
      });
      setClosed(result);
      onClosed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close session");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">End session</h2>
            <p className="text-[11px] text-gray-400 truncate mt-0.5">
              {session.intent}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {wrap && (
          <div className="mb-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 grid grid-cols-3 gap-2">
            <Stat label="Nodes" value={wrap.nodes_created} />
            <Stat label="Captures" value={wrap.fleetings_created} />
            <Stat label="Edges" value={wrap.edges_created} />
          </div>
        )}

        {closed ? (
          <div className="space-y-3">
            <p className="text-sm">
              Session closed —{" "}
              <span className="font-medium">
                {closed.status} · {Math.round((closed.duration_seconds ?? 0) / 60)}m
              </span>
            </p>
            <button
              onClick={onClose}
              className="w-full rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Closing notes — what shifted, what felt unresolved
              </label>
              <textarea
                autoFocus
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Got the harbor scene working. Vincent's motivation still murky."
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Next session intent — what you'd pick up
              </label>
              <textarea
                value={nextIntent}
                onChange={(e) => setNextIntent(e.target.value)}
                rows={2}
                placeholder="e.g. Re-read Vincent's backstory notes; draft his confrontation scene."
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`rounded border px-2 py-1.5 text-xs ${
                      status === opt.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Closing…" : "End session"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-mono text-gray-700">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </p>
    </div>
  );
}
