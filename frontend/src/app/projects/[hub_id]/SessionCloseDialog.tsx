"use client";

/**
 * Session close dialog — captures closing notes, next-session intent, and
 * status; PATCHes the session with close=true; shows the wrap summary
 * after close.
 */

import { useEffect, useState } from "react";
import { getSessionWrap, patchSession } from "@/lib/api";
import type { SessionStatus, SessionWrapCounts, WorkSession } from "@/lib/api";

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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="End session"
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              End session
            </h2>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {session.intent}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {wrap && (
          <div className="mb-4 rounded-md bg-gray-50 px-3 py-2.5 grid grid-cols-3 gap-2">
            <Stat label="Nodes" value={wrap.nodes_created} />
            <Stat label="Captures" value={wrap.fleetings_created} />
            <Stat label="Edges" value={wrap.edges_created} />
          </div>
        )}

        {closed ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Session closed —{" "}
              <span className="font-medium">
                {closed.status} ·{" "}
                {Math.round((closed.duration_seconds ?? 0) / 60)}m
              </span>
            </p>
            <button onClick={onClose} className="btn btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="session-closing-notes" className="label">
                Closing notes — what shifted, what felt unresolved
              </label>
              <textarea
                id="session-closing-notes"
                autoFocus
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Got the harbor scene working. Vincent's motivation still murky."
                className="textarea"
              />
            </div>
            <div>
              <label htmlFor="session-next-intent" className="label">
                Next session intent — what you&apos;d pick up
              </label>
              <textarea
                id="session-next-intent"
                value={nextIntent}
                onChange={(e) => setNextIntent(e.target.value)}
                rows={2}
                placeholder="e.g. Re-read Vincent's backstory notes; draft his confrontation scene."
                className="textarea"
              />
            </div>
            <div>
              <span className="label mb-1.5">Status</span>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={status === opt.value}
                    onClick={() => setStatus(opt.value)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      status === opt.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="alert-error">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
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
