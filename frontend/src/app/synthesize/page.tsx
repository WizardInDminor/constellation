"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NoteContent } from "@/components/NoteContent";
import {
  listNodes,
  listTags,
  ragScoped,
  saveAnswer,
  searchHybrid,
} from "@/lib/api";
import { resolveCitations } from "@/lib/citations";
import type { NodeRef, NodeSummary, RagResponse, TagRef } from "@/lib/api";
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
        setLoadError(
          err instanceof Error ? err.message : "Failed to load notes",
        );
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="page-title mb-1.5">Synthesize</h1>
        <p className="text-sm text-gray-500">
          Pick a subset of your notes, give a guiding prompt, and let Claude
          distill them into an artifact you can save.
        </p>
      </div>

      {loadError && <div className="alert-error">{loadError}</div>}

      {/* ── Filters + search ─────────────────────────────────────────── */}
      <section className="card flex flex-col gap-4 p-4">
        <h2 className="section-label">Build your scope</h2>

        {/* Recency */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1">Created within</span>
          {[null, 1, 7, 30, 90].map((d) => (
            <button
              key={String(d)}
              type="button"
              onClick={() => setRecentDays(d)}
              aria-pressed={recentDays === d}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                recentDays === d
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
              }`}
            >
              {d === null ? "Any time" : `${d} day${d === 1 ? "" : "s"}`}
            </button>
          ))}
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label mr-1">Tags</span>
            {allTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                aria-pressed={selectedTagIds.has(t.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  selectedTagIds.has(t.id)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                }`}
              >
                {t.name}
              </button>
            ))}
            {selectedTagIds.size > 1 && (
              <div
                role="group"
                aria-label="Tag match mode"
                className="ml-auto inline-flex items-center overflow-hidden rounded-full border border-gray-200 text-xs"
                title="OR: a note needs any selected tag. AND: a note needs all of them."
              >
                <button
                  type="button"
                  onClick={() => setTagMode("or")}
                  aria-pressed={tagMode === "or"}
                  className={`px-2.5 py-1 ${
                    tagMode === "or"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-500 hover:text-gray-800"
                  }`}
                >
                  any
                </button>
                <button
                  type="button"
                  onClick={() => setTagMode("and")}
                  aria-pressed={tagMode === "and"}
                  className={`border-l border-gray-200 px-2.5 py-1 ${
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
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {filteredPool.length} note{filteredPool.length !== 1 ? "s" : ""}{" "}
              match
            </span>
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filteredPool.length === 0}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
            >
              Add all to scope
            </button>
          </div>
          {filteredPool.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center text-xs text-gray-400">
              No notes match these filters.
            </p>
          ) : (
            <ul className="scrollbar-thin flex max-h-48 flex-col gap-1 overflow-y-auto">
              {filteredPool.slice(0, 50).map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-3 py-0.5 text-sm"
                >
                  <Link
                    href={`/nodes/${n.id}`}
                    className="truncate text-gray-700 hover:text-indigo-700"
                    target="_blank"
                  >
                    {n.title}
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      addToScope({ id: n.id, title: n.title, type: n.type })
                    }
                    disabled={scopeIds.has(n.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:font-normal disabled:text-gray-300"
                  >
                    {scopeIds.has(n.id) ? "added" : "+ add"}
                  </button>
                </li>
              ))}
              {filteredPool.length > 50 && (
                <li className="py-0.5 text-xs italic text-gray-400">
                  {filteredPool.length - 50} more — narrow filters to see them
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Search-add */}
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
          <label htmlFor="synth-search" className="section-label">
            Search to add a specific note
          </label>
          <div className="flex gap-2">
            <input
              id="synth-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Search to add a specific note…"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={!searchQuery.trim() || searching}
              className="btn btn-secondary"
            >
              {searching && (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
                />
              )}
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="scrollbar-thin flex max-h-32 flex-col gap-1 overflow-y-auto">
              {searchResults.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-gray-700">{r.title}</span>
                  <button
                    type="button"
                    onClick={() => addToScope(r)}
                    disabled={scopeIds.has(r.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:font-normal disabled:text-gray-300"
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
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Scope ({scope.length})</h2>
          {scope.length > 0 && (
            <button
              type="button"
              onClick={clearScope}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
        {scope.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center text-xs text-gray-400">
            No notes selected yet. Use the filters or search above.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {scope.map((n) => (
              <li
                key={n.id}
                className={`flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs ${TYPE_COLORS[n.type] ?? "bg-gray-100"}`}
              >
                <span className="max-w-[18rem] truncate">{n.title}</span>
                <button
                  type="button"
                  onClick={() => removeFromScope(n.id)}
                  className="text-base leading-none text-gray-500 hover:text-gray-800"
                  aria-label={`Remove ${n.title} from scope`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Query + custom prompt + generate ──────────────────────────── */}
      <section className="card flex flex-col gap-4 p-4">
        <h2 className="section-label">Question and guidance</h2>
        <div>
          <label htmlFor="synth-question" className="label">
            Question
          </label>
          <input
            id="synth-question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What should the LLM answer using these notes?"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="synth-guidance" className="label">
            Optional guidance (style, format, constraints)
          </label>
          <textarea
            id="synth-guidance"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g., Draft a one-page brief with three takeaways and a list of open questions."
            rows={3}
            className="textarea resize-none"
          />
          {scope.length === 0 && (
            <p className="field-hint">
              Add at least one note to your scope to generate.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!query.trim() || scope.length === 0 || generating}
            className="btn btn-primary px-5 py-2"
          >
            {generating && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </section>

      {/* ── Answer + save ─────────────────────────────────────────────── */}
      {genError && <div className="alert-error">{genError}</div>}

      {generating && (
        <div className="flex flex-col items-center gap-3 py-6 text-gray-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
          <p className="text-sm">
            Reading {scope.length} note{scope.length !== 1 ? "s" : ""} and
            composing answer…
          </p>
        </div>
      )}

      {resolvedAnswer && response && (
        <section className="flex flex-col gap-3">
          <div className="card prose prose-sm max-w-none break-words px-6 py-5">
            <NoteContent content={resolvedAnswer} />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-secondary border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              {saving && (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600"
                />
              )}
              {saving ? "Saving…" : "Save as note"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
