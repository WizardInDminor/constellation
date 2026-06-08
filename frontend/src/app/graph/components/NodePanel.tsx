"use client";

import { useEffect } from "react";
import Link from "next/link";

import type { GraphNodeRef, NodeDetail } from "@/lib/api";
import { nodeColor } from "../colors";
import { NoteContent } from "@/components/NoteContent";

interface Props {
  node: GraphNodeRef;
  detail: NodeDetail | null;
  loadingDetail: boolean;
  onClose: () => void;
  onStartConnect?: () => void;
  isConnecting?: boolean;
}

export function NodePanel({
  node,
  detail,
  loadingDetail,
  onClose,
  onStartConnect,
  isConnecting,
}: Props) {
  const color = nodeColor(node.type);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-gray-700 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="badge shrink-0"
            style={{ backgroundColor: color + "33", color }}
          >
            {node.type}
          </span>
          <h2 className="truncate text-sm font-semibold text-gray-100">
            {node.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          aria-label="Close panel"
          title="Close panel"
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
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {node.source_entry_type && (
          <div>
            <div className="section-label mb-1">Type</div>
            <p className="text-sm text-gray-300">{node.source_entry_type}</p>
          </div>
        )}
        {node.source_author && (
          <div>
            <div className="section-label mb-1">Author</div>
            <p className="text-sm text-gray-300">{node.source_author}</p>
          </div>
        )}
        {node.source_url && (
          <div>
            <div className="section-label mb-1">URL</div>
            <p className="break-all text-xs text-gray-400">{node.source_url}</p>
          </div>
        )}
        {!node.source_entry_type && !node.source_author && !node.source_url && (
          <p className="text-xs italic text-gray-500">
            No source details available.
          </p>
        )}
      </div>

      <div className="border-t border-gray-700 p-4">
        <Link
          href={`/sources/${node.id}`}
          className="btn w-full bg-teal-700 text-white hover:bg-teal-600"
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
      if (
        e.key === "e" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT")
        )
          return;
        onStartConnect!();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStartConnect, isConnecting]);

  return (
    <>
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {node.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map((tag) => (
              <span key={tag} className="badge bg-gray-700 text-gray-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div>
          {loadingDetail ? (
            <div className="space-y-2">
              <div className="skeleton h-3 w-3/4 bg-gray-700" />
              <div className="skeleton h-3 w-full bg-gray-700" />
              <div className="skeleton h-3 w-5/6 bg-gray-700" />
            </div>
          ) : detail?.content || detail?.summary ? (
            <NoteContent
              content={detail.content || detail.summary}
              className="prose prose-sm prose-invert max-w-none text-sm text-gray-300 leading-relaxed"
            />
          ) : (
            <p className="text-xs italic text-gray-500">No content yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-gray-700 p-4">
        {onStartConnect && !isConnecting && (
          <button
            onClick={onStartConnect}
            className="btn w-full border border-indigo-500 text-indigo-400 hover:bg-indigo-900/40"
          >
            Connect to… <kbd className="ml-1 text-xs opacity-60">E</kbd>
          </button>
        )}
        {isConnecting && (
          <p className="text-center text-xs text-indigo-400">
            Click another node to connect
          </p>
        )}
        <Link href={`/nodes/${node.id}`} className="btn btn-primary w-full">
          Open note →
        </Link>
      </div>
    </>
  );
}
