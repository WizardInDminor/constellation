"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAdminStatus,
  getEmbeddingJobs,
  retryAllFailedEmbeddingJobs,
  retryEmbeddingJob,
} from "@/lib/api";
import type { AdminStatus, EmbeddingJob } from "@/lib/api";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { applyOptimisticRetry, relativeTime, secondsUntil } from "./helpers";

const POLL_INTERVAL_MS = 5_000;

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [failed, setFailed] = useState<EmbeddingJob[]>([]);
  const [pending, setPending] = useState<EmbeddingJob[]>([]);
  const [complete, setComplete] = useState<EmbeddingJob[]>([]);
  const [completeCount, setCompleteCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [showCompletions, setShowCompletions] = useState(false);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const [s, f, p, c] = await Promise.all([
        getAdminStatus(),
        getEmbeddingJobs("failed"),
        getEmbeddingJobs("pending"),
        getEmbeddingJobs("complete"),
      ]);
      setStatus(s);
      setFailed(f.items);
      setPending(p.items);
      const sortedComplete = [...c.items].sort((a, b) => {
        const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tb - ta;
      });
      setComplete(sortedComplete.slice(0, 10));
      setCompleteCount(c.counts.complete);
      setError(null);
    } catch {
      setError("Could not reach the backend. Is it running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  usePollWhileVisible(() => {
    refresh();
    setNow(Date.now());
  }, POLL_INTERVAL_MS);

  async function handleRetry(jobId: string) {
    setRetryingIds((prev) => new Set(prev).add(jobId));
    setFailed((prev) => applyOptimisticRetry(prev, jobId));
    try {
      await retryEmbeddingJob(jobId);
      await refresh();
    } catch {
      await refresh();
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  async function handleRetryAll() {
    if (failed.length === 0) return;
    if (!confirm(`Retry all ${failed.length} failed jobs?`)) return;
    setRetryingAll(true);
    setFailed((prev) =>
      prev.map((j) => ({ ...j, status: "pending", error: null, completed_at: null })),
    );
    try {
      await retryAllFailedEmbeddingJobs();
      await refresh();
    } catch {
      await refresh();
    } finally {
      setRetryingAll(false);
    }
  }

  if (error && !status) {
    return <div className="text-red-600 text-sm">{error}</div>;
  }

  const failedCount = status?.failed_jobs ?? failed.length;
  const pendingCount = status?.pending_jobs ?? pending.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Admin</h2>
        <span className="text-xs text-gray-400">
          Auto-refreshes every {POLL_INTERVAL_MS / 1000}s while visible
        </span>
      </div>

      <StatusBar
        status={status}
        completeCount={completeCount}
        loading={loading}
        now={now}
      />

      {error && status && (
        <p className="text-xs text-amber-600">Refresh failed: {error}</p>
      )}

      {failedCount > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-red-700">
              Failed ({failedCount})
            </h3>
            <button
              onClick={handleRetryAll}
              disabled={retryingAll || failed.length === 0}
              className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {retryingAll ? "Retrying…" : "Retry all failed"}
            </button>
          </div>
          <JobsTable
            jobs={failed}
            columns={[
              { key: "title", label: "Note" },
              { key: "error", label: "Error" },
              { key: "attempt_count", label: "Attempts" },
              { key: "failed_at", label: "Failed" },
            ]}
            rowAction={(job) => (
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => handleRetry(job.id)}
                  disabled={retryingIds.has(job.id) || job.status !== "failed"}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {retryingIds.has(job.id) || job.status !== "failed" ? "Queued" : "Retry"}
                </button>
                <button
                  onClick={() => setOpenNodeId(job.node_id)}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Open note
                </button>
              </div>
            )}
            now={now}
            emptyText="No failed jobs."
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Pending ({pendingCount})
        </h3>
        <JobsTable
          jobs={pending}
          columns={[
            { key: "title", label: "Note" },
            { key: "target_model", label: "Target model" },
            { key: "queued_at", label: "Queued" },
          ]}
          rowAction={(job) => (
            <button
              onClick={() => setOpenNodeId(job.node_id)}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              Open note
            </button>
          )}
          now={now}
          emptyText="No pending jobs."
        />
      </section>

      <section className="flex flex-col gap-2">
        <button
          onClick={() => setShowCompletions((v) => !v)}
          className="self-start text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          {showCompletions ? "▾" : "▸"} Recent completions ({completeCount})
        </button>
        {showCompletions && (
          <JobsTable
            jobs={complete}
            columns={[
              { key: "title", label: "Note" },
              { key: "target_model", label: "Model" },
              { key: "completed_at", label: "Completed" },
            ]}
            rowAction={(job) => (
              <button
                onClick={() => setOpenNodeId(job.node_id)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Open note
              </button>
            )}
            now={now}
            emptyText="No completions yet."
          />
        )}
      </section>

      <NodeDetailDrawer nodeId={openNodeId} onClose={() => setOpenNodeId(null)} />
    </div>
  );
}

function StatusBar({
  status,
  completeCount,
  loading,
  now,
}: {
  status: AdminStatus | null;
  completeCount: number;
  loading: boolean;
  now: number;
}) {
  if (loading && !status) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
        Loading…
      </div>
    );
  }
  if (!status) return null;
  const cooldownSecs = secondsUntil(status.cooldown_until, now);
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <StatusPill label="Pending" value={status.pending_jobs} tone="amber" />
        <StatusPill label="Failed" value={status.failed_jobs} tone="red" />
        <StatusPill label="Complete" value={completeCount} tone="green" />
        <span className="text-gray-500 ml-auto">
          Last drain {relativeTime(status.last_drain_at, now)}
          <span className="text-gray-400"> · {status.drain_count} cycles</span>
        </span>
      </div>
      {cooldownSecs > 0 && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          Rate-limited — next attempt in {cooldownSecs}s
        </div>
      )}
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green";
}) {
  const accent =
    value === 0
      ? "text-gray-500"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-green-700";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-semibold ${accent}`}>{value}</span>
      <span className="text-gray-500">{label.toLowerCase()}</span>
    </span>
  );
}

type ColumnKey =
  | "title"
  | "error"
  | "attempt_count"
  | "queued_at"
  | "failed_at"
  | "completed_at"
  | "target_model";

interface Column {
  key: ColumnKey;
  label: string;
}

function JobsTable({
  jobs,
  columns,
  rowAction,
  now,
  emptyText,
}: {
  jobs: EmbeddingJob[];
  columns: Column[];
  rowAction: (job: EmbeddingJob) => React.ReactNode;
  now: number;
  emptyText: string;
}) {
  if (jobs.length === 0) {
    return <p className="text-xs text-gray-400 italic">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden bg-white">
        <thead>
          <tr className="text-xs text-gray-500 bg-gray-50">
            {columns.map((c) => (
              <th key={c.key} className="text-left font-medium px-3 py-2">
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-gray-100 align-top">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-gray-700">
                  {renderCell(job, c.key, now)}
                </td>
              ))}
              <td className="px-3 py-2 text-right">{rowAction(job)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(job: EmbeddingJob, key: ColumnKey, now: number): React.ReactNode {
  switch (key) {
    case "title":
      return <span className="font-medium text-gray-900">{job.node_title}</span>;
    case "error":
      return (
        <span className="text-xs text-red-700 line-clamp-2" title={job.error ?? ""}>
          {job.error ?? "—"}
        </span>
      );
    case "attempt_count":
      return <span className="tabular-nums">{job.attempt_count}</span>;
    case "target_model":
      return <span className="text-xs text-gray-500 font-mono">{job.target_model}</span>;
    case "queued_at":
      return <span className="text-xs text-gray-500">{relativeTime(job.created_at, now)}</span>;
    case "failed_at":
      return (
        <span className="text-xs text-gray-500">
          {relativeTime(job.completed_at ?? job.created_at, now)}
        </span>
      );
    case "completed_at":
      return <span className="text-xs text-gray-500">{relativeTime(job.completed_at, now)}</span>;
  }
}
