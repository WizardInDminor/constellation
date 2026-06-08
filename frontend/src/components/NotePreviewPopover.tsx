"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getNode } from "@/lib/api";
import type { NodeSummary, TagRef } from "@/lib/api";
import { NoteContent } from "./NoteContent";

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
  fleeting: "bg-amber-100 text-amber-700",
};

interface NotePreviewPopoverProps {
  node: NodeSummary;
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
}

export function NotePreviewPopover({
  node,
  anchorRef,
  visible,
}: NotePreviewPopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the popover relative to its anchor
  useEffect(() => {
    if (!visible || !anchorRef.current) {
      setPos(null);
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    const popoverWidth = 320; // w-80
    const rightSpace = window.innerWidth - rect.right - 8;
    const left =
      rightSpace >= popoverWidth
        ? rect.right + 8
        : rect.left - popoverWidth - 8;

    setPos({
      top: rect.top + window.scrollY,
      left: Math.max(8, left),
    });
  }, [visible, anchorRef]);

  // Fetch full content when popover becomes visible
  useEffect(() => {
    if (!visible) {
      setFullContent(null);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    getNode(node.id)
      .then((detail) => {
        if (!cancelled) setFullContent(detail.content || null);
      })
      .catch(() => {
        if (!cancelled) setFullContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, node.id]);

  if (!mounted || !visible || !pos) return null;

  const displayContent = fullContent ?? node.summary ?? null;

  return createPortal(
    <div
      ref={popoverRef}
      className="card pointer-events-none fixed z-50 w-80 p-4 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{node.title}</span>
        <span
          className={`badge shrink-0 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
      </div>
      {node.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {node.tags.map((t: TagRef) => (
            <span
              key={t.id}
              className="badge bg-gray-100 text-gray-500"
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
      {loadingContent && !displayContent ? (
        <div className="space-y-1.5">
          <div className="skeleton h-2.5 w-full" />
          <div className="skeleton h-2.5 w-5/6" />
          <div className="skeleton h-2.5 w-3/4" />
        </div>
      ) : displayContent ? (
        <NoteContent
          content={displayContent}
          className="prose prose-sm max-w-none text-xs text-gray-600 leading-relaxed max-h-64 overflow-y-auto scrollbar-thin pr-1"
        />
      ) : (
        <p className="text-xs italic text-gray-400">No content</p>
      )}
    </div>,
    document.body,
  );
}
