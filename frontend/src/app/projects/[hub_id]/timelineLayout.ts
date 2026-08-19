/**
 * Pure timeline-layout geometry (Phase 9 audit — Canon pass).
 *
 * Extracted from TimelinePanel so the axis math is testable and so every
 * lane shares ONE coordinate space. Slice 4/5 let each lane compute its own
 * `minPos`/`maxPos`/`canvasWidth`, which meant parallel lanes did NOT align
 * on a common axis and scrolled independently — a writer could not compare
 * "where is the dream beat relative to the external scene". A shared range +
 * a single zoom scale fixes both: lanes line up and scroll together.
 *
 * No React here — only arithmetic, so it unit-tests cleanly (repo convention:
 * pure logic lives in a `.ts` beside the component, see filterGraph.ts).
 */

import type { TimelineLane } from "@/lib/api";

// Discrete zoom scales (px per discourse_position unit). 0.4 is the Slice 5
// default and stays the initial level so existing projects look unchanged.
export const ZOOM_LEVELS = [0.1, 0.18, 0.28, 0.4, 0.6, 0.9, 1.4] as const;
export const DEFAULT_ZOOM_INDEX = 3; // → 0.4

export const X_PADDING = 60;
export const MIN_CANVAS_WIDTH = 800;

export interface PositionRange {
  minPos: number;
  maxPos: number;
}

/**
 * One range spanning every event + act-span across all (passed) lanes. Floors
 * at 0 and ceils at 1000 to match the Slice 5 single-lane defaults, so a
 * one-lane project renders identically to before.
 */
export function sharedPositionRange(lanes: TimelineLane[]): PositionRange {
  const positions: number[] = [];
  for (const lane of lanes) {
    for (const e of lane.events) positions.push(e.discourse_position);
    for (const s of lane.act_spans) {
      positions.push(s.start_position, s.end_position);
    }
  }
  if (positions.length === 0) return { minPos: 0, maxPos: 1000 };
  return {
    minPos: Math.min(0, ...positions),
    maxPos: Math.max(1000, ...positions),
  };
}

export function canvasWidth(range: PositionRange, scale: number): number {
  return (
    X_PADDING * 2 +
    Math.max(MIN_CANVAS_WIDTH, (range.maxPos - range.minPos) * scale)
  );
}

export function positionToX(
  pos: number,
  minPos: number,
  scale: number,
): number {
  return X_PADDING + (pos - minPos) * scale;
}

export function xToPosition(x: number, minPos: number, scale: number): number {
  return Math.round(minPos + (x - X_PADDING) / scale);
}

export function clampZoomIndex(i: number): number {
  return Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
}

export function zoomScale(index: number): number {
  return ZOOM_LEVELS[clampZoomIndex(index)];
}
