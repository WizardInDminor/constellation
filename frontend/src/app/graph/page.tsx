"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { getGraphData, getNode } from "@/lib/api";
import type { GraphData, GraphEdgeRef, GraphNodeRef, NodeDetail } from "@/lib/api";
import { applyFilters, initialFilterState, type FilterState } from "./filterGraph";
import { FilterBar } from "./components/FilterBar";
import { NodePanel } from "./components/NodePanel";
import { EdgePanel } from "./components/EdgePanel";

// Canvas is browser-only — disable SSR
const GraphCanvas = dynamic(
  () => import("./components/GraphCanvas").then((m) => m.GraphCanvas),
  { ssr: false },
);

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState<FilterState>(initialFilterState);

  const [selectedNode, setSelectedNode] = useState<GraphNodeRef | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeRef | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load full graph (including fleeting) on mount; filter client-side
  useEffect(() => {
    getGraphData(true)
      .then((data) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  // Lazy-load node detail when a node is selected
  useEffect(() => {
    if (!selectedNode) {
      setNodeDetail(null);
      return;
    }
    setLoadingDetail(true);
    getNode(selectedNode.id)
      .then((detail) => {
        setNodeDetail(detail);
        setLoadingDetail(false);
      })
      .catch(() => setLoadingDetail(false));
  }, [selectedNode]);

  const visibleData = useMemo(
    () => applyFilters(graphData, filterState),
    [graphData, filterState],
  );

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const n of graphData.nodes) {
      for (const t of n.tags) seen.add(t);
    }
    return Array.from(seen).sort();
  }, [graphData.nodes]);

  const handleNodeClick = (node: GraphNodeRef) => {
    setSelectedEdge(null);
    setSelectedNode(node);
  };

  const handleEdgeClick = (edge: GraphEdgeRef) => {
    setSelectedNode(null);
    setNodeDetail(null);
    setSelectedEdge(edge);
  };

  const handleBackgroundClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setNodeDetail(null);
  };

  const fromTitle = selectedEdge
    ? (graphData.nodes.find((n) => n.id === selectedEdge.from_id)?.title ?? selectedEdge.from_id)
    : "";
  const toTitle = selectedEdge
    ? (graphData.nodes.find((n) => n.id === selectedEdge.to_id)?.title ?? selectedEdge.to_id)
    : "";

  const showPanel = selectedNode !== null || selectedEdge !== null;

  return (
    // Break out of AppShell's max-w-4xl / px-4 / py-8 with fixed positioning below the header
    <div className="fixed inset-x-0 top-12 bottom-0 flex flex-col overflow-hidden bg-gray-950 z-0">
      <FilterBar state={filterState} allTags={allTags} onChange={setFilterState} />

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div className="flex-1 relative min-w-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              Loading graph…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <GraphCanvas
              nodes={visibleData.nodes}
              edges={visibleData.edges}
              searchQuery={filterState.searchQuery}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onBackgroundClick={handleBackgroundClick}
            />
          )}
          {!loading && !error && visibleData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">
              No nodes visible — adjust filters above.
            </div>
          )}
        </div>

        {/* Side panel */}
        <div
          className={`flex flex-col shrink-0 bg-gray-900 border-l border-gray-700 overflow-hidden transition-all duration-200 ${
            showPanel ? "w-72" : "w-0"
          }`}
        >
          {selectedNode && (
            <NodePanel
              node={selectedNode}
              detail={nodeDetail}
              loadingDetail={loadingDetail}
              onClose={handleBackgroundClick}
            />
          )}
          {selectedEdge && (
            <EdgePanel
              edge={selectedEdge}
              fromTitle={fromTitle}
              toTitle={toTitle}
              onClose={handleBackgroundClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
