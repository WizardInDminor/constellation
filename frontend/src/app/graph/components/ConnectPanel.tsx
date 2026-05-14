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
      const status = e && typeof e === "object" && "status" in e ? (e as { status: number }).status : null;
      setError(status === 409 ? "Already connected with this edge type." : "Failed to create connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <span className="text-sm font-semibold text-gray-100">New Connection</span>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-100 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">From</span>
            <span className="text-sm text-gray-200 truncate">{from.title}</span>
          </div>
          <div className="text-center text-gray-600 text-xs">{directionGlyph(edgeType)}</div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">To</span>
            <span className="text-sm text-gray-200 truncate">{to.title}</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">
            Connection type
          </label>
          <select
            value={edgeType}
            onChange={(e) => setEdgeType(e.target.value as EdgeType)}
            className="w-full text-sm bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {EDGE_TYPES.map((t) => (
              <option key={t} value={t}>{EDGE_TYPE_META[t].label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{EDGE_TYPE_META[edgeType].description}</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why does this connection exist?"
            rows={3}
            className="w-full text-sm bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none placeholder:text-gray-600"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="p-4 border-t border-gray-700 space-y-2">
        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5 disabled:opacity-40 transition-colors"
        >
          {saving ? "Creating…" : "Create connection"}
        </button>
        <button
          onClick={onCancel}
          className="w-full text-sm text-gray-400 hover:text-gray-200 rounded px-3 py-1.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
