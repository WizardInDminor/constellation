import type { EmbeddingJob } from "@/lib/api";

export function relativeTime(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return "never";
  const diffMs = nowMs - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function applyOptimisticRetry(jobs: EmbeddingJob[], jobId: string): EmbeddingJob[] {
  return jobs.map((j) =>
    j.id === jobId ? { ...j, status: "pending", error: null, completed_at: null } : j,
  );
}

export function secondsUntil(iso: string | null | undefined, nowMs: number = Date.now()): number {
  if (!iso) return 0;
  const diffMs = new Date(iso).getTime() - nowMs;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 1000);
}
