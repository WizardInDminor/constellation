"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStats } from "@/lib/api";
import type { CorpusStats } from "@/lib/api";

const TYPE_ACCENTS: Record<string, string> = {
  fleeting: "text-amber-700",
  permanent: "text-green-700",
  literature: "text-blue-700",
  structure: "text-purple-700",
};

const TYPE_ORDER = ["fleeting", "permanent", "literature", "structure"] as const;

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function Tile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  href?: string;
  accent?: string;
}) {
  const body = (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1 hover:border-indigo-200 transition-colors">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-semibold ${accent ?? "text-gray-900"}`}>{value}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Home() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats"));
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Constellation</h1>
        <p className="text-sm text-gray-500">
          Press{" "}
          <kbd className="bg-white border border-gray-200 shadow-sm px-1.5 py-0.5 rounded text-xs font-mono">
            Ctrl+K
          </kbd>{" "}
          to capture a thought.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}

      {!stats && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TYPE_ORDER.map((t) => (
                <Tile
                  key={t}
                  label={t}
                  value={stats.nodes_by_type[t] ?? 0}
                  href={`/notes?type=${t}`}
                  accent={TYPE_ACCENTS[t]}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Graph</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Edges" value={stats.edges} href="/graph" />
              <Tile label="Sources" value={stats.sources} href="/sources" />
              <Tile label="Tags" value={stats.tags} />
              <Tile
                label="Inbox"
                value={stats.inbox}
                href="/inbox"
                accent={stats.inbox > 0 ? "text-amber-700" : undefined}
              />
            </div>
          </section>

          <p className="text-xs text-gray-400">
            Last processed: {formatRelative(stats.last_processed_at)}
          </p>
        </>
      )}
    </div>
  );
}
