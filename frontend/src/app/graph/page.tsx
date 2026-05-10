"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { createEdge, getGraphData, getNode, listTags, updateNode } from "@/lib/api";
import type { EdgeType, GraphData, GraphEdgeRef, GraphNodeRef, NodeDetail, TagRef } from "@/lib/api";
import { applyFilters, initialFilterState, type FilterState } from "./filterGraph";
import { FilterBar } from "./components/FilterBar";
import { NodePanel } from "./components/NodePanel";
import { EdgePanel } from "./components/EdgePanel";
import { ConnectPanel } from "./components/ConnectPanel";
import { BatchPanel } from "./components/BatchPanel";

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

  // Connecting mode state
  const [connectingFrom, setConnectingFrom] = useState<GraphNodeRef | null>(null);
  const [connectTarget, setConnectTarget] = useState<GraphNodeRef | null>(null);

  // Multi-select state
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [allTagRefs, setAllTagRefs] = useState<TagRef[]>([]);

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
    listTags().then(setAllTagRefs).catch(() => {});
  }, []);

  // Escape key: cancel connecting mode and clear multi-select
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConnectingFrom(null);
        setConnectTarget(null);
        setSelectedNodes(new Set());
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load node detail when a node is selected (sources have no NodeDetail)
  useEffect(() => {
    if (!selectedNode || selectedNode.type === "source") {
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

  const handleNodeClick = (node: GraphNodeRef, shiftKey: boolean) => {
    // Multi-select mode
    if (shiftKey) {
      setSelectedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      setSelectedNode(null);
      setSelectedEdge(null);
      setNodeDetail(null);
      return;
    }

    // Exit multi-select on plain click
    if (selectedNodes.size > 0) {
      setSelectedNodes(new Set());
    }

    // Connecting mode: second node clicked
    if (connectingFrom) {
      if (node.id === connectingFrom.id) return;
      setConnectTarget(node);
      return;
    }

    setSelectedEdge(null);
    setSelectedNode(node);
  };

  const handleEdgeClick = (edge: GraphEdgeRef) => {
    setSelectedNode(null);
    setNodeDetail(null);
    setSelectedEdge(edge);
    setSelectedNodes(new Set());
  };

  const handleBackgroundClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setNodeDetail(null);
    setConnectingFrom(null);
    setConnectTarget(null);
    setSelectedNodes(new Set());
  };

  async function handleConfirmConnect(type: EdgeType, note: string) {
    if (!connectingFrom || !connectTarget) return;
    await createEdge({
      from_id: connectingFrom.id,
      to_id: connectTarget.id,
      type,
      note: note || undefined,
    });
    const data = await getGraphData(true);
    setGraphData(data);
    setConnectingFrom(null);
    setConnectTarget(null);
    setSelectedNode(null);
    setNodeDetail(null);
  }

  async function handleBatchTagAssign(tagIds: string[]) {
    const nodeIds = Array.from(selectedNodes);
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        const detail = await getNode(nodeId);
        const existing = detail.tags.map((t) => t.id);
        const merged = Array.from(new Set([...existing, ...tagIds]));
        await updateNode(nodeId, { tag_ids: merged });
      }),
    );
    const data = await getGraphData(true);
    setGraphData(data);
    setSelectedNodes(new Set());
  }

  const fromTitle = selectedEdge
    ? (graphData.nodes.find((n) => n.id === selectedEdge.from_id)?.title ?? selectedEdge.from_id)
    : "";
  const toTitle = selectedEdge
    ? (graphData.nodes.find((n) => n.id === selectedEdge.to_id)?.title ?? selectedEdge.to_id)
    : "";

  const showPanel =
    selectedNodes.size > 0 ||
    connectTarget !== null ||
    selectedNode !== null ||
    selectedEdge !== null;

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
              connectingMode={connectingFrom !== null}
              selectedNodeIds={selectedNodes}
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
          {/* Priority: BatchPanel > ConnectPanel > connecting NodePanel > normal NodePanel > EdgePanel */}
          {selectedNodes.size > 0 && !connectingFrom && (
            <BatchPanel
              selectedCount={selectedNodes.size}
              allTagRefs={allTagRefs}
              onApplyTags={handleBatchTagAssign}
              onClose={() => setSelectedNodes(new Set())}
            />
          )}
          {connectTarget && connectingFrom && (
            <ConnectPanel
              from={connectingFrom}
              to={connectTarget}
              onConfirm={handleConfirmConnect}
              onCancel={handleBackgroundClick}
            />
          )}
          {!connectTarget && connectingFrom && (
            <NodePanel
              node={connectingFrom}
              detail={nodeDetail}
              loadingDetail={loadingDetail}
              onClose={handleBackgroundClick}
              isConnecting={true}
            />
          )}
          {!connectingFrom && selectedNode && (
            <NodePanel
              node={selectedNode}
              detail={nodeDetail}
              loadingDetail={loadingDetail}
              onClose={handleBackgroundClick}
              onStartConnect={() => {
                setConnectingFrom(selectedNode);
                setConnectTarget(null);
              }}
              isConnecting={false}
            />
          )}
          {!connectingFrom && !selectedNode && selectedEdge && (
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
