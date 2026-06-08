"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { clusterSuggestLinks, createEdge, listTags } from "@/lib/api";
import type {
  ClusterLinkProposal,
  ClusterSuggestResponse,
  EdgeType,
  TagRef,
} from "@/lib/api";
import { EDGE_TYPES, EDGE_TYPE_META, directionGlyph } from "@/lib/edgeTypes";

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
};

interface ProposalRowState {
  proposal: ClusterLinkProposal;
  edgeType: EdgeType;
  status: "pending" | "accepted" | "rejected" | "saving" | "error";
  error?: string;
}

function ProposalRow({
  row,
  onAccept,
  onReject,
  onTypeChange,
}: {
  row: ProposalRowState;
  onAccept: () => void;
  onReject: () => void;
  onTypeChange: (t: EdgeType) => void;
}) {
  const { proposal: p, edgeType, status, error } = row;
  const dimmed = status === "accepted" || status === "rejected";

  return (
    <li
      className={`card flex flex-col gap-2 p-3 transition-opacity ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span
          className={`badge shrink-0 ${TYPE_COLORS[p.from_node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {p.from_node.type}
        </span>
        <Link
          href={`/nodes/${p.from_node.id}`}
          className="text-indigo-700 hover:underline truncate max-w-xs"
        >
          {p.from_node.title}
        </Link>
        <span className="text-xs text-gray-400" aria-hidden="true">
          {directionGlyph(edgeType)}
        </span>
        <label
          htmlFor={`edge-type-${p.from_node.id}-${p.to_node.id}`}
          className="sr-only"
        >
          Edge type
        </label>
        <select
          id={`edge-type-${p.from_node.id}-${p.to_node.id}`}
          value={edgeType}
          onChange={(e) => onTypeChange(e.target.value as EdgeType)}
          disabled={status !== "pending" && status !== "error"}
          className="input w-auto px-2 py-1 font-mono text-xs"
        >
          {EDGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span
          className={`badge shrink-0 ${TYPE_COLORS[p.to_node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {p.to_node.type}
        </span>
        <Link
          href={`/nodes/${p.to_node.id}`}
          className="text-indigo-700 hover:underline truncate max-w-xs"
        >
          {p.to_node.title}
        </Link>
      </div>

      <p className="text-xs italic leading-relaxed text-gray-600">
        {p.rationale}
      </p>
      <p className="text-[10px] text-gray-400">
        {EDGE_TYPE_META[edgeType].description}
      </p>

      {error && <div className="alert-error">{error}</div>}

      <div className="flex items-center gap-2 text-xs">
        {status === "pending" || status === "error" ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              className="btn btn-primary btn-sm"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onReject}
              className="btn btn-secondary btn-sm"
            >
              Reject
            </button>
          </>
        ) : status === "saving" ? (
          <span className="text-gray-500">Saving…</span>
        ) : status === "accepted" ? (
          <span className="font-medium text-green-700">✓ Accepted</span>
        ) : (
          <span className="text-gray-500">— Rejected</span>
        )}
      </div>
    </li>
  );
}

function ClusterLinksInner() {
  const searchParams = useSearchParams();
  const [tags, setTags] = useState<TagRef[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>(
    searchParams.get("tag_id") ?? "",
  );
  const [rows, setRows] = useState<ProposalRowState[]>([]);
  const [scopeSize, setScopeSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  const run = useCallback(async (tagId: string) => {
    if (!tagId) return;
    setLoading(true);
    setError(null);
    setRows([]);
    setScopeSize(null);
    try {
      const res: ClusterSuggestResponse = await clusterSuggestLinks({
        tag_id: tagId,
      });
      setScopeSize(res.scope_size);
      setRows(
        res.proposals.map((p) => ({
          proposal: p,
          edgeType: p.edge_type,
          status: "pending" as const,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run when a tag is preselected via URL
  useEffect(() => {
    const urlTag = searchParams.get("tag_id");
    if (
      urlTag &&
      urlTag === selectedTagId &&
      rows.length === 0 &&
      !loading &&
      !error
    ) {
      run(urlTag);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateRow(idx: number, patch: Partial<ProposalRowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function acceptOne(idx: number) {
    const row = rows[idx];
    if (!row) return;
    updateRow(idx, { status: "saving", error: undefined });
    try {
      await createEdge({
        from_id: row.proposal.from_node.id,
        to_id: row.proposal.to_node.id,
        type: row.edgeType,
        note: row.proposal.rationale || undefined,
      });
      updateRow(idx, { status: "accepted" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      // 409 = already exists; treat as accepted (idempotent)
      if (msg.includes("409") || msg.includes("already exists")) {
        updateRow(idx, { status: "accepted" });
      } else {
        updateRow(idx, { status: "error", error: msg });
      }
    }
  }

  async function acceptAll() {
    // Process sequentially so the user sees progress and errors don't cascade
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === "pending") {
        await acceptOne(i);
      }
    }
  }

  const pendingCount = rows.filter(
    (r) => r.status === "pending" || r.status === "error",
  ).length;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Cluster suggest-links</h1>
        <p className="text-sm text-gray-500">
          Pick a tag; Claude runs <code>suggest-links</code> across each note in
          scope and deduplicates the proposals into one row per pair-of-notes.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label htmlFor="cluster-tag" className="label">
            Tag
          </label>
          <select
            id="cluster-tag"
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="input w-auto min-w-[12rem]"
          >
            <option value="">Choose a tag…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => run(selectedTagId)}
          disabled={!selectedTagId || loading}
          className="btn btn-primary"
        >
          {loading ? "Asking Claude…" : "Suggest"}
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={acceptAll}
            className="btn btn-secondary"
          >
            Accept all ({pendingCount})
          </button>
        )}
      </div>

      {scopeSize !== null && !loading && (
        <p className="text-xs text-gray-500">
          Scope: {scopeSize} note{scopeSize === 1 ? "" : "s"}. Proposals:{" "}
          {rows.length}.
        </p>
      )}

      {error && <div className="alert-error">{error}</div>}

      {loading && (
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
          <p className="text-sm">Per-note suggest-links in parallel…</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <ProposalRow
              key={`${r.proposal.from_node.id}-${r.proposal.to_node.id}`}
              row={r}
              onAccept={() => acceptOne(i)}
              onReject={() => updateRow(i, { status: "rejected" })}
              onTypeChange={(t) => updateRow(i, { edgeType: t })}
            />
          ))}
        </ul>
      )}

      {!loading && rows.length === 0 && scopeSize !== null && (
        <div className="empty-state">
          <p className="text-sm font-medium text-gray-600">No proposals</p>
          <p className="text-sm text-gray-400">
            Claude found no meaningful new connections in this scope.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ClusterLinksPage() {
  return (
    <Suspense fallback={null}>
      <ClusterLinksInner />
    </Suspense>
  );
}
