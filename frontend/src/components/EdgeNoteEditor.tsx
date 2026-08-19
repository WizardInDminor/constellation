"use client";

/**
 * EdgeNoteEditor — inline editor for a relationship's note (Phase C, ADR-088).
 *
 * The edge-note authoring loop: a lightweight, generic prompt to record WHY a
 * link exists / what the connection means. Feeds EntityArc interpretation
 * entries, ConnectionsByRole "why" labels, and RAG edge context. Domain-neutral
 * copy — works for symbols, research concepts, learning topics, dependencies,
 * and story nodes.
 *
 * Renders compactly: shows the note (or a subtle "+ add note" prompt) until the
 * user clicks to edit, then an autosizing textarea with save/cancel.
 */

import { useState } from "react";

import { updateEdge } from "@/lib/api";
import { EDGE_NOTE_PLACEHOLDER } from "@/lib/edgeTypes";

export function EdgeNoteEditor({
  edgeId,
  note,
  onSaved,
}: {
  edgeId: string;
  note: string | null | undefined;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      await updateEdge(edgeId, { note: trimmed.length > 0 ? trimmed : null });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return note ? (
      <button
        type="button"
        onClick={() => {
          setValue(note);
          setEditing(true);
        }}
        className="text-left text-[11px] italic text-gray-500 hover:text-gray-700"
        title="Edit note"
      >
        {note}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          setValue("");
          setEditing(true);
        }}
        className="text-left text-[11px] text-gray-300 hover:text-indigo-500"
        title="Add a note explaining this connection"
      >
        + add note
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        placeholder={EDGE_NOTE_PLACEHOLDER}
        rows={2}
        className="textarea text-xs"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn btn-primary btn-sm"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn btn-ghost btn-sm"
        >
          Cancel
        </button>
        <span className="text-[10px] text-gray-400">⌘↵ to save · Esc</span>
      </div>
      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}
