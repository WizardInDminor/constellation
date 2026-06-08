"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNode } from "@/lib/api";
import type { NodeDetail, TagRef } from "@/lib/api";

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
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Note details"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-gray-200 p-4">
          <div className="flex min-w-0 items-center gap-2">
            {detail && (
              <span
                className={`badge shrink-0 ${TYPE_COLORS[detail.type] ?? "bg-gray-100 text-gray-600"}`}
              >
                {detail.type}
              </span>
            )}
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {detail?.title ?? (loading ? "Loading…" : "")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 text-xl leading-none text-gray-400 hover:text-gray-700"
          >
            ×
          </button>
        </header>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
          {loading && !detail && (
            <div className="space-y-2">
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
            </div>
          )}
          {error && <div className="alert-error">{error}</div>}
          {detail && (
            <>
              {detail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((t: TagRef) => (
                    <span
                      key={t.id}
                      className="badge bg-gray-100 text-gray-600"
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
                  <div className="section-label mb-1">Summary</div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {detail.summary}
                  </p>
                </div>
              )}
              {detail.content && (
                <div>
                  <div className="section-label mb-1">Content</div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {detail.content}
                  </p>
                </div>
              )}
              {!detail.content && !detail.summary && (
                <p className="text-xs italic text-gray-400">No content</p>
              )}
            </>
          )}
        </div>

        {detail && (
          <footer className="border-t border-gray-200 p-4">
            <Link
              href={`/nodes/${detail.id}`}
              className="btn btn-primary w-full"
            >
              Open full note →
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
