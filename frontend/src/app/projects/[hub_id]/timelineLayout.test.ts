import { describe, expect, it } from "vitest";

import type { TimelineLane } from "@/lib/api";
import {
  ZOOM_LEVELS,
  X_PADDING,
  canvasWidth,
  clampZoomIndex,
  positionToX,
  sharedPositionRange,
  xToPosition,
  zoomScale,
} from "./timelineLayout";

function lane(
  id: string,
  positions: number[],
  spans: [number, number][] = [],
): TimelineLane {
  return {
    timeline: { id, title: id, type: "structure" },
    events: positions.map((p, i) => ({
      node: { id: `${id}-e${i}`, title: `e${i}`, type: "permanent" },
      discourse_position: p,
      story_time: null,
      prose_status: null,
      manuscript_location: null,
      timeline_count: 1,
      character_ids: [],
      theme_ids: [],
    })),
    act_spans: spans.map(([s, e], i) => ({
      id: `${id}-s${i}`,
      timeline_node_id: id,
      label: `act${i}`,
      start_position: s,
      end_position: e,
      color: null,
    })),
  } as unknown as TimelineLane;
}

describe("sharedPositionRange", () => {
  it("defaults to 0..1000 with no events", () => {
    expect(sharedPositionRange([])).toEqual({ minPos: 0, maxPos: 1000 });
  });

  it("floors at 0 and ceils at 1000", () => {
    expect(sharedPositionRange([lane("a", [100, 400])])).toEqual({
      minPos: 0,
      maxPos: 1000,
    });
  });

  it("spans the union of every lane and act span", () => {
    const range = sharedPositionRange([
      lane("a", [200, 1500]),
      lane("b", [-50, 300], [[1400, 2000]]),
    ]);
    // Crucial: parallel lanes share ONE axis so they align.
    expect(range).toEqual({ minPos: -50, maxPos: 2000 });
  });
});

describe("canvasWidth", () => {
  it("never goes below the minimum width", () => {
    const w = canvasWidth({ minPos: 0, maxPos: 100 }, 0.4);
    expect(w).toBe(X_PADDING * 2 + 800);
  });

  it("grows with range and scale", () => {
    const w = canvasWidth({ minPos: 0, maxPos: 5000 }, 0.4);
    expect(w).toBe(X_PADDING * 2 + 5000 * 0.4);
  });
});

describe("positionToX / xToPosition round trip", () => {
  it("inverts cleanly at integer positions", () => {
    const x = positionToX(640, -50, 0.4);
    expect(xToPosition(x, -50, 0.4)).toBe(640);
  });

  it("anchors minPos at the left padding", () => {
    expect(positionToX(-50, -50, 0.4)).toBe(X_PADDING);
  });
});

describe("zoom", () => {
  it("clamps the index to the available levels", () => {
    expect(clampZoomIndex(-5)).toBe(0);
    expect(clampZoomIndex(99)).toBe(ZOOM_LEVELS.length - 1);
    expect(clampZoomIndex(2)).toBe(2);
  });

  it("zoomScale resolves to a level", () => {
    expect(zoomScale(0)).toBe(ZOOM_LEVELS[0]);
    expect(zoomScale(100)).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });
});
