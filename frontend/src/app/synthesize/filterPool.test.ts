import { describe, expect, it } from "vitest";

import type { NodeSummary } from "@/lib/api";
import { applyPoolFilters } from "./filterPool";

const NOW = new Date("2026-05-15T12:00:00Z").getTime();

function mkNode(id: string, tagIds: string[], createdDaysAgo: number): NodeSummary {
  const createdMs = NOW - createdDaysAgo * 24 * 60 * 60 * 1000;
  return {
    id,
    title: id,
    type: "permanent",
    summary: null,
    created_at: new Date(createdMs).toISOString(),
    updated_at: new Date(createdMs).toISOString(),
    processed_at: null,
    is_story_event: false,
    tags: tagIds.map((t) => ({ id: t, name: t, color: null })),
  };
}

describe("applyPoolFilters — tag mode", () => {
  const A_AND_B = mkNode("ab", ["a", "b"], 1);
  const A_ONLY = mkNode("a", ["a"], 1);
  const B_ONLY = mkNode("b", ["b"], 1);
  const NONE = mkNode("none", [], 1);
  const POOL = [A_AND_B, A_ONLY, B_ONLY, NONE];

  it("OR mode keeps any-match notes", () => {
    const result = applyPoolFilters(
      POOL,
      { selectedTagIds: new Set(["a", "b"]), recentDays: null, tagMode: "or" },
      NOW,
    );
    expect(result.map((n) => n.id).sort()).toEqual(["a", "ab", "b"]);
  });

  it("AND mode keeps only all-match notes", () => {
    const result = applyPoolFilters(
      POOL,
      { selectedTagIds: new Set(["a", "b"]), recentDays: null, tagMode: "and" },
      NOW,
    );
    expect(result.map((n) => n.id)).toEqual(["ab"]);
  });

  it("empty tag selection passes everything regardless of mode", () => {
    const or = applyPoolFilters(
      POOL,
      { selectedTagIds: new Set(), recentDays: null, tagMode: "or" },
      NOW,
    );
    const and = applyPoolFilters(
      POOL,
      { selectedTagIds: new Set(), recentDays: null, tagMode: "and" },
      NOW,
    );
    expect(or).toHaveLength(POOL.length);
    expect(and).toHaveLength(POOL.length);
  });
});

describe("applyPoolFilters — recency", () => {
  it("excludes notes older than recentDays", () => {
    const recent = mkNode("recent", [], 2);
    const old = mkNode("old", [], 10);
    const result = applyPoolFilters(
      [recent, old],
      { selectedTagIds: new Set(), recentDays: 7, tagMode: "or" },
      NOW,
    );
    expect(result.map((n) => n.id)).toEqual(["recent"]);
  });
});
