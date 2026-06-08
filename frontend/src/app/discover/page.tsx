"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listBridges,
  listOrphans,
  listStale,
  listTriangles,
  createEdge,
  getNode,
  classifyBridge,
} from "@/lib/api";
import type {
  BridgeCandidate,
  BridgeClassification,
  NodeDetail,
  NodeSummary,
  TagRef,
  TriangleCandidate,
  EdgeType,
  NodeRef,
} from "@/lib/api";
import { NodePicker } from "@/components/NodePicker";
import { NotePreviewPopover } from "@/components/NotePreviewPopover";
import { EDGE_TYPES, EDGE_TYPE_META } from "@/lib/edgeTypes";

type Tab = "orphans" | "stale" | "bridges" | "triangles";

const TAB_LABELS: Record<Tab, string> = {
  orphans: "Orphans",
  stale: "Stale",
  bridges: "Bridges",
  triangles: "Triangles",
};

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  orphans:
    "Notes with zero edges. Linking even one of these to an existing note pulls them into the graph.",
  stale:
    "Notes you haven't touched in a while. Worth a re-read or a fresh link.",
  bridges:
    "Pairs of notes that look semantically related but aren't linked. Decide whether each pair belongs together.",
  triangles:
    "Pairs of notes that share two or more graph neighbours but no direct edge. Structural counterpart to Bridges.",
};

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
  fleeting: "bg-amber-100 text-amber-700",
};

function TagChip({ tag }: { tag: TagRef }) {
  return (
    <span
      className="badge bg-gray-100 text-gray-500"
      style={
        tag.color
          ? { backgroundColor: tag.color + "33", color: tag.color }
          : undefined
      }
    >
      {tag.name}
    </span>
  );
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

// ── Edge creation form ────────────────────────────────────────────────────────

function EdgeForm({
  fromId,
  toId,
  excludeIds,
  onPickTarget,
  onSuccess,
  initialType,
  initialNote,
  classifierRationale,
  prefillKey,
}: {
  fromId: string;
  toId: string | null;
  excludeIds: string[];
  onPickTarget?: (node: NodeRef) => void;
  onSuccess: () => void;
  initialType?: EdgeType;
  initialNote?: string;
  classifierRationale?: string;
  // Bumping this signals "external suggestion changed — reset edge type and note".
  // Direct equality on the initial* values would over-fire on every parent re-render.
  prefillKey?: string | number;
}) {
  const [edgeType, setEdgeType] = useState<EdgeType>(initialType ?? "SUPPORTS");
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);

  useEffect(() => {
    if (prefillKey === undefined) return;
    if (initialType !== undefined) setEdgeType(initialType);
    if (initialNote !== undefined) setNote(initialNote);
  }, [prefillKey, initialType, initialNote]);

  async function submit() {
    if (!toId) return;
    setSaving(true);
    setEdgeError(null);
    try {
      await createEdge({
        from_id: fromId,
        to_id: toId,
        type: edgeType,
        note: note || undefined,
        classifier_rationale: classifierRationale || undefined,
      });
      onSuccess();
    } catch (e: unknown) {
      if (e instanceof Response && e.status === 409) {
        setEdgeError("Already connected with this edge type.");
      } else if (
        e &&
        typeof e === "object" &&
        "status" in e &&
        (e as { status: number }).status === 409
      ) {
        setEdgeError("Already connected with this edge type.");
      } else {
        setEdgeError("Failed to create connection.");
      }
    } finally {
      setSaving(false);
    }
  }

  const typeId = `edge-type-${fromId}`;
  const noteId = `edge-note-${fromId}`;
  return (
    <div className="flex flex-col gap-3">
      {onPickTarget && (
        <div>
          <span className="label">Connect to</span>
          <NodePicker
            onSelect={onPickTarget}
            exclude={excludeIds}
            placeholder="Search for a note to link…"
            previewOnHover
          />
        </div>
      )}
      <div>
        <label htmlFor={typeId} className="label">
          Connection type
        </label>
        <select
          id={typeId}
          value={edgeType}
          onChange={(e) => setEdgeType(e.target.value as EdgeType)}
          className="input"
        >
          {EDGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {EDGE_TYPE_META[t].label}
            </option>
          ))}
        </select>
        <p className="field-hint">{EDGE_TYPE_META[edgeType].description}</p>
      </div>
      {classifierRationale && (
        <div className="border-l-2 border-indigo-300 bg-indigo-50/40 px-3 py-2 rounded-r">
          <div className="section-label text-indigo-600/80">
            Classifier rationale
          </div>
          <p className="text-xs text-gray-700 leading-relaxed italic mt-1">
            {classifierRationale}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Saved with the edge as Claude&apos;s justification — separate from
            your note below.
          </p>
        </div>
      )}
      <div>
        <label htmlFor={noteId} className="label">
          Note (optional)
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why does this connection exist?"
          rows={2}
          className="textarea resize-none"
        />
      </div>
      {edgeError && <p className="alert-error">{edgeError}</p>}
      <button
        onClick={submit}
        disabled={saving || !toId}
        className="btn btn-primary w-full"
      >
        {saving ? "Creating…" : "Create connection"}
      </button>
    </div>
  );
}

// ── Slide-out panel ───────────────────────────────────────────────────────────

function SlideOutPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      {/* backdrop */}
      <div className="fixed inset-0 bg-black/20 z-20" onClick={onClose} />
      {/* drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed right-0 top-12 bottom-0 w-full max-w-sm bg-white border-l border-gray-200 shadow-lg z-30 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="font-medium text-sm text-gray-900 truncate">
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="btn btn-ghost btn-sm shrink-0 text-lg leading-none px-1.5"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 flex flex-col gap-5">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Node mini-card (used inside slide-out) ────────────────────────────────────

function NodeMiniCard({
  node,
}: {
  node: { id: string; title: string; type: string };
}) {
  return (
    <div className="flex items-start justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <span className="text-sm font-medium break-words min-w-0">
        {node.title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`badge ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
        <Link
          href={`/nodes/${node.id}`}
          className="text-xs text-indigo-600 hover:underline"
          target="_blank"
        >
          open ↗
        </Link>
      </div>
    </div>
  );
}

// ── BridgeNoteSection — full note display inside bridge slide-out ─────────────

function BridgeNoteSection({
  node,
  detail,
}: {
  node: { id: string; title: string; type: string };
  detail: NodeDetail | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug break-words min-w-0">
          {node.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`badge ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {node.type}
          </span>
          <Link
            href={`/nodes/${node.id}`}
            className="text-xs text-indigo-600 hover:underline"
            target="_blank"
          >
            open ↗
          </Link>
        </div>
      </div>

      {detail?.tags && detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {detail.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      )}

      {detail ? (
        <div className="text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto scrollbar-thin pr-1 whitespace-pre-wrap break-words">
          {detail.content || detail.summary || (
            <span className="italic text-gray-400">No content</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic">
          Could not load note content.
        </div>
      )}
    </div>
  );
}

// ── ClassifyBridgePanel ───────────────────────────────────────────────────────

function ClassifyBridgePanel({
  pair,
  onApply,
}: {
  pair: BridgeCandidate;
  onApply: (result: BridgeClassification) => void;
}) {
  const [result, setResult] = useState<BridgeClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on pair change
  useEffect(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, [pair.node_a.id, pair.node_b.id]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await classifyBridge(pair.node_a.id, pair.node_b.id);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-xs text-gray-500 italic flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-indigo-300 border-t-transparent animate-spin" />
        Asking Claude…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="alert-error">{error}</p>
        <button
          onClick={run}
          className="self-start text-xs text-indigo-600 hover:text-indigo-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (result === null) {
    return (
      <button
        onClick={run}
        className="btn btn-secondary w-full border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100"
      >
        ✨ Ask Claude to classify this pair
      </button>
    );
  }

  if (result.no_connection) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-md px-3 py-2 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-amber-700">
          Claude doesn&apos;t see a meaningful link
        </span>
        <p className="text-xs text-amber-800/80 leading-relaxed break-words">
          {result.rationale}
        </p>
        <button
          onClick={run}
          className="self-start text-xs text-amber-700 hover:text-amber-900"
        >
          Re-classify
        </button>
      </div>
    );
  }

  // Direction display: which node is from, which is to
  const fromNode =
    result.from_id === pair.node_a.id ? pair.node_a : pair.node_b;
  const toNode = result.to_id === pair.node_a.id ? pair.node_a : pair.node_b;

  return (
    <div className="border border-indigo-200 bg-indigo-50/50 rounded-md px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium truncate max-w-32" title={fromNode.title}>
          {fromNode.title}
        </span>
        <span className="text-indigo-400">→</span>
        <span className="font-medium truncate max-w-32" title={toNode.title}>
          {toNode.title}
        </span>
        <span className="badge bg-indigo-600 text-white font-mono">
          {result.edge_type}
        </span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed italic break-words">
        {result.rationale}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onApply(result)}
          className="btn btn-primary btn-sm"
        >
          Apply suggestion
        </button>
        <button onClick={run} className="btn btn-ghost btn-sm">
          Re-classify
        </button>
      </div>
    </div>
  );
}

// ── BridgeCard ────────────────────────────────────────────────────────────────

function BridgeCard({
  pair,
  onClick,
}: {
  pair: BridgeCandidate;
  onClick: () => void;
}) {
  const pct = Math.round(pair.similarity * 100);
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Bridge between ${pair.node_a.title} and ${pair.node_b.title}, ${pct}% similar`}
      className="card-interactive cursor-pointer px-4 py-3"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="section-label normal-case tracking-normal">
          Similarity
        </span>
        <span className="text-xs font-mono text-indigo-600">{pct}%</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded min-w-0">
          <span className="font-medium text-sm truncate">
            {pair.node_a.title}
          </span>
          <span
            className={`badge self-start ${TYPE_COLORS[pair.node_a.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_a.type}
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded min-w-0">
          <span className="font-medium text-sm truncate">
            {pair.node_b.title}
          </span>
          <span
            className={`badge self-start ${TYPE_COLORS[pair.node_b.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_b.type}
          </span>
        </div>
      </div>
    </li>
  );
}

// ── TriangleCard ──────────────────────────────────────────────────────────────

function TriangleCard({
  pair,
  onClick,
}: {
  pair: TriangleCandidate;
  onClick: () => void;
}) {
  const previewIntermediates = pair.intermediates.slice(0, 3);
  const extra = pair.intermediates.length - previewIntermediates.length;
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Triangle between ${pair.node_a.title} and ${pair.node_b.title}, ${pair.intermediate_count} shared neighbours`}
      className="card-interactive cursor-pointer px-4 py-3"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="section-label normal-case tracking-normal">
          Shared neighbours
        </span>
        <span className="text-xs font-mono text-indigo-600">
          {pair.intermediate_count}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded min-w-0">
          <span className="font-medium text-sm truncate">
            {pair.node_a.title}
          </span>
          <span
            className={`badge self-start ${TYPE_COLORS[pair.node_a.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_a.type}
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded min-w-0">
          <span className="font-medium text-sm truncate">
            {pair.node_b.title}
          </span>
          <span
            className={`badge self-start ${TYPE_COLORS[pair.node_b.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {pair.node_b.type}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        via{" "}
        {previewIntermediates.map((n, i) => (
          <span key={n.id}>
            <span className="text-gray-700">{n.title}</span>
            {i < previewIntermediates.length - 1 && ", "}
          </span>
        ))}
        {extra > 0 && <span className="text-gray-400"> + {extra} more</span>}
      </p>
    </li>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({
  node,
  hint,
  onClick,
}: {
  node: NodeSummary;
  hint?: string;
  onClick: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <li
      ref={ref}
      onMouseEnter={() => {
        timer.current = setTimeout(() => setShowPreview(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setShowPreview(false);
      }}
    >
      <button
        onClick={onClick}
        className="card-interactive w-full text-left flex items-start justify-between gap-3 px-4 py-3"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-medium text-sm truncate">{node.title}</span>
          {node.summary && (
            <span className="text-xs text-gray-500 line-clamp-2">
              {node.summary}
            </span>
          )}
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
          {node.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {node.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
        </div>
        <span
          className={`badge shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
      </button>
      <NotePreviewPopover node={node} anchorRef={ref} visible={showPreview} />
    </li>
  );
}

// ── Loading skeletons ─────────────────────────────────────────────────────────

function NoteCardSkeletonList() {
  return (
    <ul
      className="flex flex-col gap-2"
      aria-busy="true"
      aria-label="Loading notes"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="card px-4 py-3 flex items-start justify-between gap-3"
        >
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-3 w-3/4" />
          </div>
          <div className="skeleton h-5 w-16 rounded-full shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function PairCardSkeletonList({ caption }: { caption: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p className="text-sm text-gray-500">{caption}</p>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="card px-4 py-3 flex flex-col gap-2">
            <div className="skeleton h-3 w-24" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="skeleton h-14 rounded" />
              <div className="skeleton h-14 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("orphans");
  const [orphans, setOrphans] = useState<NodeSummary[] | null>(null);
  const [stale, setStale] = useState<NodeSummary[] | null>(null);
  const [bridges, setBridges] = useState<BridgeCandidate[] | null>(null);
  const [triangles, setTriangles] = useState<TriangleCandidate[] | null>(null);
  const [selectedTriangle, setSelectedTriangle] =
    useState<TriangleCandidate | null>(null);
  const [crossTag, setCrossTag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Slide-out state
  const [selectedBridge, setSelectedBridge] = useState<BridgeCandidate | null>(
    null,
  );
  const [bridgeDetails, setBridgeDetails] = useState<
    [NodeDetail | null, NodeDetail | null]
  >([null, null]);
  const [loadingBridgeDetails, setLoadingBridgeDetails] = useState(false);
  const [bridgePrefill, setBridgePrefill] = useState<{
    fromId: string;
    toId: string;
    edgeType: EdgeType;
    classifierRationale: string;
    key: number;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeSummary | null>(null);
  const [selectedNodeDetail, setSelectedNodeDetail] =
    useState<NodeDetail | null>(null);
  const [loadingNodeDetail, setLoadingNodeDetail] = useState(false);
  const [nodePickTarget, setNodePickTarget] = useState<NodeRef | null>(null);

  // Reset bridge prefill when the selected bridge changes
  useEffect(() => {
    setBridgePrefill(null);
  }, [selectedBridge?.node_a.id, selectedBridge?.node_b.id]);

  // Fetch full node detail when an orphan/stale node is opened
  useEffect(() => {
    if (!selectedNode) {
      setSelectedNodeDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingNodeDetail(true);
    setSelectedNodeDetail(null);
    getNode(selectedNode.id)
      .then((d) => {
        if (!cancelled) setSelectedNodeDetail(d);
      })
      .catch(() => {
        if (!cancelled) setSelectedNodeDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingNodeDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNode]);

  // Fetch full node details when a bridge pair is opened
  useEffect(() => {
    if (!selectedBridge) {
      setBridgeDetails([null, null]);
      return;
    }
    let cancelled = false;
    setLoadingBridgeDetails(true);
    setBridgeDetails([null, null]);
    Promise.all([
      getNode(selectedBridge.node_a.id),
      getNode(selectedBridge.node_b.id),
    ])
      .then(([a, b]) => {
        if (!cancelled) setBridgeDetails([a, b]);
      })
      .catch(() => {
        if (!cancelled) setBridgeDetails([null, null]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBridgeDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBridge]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (tab === "orphans" && orphans === null) {
          const data = await listOrphans({ limit: 50 });
          if (!cancelled) setOrphans(data);
        } else if (tab === "stale" && stale === null) {
          const data = await listStale({ limit: 50 });
          if (!cancelled) setStale(data);
        } else if (tab === "bridges" && bridges === null) {
          const data = await listBridges({
            limit: 30,
            minSimilarity: 0.7,
            crossTag,
          });
          if (!cancelled) setBridges(data);
        } else if (tab === "triangles" && triangles === null) {
          const data = await listTriangles({ limit: 30, minIntermediates: 2 });
          if (!cancelled) setTriangles(data);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, orphans, stale, bridges, triangles, crossTag]);

  function closePanel() {
    setSelectedBridge(null);
    setSelectedTriangle(null);
    setSelectedNode(null);
    setSelectedNodeDetail(null);
    setNodePickTarget(null);
  }

  function openNode(node: NodeSummary) {
    setNodePickTarget(null);
    setSelectedNode(node);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="page-title">Discover</h2>
        <p className="text-sm text-gray-500 mt-1">
          Re-encounter notes you&apos;ve forgotten or never linked.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Discovery modes"
        className="flex gap-1 border-b border-gray-200 overflow-x-auto scrollbar-none"
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              tab === t
                ? "text-gray-900 font-medium border-indigo-600"
                : "text-gray-500 hover:text-gray-900 border-transparent"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-600">{TAB_DESCRIPTIONS[tab]}</p>

      {error && <div className="alert-error">{error}</div>}

      {tab === "orphans" && (
        <>
          {loading && orphans === null ? (
            <NoteCardSkeletonList />
          ) : orphans && orphans.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-medium text-gray-700">
                No orphan notes
              </p>
              <p className="text-sm text-gray-500">
                Every note in your knowledge base is linked into the graph.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {orphans?.map((n) => (
                <NoteCard key={n.id} node={n} onClick={() => openNode(n)} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "stale" && (
        <>
          {loading && stale === null ? (
            <NoteCardSkeletonList />
          ) : stale && stale.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-medium text-gray-700">
                Nothing stale here
              </p>
              <p className="text-sm text-gray-500">
                No notes yet — capture some and they&apos;ll surface here as
                they age.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {stale?.map((n) => (
                <NoteCard
                  key={n.id}
                  node={n}
                  hint={`updated ${fmtAge(n.updated_at)}`}
                  onClick={() => openNode(n)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "bridges" && (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={crossTag}
              onChange={(e) => {
                setCrossTag(e.target.checked);
                setBridges(null);
              }}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            Hide same-tag pairs
            <span className="text-gray-400">
              — only show pairs whose two notes share no tags
            </span>
          </label>

          {loading && bridges === null ? (
            <PairCardSkeletonList caption="Scanning embeddings — this can take a moment on large corpora." />
          ) : bridges && bridges.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-medium text-gray-700">
                No bridge candidates
              </p>
              <p className="text-sm text-gray-500">
                {crossTag
                  ? "No cross-tag bridges found. Toggle off to see all candidates."
                  : "Try lowering the similarity threshold or adding more notes."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {bridges?.map((br) => (
                <BridgeCard
                  key={`${br.node_a.id}-${br.node_b.id}`}
                  pair={br}
                  onClick={() => setSelectedBridge(br)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "triangles" && (
        <>
          {loading && triangles === null ? (
            <PairCardSkeletonList caption="Scanning the graph for shared neighbours…" />
          ) : triangles && triangles.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-medium text-gray-700">
                No triangle candidates
              </p>
              <p className="text-sm text-gray-500">
                Nothing with ≥2 shared neighbours yet. Add more connections, or
                try Bridges for semantic candidates.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {triangles?.map((t) => (
                <TriangleCard
                  key={`${t.node_a.id}-${t.node_b.id}`}
                  pair={t}
                  onClick={() => setSelectedTriangle(t)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Triangle slide-out */}
      {selectedTriangle && (
        <SlideOutPanel
          title={`Triangle — ${selectedTriangle.intermediate_count} shared`}
          onClose={closePanel}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="section-label">A</span>
              <Link
                href={`/nodes/${selectedTriangle.node_a.id}`}
                className="text-sm font-medium text-indigo-700 hover:underline break-words"
              >
                {selectedTriangle.node_a.title}
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="section-label">Shared via</span>
              <ul className="flex flex-col gap-1">
                {selectedTriangle.intermediates.map((n) => (
                  <li key={n.id} className="text-xs">
                    <Link
                      href={`/nodes/${n.id}`}
                      className="text-gray-700 hover:text-indigo-700 hover:underline"
                    >
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <span className="section-label">B</span>
              <Link
                href={`/nodes/${selectedTriangle.node_b.id}`}
                className="text-sm font-medium text-indigo-700 hover:underline break-words"
              >
                {selectedTriangle.node_b.title}
              </Link>
            </div>
          </div>
          <div>
            <p className="section-label mb-3">Create A → B connection</p>
            <EdgeForm
              fromId={selectedTriangle.node_a.id}
              toId={selectedTriangle.node_b.id}
              excludeIds={[
                selectedTriangle.node_a.id,
                selectedTriangle.node_b.id,
              ]}
              onSuccess={() => {
                setTriangles((prev) =>
                  prev
                    ? prev.filter(
                        (t) =>
                          !(
                            t.node_a.id === selectedTriangle.node_a.id &&
                            t.node_b.id === selectedTriangle.node_b.id
                          ),
                      )
                    : prev,
                );
                closePanel();
              }}
            />
          </div>
        </SlideOutPanel>
      )}

      {/* Bridge pair slide-out */}
      {selectedBridge && (
        <SlideOutPanel
          title={`Bridge — ${Math.round(selectedBridge.similarity * 100)}% similar`}
          onClose={closePanel}
        >
          <div className="flex flex-col gap-4">
            {loadingBridgeDetails ? (
              <div className="space-y-3" aria-busy="true">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-20" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ) : (
              <>
                <BridgeNoteSection
                  node={selectedBridge.node_a}
                  detail={bridgeDetails[0]}
                />
                <div className="border-t border-gray-100" />
                <BridgeNoteSection
                  node={selectedBridge.node_b}
                  detail={bridgeDetails[1]}
                />
              </>
            )}
          </div>
          <ClassifyBridgePanel
            pair={selectedBridge}
            onApply={(r) => {
              if (r.no_connection || !r.edge_type || !r.from_id || !r.to_id)
                return;
              setBridgePrefill({
                fromId: r.from_id,
                toId: r.to_id,
                edgeType: r.edge_type,
                classifierRationale: r.rationale,
                key: Date.now(),
              });
            }}
          />
          <div>
            <p className="section-label mb-3">Create connection</p>
            <EdgeForm
              fromId={bridgePrefill?.fromId ?? selectedBridge.node_a.id}
              toId={bridgePrefill?.toId ?? selectedBridge.node_b.id}
              excludeIds={[selectedBridge.node_a.id, selectedBridge.node_b.id]}
              initialType={bridgePrefill?.edgeType}
              classifierRationale={bridgePrefill?.classifierRationale}
              prefillKey={bridgePrefill?.key}
              onSuccess={() => {
                // Remove this pair from the list
                setBridges((prev) =>
                  prev
                    ? prev.filter(
                        (b) =>
                          !(
                            b.node_a.id === selectedBridge.node_a.id &&
                            b.node_b.id === selectedBridge.node_b.id
                          ),
                      )
                    : prev,
                );
                closePanel();
              }}
            />
          </div>
        </SlideOutPanel>
      )}

      {/* Orphan / stale node slide-out */}
      {selectedNode && (
        <SlideOutPanel
          title={
            selectedNode.type.charAt(0).toUpperCase() +
            selectedNode.type.slice(1)
          }
          onClose={closePanel}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-sm break-words min-w-0">
                {selectedNode.title}
              </span>
              <Link
                href={`/nodes/${selectedNode.id}`}
                className="text-xs text-indigo-600 hover:underline shrink-0"
                target="_blank"
              >
                open ↗
              </Link>
            </div>
            {selectedNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedNode.tags.map((t) => (
                  <TagChip key={t.id} tag={t} />
                ))}
              </div>
            )}
            {loadingNodeDetail ? (
              <div className="space-y-1.5 mt-1" aria-busy="true">
                <div className="skeleton h-2.5 w-full" />
                <div className="skeleton h-2.5 w-5/6" />
                <div className="skeleton h-2.5 w-3/4" />
              </div>
            ) : selectedNodeDetail?.content || selectedNodeDetail?.summary ? (
              <p className="text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto scrollbar-thin whitespace-pre-wrap break-words pr-1">
                {selectedNodeDetail.content || selectedNodeDetail.summary}
              </p>
            ) : selectedNode.summary ? (
              <p className="text-xs text-gray-500 leading-relaxed break-words">
                {selectedNode.summary}
              </p>
            ) : null}
          </div>
          <div>
            <p className="section-label mb-3">Create connection</p>
            <EdgeForm
              fromId={selectedNode.id}
              toId={nodePickTarget?.id ?? null}
              excludeIds={[selectedNode.id]}
              onPickTarget={(n) => setNodePickTarget(n)}
              onSuccess={() => {
                // Remove from orphans/stale list
                if (tab === "orphans") {
                  setOrphans((prev) =>
                    prev ? prev.filter((n) => n.id !== selectedNode.id) : prev,
                  );
                } else {
                  setStale((prev) =>
                    prev ? prev.filter((n) => n.id !== selectedNode.id) : prev,
                  );
                }
                closePanel();
              }}
            />
          </div>
        </SlideOutPanel>
      )}
    </div>
  );
}
