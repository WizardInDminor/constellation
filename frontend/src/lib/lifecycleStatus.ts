/**
 * Lifecycle status via reserved `status:*` tags (Phase B, Objective 2).
 *
 * GENERIC, not narrative-only: an Open Question, a research hypothesis, or any
 * node with an unresolved → resolved trajectory can carry a lifecycle status.
 * Modelled as reserved tags (no schema change), consistent with narrative:* and
 * layer:* conventions. Resolution of the *relationship* (which scene/note
 * resolves it) stays on the QUESTIONS edge's resolved-state (ADR-059); this is
 * the coarse lifecycle state of the node itself.
 */

export type LifecycleStatus = "open" | "developing" | "resolved";

export const STATUS_PREFIX = "status:";

export const LIFECYCLE_STATUSES: LifecycleStatus[] = [
  "open",
  "developing",
  "resolved",
];

export interface StatusMeta {
  label: string;
  badge: string; // tailwind classes for a badge
  dot: string; // tailwind bg-* for a dot
}

export const STATUS_META: Record<LifecycleStatus, StatusMeta> = {
  open: {
    label: "Open",
    badge: "bg-yellow-100 text-yellow-800",
    dot: "bg-yellow-400",
  },
  developing: {
    label: "Developing",
    badge: "bg-blue-100 text-blue-800",
    dot: "bg-blue-500",
  },
  resolved: {
    label: "Resolved",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
  },
};

export function isStatusTag(name: string): boolean {
  return name.startsWith(STATUS_PREFIX);
}

export function statusTagName(status: LifecycleStatus): string {
  return `${STATUS_PREFIX}${status}`;
}

/** The lifecycle status encoded in a set of tag names, or null if none. */
export function statusFromTags(tagNames: string[]): LifecycleStatus | null {
  for (const name of tagNames) {
    if (!isStatusTag(name)) continue;
    const value = name.slice(STATUS_PREFIX.length).trim();
    if ((LIFECYCLE_STATUSES as string[]).includes(value)) {
      return value as LifecycleStatus;
    }
  }
  return null;
}

/**
 * Compute the new tag-id set when changing a node's status: drop any existing
 * `status:*` tags, add the chosen status tag id. Pure — the caller resolves the
 * status tag id (creating the tag if needed) and persists via updateNode.
 */
export function nextTagIdsForStatus(
  currentTags: { id: string; name: string }[],
  chosenStatusTagId: string,
): string[] {
  const kept = currentTags.filter((t) => !isStatusTag(t.name)).map((t) => t.id);
  return [...kept, chosenStatusTagId];
}
