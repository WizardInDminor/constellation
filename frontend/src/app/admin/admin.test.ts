import { describe, expect, it } from "vitest";

import type { EmbeddingJob } from "@/lib/api";
import { applyOptimisticRetry, relativeTime, secondsUntil } from "./helpers";

function job(id: string, status: EmbeddingJob["status"], extra: Partial<EmbeddingJob> = {}): EmbeddingJob {
  return {
    id,
    node_id: `n-${id}`,
    node_title: `Note ${id}`,
    status,
    target_model: "voyage-4",
    error: status === "failed" ? "boom" : null,
    attempt_count: 1,
    created_at: "2026-05-13T12:00:00Z",
    completed_at: status === "failed" || status === "complete" ? "2026-05-13T12:01:00Z" : null,
    ...extra,
  };
}

describe("applyOptimisticRetry", () => {
  it("flips the target job to pending and clears error/completed_at", () => {
    const jobs = [job("a", "failed"), job("b", "failed")];
    const next = applyOptimisticRetry(jobs, "a");
    expect(next[0]).toMatchObject({
      id: "a",
      status: "pending",
      error: null,
      completed_at: null,
    });
    expect(next[1]).toEqual(jobs[1]);
  });

  it("returns the original list when the id is missing", () => {
    const jobs = [job("a", "failed")];
    const next = applyOptimisticRetry(jobs, "z");
    expect(next).toEqual(jobs);
  });

  it("does not mutate the input array", () => {
    const jobs = [job("a", "failed")];
    const snapshot = JSON.parse(JSON.stringify(jobs));
    applyOptimisticRetry(jobs, "a");
    expect(jobs).toEqual(snapshot);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-05-13T12:00:00Z").getTime();

  it("returns 'never' for null", () => {
    expect(relativeTime(null, now)).toBe("never");
  });

  it("formats sub-minute deltas as seconds", () => {
    const past = new Date(now - 7_000).toISOString();
    expect(relativeTime(past, now)).toBe("7s ago");
  });

  it("formats minutes", () => {
    const past = new Date(now - 4 * 60_000).toISOString();
    expect(relativeTime(past, now)).toBe("4m ago");
  });

  it("formats hours", () => {
    const past = new Date(now - 3 * 3_600_000).toISOString();
    expect(relativeTime(past, now)).toBe("3h ago");
  });

  it("formats days", () => {
    const past = new Date(now - 2 * 86_400_000).toISOString();
    expect(relativeTime(past, now)).toBe("2d ago");
  });
});

describe("secondsUntil", () => {
  const now = new Date("2026-05-13T12:00:00Z").getTime();

  it("returns 0 for null / undefined", () => {
    expect(secondsUntil(null, now)).toBe(0);
    expect(secondsUntil(undefined, now)).toBe(0);
  });

  it("returns 0 for past timestamps", () => {
    const past = new Date(now - 5_000).toISOString();
    expect(secondsUntil(past, now)).toBe(0);
  });

  it("returns ceiling seconds until the future timestamp", () => {
    const future = new Date(now + 42_400).toISOString();
    expect(secondsUntil(future, now)).toBe(43);
  });

  it("returns 0 exactly at the timestamp", () => {
    const eq = new Date(now).toISOString();
    expect(secondsUntil(eq, now)).toBe(0);
  });
});
