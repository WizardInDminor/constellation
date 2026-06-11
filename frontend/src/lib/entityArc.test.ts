import { describe, expect, it } from "vitest";

import {
  type ArcAppearanceLike,
  appearanceTimeLabel,
  arcIsMeaningful,
  meaningCount,
  pendingCount,
} from "./entityArc";

function ap(over: Partial<ArcAppearanceLike> = {}): ArcAppearanceLike {
  return {
    meaning: null,
    story_time: null,
    discourse_position: null,
    created_at: "2026-02-01T00:00:00Z",
    is_pending: false,
    ...over,
  };
}

describe("appearanceTimeLabel", () => {
  it("prefers story_time when present", () => {
    expect(appearanceTimeLabel(ap({ story_time: "Act 2, Day 14" }))).toBe(
      "Act 2, Day 14",
    );
  });

  it("falls back to a formatted created date", () => {
    const label = appearanceTimeLabel(
      ap({ created_at: "2026-02-01T00:00:00Z" }),
    );
    expect(label).toMatch(/2026/);
  });

  it("returns the raw string for an unparseable date", () => {
    expect(appearanceTimeLabel(ap({ created_at: "not-a-date" }))).toBe(
      "not-a-date",
    );
  });
});

describe("meaningCount / pendingCount", () => {
  it("counts appearances with a non-empty meaning", () => {
    expect(
      meaningCount([ap({ meaning: "Potential" }), ap({ meaning: "  " }), ap()]),
    ).toBe(1);
  });

  it("counts pending appearances", () => {
    expect(
      pendingCount([ap({ is_pending: true }), ap(), ap({ is_pending: true })]),
    ).toBe(2);
  });
});

describe("arcIsMeaningful", () => {
  it("is true with two or more appearances", () => {
    expect(
      arcIsMeaningful({
        ordering_basis: "timeline",
        appearances: [ap(), ap()],
      }),
    ).toBe(true);
  });

  it("is true with one appearance that carries a meaning", () => {
    expect(
      arcIsMeaningful({
        ordering_basis: "chronological",
        appearances: [ap({ meaning: "Guidance" })],
      }),
    ).toBe(true);
  });

  it("is false with a single bare connection", () => {
    expect(
      arcIsMeaningful({ ordering_basis: "chronological", appearances: [ap()] }),
    ).toBe(false);
  });
});
