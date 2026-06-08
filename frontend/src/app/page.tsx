"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getActivity, getStats } from "@/lib/api";
import type {
  ActivityFeed,
  CorpusStats,
  NodeSummary,
  RecentEdge,
} from "@/lib/api";

const TYPE_ACCENTS: Record<string, string> = {
  fleeting: "text-amber-700",
  permanent: "text-green-700",
  literature: "text-blue-700",
  structure: "text-purple-700",
};

const TYPE_CHIP: Record<string, string> = {
  fleeting: "bg-amber-100 text-amber-700",
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
  source: "bg-teal-100 text-teal-700",
};

const TYPE_CHIP_FALLBACK = "bg-gray-100 text-gray-600";

const TYPE_ORDER = [
  "fleeting",
  "permanent",
  "literature",
  "structure",
] as const;

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
    <div
      className={`${href ? "card-interactive" : "card"} p-4 flex flex-col gap-1 h-full`}
    >
      <span className="section-label">{label}</span>
      <span className={`text-2xl font-semibold ${accent ?? "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ActivityNodeRow({
  node,
  timestamp,
}: {
  node: NodeSummary;
  timestamp: string;
}) {
  return (
    <Link
      href={`/nodes/${node.id}`}
      className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition-colors"
    >
      <span className="text-sm truncate flex-1 text-gray-800">
        {node.title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`badge ${TYPE_CHIP[node.type] ?? TYPE_CHIP_FALLBACK}`}>
          {node.type}
        </span>
        <span
          className="text-xs text-gray-400 w-12 text-right"
          title={timestamp}
        >
          {formatRelative(timestamp)}
        </span>
      </div>
    </Link>
  );
}

function ActivityEdgeRow({ edge }: { edge: RecentEdge }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href={`/nodes/${edge.from_node.id}`}
          className="truncate text-gray-800 hover:text-indigo-700"
        >
          {edge.from_node.title}
        </Link>
        <span className="text-xs font-mono text-gray-400 shrink-0">
          {edge.type}
        </span>
        <Link
          href={`/nodes/${edge.to_node.id}`}
          className="truncate text-gray-800 hover:text-indigo-700"
        >
          {edge.to_node.title}
        </Link>
      </div>
      <span
        className="text-xs text-gray-400 w-12 text-right shrink-0"
        title={edge.created_at}
      >
        {formatRelative(edge.created_at)}
      </span>
    </div>
  );
}

function ActivitySection({
  title,
  seeAllHref,
  isEmpty,
  emptyCopy,
  children,
}: {
  title: string;
  seeAllHref?: string;
  isEmpty: boolean;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="section-label">{title}</h3>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            See all →
          </Link>
        )}
      </div>
      {isEmpty ? (
        <div className="empty-state py-8">
          <p className="text-sm text-gray-500">{emptyCopy}</p>
        </div>
      ) : (
        <div className="card p-2 flex flex-col">{children}</div>
      )}
    </section>
  );
}

export default function Home() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load stats"),
      );
    getActivity()
      .then(setActivity)
      .catch(() => {
        // Non-fatal — page still renders without the activity sections
      });
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="page-title text-2xl">Constellation</h1>
        <p className="text-sm text-gray-500">
          Press{" "}
          <kbd className="bg-white border border-gray-200 shadow-sm px-1.5 py-0.5 rounded text-xs font-mono">
            Ctrl+K
          </kbd>{" "}
          to capture a thought.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {!stats && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="section-label">Notes</h2>
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
            <h2 className="section-label">Graph</h2>
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

          {activity && (
            <section className="flex flex-col gap-5">
              <h2 className="section-label">
                Last {activity.window_days} days
              </h2>

              <ActivitySection
                title="Recently captured"
                seeAllHref="/inbox"
                isEmpty={activity.captured.length === 0}
                emptyCopy="No fleeting notes captured this week."
              >
                {activity.captured.map((n) => (
                  <ActivityNodeRow
                    key={n.id}
                    node={n}
                    timestamp={n.created_at}
                  />
                ))}
              </ActivitySection>

              <ActivitySection
                title="Recently edited"
                seeAllHref="/notes"
                isEmpty={activity.edited.length === 0}
                emptyCopy="No notes edited this week."
              >
                {activity.edited.map((n) => (
                  <ActivityNodeRow
                    key={n.id}
                    node={n}
                    timestamp={n.updated_at}
                  />
                ))}
              </ActivitySection>

              <ActivitySection
                title="Recent connections"
                seeAllHref="/graph"
                isEmpty={activity.edges.length === 0}
                emptyCopy="No new edges this week."
              >
                {activity.edges.map((e) => (
                  <ActivityEdgeRow key={e.id} edge={e} />
                ))}
              </ActivitySection>
            </section>
          )}

          <p className="text-xs text-gray-400">
            Last processed: {formatRelative(stats.last_processed_at)}
          </p>
        </>
      )}
    </div>
  );
}
