import { describe, expect, it } from "vitest";

import {
  type LaneLike,
  distinctLayerKinds,
  layerKindForLane,
  layerMeta,
  visibleByKind,
} from "./timelineLayers";

function lane(tagNames: string[] = []): LaneLike {
  return { timeline_tags: tagNames.map((name) => ({ name })) };
}

describe("layerKindForLane", () => {
  it("reads the kind from a layer:* tag", () => {
    expect(layerKindForLane(lane(["layer:dream"]))).toBe("dream");
    expect(layerKindForLane(lane(["narrative:x", "layer:historical"]))).toBe(
      "historical",
    );
  });

  it("is 'unspecified' when no layer tag is present", () => {
    expect(layerKindForLane(lane([]))).toBe("unspecified");
    expect(layerKindForLane(lane(["narrative:character"]))).toBe("unspecified");
    expect(layerKindForLane({})).toBe("unspecified");
  });
});

describe("layerMeta", () => {
  it("gives distinct labels/colors for known kinds", () => {
    const dream = layerMeta("dream");
    const external = layerMeta("external");
    expect(dream.label).toBe("Dream");
    expect(external.label).toBe("External");
    expect(dream.color).not.toBe(external.color);
  });

  it("title-cases unknown kinds with a neutral colour", () => {
    expect(layerMeta("prophecy-thread").label).toBe("Prophecy Thread");
    expect(layerMeta("prophecy-thread").color).toBe("#9ca3af");
  });
});

describe("distinctLayerKinds", () => {
  it("returns first-seen order without duplicates", () => {
    const lanes = [
      lane(["layer:external"]),
      lane(["layer:dream"]),
      lane(["layer:external"]),
    ];
    expect(distinctLayerKinds(lanes)).toEqual(["external", "dream"]);
  });
});

describe("visibleByKind", () => {
  it("ACCEPTANCE: filtering to Dream leaves only dream lanes", () => {
    const lanes = [
      lane(["layer:external"]),
      lane(["layer:dream"]),
      lane(["layer:historical"]),
    ];
    // Hide everything that is not 'dream'.
    const hidden = new Set(["external", "historical"]);
    const visible = visibleByKind(lanes, hidden);
    expect(visible).toHaveLength(1);
    expect(layerKindForLane(visible[0])).toBe("dream");
  });

  it("returns all lanes when nothing is hidden", () => {
    const lanes = [lane(["layer:external"]), lane(["layer:dream"])];
    expect(visibleByKind(lanes, new Set())).toHaveLength(2);
  });
});
