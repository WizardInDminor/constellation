"use client";

import { useState } from "react";
import type { EdgeType, GraphNodeRef } from "@/lib/api";
import { EDGE_TYPES, EDGE_TYPE_META, directionGlyph } from "@/lib/edgeTypes";

interface Props {
  from: GraphNodeRef;
  to: GraphNodeRef;
  onConfirm: (type: EdgeType, note: string) => Promise<void>;
  onCancel: () => void;
}

export function ConnectPanel({ from, to, onConfirm, onCancel }: Props) {
  const [edgeType, setEdgeType] = useState<EdgeType>("SUPPORTS");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(edgeType, note);
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "status" in e
          ? (e as { status: number }).status
          : null;
      setError(
        status === 409
          ? "Already connected with this edge type."
          : "Failed to create connection.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-100">New connection</h2>
        <button
          onClick={onCancel}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          aria-label="Cancel connection"
          title="Cancel connection"
        >
          ×
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <span className="section-label">From</span>
            <span className="truncate text-sm text-gray-200">{from.title}</span>
          </div>
          <div className="text-center text-xs text-gray-600">
            {directionGlyph(edgeType)}
          </div>
          <div className="flex flex-col gap-1">
            <span className="section-label">To</span>
            <span className="truncate text-sm text-gray-200">{to.title}</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="connect-edge-type"
            className="section-label mb-1 block"
          >
            Connection type
          </label>
          <select
            id="connect-edge-type"
            value={edgeType}
            onChange={(e) => setEdgeType(e.target.value as EdgeType)}
            className="w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {EDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDGE_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <p className="field-hint">{EDGE_TYPE_META[edgeType].description}</p>
        </div>

        <div>
          <label htmlFor="connect-note" className="section-label mb-1 block">
            Note (optional)
          </label>
          <textarea
            id="connect-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why does this connection exist?"
            rows={3}
            className="w-full resize-none rounded-md border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-700 p-4">
        <button
          onClick={handleCreate}
          disabled={saving}
          className="btn btn-primary w-full"
        >
          {saving ? "Creating…" : "Create connection"}
        </button>
        <button
          onClick={onCancel}
          className="btn w-full text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
