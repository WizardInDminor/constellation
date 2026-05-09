"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { NodeObject, LinkObject, ForceGraphMethods } from "react-force-graph-2d";

import type { GraphEdgeRef, GraphNodeRef } from "@/lib/api";
import { edgeColor, nodeColor } from "../colors";
import { GraphControls } from "./GraphControls";

interface Props {
  nodes: GraphNodeRef[];
  edges: GraphEdgeRef[];
  searchQuery: string;
  onNodeClick: (node: GraphNodeRef) => void;
  onEdgeClick: (edge: GraphEdgeRef) => void;
  onBackgroundClick: () => void;
}

type FGNode = NodeObject & GraphNodeRef;
type FGLink = LinkObject & GraphEdgeRef & { source: string; target: string };

export function GraphCanvas({
  nodes,
  edges,
  searchQuery,
  onNodeClick,
  onEdgeClick,
  onBackgroundClick,
}: Props) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Reset auto-fit flag when graph data changes so the new layout fits on settle
  useEffect(() => {
    fittedRef.current = false;
  }, [nodes, edges]);

  const fgData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })) as FGNode[],
      links: edges.map((e) => ({
        ...e,
        source: e.from_id,
        target: e.to_id,
      })) as FGLink[],
    }),
    [nodes, edges],
  );

  const paintNode = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const r = 5;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = nodeColor(n.type);
      ctx.fill();

      if (
        searchQuery &&
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = "#FACC15";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      if (globalScale >= 1.5) {
        const fontSize = 10 / globalScale;
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#F9FAFB";
        ctx.fillText(n.title, x, y + r + 1 / globalScale);
      }
    },
    [searchQuery],
  );

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      const n = node as FGNode;
      onNodeClick({ id: n.id as string, title: n.title, type: n.type, tags: n.tags });
    },
    [onNodeClick],
  );

  const handleLinkClick = useCallback(
    (link: LinkObject) => {
      const l = link as FGLink;
      onEdgeClick({
        id: l.id,
        from_id: l.from_id,
        to_id: l.to_id,
        type: l.type,
        note: l.note,
      });
    },
    [onEdgeClick],
  );

  const handleEngineStop = useCallback(() => {
    if (!fittedRef.current && graphRef.current) {
      graphRef.current.zoomToFit(400, 20);
      fittedRef.current = true;
    }
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-950">
      <ForceGraph2D
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={graphRef as any}
        graphData={fgData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#030712"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        nodeLabel={(n) => (n as FGNode).title}
        linkColor={(l) => edgeColor((l as FGLink).type)}
        linkWidth={1.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onBackgroundClick={onBackgroundClick}
        onEngineStop={handleEngineStop}
      />
      <GraphControls
        onZoomIn={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300)}
        onZoomOut={() => graphRef.current?.zoom(graphRef.current.zoom() * 0.67, 300)}
        onFit={() => graphRef.current?.zoomToFit(400, 20)}
      />
    </div>
  );
}
