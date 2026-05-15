import type { NodeSummary } from "@/lib/api";

export type TagMode = "or" | "and";

export interface PoolFilters {
  selectedTagIds: Set<string>;
  recentDays: number | null;
  tagMode: TagMode;
}

function isWithinDays(iso: string, days: number, now: number): boolean {
  const ms = now - new Date(iso).getTime();
  return ms <= days * 24 * 60 * 60 * 1000;
}

export function applyPoolFilters(
  pool: NodeSummary[],
  filters: PoolFilters,
  now: number = Date.now(),
): NodeSummary[] {
  return pool.filter((n) => {
    if (
      filters.recentDays !== null &&
      !isWithinDays(n.created_at, filters.recentDays, now)
    ) {
      return false;
    }

    if (filters.selectedTagIds.size === 0) return true;

    const noteTagIds = new Set(n.tags.map((t) => t.id));
    if (filters.tagMode === "and") {
      for (const id of filters.selectedTagIds) {
        if (!noteTagIds.has(id)) return false;
      }
      return true;
    }
    // OR (default): at least one selected tag must be present
    for (const id of filters.selectedTagIds) {
      if (noteTagIds.has(id)) return true;
    }
    return false;
  });
}
