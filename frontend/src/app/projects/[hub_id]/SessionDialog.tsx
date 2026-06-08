"use client";

import { useState } from "react";
import type { ProjectMode, SessionMode, WorkSessionCreate } from "@/lib/api";

const SESSION_MODES: { value: SessionMode; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "narrative", label: "Narrative" },
  { value: "learning", label: "Learning" },
  { value: "planning", label: "Planning" },
];

interface Props {
  projectMode: ProjectMode;
  onClose: () => void;
  onConfirm: (data: WorkSessionCreate) => void | Promise<void>;
}

export function SessionDialog({ projectMode, onClose, onConfirm }: Props) {
  const [intent, setIntent] = useState("");
  // Mode pre-fills from project mode, but the user can override per session
  // (philosophy doc §IIIb.2 — session mode is independent of project mode).
  const [mode, setMode] = useState<SessionMode>(projectMode);
  const [estimated, setEstimated] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!intent.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data: WorkSessionCreate = {
        mode,
        intent: intent.trim(),
        estimated_duration_minutes: estimated ? parseInt(estimated, 10) : null,
      };
      await onConfirm(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start session");
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
        aria-label="Start session"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Start session
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="session-intent" className="label">
              What are you working on today?
            </label>
            <textarea
              id="session-intent"
              autoFocus
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              placeholder="e.g. Process the last six literature notes into permanents"
              className="textarea"
            />
          </div>

          <div>
            <span className="label mb-1.5">Session mode</span>
            <p className="field-hint mt-0 mb-2">
              Pre-filled from project mode; override if this session has a
              different shape.
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {SESSION_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    mode === m.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="session-duration" className="label">
              Estimated duration (minutes, optional)
            </label>
            <input
              id="session-duration"
              type="number"
              min="1"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              placeholder="e.g. 45"
              className="input w-32"
            />
          </div>

          {error && <p className="alert-error">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !intent.trim()}
              className="btn btn-primary"
            >
              {saving ? "Starting…" : "Start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
