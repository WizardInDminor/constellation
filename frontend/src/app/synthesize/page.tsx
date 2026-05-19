"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkdownWithMermaid } from "@/components/MarkdownWithMermaid";
import {
  listNodes,
  listTags,
  ragScoped,
  saveAnswer,
  searchHybrid,
} from "@/lib/api";
import { resolveCitations } from "@/lib/citations";
import type {
  NodeRef,
  NodeSummary,
  RagResponse,
  TagRef,
} from "@/lib/api";
import { applyPoolFilters, type TagMode } from "./filterPool";

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
  fleeting: "bg-amber-100 text-amber-700",
};

export default function SynthesizePage() {
  const router = useRouter();

  // ── Source pool ──────────────────────────────────────────────────────────
  // For v1 we load up to 200 most-recent non-fleeting notes via the existing
  // listNodes endpoint, then filter client-side. Fine at personal scale.
  const [pool, setPool] = useState<NodeSummary[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [permanent, literature, structure, tags] = await Promise.all([
          listNodes("permanent"),
          listNodes("literature"),
          listNodes("structure"),
          listTags(),
        ]);
        const merged = [
          ...permanent.items,
          ...literature.items,
          ...structure.items,
        ].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        setPool(merged);
        setAllTags(tags);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load notes");
      }
    }
    load();
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [tagMode, setTagMode] = useState<TagMode>("or");
  const [recentDays, setRecentDays] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NodeRef[]>([]);
  const [searching, setSearching] = useState(false);

  const filteredPool = useMemo(
    () => applyPoolFilters(pool, { selectedTagIds, recentDays, tagMode }),
    [pool, selectedTagIds, recentDays, tagMode],
  );

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchHybrid(searchQuery.trim(), 15);
      setSearchResults(
        res.results.map((r) => ({
          id: r.node.id,
          title: r.node.title,
          type: r.node.type,
        })),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // ── Scope basket ─────────────────────────────────────────────────────────
  const [scope, setScope] = useState<NodeRef[]>([]);
  const scopeIds = useMemo(() => new Set(scope.map((n) => n.id)), [scope]);

  function addToScope(ref: NodeRef) {
    if (scopeIds.has(ref.id)) return;
    setScope((prev) => [...prev, ref]);
  }

  function removeFromScope(id: string) {
    setScope((prev) => prev.filter((n) => n.id !== id));
  }

  function selectAllFiltered() {
    const additions = filteredPool
      .filter((n) => !scopeIds.has(n.id))
      .map((n) => ({ id: n.id, title: n.title, type: n.type }));
    setScope((prev) => [...prev, ...additions]);
  }

  function clearScope() {
    setScope([]);
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [response, setResponse] = useState<RagResponse | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!query.trim() || scope.length === 0 || generating) return;
    setGenerating(true);
    setGenError(null);
    setResponse(null);
    try {
      const res = await ragScoped(
        query.trim(),
        scope.map((n) => n.id),
        customPrompt.trim() || undefined,
      );
      setResponse(res);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!response || saving) return;
    setSaving(true);
    setGenError(null);
    try {
      const note = await saveAnswer({
        query: response.query,
        answer: response.answer,
        provenance_ids: response.provenance.map((p) => p.node_id),
        custom_prompt: customPrompt.trim() || undefined,
      });
      router.push(`/nodes/${note.id}`);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  const resolvedAnswer = response
    ? resolveCitations(response.answer, response.provenance)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Synthesize</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pick a subset of your notes, give a guiding prompt, and let Claude
          distill them into an artifact you can save.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* ── Filters + search ─────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4">
        <h3 className="text-sm font-medium text-gray-700">Build your scope</h3>

        {/* Recency */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-2">Created within:</span>
          {[null, 1, 7, 30, 90].map((d) => (
            <button
              key={String(d)}
              onClick={() => setRecentDays(d)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                recentDays === d
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {d === null ? "Any time" : `${d} day${d === 1 ? "" : "s"}`}
            </button>
          ))}
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-2">Tags:</span>
            {allTags.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedTagIds.has(t.id)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                }`}
              >
                {t.name}
              </button>
            ))}
            {selectedTagIds.size > 1 && (
              <div
                className="ml-auto inline-flex items-center rounded-full border border-gray-200 overflow-hidden text-xs"
                title="OR: a note needs any selected tag. AND: a note needs all of them."
              >
                <button
                  onClick={() => setTagMode("or")}
                  className={`px-2.5 py-1 ${
                    tagMode === "or"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-500 hover:text-gray-800"
                  }`}
                >
                  any
                </button>
                <button
                  onClick={() => setTagMode("and")}
                  className={`px-2.5 py-1 border-l border-gray-200 ${
                    tagMode === "and"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-500 hover:text-gray-800"
                  }`}
                >
                  all
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filtered pool — bulk add */}
        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {filteredPool.length} note{filteredPool.length !== 1 ? "s" : ""} match
            </span>
            <button
              onClick={selectAllFiltered}
              disabled={filteredPool.length === 0}
              className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
            >
              Add all to scope
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto flex flex-col gap-1">
            {filteredPool.slice(0, 50).map((n) => (
              <li key={n.id} className="flex items-center justify-between text-sm py-0.5">
                <Link
                  href={`/nodes/${n.id}`}
                  className="truncate text-gray-700 hover:text-indigo-700"
                  target="_blank"
                >
                  {n.title}
                </Link>
                <button
                  onClick={() =>
                    addToScope({ id: n.id, title: n.title, type: n.type })
                  }
                  disabled={scopeIds.has(n.id)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-300 ml-3 shrink-0"
                >
                  {scopeIds.has(n.id) ? "added" : "+ add"}
                </button>
              </li>
            ))}
            {filteredPool.length > 50 && (
              <li className="text-xs text-gray-400 italic">
                {filteredPool.length - 50} more — narrow filters to see them
              </li>
            )}
          </ul>
        </div>

        {/* Search-add */}
        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Search to add a specific note…"
              className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <button
              onClick={runSearch}
              disabled={!searchQuery.trim() || searching}
              className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {searchResults.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-gray-700">{r.title}</span>
                  <button
                    onClick={() => addToScope(r)}
                    disabled={scopeIds.has(r.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-300 ml-3 shrink-0"
                  >
                    {scopeIds.has(r.id) ? "added" : "+ add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Selected basket ───────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            Scope ({scope.length})
          </h3>
          {scope.length > 0 && (
            <button
              onClick={clearScope}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
        {scope.length === 0 ? (
          <p className="text-xs text-gray-400">
            No notes selected yet. Use the filters or search above.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {scope.map((n) => (
              <li
                key={n.id}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-gray-200 ${TYPE_COLORS[n.type] ?? "bg-gray-100"}`}
              >
                <span className="max-w-[18rem] truncate">{n.title}</span>
                <button
                  onClick={() => removeFromScope(n.id)}
                  className="text-gray-500 hover:text-gray-800"
                  aria-label="Remove from scope"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Query + custom prompt + generate ──────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium text-gray-700">Question and guidance</h3>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Question</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What should the LLM answer using these notes?"
            className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Optional guidance (style, format, constraints)
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g., Draft a one-page brief with three takeaways and a list of open questions."
            rows={3}
            className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={!query.trim() || scope.length === 0 || generating}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </section>

      {/* ── Answer + save ─────────────────────────────────────────────── */}
      {genError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {genError}
        </div>
      )}

      {generating && (
        <div className="flex flex-col items-center gap-3 text-gray-400 py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
          <p className="text-sm">Reading {scope.length} notes and composing answer…</p>
        </div>
      )}

      {resolvedAnswer && response && (
        <section className="flex flex-col gap-3">
          <div className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white px-6 py-5">
            <MarkdownWithMermaid>{resolvedAnswer}</MarkdownWithMermaid>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as note"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
