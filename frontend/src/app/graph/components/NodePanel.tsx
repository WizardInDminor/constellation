"use client";

import Link from "next/link";

import type { GraphNodeRef, NodeDetail } from "@/lib/api";
import { nodeColor } from "../colors";

interface Props {
  node: GraphNodeRef;
  detail: NodeDetail | null;
  loadingDetail: boolean;
  onClose: () => void;
}

export function NodePanel({ node, detail, loadingDetail, onClose }: Props) {
  const color = nodeColor(node.type);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: color + "33", color }}
          >
            {node.type}
          </span>
          <h2 className="text-sm font-semibold text-gray-100 truncate">{node.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-gray-400 hover:text-gray-100 text-lg leading-none"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {node.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2 py-0.5 text-xs bg-gray-700 text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div>
          <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Summary</div>
          {loadingDetail ? (
            <div className="h-3 bg-gray-700 rounded animate-pulse w-3/4" />
          ) : detail?.summary ? (
            <p className="text-sm text-gray-300 leading-relaxed">{detail.summary}</p>
          ) : (
            <p className="text-xs text-gray-500 italic">No summary</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-700">
        <Link
          href={`/nodes/${node.id}`}
          className="block w-full text-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5 transition-colors"
        >
          Open note →
        </Link>
      </div>
    </div>
  );
}
