"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNode } from "@/lib/api";
import type { NodeDetail, TagRef } from "@/lib/api";
import { NoteContent } from "./NoteContent";

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
  fleeting: "bg-amber-100 text-amber-700",
};

interface NodeDetailDrawerProps {
  nodeId: string | null;
  onClose: () => void;
}

export function NodeDetailDrawer({ nodeId, onClose }: NodeDetailDrawerProps) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getNode(nodeId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load note.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nodeId, onClose]);

  if (!nodeId) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        <header className="flex items-start justify-between gap-2 p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            {detail && (
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[detail.type] ?? "bg-gray-100 text-gray-600"}`}
              >
                {detail.type}
              </span>
            )}
            <h2 className="text-sm font-semibold text-gray-900 truncate">
              {detail?.title ?? (loading ? "Loading…" : "")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && !detail && (
            <div className="space-y-2">
              <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {detail && (
            <>
              {detail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((t: TagRef) => (
                    <span
                      key={t.id}
                      className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      style={
                        t.color
                          ? { backgroundColor: t.color + "33", color: t.color }
                          : undefined
                      }
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              {detail.summary && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Summary
                  </div>
                  <NoteContent
                    content={detail.summary}
                    className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed"
                  />
                </div>
              )}
              {detail.content && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Content
                  </div>
                  <NoteContent
                    content={detail.content}
                    className="prose prose-sm max-w-none text-sm text-gray-800 leading-relaxed"
                  />
                </div>
              )}
              {!detail.content && !detail.summary && (
                <p className="text-xs italic text-gray-400">No content</p>
              )}
            </>
          )}
        </div>

        {detail && (
          <footer className="p-4 border-t border-gray-200">
            <Link
              href={`/nodes/${detail.id}`}
              className="block w-full text-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5 transition-colors"
            >
              Open full note →
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
