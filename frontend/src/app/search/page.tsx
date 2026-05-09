"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchHybrid, searchSemantic, searchFulltext } from "@/lib/api";
import type { SearchResult } from "@/lib/api";

type SearchMode = "hybrid" | "semantic" | "fulltext";

const MODE_LABELS: Record<SearchMode, string> = {
  hybrid: "Hybrid",
  semantic: "Semantic",
  fulltext: "Fulltext",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  permanent: "bg-blue-100 text-blue-800",
  literature: "bg-purple-100 text-purple-800",
  structure: "bg-green-100 text-green-800",
  fleeting: "bg-yellow-100 text-yellow-800",
};

function ResultCard({ result }: { result: SearchResult }) {
  const { node } = result;
  return (
    <Link
      href={`/nodes/${node.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-gray-900 leading-snug">{node.title}</h3>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${NODE_TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-700"}`}
        >
          {node.type}
        </span>
      </div>
      {node.summary && (
        <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">{node.summary}</p>
      )}
      {node.tags && node.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full px-2 py-0.5 text-xs"
              style={t.color ? { backgroundColor: t.color + "33", color: t.color } : { backgroundColor: "#e5e7eb", color: "#374151" }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </Link>
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
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (q: string, m: SearchMode) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const fn = m === "semantic" ? searchSemantic : m === "fulltext" ? searchFulltext : searchHybrid;
        const res = await fn(q);
        setResults(res.results);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Search</h1>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your notes…"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {/* Mode toggle */}
      <div className="mt-3 flex gap-1">
        {(["hybrid", "semantic", "fulltext"] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">
          {mode === "hybrid" && "Vector + fulltext combined"}
          {mode === "semantic" && "Vector similarity"}
          {mode === "fulltext" && "Keyword match · works offline"}
        </span>
      </div>

      {/* Results */}
      <div className="mt-6">
        {loading && (
          <div className="flex justify-center py-12 text-gray-400 text-sm">Searching…</div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && results !== null && results.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            No results for &ldquo;{params.get("q")}&rdquo;
            {mode !== "fulltext" && (
              <span>
                {" — try "}
                <button
                  className="text-blue-600 underline"
                  onClick={() => switchMode("fulltext")}
                >
                  fulltext
                </button>
              </span>
            )}
          </div>
        )}
        {!loading && results && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{results.length} result{results.length !== 1 ? "s" : ""}</p>
            {results.map((r) => (
              <ResultCard key={r.node.id} result={r} />
            ))}
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
