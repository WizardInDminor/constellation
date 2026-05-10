"use client";

import { useState } from "react";
import type { TagRef } from "@/lib/api";

interface Props {
  selectedCount: number;
  allTagRefs: TagRef[];
  onApplyTags: (tagIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function BatchPanel({ selectedCount, allTagRefs, onApplyTags, onClose }: Props) {
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <span className="text-sm font-semibold text-gray-100">
          {selectedCount} node{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-100 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Add tags to all selected</div>
          {allTagRefs.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No tags exist yet. Create tags on individual notes first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTagRefs.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    pendingTagIds.has(tag.id)
                      ? "border-transparent"
                      : "border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}
                  style={
                    pendingTagIds.has(tag.id)
                      ? tag.color
                        ? { backgroundColor: tag.color + "33", color: tag.color }
                        : { backgroundColor: "#3730a3", color: "#c7d2fe" }
                      : undefined
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Selected tags will be added to all {selectedCount} nodes. Existing tags are preserved.
        </p>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="p-4 border-t border-gray-700 space-y-2">
        <button
          onClick={handleApply}
          disabled={saving || pendingTagIds.size === 0}
          className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5 disabled:opacity-40 transition-colors"
        >
          {saving ? "Applying…" : `Apply ${pendingTagIds.size > 0 ? `${pendingTagIds.size} tag${pendingTagIds.size !== 1 ? "s" : ""}` : "tags"}`}
        </button>
        <button
          onClick={onClose}
          className="w-full text-sm text-gray-400 hover:text-gray-200 rounded px-3 py-1.5 transition-colors"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
