import { describe, expect, it } from "vitest";

import type { GraphData } from "@/lib/api";
import { applyFilters, initialFilterState } from "./filterGraph";

const P1: GraphData["nodes"][0] = {
  id: "p1",
  title: "Permanent A",
  type: "permanent",
  tags: ["circuits"],
};
const L1: GraphData["nodes"][0] = {
  id: "l1",
  title: "Literature B",
  type: "literature",
  tags: [],
};
const F1: GraphData["nodes"][0] = {
  id: "f1",
  title: "Fleeting C",
  type: "fleeting",
  tags: [],
};
const S1: GraphData["nodes"][0] = {
  id: "s1",
  title: "MCP4922 Datasheet",
  type: "source",
  tags: [],
  source_entry_type: "datasheet",
  source_author: "Microchip",
  source_url: "file:///datasheets/mcp4922.pdf",
};

const E_P_L: GraphData["edges"][0] = {
  id: "e1",
  from_id: "p1",
  to_id: "l1",
  type: "SUPPORTS",
};
const E_L_F: GraphData["edges"][0] = {
  id: "e2",
  from_id: "l1",
  to_id: "f1",
  type: "ELABORATES",
};
const E_L_S: GraphData["edges"][0] = {
  id: "cites-l1",
  from_id: "l1",
  to_id: "s1",
  type: "CITES",
};

const DATA: GraphData = {
  nodes: [P1, L1, F1, S1],
  edges: [E_P_L, E_L_F, E_L_S],
};

describe("applyFilters", () => {
  it("initial state hides fleeting nodes", () => {
    const result = applyFilters(DATA, initialFilterState());
    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain("f1");
    expect(ids).toContain("p1");
    expect(ids).toContain("l1");
  });

  it("edges to excluded nodes are dropped", () => {
    const state = { ...initialFilterState(), nodeTypes: new Set(["permanent"]) };
    const result = applyFilters(DATA, state);
    expect(result.edges).toHaveLength(0);
  });

  it("edge type filter drops matching edges", () => {
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["permanent", "literature"]),
      edgeTypes: new Set(["ELABORATES"]),
    };
    const result = applyFilters(DATA, state);
    expect(result.edges.map((e) => e.id)).not.toContain("e1");
  });

  it("tag filter shows only nodes with matching tag", () => {
    const state = { ...initialFilterState(), selectedTag: "circuits" };
    const result = applyFilters(DATA, state);
    expect(result.nodes.map((n) => n.id)).toEqual(["p1"]);
  });

  it("hideIsolated drops nodes with no post-filter edges", () => {
    // permanent visible, literature hidden → no edge → permanent isolated
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["permanent"]),
      hideIsolated: true,
    };
    const result = applyFilters(DATA, state);
    expect(result.nodes).toHaveLength(0);
  });

  it("hideIsolated keeps connected nodes", () => {
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["permanent", "literature"]),
      hideIsolated: true,
    };
    const result = applyFilters(DATA, state);
    expect(result.nodes.map((n) => n.id)).toContain("p1");
    expect(result.nodes.map((n) => n.id)).toContain("l1");
    expect(result.edges).toHaveLength(1);
  });

  it("searchQuery does not change the node count", () => {
    const base = applyFilters(DATA, initialFilterState());
    const withSearch = applyFilters(DATA, {
      ...initialFilterState(),
      searchQuery: "Permanent",
    });
    expect(withSearch.nodes.length).toBe(base.nodes.length);
    expect(withSearch.edges.length).toBe(base.edges.length);
  });

  it("initial state shows source nodes", () => {
    const result = applyFilters(DATA, initialFilterState());
    expect(result.nodes.map((n) => n.id)).toContain("s1");
  });

  it("toggling source off hides source nodes and drops CITES edges", () => {
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["literature", "permanent", "structure"]),
    };
    const result = applyFilters(DATA, state);
    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain("s1");
    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).not.toContain("cites-l1");
  });

  it("CITES edges survive when both endpoints are visible", () => {
    const result = applyFilters(DATA, initialFilterState());
    expect(result.edges.map((e) => e.id)).toContain("cites-l1");
  });

  it("focusIds shows only the focus nodes and their 1-hop neighbors", () => {
    // Focus on p1 → keep p1 + l1 (via SUPPORTS edge); drop f1 and s1 (no edge
    // touches p1, and f1 is filtered out by default anyway)
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["permanent", "literature", "source"]),
      focusIds: new Set(["p1"]),
    };
    const result = applyFilters(DATA, state);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["l1", "p1"]);
    expect(result.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("focusIds keeps cross-edges only when an endpoint is in focus", () => {
    // Focus on l1 → keep l1, p1 (via e1), s1 (via cites-l1). The "neighbor
    // among neighbors" edge that doesn't touch l1 would be excluded — exercised
    // here trivially because we have no such edge in DATA, but the filter
    // logic must not pull in non-focus-touching edges. Verify by checking
    // edges only.
    const state = {
      ...initialFilterState(),
      nodeTypes: new Set(["permanent", "literature", "source"]),
      focusIds: new Set(["l1"]),
    };
    const result = applyFilters(DATA, state);
    for (const e of result.edges) {
      expect(e.from_id === "l1" || e.to_id === "l1").toBe(true);
    }
  });

  it("focusIds composes with node-type filter — hidden focus stays hidden", () => {
    // Focus on f1 but fleeting is filtered out → f1 and its edges drop
    const state = {
      ...initialFilterState(), // fleeting hidden by default
      focusIds: new Set(["f1"]),
    };
    const result = applyFilters(DATA, state);
    expect(result.nodes.map((n) => n.id)).not.toContain("f1");
    expect(result.edges).toHaveLength(0);
  });
});
