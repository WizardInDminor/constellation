/**
 * Pure timeline-filter logic (Phase 9 audit — Canon pass).
 *
 * Slice 5 shipped exactly two timeline filters: per-lane visibility (hide a
 * lane) and a single "highlight one character" dim. For a large story world
 * that's too thin — a writer also wants to find scenes by title/story-time
 * and to focus on prose-pipeline state (e.g. "show me what's still planned").
 *
 * Design choice (ADR-082): prose-status and text filters DIM rather than HIDE,
 * matching the existing character-highlight philosophy. Hiding events would
 * leave gaps in the FOLLOWS_FROM connector chain and lose the writer's sense
 * of where a beat sits on the axis. Everything stays on the canvas; the
 * non-matching beats just recede.
 */

import type { ProseStatus, TimelineEvent, TimelineLane } from "@/lib/api";

export interface TimelineFilter {
  /** Lanes the user has toggled off entirely. */
  hiddenLaneIds: Set<string>;
  /** Character to highlight; others dim. null = no highlight. */
  highlightedCharacterId: string | null;
  /** Prose-pipeline states to keep prominent. Empty = all states. */
  proseStatuses: Set<ProseStatus>;
  /** Free-text match against title + story_time. Blank = no text filter. */
  query: string;
}

export function emptyTimelineFilter(): TimelineFilter {
  return {
    hiddenLaneIds: new Set(),
    highlightedCharacterId: null,
    proseStatuses: new Set(),
    query: "",
  };
}

/** Lanes still visible after the lane-toggle filter. */
export function visibleLanes(
  lanes: TimelineLane[],
  filter: TimelineFilter,
): TimelineLane[] {
  return lanes.filter((l) => !filter.hiddenLaneIds.has(l.timeline.id));
}

/** True when any non-lane filter is actively narrowing the view. */
export function hasActiveEventFilter(filter: TimelineFilter): boolean {
  return (
    filter.highlightedCharacterId !== null ||
    filter.proseStatuses.size > 0 ||
    filter.query.trim().length > 0
  );
}

/**
 * Should this event be dimmed (i.e. it fails one of the active event
 * filters)? Returns false when the event matches everything / no filter is
 * active. Pure — drives the card opacity in TimelineLaneCanvas.
 */
export function eventDimmed(
  event: TimelineEvent,
  filter: TimelineFilter,
): boolean {
  // Prose-status filter.
  if (filter.proseStatuses.size > 0) {
    if (
      !event.prose_status ||
      !filter.proseStatuses.has(event.prose_status as ProseStatus)
    ) {
      return true;
    }
  }

  // Free-text filter over title + story_time.
  const q = filter.query.trim().toLowerCase();
  if (q.length > 0) {
    const hay = `${event.node.title} ${event.story_time ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return true;
  }

  // Character highlight.
  if (filter.highlightedCharacterId !== null) {
    if (!(event.character_ids ?? []).includes(filter.highlightedCharacterId)) {
      return true;
    }
  }

  return false;
}
