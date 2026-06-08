"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchHybrid, searchSemantic, searchFulltext } from "@/lib/api";
import type { SearchResult } from "@/lib/api";
import { NotePreviewPopover } from "@/components/NotePreviewPopover";

type SearchMode = "hybrid" | "semantic" | "fulltext";

const MODE_LABELS: Record<SearchMode, string> = {
  hybrid: "Hybrid",
  semantic: "Semantic",
  fulltext: "Fulltext",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-800",
  literature: "bg-blue-100 text-blue-800",
  structure: "bg-purple-100 text-purple-800",
  fleeting: "bg-amber-100 text-amber-800",
};

function ResultCard({ result }: { result: SearchResult }) {
  const { node } = result;
  const [showPreview, setShowPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        timer.current = setTimeout(() => setShowPreview(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setShowPreview(false);
      }}
    >
      <Link href={`/nodes/${node.id}`} className="card-interactive block p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium text-gray-900 leading-snug">
            {node.title}
          </h3>
          <span
            className={`badge shrink-0 ${NODE_TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-700"}`}
          >
            {node.type}
          </span>
        </div>
        {node.summary && (
          <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">
            {node.summary}
          </p>
        )}
        {node.tags && node.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {node.tags.map((t) => (
              <span
                key={t.id}
                className="badge"
                style={
                  t.color
                    ? { backgroundColor: t.color + "33", color: t.color }
                    : { backgroundColor: "#e5e7eb", color: "#374151" }
                }
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </Link>
      <NotePreviewPopover node={node} anchorRef={ref} visible={showPreview} />
    </div>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const initialQ = params.get("q") ?? "";
  const initialMode = (params.get("mode") as SearchMode) ?? "hybrid";

  const [query, setQuery] = useState(initialQ);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string, m: SearchMode) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const fn =
        m === "semantic"
          ? searchSemantic
          : m === "fulltext"
            ? searchFulltext
            : searchHybrid;
      const res = await fn(q);
      setResults(res.results);
      setActiveTypes(new Set());
      setActiveTags(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run search when URL params change (back/forward nav)
  useEffect(() => {
    const q = params.get("q") ?? "";
    const m = (params.get("mode") as SearchMode) ?? "hybrid";
    setQuery(q);
    setMode(m);
    if (q) doSearch(q, m);
  }, [params, doSearch]);

  const submit = (q: string, m: SearchMode) => {
    const p = new URLSearchParams({ q, mode: m });
    router.replace(`/search?${p}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) submit(query.trim(), mode);
  };

  const switchMode = (m: SearchMode) => {
    setMode(m);
    if (query.trim()) submit(query.trim(), m);
  };

  // Derive available filter options from current results
  const availableTypes = results
    ? Array.from(new Set(results.map((r) => r.node.type))).sort()
    : [];
  const tagMap = new Map<
    string,
    { id: string; name: string; color?: string | null }
  >();
  if (results) {
    for (const r of results) {
      for (const t of r.node.tags ?? []) {
        tagMap.set(t.id, t);
      }
    }
  }
  const availableTags = Array.from(tagMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const visibleResults = results
    ? results.filter(
        (r) =>
          (activeTypes.size === 0 || activeTypes.has(r.node.type)) &&
          (activeTags.size === 0 ||
            (r.node.tags ?? []).some((t) => activeTags.has(t.id))),
      )
    : null;

  const activeFilterCount = activeTypes.size + activeTags.size;

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleTag(tagId: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="page-title mb-6">Search</h1>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="search-query" className="sr-only">
          Search your notes
        </label>
        <input
          id="search-query"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your notes…"
          className="input flex-1"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="btn btn-primary px-5"
        >
          Search
        </button>
      </form>

      {/* Mode toggle */}
      <div
        className="mt-3 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Search mode"
      >
        {(["hybrid", "semantic", "fulltext"] as SearchMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-gray-400">
          {mode === "hybrid" && "Vector + fulltext combined"}
          {mode === "semantic" && "Vector similarity"}
          {mode === "fulltext" && "Keyword match · works offline"}
        </span>
      </div>

      {/* Filter panel — shown once results are available */}
      {!loading && results && results.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={activeTypes.has(type)}
                onClick={() => toggleType(type)}
                className={`text-xs px-3 py-0.5 rounded-full border transition-colors ${
                  activeTypes.has(type)
                    ? (NODE_TYPE_COLORS[type] ?? "bg-gray-200 text-gray-700") +
                      " border-transparent"
                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                }`}
              >
                {type}
              </button>
            ))}
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-pressed={activeTags.has(tag.id)}
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  activeTags.has(tag.id)
                    ? "border-transparent"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
                style={
                  activeTags.has(tag.id) && tag.color
                    ? { backgroundColor: tag.color + "33", color: tag.color }
                    : activeTags.has(tag.id)
                      ? { backgroundColor: "#e0e7ff", color: "#4338ca" }
                      : undefined
                }
              >
                {tag.name}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveTypes(new Set());
                  setActiveTags(new Set());
                }}
                className="btn btn-ghost btn-sm ml-1"
              >
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-6">
        {loading && (
          <div className="space-y-3" aria-busy="true" aria-label="Searching">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-4 w-16" />
                </div>
                <div className="skeleton mt-3 h-3 w-full" />
                <div className="skeleton mt-1.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && <div className="alert-error">{error}</div>}
        {!loading && !error && results === null && (
          <div className="empty-state">
            <p className="text-sm font-medium text-gray-600">
              Search your notes
            </p>
            <p className="text-sm text-gray-400">
              Enter a query above to find notes by meaning or keyword.
            </p>
          </div>
        )}
        {!loading && !error && results !== null && results.length === 0 && (
          <div className="empty-state">
            <p className="text-sm font-medium text-gray-600">
              No results for &ldquo;{params.get("q")}&rdquo;
            </p>
            {mode !== "fulltext" && (
              <p className="text-sm text-gray-400">
                Try a{" "}
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:underline"
                  onClick={() => switchMode("fulltext")}
                >
                  fulltext
                </button>{" "}
                search instead.
              </p>
            )}
          </div>
        )}
        {!loading && visibleResults && visibleResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              {activeFilterCount > 0
                ? `${visibleResults.length} of ${results!.length} result${results!.length !== 1 ? "s" : ""}`
                : `${visibleResults.length} result${visibleResults.length !== 1 ? "s" : ""}`}
            </p>
            {visibleResults.map((r) => (
              <ResultCard key={r.node.id} result={r} />
            ))}
          </div>
        )}
        {!loading &&
          visibleResults &&
          visibleResults.length === 0 &&
          results &&
          results.length > 0 && (
            <div className="empty-state">
              <p className="text-sm text-gray-400">
                No results match the active filters.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
