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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Start session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              What are you working on today?
            </label>
            <textarea
              autoFocus
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              placeholder="e.g. Process the last six literature notes into permanents"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Session mode
            </label>
            <p className="text-[10px] text-gray-400 mb-2">
              Pre-filled from project mode; override if this session has a
              different shape.
            </p>
            <div className="grid grid-cols-4 gap-1">
              {SESSION_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`rounded border px-2 py-1 text-xs ${
                    mode === m.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Estimated duration (minutes, optional)
            </label>
            <input
              type="number"
              min="1"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              placeholder="e.g. 45"
              className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
              disabled={saving || !intent.trim()}
              className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Starting…" : "Start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
