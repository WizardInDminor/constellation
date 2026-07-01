import { describe, expect, it } from "vitest";

import { EDGE_TYPES, EDGE_COLORS, EDGE_TYPE_META } from "./edgeTypes";

// Locks the three parallel edge-type tables in sync — a new verb added to
// EDGE_TYPES without a color or meta entry would render as `undefined` classes
// / crash the label lookup. Also asserts the Canon verbs (ADR-077) are present.
describe("edge type tables", () => {
  it("every edge type has a color and metadata entry", () => {
    for (const t of EDGE_TYPES) {
      expect(EDGE_COLORS[t], `color for ${t}`).toBeTruthy();
      expect(EDGE_TYPE_META[t], `meta for ${t}`).toBeTruthy();
      expect(EDGE_TYPE_META[t].label, `label for ${t}`).toBeTruthy();
    }
  });

  it("includes the Canon symbolic / resonance verbs", () => {
    for (const t of [
      "HOLDS_OPEN",
      "REFUSES_TO_NAME",
      "CARRIES_CHARGE_FOR",
      "FORESHADOWS",
      "MIRRORS",
      "INVERSION_OF",
      "PROTOTYPE_OF",
      "AMPLIFIES",
      "CORRUPTS",
      "DESTABILIZES",
      "STABILIZES",
      "PROTECTS",
      "THREATENS",
    ] as const) {
      expect(EDGE_TYPES).toContain(t);
    }
  });

  it("MIRRORS and INVERSION_OF are non-directional", () => {
    expect(EDGE_TYPE_META.MIRRORS.directional).toBe(false);
    expect(EDGE_TYPE_META.INVERSION_OF.directional).toBe(false);
  });
});
