"use client";

/**
 * Workspace Ask bar with the three-state scope toggle (ADR-068).
 *
 * - Project: one `POST /rag/query` with `tag_filter = [primary_tag_id]`.
 * - Full corpus: one `POST /rag/query` with no `tag_filter`.
 * - Both: scoped call first; if provenance is empty (low confidence proxy),
 *   re-issue without `tag_filter`; merge and label out-of-scope items.
 *
 * The Project / Both toggles are disabled when `primary_tag_id` is null —
 * the workspace must never silently degrade to full-corpus behavior
 * (ADR-063 silent-failure guardrail). A tooltip explains the missing tag.
 */

import { useState } from "react";
import { ragQuery } from "@/lib/api";
import type { NodeUsed, RagResponse } from "@/lib/api";

export type AskScope = "project" | "both" | "full";

interface Props {
  primaryTagId: string | null;
  onResult: (payload: {
    response: RagResponse;
    outOfScopeIds: Set<string>;
  }) => void;
  onError: (e: string) => void;
  onClear: () => void;
}

export function AskBar({ primaryTagId, onResult, onError, onClear }: Props) {
  const hasPrimary = primaryTagId !== null;
  const [scope, setScope] = useState<AskScope>(hasPrimary ? "project" : "full");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // If primaryTagId drops to null mid-session, snap scope back to "full".
  if (!hasPrimary && scope !== "full") {
    setScope("full");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    onClear();
    try {
      const merged = await runAsk(query.trim(), scope, primaryTagId);
      onResult(merged);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }

  function makeToggle(value: AskScope, label: string, disabled: boolean) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setScope(value)}
        title={
          disabled
            ? "Set a primary tag on the project scope to enable this option."
            : undefined
        }
        className={`px-2.5 py-1 text-xs border-l first:border-l-0 border-gray-200 transition-colors ${
          scope === value
            ? "bg-indigo-600 text-white"
            : disabled
              ? "bg-gray-50 text-gray-300 cursor-not-allowed"
              : "bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-shrink-0"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask anything about this project…"
        className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="inline-flex items-center rounded-md border border-gray-200 overflow-hidden">
        {makeToggle("project", "Project", !hasPrimary)}
        {makeToggle("both", "Both", !hasPrimary)}
        {makeToggle("full", "Full corpus", false)}
      </div>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Asking…" : "Ask"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Orchestration (ADR-068)
// ---------------------------------------------------------------------------

async function runAsk(
  query: string,
  scope: AskScope,
  primaryTagId: string | null,
): Promise<{ response: RagResponse; outOfScopeIds: Set<string> }> {
  if (scope === "full" || primaryTagId === null) {
    const r = await ragQuery(query);
    return { response: r, outOfScopeIds: new Set() };
  }

  if (scope === "project") {
    const r = await ragQuery(query, { tag_filter: [primaryTagId] });
    return { response: r, outOfScopeIds: new Set() };
  }

  // scope === "both": scoped first; if it returned useful provenance, return it.
  // Otherwise widen to full corpus and merge, labeling new items out-of-scope.
  // The "useful provenance" proxy is provenance.length > 0 (B5 / ADR-057's
  // low-confidence framing kicks in when retrieval is empty or weak).
  const scoped = await ragQuery(query, { tag_filter: [primaryTagId] });
  if (scoped.provenance.length > 0) {
    return { response: scoped, outOfScopeIds: new Set() };
  }

  // Widen.
  const wide = await ragQuery(query);
  const scopedIds = new Set(scoped.provenance.map((p) => p.node_id));
  // Merge provenance: scoped first, then wide items the scoped call didn't see.
  const merged: NodeUsed[] = [
    ...scoped.provenance,
    ...wide.provenance.filter((p) => !scopedIds.has(p.node_id)),
  ];
  const outOfScopeIds = new Set(
    wide.provenance
      .filter((p) => !scopedIds.has(p.node_id))
      .map((p) => p.node_id),
  );
  return {
    response: {
      answer: wide.answer,
      query: wide.query,
      provenance: merged,
      edges_traversed: wide.edges_traversed,
    },
    outOfScopeIds,
  };
}
