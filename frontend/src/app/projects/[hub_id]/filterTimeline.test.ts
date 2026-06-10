import { describe, expect, it } from "vitest";

import type { ProseStatus, TimelineEvent, TimelineLane } from "@/lib/api";
import {
  emptyTimelineFilter,
  eventDimmed,
  hasActiveEventFilter,
  visibleLanes,
} from "./filterTimeline";

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    node: { id: "e1", title: "Harbor arrival", type: "permanent" },
    discourse_position: 100,
    story_time: "Day 14",
    prose_status: null,
    manuscript_location: null,
    timeline_count: 1,
    character_ids: [],
    theme_ids: [],
    ...over,
  } as unknown as TimelineEvent;
}

function lane(id: string): TimelineLane {
  return {
    timeline: { id, title: id, type: "structure" },
    events: [],
    act_spans: [],
  } as unknown as TimelineLane;
}

describe("visibleLanes", () => {
  it("drops hidden lanes", () => {
    const lanes = [lane("a"), lane("b"), lane("c")];
    const f = emptyTimelineFilter();
    f.hiddenLaneIds = new Set(["b"]);
    expect(visibleLanes(lanes, f).map((l) => l.timeline.id)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("hasActiveEventFilter", () => {
  it("is false for the empty filter", () => {
    expect(hasActiveEventFilter(emptyTimelineFilter())).toBe(false);
  });

  it("is true once any event filter is set", () => {
    const f = emptyTimelineFilter();
    f.query = "fire";
    expect(hasActiveEventFilter(f)).toBe(true);
  });
});

describe("eventDimmed", () => {
  it("never dims with no active filter", () => {
    expect(eventDimmed(event(), emptyTimelineFilter())).toBe(false);
  });

  it("dims events whose prose_status is not selected", () => {
    const f = emptyTimelineFilter();
    f.proseStatuses = new Set<ProseStatus>(["draft"]);
    expect(eventDimmed(event({ prose_status: "draft" }), f)).toBe(false);
    expect(eventDimmed(event({ prose_status: "written" }), f)).toBe(true);
    expect(eventDimmed(event({ prose_status: null }), f)).toBe(true);
  });

  it("matches the query against title and story_time, case-insensitively", () => {
    const f = emptyTimelineFilter();
    f.query = "HARBOR";
    expect(eventDimmed(event(), f)).toBe(false);
    f.query = "day 14";
    expect(eventDimmed(event(), f)).toBe(false);
    f.query = "dragon";
    expect(eventDimmed(event(), f)).toBe(true);
  });

  it("dims events that lack the highlighted character", () => {
    const f = emptyTimelineFilter();
    f.highlightedCharacterId = "michael";
    expect(eventDimmed(event({ character_ids: ["michael"] }), f)).toBe(false);
    expect(eventDimmed(event({ character_ids: ["ian"] }), f)).toBe(true);
    expect(eventDimmed(event({ character_ids: [] }), f)).toBe(true);
  });

  it("dims when ANY active filter fails (filters are AND)", () => {
    const f = emptyTimelineFilter();
    f.query = "harbor";
    f.proseStatuses = new Set<ProseStatus>(["written"]);
    // Matches query but wrong status → still dimmed.
    expect(eventDimmed(event({ prose_status: "draft" }), f)).toBe(true);
    expect(eventDimmed(event({ prose_status: "written" }), f)).toBe(false);
  });
});
