import type { GraphData } from "@/lib/api";

export const ALL_NODE_TYPES = [
  "fleeting",
  "literature",
  "permanent",
  "structure",
] as const;

export const ALL_EDGE_TYPES = [
  "SUPPORTS",
  "CONTRADICTS",
  "ELABORATES",
  "ANALOGOUS_TO",
  "QUESTIONS",
  "INSPIRED_BY",
  "COLLECTS",
] as const;

export interface FilterState {
  nodeTypes: Set<string>;
  edgeTypes: Set<string>;
  selectedTag: string | null;
  hideIsolated: boolean;
  searchQuery: string;
}

export function initialFilterState(): FilterState {
  return {
    // fleeting hidden by default — present in payload but not shown initially
    nodeTypes: new Set(["literature", "permanent", "structure"]),
    edgeTypes: new Set(ALL_EDGE_TYPES),
    selectedTag: null,
    hideIsolated: false,
    searchQuery: "",
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
