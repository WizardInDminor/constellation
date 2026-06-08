"use client";

import { useState } from "react";
import type { TagRef } from "@/lib/api";

interface Props {
  selectedCount: number;
  allTagRefs: TagRef[];
  onApplyTags: (tagIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function BatchPanel({
  selectedCount,
  allTagRefs,
  onApplyTags,
  onClose,
}: Props) {
  const [pendingTagIds, setPendingTagIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tagId: string) {
    setPendingTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handleApply() {
    if (pendingTagIds.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onApplyTags(Array.from(pendingTagIds));
    } catch {
      setError("Failed to apply tags to some nodes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-100">
          {selectedCount} node{selectedCount !== 1 ? "s" : ""} selected
        </h2>
        <button
          onClick={onClose}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          aria-label="Clear selection"
          title="Clear selection"
        >
          ×
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="section-label mb-2">Add tags to all selected</div>
          {allTagRefs.length === 0 ? (
            <p className="text-xs italic text-gray-500">
              No tags exist yet. Create tags on individual notes first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allTagRefs.map((tag) => {
                const selected = pendingTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={selected}
                    className={`badge border transition-colors ${
                      selected
                        ? "border-transparent"
                        : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200"
                    }`}
                    style={
                      selected
                        ? tag.color
                          ? {
                              backgroundColor: tag.color + "33",
                              color: tag.color,
                            }
                          : { backgroundColor: "#3730a3", color: "#c7d2fe" }
                        : undefined
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="field-hint mt-0">
          Selected tags will be added to all {selectedCount} nodes. Existing
          tags are preserved.
        </p>

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-700 p-4">
        <button
          onClick={handleApply}
          disabled={saving || pendingTagIds.size === 0}
          className="btn btn-primary w-full"
        >
          {saving
            ? "Applying…"
            : `Apply ${pendingTagIds.size > 0 ? `${pendingTagIds.size} tag${pendingTagIds.size !== 1 ? "s" : ""}` : "tags"}`}
        </button>
        <button
          onClick={onClose}
          className="btn w-full text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
