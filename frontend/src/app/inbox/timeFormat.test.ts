import { describe, expect, it } from "vitest";

import { formatAbsolute, timeAgo } from "./timeFormat";

describe("timeAgo", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();

  it("returns 'just now' for sub-minute deltas", () => {
    expect(timeAgo("2026-05-15T11:59:30Z", now)).toBe("just now");
  });

  it("returns minutes for under-an-hour deltas", () => {
    expect(timeAgo("2026-05-15T11:45:00Z", now)).toBe("15m ago");
  });

  it("returns hours for under-a-day deltas", () => {
    expect(timeAgo("2026-05-15T09:00:00Z", now)).toBe("3h ago");
  });

  it("returns days for older notes", () => {
    expect(timeAgo("2026-05-13T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("formatAbsolute", () => {
  it("includes time-of-day, not just date", () => {
    // Output is locale-dependent, but the hour/minute portion must be present
    // so mobile captures show actual capture time per A2's acceptance criterion.
    const out = formatAbsolute("2026-05-15T14:23:45Z");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("falls back to the raw string on unparseable input", () => {
    expect(formatAbsolute("not-a-date")).toBe("not-a-date");
  });
});
