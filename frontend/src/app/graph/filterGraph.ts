import type { GraphData } from "@/lib/api";

export const ALL_NODE_TYPES = [
  "fleeting",
  "literature",
  "permanent",
  "structure",
  "source",
] as const;

export const ALL_EDGE_TYPES = [
  "SUPPORTS",
  "CONTRADICTS",
  "ELABORATES",
  "ANALOGOUS_TO",
  "QUESTIONS",
  "INSPIRED_BY",
  "COLLECTS",
  "CITES",
  "BUILDS_ON",
  "APPLIES_TO",
  "MEASURES",
  "EXTENDS",
  "REFINES",
  // Evolution / D1 (ADR-060) + narrative (ADR-052 Slice 4).
  "SUPERSEDED_BY",
  "SCOPED_TO",
  "REGIME_OF",
  "FOLLOWS_FROM",
  "EXPLAINS",
  // Canon symbolic / resonance verbs (ADR-077).
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
] as const;

export interface FilterState {
  nodeTypes: Set<string>;
  edgeTypes: Set<string>;
  selectedTag: string | null;
  hideIsolated: boolean;
  searchQuery: string;
  /**
   * If non-null, only nodes in this set (plus their 1-hop neighbors via
   * surviving edges) are shown. Composes with the other filters: a focus
   * node hidden by node-type filter still doesn't appear. Drives the
   * `?ids=` URL param on /graph.
   */
  focusIds: Set<string> | null;
}

export function initialFilterState(): FilterState {
  return {
    // fleeting hidden by default — present in payload but not shown initially
    nodeTypes: new Set(["literature", "permanent", "structure", "source"]),
    edgeTypes: new Set(ALL_EDGE_TYPES),
    selectedTag: null,
    hideIsolated: false,
    searchQuery: "",
    focusIds: null,
  };
}

export function applyFilters(data: GraphData, state: FilterState): GraphData {
  let nodes = data.nodes.filter((n) => state.nodeTypes.has(n.type));

  if (state.selectedTag !== null) {
    nodes = nodes.filter((n) => n.tags.includes(state.selectedTag!));
  }

  const visibleNodeIds = new Set(nodes.map((n) => n.id));

  // Edges where both endpoints survive the node filter, and edge type is visible
  let edges = data.edges.filter(
    (e) =>
      state.edgeTypes.has(e.type) &&
      visibleNodeIds.has(e.from_id) &&
      visibleNodeIds.has(e.to_id),
  );

  // Focus pass: narrow to focusIds + their 1-hop neighbors. Edges retained
  // only if at least one endpoint is in focusIds (so we don't drag in
  // unrelated cross-links between neighbor nodes).
  if (state.focusIds !== null) {
    const focus = state.focusIds;
    edges = edges.filter((e) => focus.has(e.from_id) || focus.has(e.to_id));
    const keepIds = new Set<string>(focus);
    for (const e of edges) {
      keepIds.add(e.from_id);
      keepIds.add(e.to_id);
    }
    nodes = nodes.filter((n) => keepIds.has(n.id));
  }

  // "Isolated" = zero edges after the active edge-type filter, not globally
  if (state.hideIsolated) {
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.from_id);
      connectedIds.add(e.to_id);
    }
    nodes = nodes.filter((n) => connectedIds.has(n.id));
  }

  return { nodes, edges };
}
