import { describe, expect, it } from "vitest";

import {
  isStatusTag,
  nextTagIdsForStatus,
  statusFromTags,
  statusTagName,
} from "./lifecycleStatus";

describe("statusFromTags", () => {
  it("extracts a known status", () => {
    expect(
      statusFromTags(["narrative:open-question", "status:developing"]),
    ).toBe("developing");
    expect(statusFromTags(["status:resolved"])).toBe("resolved");
  });

  it("returns null when there is no status tag", () => {
    expect(statusFromTags(["narrative:open-question"])).toBeNull();
    expect(statusFromTags([])).toBeNull();
  });

  it("ignores unknown status values", () => {
    expect(statusFromTags(["status:pondering"])).toBeNull();
  });
});

describe("isStatusTag / statusTagName", () => {
  it("round-trips", () => {
    expect(statusTagName("open")).toBe("status:open");
    expect(isStatusTag(statusTagName("resolved"))).toBe(true);
    expect(isStatusTag("narrative:symbol")).toBe(false);
  });
});

describe("nextTagIdsForStatus", () => {
  it("drops existing status tags and adds the chosen one", () => {
    const current = [
      { id: "t-q", name: "narrative:open-question" },
      { id: "t-old", name: "status:open" },
    ];
    expect(nextTagIdsForStatus(current, "t-new")).toEqual(["t-q", "t-new"]);
  });

  it("keeps non-status tags when none existed before", () => {
    const current = [{ id: "t-q", name: "narrative:open-question" }];
    expect(nextTagIdsForStatus(current, "t-new")).toEqual(["t-q", "t-new"]);
  });
});
