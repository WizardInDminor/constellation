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
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge font-mono ${
              isResolved ? "line-through opacity-50" : ""
            }`}
            style={{ backgroundColor: color + "33", color }}
          >
            {edge.type}
          </span>
          {isResolved && (
            <span className="badge bg-gray-700 text-[10px] uppercase tracking-wide text-gray-200">
              Resolved
            </span>
          )}
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

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {edge.note && (
          <div>
            <div className="section-label mb-1">Why this edge exists</div>
            <p className="text-sm text-gray-300 leading-relaxed">{edge.note}</p>
          </div>
        )}

        {edge.classifier_rationale && (
          <div className="border-l-2 border-indigo-500/60 pl-3">
            <div className="section-label mb-1 text-indigo-300/80">
              Classifier rationale
            </div>
            <p className="text-sm italic leading-relaxed text-gray-300">
              {edge.classifier_rationale}
            </p>
          </div>
        )}

        {isResolved && (
          <div className="border-l-2 border-amber-500/60 pl-3">
            <div className="section-label mb-1 text-amber-300/80">Resolved</div>
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
            <div className="section-label mb-1">From</div>
            <Link
              href={`/nodes/${edge.from_id}`}
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              {fromTitle}
            </Link>
          </div>
          <div>
            <div className="section-label mb-1">To</div>
            <Link
              href={`/nodes/${edge.to_id}`}
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              {toTitle}
            </Link>
          </div>
        </div>

        {isResolvable && (
          <div className="space-y-2 border-t border-gray-700 pt-4">
            {!isResolved && !picking && (
              <button
                onClick={() => setPicking(true)}
                disabled={submitting}
                className="btn w-full bg-gray-800 text-gray-200 hover:bg-gray-700"
              >
                Mark resolved…
              </button>
            )}

            {!isResolved && picking && (
              <div className="space-y-2">
                <div className="section-label">
                  Pick the synthesis note that supersedes this tension
                </div>
                <NodePicker
                  onSelect={handleResolveWithSynthesis}
                  exclude={[edge.from_id, edge.to_id]}
                  placeholder="Search notes…"
                  previewOnHover={true}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleResolveWithoutSynthesis}
                    disabled={submitting}
                    className="btn btn-sm flex-1 bg-gray-800 text-gray-300 hover:bg-gray-700"
                  >
                    Resolve without a synthesis note
                  </button>
                  <button
                    onClick={() => setPicking(false)}
                    disabled={submitting}
                    className="btn btn-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
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
                className="btn w-full bg-gray-800 text-gray-200 hover:bg-gray-700"
              >
                Clear resolution
              </button>
            )}

            {error && (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
