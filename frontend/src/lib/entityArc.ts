/**
 * Entity Arc presentation helpers (Phase C, ADR-081).
 *
 * Ordering is computed server-side (arc_repo); these are the small pure pieces
 * the EntityArc component needs — a per-appearance time label, a human label
 * for the ordering basis, and a "is this arc worth showing" predicate. Generic:
 * an appearance is any connected node, narrative or not.
 */

export type OrderingBasis = "timeline" | "chronological" | "mixed";

export interface ArcAppearanceLike {
  meaning?: string | null;
  story_time?: string | null;
  discourse_position?: number | null;
  created_at: string;
  is_pending?: boolean;
}

export interface EntityArcLike {
  ordering_basis: OrderingBasis;
  appearances: ArcAppearanceLike[];
}

export const ORDERING_BASIS_LABEL: Record<OrderingBasis, string> = {
  timeline: "Ordered by timeline position",
  chronological: "Ordered by when added",
  mixed: "Ordered by timeline, then when added",
};

/**
 * The time label shown on an appearance: the narrative `story_time` if present,
 * else the calendar date the connected node was added. Keeps the arc legible
 * for both story worlds (story_time) and research/learning corpora (created).
 */
export function appearanceTimeLabel(a: ArcAppearanceLike): string {
  if (a.story_time && a.story_time.trim()) return a.story_time.trim();
  const d = new Date(a.created_at);
  if (Number.isNaN(d.getTime())) return a.created_at;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** How many appearances carry an explicit interpretation (edge note). */
export function meaningCount(appearances: ArcAppearanceLike[]): number {
  return appearances.filter((a) => a.meaning && a.meaning.trim().length > 0)
    .length;
}

/** Future payoff points = pending (not-yet-written) appearances. */
export function pendingCount(appearances: ArcAppearanceLike[]): number {
  return appearances.filter((a) => a.is_pending).length;
}

/**
 * Worth rendering the arc panel? Show it once there's a sequence to see — two+
 * appearances, or at least one appearance carrying an interpretation. A lone
 * connection with no note tells no story of change.
 */
export function arcIsMeaningful(arc: EntityArcLike): boolean {
  if (arc.appearances.length >= 2) return true;
  return meaningCount(arc.appearances) > 0;
}
