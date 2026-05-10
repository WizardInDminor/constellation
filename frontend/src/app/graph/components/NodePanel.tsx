"use client";

import { useEffect } from "react";
import Link from "next/link";

import type { GraphNodeRef, NodeDetail } from "@/lib/api";
import { nodeColor } from "../colors";

interface Props {
  node: GraphNodeRef;
  detail: NodeDetail | null;
  loadingDetail: boolean;
  onClose: () => void;
  onStartConnect?: () => void;
  isConnecting?: boolean;
}

export function NodePanel({ node, detail, loadingDetail, onClose, onStartConnect, isConnecting }: Props) {
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

      {node.type === "source" ? (
        <SourcePanel node={node} />
      ) : (
        <NotePanel
          node={node}
          detail={detail}
          loadingDetail={loadingDetail}
          onStartConnect={onStartConnect}
          isConnecting={isConnecting}
        />
      )}
    </div>
  );
}

function SourcePanel({ node }: { node: GraphNodeRef }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {node.source_entry_type && (
          <div>
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Type</div>
            <span className="text-sm text-gray-300">{node.source_entry_type}</span>
          </div>
        )}
        {node.source_author && (
          <div>
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Author</div>
            <span className="text-sm text-gray-300">{node.source_author}</span>
          </div>
        )}
        {node.source_url && (
          <div>
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">URL</div>
            <span className="text-xs text-gray-400 break-all">{node.source_url}</span>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-700">
        <Link
          href={`/sources/${node.id}`}
          className="block w-full text-center text-sm bg-teal-700 hover:bg-teal-600 text-white rounded px-3 py-1.5 transition-colors"
        >
          Open source →
        </Link>
      </div>
    </>
  );
}

function NotePanel({
  node,
  detail,
  loadingDetail,
  onStartConnect,
  isConnecting,
}: {
  node: GraphNodeRef;
  detail: NodeDetail | null;
  loadingDetail: boolean;
  onStartConnect?: () => void;
  isConnecting?: boolean;
}) {
  useEffect(() => {
    if (!onStartConnect || isConnecting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
        onStartConnect!();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStartConnect, isConnecting]);

  return (
    <>
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
          {loadingDetail ? (
            <div className="space-y-1.5">
              <div className="h-3 bg-gray-700 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-700 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-700 rounded animate-pulse w-5/6" />
            </div>
          ) : (detail?.content || detail?.summary) ? (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
              {detail.content || detail.summary}
            </p>
          ) : (
            <p className="text-xs text-gray-500 italic">No content</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-700 space-y-2">
        {onStartConnect && !isConnecting && (
          <button
            onClick={onStartConnect}
            className="block w-full text-center text-sm border border-indigo-500 text-indigo-400 hover:bg-indigo-900/40 rounded px-3 py-1.5 transition-colors"
          >
            Connect to… <span className="opacity-50 text-xs font-mono ml-1">E</span>
          </button>
        )}
        {isConnecting && (
          <p className="text-xs text-indigo-400 text-center">Click another node to connect</p>
        )}
        <Link
          href={`/nodes/${node.id}`}
          className="block w-full text-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5 transition-colors"
        >
          Open note →
        </Link>
      </div>
    </>
  );
}
