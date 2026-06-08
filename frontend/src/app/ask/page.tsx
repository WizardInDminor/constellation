"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NoteContent } from "@/components/NoteContent";
import { listTags, ragQuery, saveAnswer } from "@/lib/api";
import { resolveCitations } from "@/lib/citations";
import type { RagResponse, NodeUsed, EdgeTraversed, RagMode, TagRef } from "@/lib/api";

const MODE_OPTIONS: {
  value: RagMode;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Balanced",
    description: "Default behaviour — preserves nuance and hedges when notes are thin.",
  },
  {
    value: "brief",
    label: "Brief",
    description: "Argue the case directly. No counterarguments unless asked.",
  },
  {
    value: "critic",
    label: "Critic",
    description: "Enumerate the questions a careful reader would ask.",
  },
];

const NODE_TYPE_COLORS: Record<string, string> = {
  permanent: "bg-blue-100 text-blue-800",
  literature: "bg-purple-100 text-purple-800",
  structure: "bg-green-100 text-green-800",
  fleeting: "bg-yellow-100 text-yellow-800",
};

// ADR-061: recency presets. `null` means no `since` filter.
const RECENCY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any time" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function ProvenancePanel({
  provenance,
  edges,
  open,
  onToggle,
}: {
  provenance: NodeUsed[];
  edges: EdgeTraversed[];
  open: boolean;
  onToggle: () => void;
}) {
  const directNodes = provenance.filter((n) => n.role === "direct");
  const neighborNodes = provenance.filter((n) => n.role === "neighbor");

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
      >
        <span>
          Sources used ({provenance.length} note{provenance.length !== 1 ? "s" : ""}
          {edges.length > 0 && `, ${edges.length} connection${edges.length !== 1 ? "s" : ""}`})
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-4">
          {directNodes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Direct matches
              </p>
              <ul className="space-y-1.5">
                {directNodes.map((n, i) => (
                  <li key={n.node_id} className="flex items-center gap-2 text-sm">
                    <span className="w-14 shrink-0 text-xs text-gray-400">Note {provenance.indexOf(n) + 1}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${NODE_TYPE_COLORS[n.node_type] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {n.node_type}
                    </span>
                    <Link
                      href={`/nodes/${n.node_id}`}
                      className="text-blue-600 hover:underline truncate"
                    >
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {neighborNodes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Via graph expansion
              </p>
              <ul className="space-y-1.5">
                {neighborNodes.map((n) => (
                  <li key={n.node_id} className="flex items-center gap-2 text-sm">
                    <span className="w-14 shrink-0 text-xs text-gray-400">Note {provenance.indexOf(n) + 1}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${NODE_TYPE_COLORS[n.node_type] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {n.node_type}
                    </span>
                    <Link
                      href={`/nodes/${n.node_id}`}
                      className="text-blue-600 hover:underline truncate"
                    >
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {edges.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Connections traversed
              </p>
              <ul className="space-y-1 text-xs text-gray-500 font-mono">
                {edges.map((e) => {
                  const fromNode = provenance.find((n) => n.node_id === e.from_id);
                  const toNode = provenance.find((n) => n.node_id === e.to_id);
                  const fromLabel = fromNode
                    ? `Note ${provenance.indexOf(fromNode) + 1}`
                    : e.from_id.slice(0, 8);
                  const toLabel = toNode
                    ? `Note ${provenance.indexOf(toNode) + 1}`
                    : e.to_id.slice(0, 8);
                  return (
                    <li key={e.edge_id}>
                      {fromLabel} → [{e.edge_type}] → {toLabel}
                      {e.note && <span className="text-gray-400 not-italic font-sans"> ({e.note})</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RagMode>("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<RagResponse | null>(null);
  const [provenanceOpen, setProvenanceOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  // ADR-061: scope state.
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [recencyDays, setRecencyDays] = useState<number | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    listTags()
      .then(setAllTags)
      .catch(() => {
        // Non-fatal — scope controls just won't list tags.
      });
  }, []);

  const scopeActive = selectedTagIds.size > 0 || recencyDays !== null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await ragQuery(query.trim(), {
        mode,
        tag_filter: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
        since: recencyDays !== null ? daysAgoIso(recencyDays) : undefined,
      });
      setResponse(res);
      setProvenanceOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearScope = () => {
    setSelectedTagIds(new Set());
    setRecencyDays(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const reset = () => {
    setQuery("");
    setResponse(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSaveAsNote = async () => {
    if (!response || saving) return;
    setSaving(true);
    setError(null);
    try {
      const note = await saveAnswer({
        query: response.query,
        answer: response.answer,
        provenance_ids: response.provenance.map((p) => p.node_id),
      });
      router.push(`/nodes/${note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const resolvedAnswer = response
    ? resolveCitations(response.answer, response.provenance)
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Ask your notes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Questions are answered using your own notes. Answers include citations you can follow.
      </p>

      {/* Question input */}
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your notes…"
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          autoFocus
        />

        {/* ADR-061: scope controls. Collapsed by default to keep the page calm
            when scope is off; opens to expose tag and recency selectors. */}
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setScopeOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <span className="flex items-center gap-2">
              <span className="uppercase tracking-wide text-gray-500">Scope</span>
              {scopeActive ? (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 normal-case tracking-normal">
                  {selectedTagIds.size > 0
                    ? `${selectedTagIds.size} tag${selectedTagIds.size === 1 ? "" : "s"}`
                    : null}
                  {selectedTagIds.size > 0 && recencyDays !== null ? " · " : null}
                  {recencyDays !== null
                    ? RECENCY_OPTIONS.find((o) => o.value === recencyDays)?.label
                    : null}
                </span>
              ) : (
                <span className="text-gray-400 normal-case tracking-normal">any note, any time</span>
              )}
            </span>
            <span className="text-gray-400">{scopeOpen ? "▲" : "▼"}</span>
          </button>
          {scopeOpen && (
            <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Recency
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {RECENCY_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setRecencyDays(opt.value)}
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        recencyDays === opt.value
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Tags (matches any selected)
                </p>
                {allTags.length === 0 ? (
                  <p className="text-xs text-gray-400">No tags yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => {
                      const active = selectedTagIds.has(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            active
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {scopeActive && (
                <button
                  type="button"
                  onClick={clearScope}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Clear scope
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`px-3 py-1.5 border-l border-gray-200 first:border-l-0 transition-colors ${
                    mode === opt.value
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  title={opt.description}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400 max-w-xs">
              {MODE_OPTIONS.find((m) => m.value === mode)?.description}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {response && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Ask another
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Thinking…" : "Ask"}
              </button>
            </div>
            <span className="text-xs text-gray-400">⌘↵ or Ctrl↵ to submit</span>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-8 flex flex-col items-center gap-3 text-gray-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
          <p className="text-sm">Searching notes and composing answer…</p>
        </div>
      )}

      {/* Answer */}
      {resolvedAnswer && response && (
        <div className="mt-6">
          <div className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white px-6 py-5">
            <NoteContent content={resolvedAnswer} />
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSaveAsNote}
              disabled={saving}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as note"}
            </button>
          </div>

          <ProvenancePanel
            provenance={response.provenance}
            edges={response.edges_traversed}
            open={provenanceOpen}
            onToggle={() => setProvenanceOpen((o) => !o)}
          />
        </div>
      )}
    </div>
  );
}
