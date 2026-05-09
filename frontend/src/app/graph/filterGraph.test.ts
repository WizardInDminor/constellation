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

const DATA: GraphData = {
  nodes: [P1, L1, F1],
  edges: [E_P_L, E_L_F],
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
});
