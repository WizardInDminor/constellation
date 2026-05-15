"use client";

import Link from "next/link";

import type { GraphEdgeRef } from "@/lib/api";
import { edgeColor } from "../colors";

interface Props {
  edge: GraphEdgeRef;
  fromTitle: string;
  toTitle: string;
  onClose: () => void;
}

export function EdgePanel({ edge, fromTitle, toTitle, onClose }: Props) {
  const color = edgeColor(edge.type);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-700">
        <span
          className="rounded px-2 py-0.5 text-xs font-medium font-mono"
          style={{ backgroundColor: color + "33", color }}
        >
          {edge.type}
        </span>
        <button
          onClick={onClose}
          className="shrink-0 text-gray-400 hover:text-gray-100 text-lg leading-none"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {edge.note && (
          <div>
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Why this edge exists</div>
            <p className="text-sm text-gray-300 leading-relaxed">{edge.note}</p>
          </div>
        )}

        {edge.classifier_rationale && (
          <div className="border-l-2 border-indigo-500/60 pl-3">
            <div className="text-xs text-indigo-300/80 mb-1 uppercase tracking-wide">
              Classifier rationale
            </div>
            <p className="text-sm text-gray-300 leading-relaxed italic">
              {edge.classifier_rationale}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">From</div>
            <Link
              href={`/nodes/${edge.from_id}`}
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              {fromTitle}
            </Link>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">To</div>
            <Link
              href={`/nodes/${edge.to_id}`}
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              {toTitle}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
