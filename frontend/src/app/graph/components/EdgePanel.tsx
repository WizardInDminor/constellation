"use client";

import Link from "next/link";
import { useState } from "react";

import { NodePicker } from "@/components/NodePicker";
import { resolveEdge, unresolveEdge } from "@/lib/api";
import type { GraphEdgeRef, NodeRef } from "@/lib/api";
import { RESOLVABLE_EDGE_TYPES } from "@/lib/edgeTypes";
import { edgeColor } from "../colors";

interface Props {
  edge: GraphEdgeRef;
  fromTitle: string;
  toTitle: string;
  resolverTitle: string | null;
  onClose: () => void;
  /** Called after resolve/unresolve so the parent can refresh GraphData. */
  onEdgeUpdated: () => void;
}

export function EdgePanel({
  edge,
  fromTitle,
  toTitle,
  resolverTitle,
  onClose,
  onEdgeUpdated,
}: Props) {
  const color = edgeColor(edge.type);
  const isResolvable = RESOLVABLE_EDGE_TYPES.has(edge.type);
  const isResolved = edge.resolved_at != null;

  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolveWithoutSynthesis() {
    setSubmitting(true);
    setError(null);
    try {
      await resolveEdge(edge.id, {});
      setPicking(false);
      onEdgeUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark resolved");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolveWithSynthesis(node: NodeRef) {
    setSubmitting(true);
    setError(null);
    try {
      await resolveEdge(edge.id, { resolved_by_node_id: node.id });
      setPicking(false);
      onEdgeUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark resolved");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearResolution() {
    setSubmitting(true);
    setError(null);
    try {
      await unresolveEdge(edge.id);
      onEdgeUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear resolution");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-700">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium font-mono ${
              isResolved ? "opacity-50 line-through" : ""
            }`}
            style={{ backgroundColor: color + "33", color }}
          >
            {edge.type}
          </span>
          {isResolved && (
            <span className="rounded bg-gray-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-200">
              Resolved
            </span>
          )}
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
        {edge.note && (
          <div>
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">
              Why this edge exists
            </div>
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

        {isResolved && (
          <div className="border-l-2 border-amber-500/60 pl-3">
            <div className="text-xs text-amber-300/80 mb-1 uppercase tracking-wide">
              Resolved
            </div>
            {edge.resolved_by_node_id && resolverTitle ? (
              <p className="text-sm text-gray-300 leading-relaxed">
                Superseded by{" "}
                <Link
                  href={`/nodes/${edge.resolved_by_node_id}`}
                  className="text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  {resolverTitle}
                </Link>
                .
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Marked resolved without a specific synthesis note.
              </p>
            )}
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

        {isResolvable && (
          <div className="border-t border-gray-700 pt-4 space-y-2">
            {!isResolved && !picking && (
              <button
                onClick={() => setPicking(true)}
                disabled={submitting}
                className="w-full rounded bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
              >
                Mark resolved…
              </button>
            )}

            {!isResolved && picking && (
              <div className="space-y-2">
                <div className="text-xs text-gray-400 uppercase tracking-wide">
                  Pick the synthesis note that supersedes this tension
                </div>
                <NodePicker
                  onSelect={handleResolveWithSynthesis}
                  exclude={[edge.from_id, edge.to_id]}
                  placeholder="Search notes…"
                  previewOnHover={true}
                />
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={handleResolveWithoutSynthesis}
                    disabled={submitting}
                    className="rounded bg-gray-800 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                  >
                    Resolve without a synthesis note
                  </button>
                  <button
                    onClick={() => setPicking(false)}
                    disabled={submitting}
                    className="rounded px-2 py-1 text-gray-400 hover:text-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isResolved && (
              <button
                onClick={handleClearResolution}
                disabled={submitting}
                className="w-full rounded bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
              >
                Clear resolution
              </button>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
