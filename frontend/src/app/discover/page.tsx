"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listBridges, listOrphans, listStale } from "@/lib/api";
import type { BridgeCandidate, NodeSummary, TagRef } from "@/lib/api";

type Tab = "orphans" | "stale" | "bridges";

const TAB_LABELS: Record<Tab, string> = {
  orphans: "Orphans",
  stale: "Stale",
  bridges: "Bridges",
};

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  orphans: "Notes with zero edges. Linking even one of these to an existing note pulls them into the graph.",
  stale: "Notes you haven't touched in a while. Worth a re-read or a fresh link.",
  bridges:
    "Pairs of notes that look semantically related but aren't linked. Decide whether each pair belongs together.",
};

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
  fleeting: "bg-amber-100 text-amber-700",
};

function TagChip({ tag }: { tag: TagRef }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
      style={tag.color ? { backgroundColor: tag.color + "33", color: tag.color } : undefined}
    >
      {tag.name}
    </span>
  );
}

function NoteCard({ node, hint }: { node: NodeSummary; hint?: string }) {
  return (
    <li>
      <Link
        href={`/nodes/${node.id}`}
        className="flex items-start justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
      >
        <div className="flex flex-col gap-1 min-w-0 pr-4">
          <span className="font-medium text-sm truncate">{node.title}</span>
          {node.summary && (
            <span className="text-xs text-gray-500 line-clamp-2">{node.summary}</span>
          )}
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
          {node.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {node.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
      </Link>
    </li>
  );
}

function BridgeCard({ pair }: { pair: BridgeCandidate }) {
  const pct = Math.round(pair.similarity * 100);
  return (
    <li className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">Similarity</span>
        <span className="text-xs font-mono text-indigo-600">{pct}%</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/nodes/${pair.node_a.id}`}
          className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
        >
          <span className="font-medium text-sm truncate">{pair.node_a.title}</span>
          <span
            className={`self-start text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[pair.node_a.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_a.type}
          </span>
        </Link>
        <Link
          href={`/nodes/${pair.node_b.id}`}
          className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
        >
          <span className="font-medium text-sm truncate">{pair.node_b.title}</span>
          <span
            className={`self-start text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[pair.node_b.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_b.type}
          </span>
        </Link>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Open either note to add an edge between them via the link picker.
      </p>
    </li>
  );
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("orphans");
  const [orphans, setOrphans] = useState<NodeSummary[] | null>(null);
  const [stale, setStale] = useState<NodeSummary[] | null>(null);
  const [bridges, setBridges] = useState<BridgeCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (tab === "orphans" && orphans === null) {
          const data = await listOrphans({ limit: 50 });
          if (!cancelled) setOrphans(data);
        } else if (tab === "stale" && stale === null) {
          const data = await listStale({ limit: 50 });
          if (!cancelled) setStale(data);
        } else if (tab === "bridges" && bridges === null) {
          const data = await listBridges({ limit: 30, minSimilarity: 0.7 });
          if (!cancelled) setBridges(data);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, orphans, stale, bridges]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Discover</h2>
        <p className="text-sm text-gray-500 mt-1">
          Re-encounter notes you've forgotten or never linked.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-600">{TAB_DESCRIPTIONS[tab]}</p>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {tab === "orphans" && (
        <>
          {loading && orphans === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orphans && orphans.length === 0 ? (
            <p className="text-sm text-gray-400">
              No orphan notes — every note in your knowledge base is linked.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orphans?.map((n) => <NoteCard key={n.id} node={n} />)}
            </ul>
          )}
        </>
      )}

      {tab === "stale" && (
        <>
          {loading && stale === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : stale && stale.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stale?.map((n) => (
                <NoteCard
                  key={n.id}
                  node={n}
                  hint={`updated ${fmtAge(n.updated_at)}`}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "bridges" && (
        <>
          {loading && bridges === null ? (
            <p className="text-sm text-gray-400">
              Scanning embeddings — this can take a moment on large corpora.
            </p>
          ) : bridges && bridges.length === 0 ? (
            <p className="text-sm text-gray-400">
              No bridge candidates found. Try lowering the similarity threshold or adding more notes.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bridges?.map((br) => (
                <BridgeCard key={`${br.node_a.id}-${br.node_b.id}`} pair={br} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
