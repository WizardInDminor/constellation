/**
 * Pure helpers for the Open Threads & Pending Payoffs dashboard (ADR-089).
 *
 * The aggregation is server-side; these are the small testable pieces the
 * ThreadsPanel needs — total open count and an empty check.
 */

export interface ThreadsLike {
  open_questions: unknown[];
  pending_payoffs: unknown[];
  unresolved_tensions: unknown[];
}

/** Total number of items needing attention across all three buckets. */
export function threadsTotal(t: ThreadsLike): number {
  return (
    t.open_questions.length +
    t.pending_payoffs.length +
    t.unresolved_tensions.length
  );
}

export function threadsIsEmpty(t: ThreadsLike): boolean {
  return threadsTotal(t) === 0;
}
