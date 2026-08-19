"use client";

/**
 * ThreadsPanel — project-wide Open Threads & Pending Payoffs (ADR-089).
 *
 * Generic situational awareness: what in this project is still unresolved
 * (open/developing lifecycle nodes + unresolved tension edges) and what is set
 * up but not yet paid off (planned story events). Works for research, learning,
 * and narrative projects alike.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  type ProjectScope,
  type ProjectThreads,
  getProjectThreads,
} from "@/lib/api";
import { threadsIsEmpty, threadsTotal } from "./threads";

interface Props {
  scope: ProjectScope;
}

export function ThreadsPanel({ scope }: Props) {
  const [threads, setThreads] = useState<ProjectThreads | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThreads(null);
    getProjectThreads(scope.hub_node_id)
      .then((t) => !cancelled && setThreads(t))
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Failed to load threads"),
      );
    return () => {
      cancelled = true;
    };
  }, [scope.hub_node_id]);

  if (error) return <div className="alert-error">{error}</div>;
  if (threads === null) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton h-6 w-1/3" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="section-label">Open threads &amp; pending payoffs</h2>
        <p className="mt-1 text-xs text-gray-500">
          What&rsquo;s still unresolved in this project, and what&rsquo;s set up
          but not yet paid off. {threadsTotal(threads)} item
          {threadsTotal(threads) === 1 ? "" : "s"} need attention.
        </p>
      </div>

      {threadsIsEmpty(threads) ? (
        <div className="empty-state">
          <p className="text-sm font-medium text-gray-700">All clear</p>
          <p className="text-xs text-gray-500">
            No open questions, unresolved tensions, or pending payoffs in scope.
          </p>
        </div>
      ) : (
        <>
          <ThreadSection
            title="Open questions"
            count={threads.open_questions.length}
            accent="bg-yellow-100 text-yellow-800"
            empty="No open or developing questions."
          >
            {threads.open_questions.map((q) => (
              <ItemRow
                key={q.node.id}
                id={q.node.id}
                title={q.node.title}
                badge={q.status ?? undefined}
                badgeClass="bg-yellow-100 text-yellow-800"
              />
            ))}
          </ThreadSection>

          <ThreadSection
            title="Unresolved tensions"
            count={threads.unresolved_tensions.length}
            accent="bg-red-100 text-red-800"
            empty="No unresolved contradictions or questions."
          >
            {threads.unresolved_tensions.map((t) => (
              <li key={t.edge_id} className="px-3 py-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/nodes/${t.from_node.id}`}
                    className="truncate text-indigo-600 hover:underline"
                  >
                    {t.from_node.title}
                  </Link>
                  <span className="shrink-0 font-mono text-[10px] text-red-600">
                    {t.type.toLowerCase()}
                  </span>
                  <Link
                    href={`/nodes/${t.to_node.id}`}
                    className="truncate text-indigo-600 hover:underline"
                  >
                    {t.to_node.title}
                  </Link>
                </div>
                {t.note && (
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">
                    {t.note}
                  </p>
                )}
              </li>
            ))}
          </ThreadSection>

          <ThreadSection
            title="Pending payoffs"
            count={threads.pending_payoffs.length}
            accent="bg-amber-100 text-amber-800"
            empty="No planned-but-unwritten events."
          >
            {threads.pending_payoffs.map((p) => (
              <ItemRow
                key={p.node.id}
                id={p.node.id}
                title={p.node.title}
                badge="planned"
                badgeClass="bg-amber-100 text-amber-800"
              />
            ))}
          </ThreadSection>
        </>
      )}
    </div>
  );
}

function ThreadSection({
  title,
  count,
  accent,
  empty,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-0">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
        <span className={`badge ml-auto ${accent}`}>{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-2 text-xs text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">{children}</ul>
      )}
    </section>
  );
}

function ItemRow({
  id,
  title,
  badge,
  badgeClass,
}: {
  id: string;
  title: string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
      <Link
        href={`/nodes/${id}`}
        className="truncate text-indigo-600 hover:underline"
        title={title}
      >
        {title}
      </Link>
      {badge && (
        <span className={`badge shrink-0 ${badgeClass ?? ""}`}>{badge}</span>
      )}
    </li>
  );
}
