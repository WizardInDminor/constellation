"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listBridges,
  listOrphans,
  listStale,
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
  EdgeType,
  NodeRef,
} from "@/lib/api";
import { NodePicker } from "@/components/NodePicker";
import { NotePreviewPopover } from "@/components/NotePreviewPopover";
import { EDGE_TYPES, EDGE_TYPE_META } from "@/lib/edgeTypes";

type Tab = "orphans" | "stale" | "bridges";

const TAB_LABELS: Record<Tab, string> = {
  orphans: "Orphans",
  stale: "Stale",
  bridges: "Bridges",
};

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  orphans: "Notes with zero edges. Linking even one of these to an existing note pulls them into the graph.",
  stale: "Notes you haven't touched in a while. Worth a re-read or a fresh link.",
  bridges:
    "Pairs of notes that look semantically related but aren't linked. Decide whether each pair belongs together.",
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
      className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
      style={tag.color ? { backgroundColor: tag.color + "33", color: tag.color } : undefined}
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
      } else if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 409) {
        setEdgeError("Already connected with this edge type.");
      } else {
        setEdgeError("Failed to create connection.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {onPickTarget && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Connect to</label>
          <NodePicker onSelect={onPickTarget} exclude={excludeIds} placeholder="Search for a note to link…" previewOnHover />
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Connection type</label>
        <select
          value={edgeType}
          onChange={(e) => setEdgeType(e.target.value as EdgeType)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        >
          {EDGE_TYPES.map((t) => (
            <option key={t} value={t}>{EDGE_TYPE_META[t].label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{EDGE_TYPE_META[edgeType].description}</p>
      </div>
      {classifierRationale && (
        <div className="border-l-2 border-indigo-300 bg-indigo-50/40 px-2 py-1.5 rounded-r">
          <div className="text-xs uppercase tracking-wide text-indigo-600/80 font-medium">
            Classifier rationale
          </div>
          <p className="text-xs text-gray-700 leading-relaxed italic mt-0.5">
            {classifierRationale}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Saved with the edge as Claude&apos;s justification — separate from your note below.
          </p>
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why does this connection exist?"
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
        />
      </div>
      {edgeError && <p className="text-xs text-red-600">{edgeError}</p>}
      <button
        onClick={submit}
        disabled={saving || !toId}
        className="w-full text-sm bg-indigo-600 text-white rounded px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
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
      <div
        className="fixed inset-0 bg-black/20 z-20"
        onClick={onClose}
      />
      {/* drawer */}
      <div className="fixed right-0 top-12 bottom-0 w-80 bg-white border-l border-gray-200 shadow-lg z-30 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="font-medium text-sm">{title}</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Node mini-card (used inside slide-out) ────────────────────────────────────

function NodeMiniCard({ node }: { node: { id: string; title: string; type: string } }) {
  return (
    <div className="flex items-start justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <span className="text-sm font-medium">{node.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
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
        <span className="font-medium text-sm leading-snug">{node.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
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
            <span
              key={t.id}
              className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
              style={t.color ? { backgroundColor: t.color + "33", color: t.color } : undefined}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      {detail ? (
        <div className="text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto pr-1 whitespace-pre-wrap">
          {detail.content || detail.summary || <span className="italic text-gray-400">No content</span>}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic">Could not load note content.</div>
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
        <p className="text-xs text-red-600">{error}</p>
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
        className="w-full text-sm border border-indigo-200 bg-indigo-50/50 text-indigo-700 rounded px-3 py-2 hover:bg-indigo-100 transition-colors"
      >
        ✨ Ask Claude to classify this pair
      </button>
    );
  }

  if (result.no_connection) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded px-3 py-2 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-amber-700">
          Claude doesn&apos;t see a meaningful link
        </span>
        <p className="text-xs text-amber-800/80 leading-relaxed">{result.rationale}</p>
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
  const fromNode = result.from_id === pair.node_a.id ? pair.node_a : pair.node_b;
  const toNode = result.to_id === pair.node_a.id ? pair.node_a : pair.node_b;

  return (
    <div className="border border-indigo-200 bg-indigo-50/50 rounded px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium truncate max-w-32" title={fromNode.title}>
          {fromNode.title}
        </span>
        <span className="text-indigo-400">→</span>
        <span className="font-medium truncate max-w-32" title={toNode.title}>
          {toNode.title}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono">
          {result.edge_type}
        </span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed italic">
        {result.rationale}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onApply(result)}
          className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Apply suggestion
        </button>
        <button
          onClick={run}
          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
        >
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
      className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">Similarity</span>
        <span className="text-xs font-mono text-indigo-600">{pct}%</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded">
          <span className="font-medium text-sm truncate">{pair.node_a.title}</span>
          <span className={`self-start text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[pair.node_a.type] ?? "bg-gray-100 text-gray-600"}`}>
            {pair.node_a.type}
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2 border border-gray-100 rounded">
          <span className="font-medium text-sm truncate">{pair.node_b.title}</span>
          <span className={`self-start text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[pair.node_b.type] ?? "bg-gray-100 text-gray-600"}`}>
            {pair.node_b.type}
          </span>
        </div>
      </div>
    </li>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ node, hint, onClick }: { node: NodeSummary; hint?: string; onClick: () => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <li
      ref={ref}
      onMouseEnter={() => { timer.current = setTimeout(() => setShowPreview(true), 300); }}
      onMouseLeave={() => { clearTimeout(timer.current); setShowPreview(false); }}
    >
      <button
        onClick={onClick}
        className="w-full text-left flex items-start justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
      >
        <div className="flex flex-col gap-1 min-w-0 pr-4">
          <span className="font-medium text-sm truncate">{node.title}</span>
          {node.summary && (
            <span className="text-xs text-gray-500 line-clamp-2">{node.summary}</span>
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
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
          {node.type}
        </span>
      </button>
      <NotePreviewPopover node={node} anchorRef={ref} visible={showPreview} />
    </li>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("orphans");
  const [orphans, setOrphans] = useState<NodeSummary[] | null>(null);
  const [stale, setStale] = useState<NodeSummary[] | null>(null);
  const [bridges, setBridges] = useState<BridgeCandidate[] | null>(null);
  const [crossTag, setCrossTag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Slide-out state
  const [selectedBridge, setSelectedBridge] = useState<BridgeCandidate | null>(null);
  const [bridgeDetails, setBridgeDetails] = useState<[NodeDetail | null, NodeDetail | null]>([null, null]);
  const [loadingBridgeDetails, setLoadingBridgeDetails] = useState(false);
  const [bridgePrefill, setBridgePrefill] = useState<{
    fromId: string;
    toId: string;
    edgeType: EdgeType;
    classifierRationale: string;
    key: number;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeSummary | null>(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<NodeDetail | null>(null);
  const [loadingNodeDetail, setLoadingNodeDetail] = useState(false);
  const [nodePickTarget, setNodePickTarget] = useState<NodeRef | null>(null);

  // Reset bridge prefill when the selected bridge changes
  useEffect(() => {
    setBridgePrefill(null);
  }, [selectedBridge?.node_a.id, selectedBridge?.node_b.id]);

  // Fetch full node detail when an orphan/stale node is opened
  useEffect(() => {
    if (!selectedNode) { setSelectedNodeDetail(null); return; }
    let cancelled = false;
    setLoadingNodeDetail(true);
    setSelectedNodeDetail(null);
    getNode(selectedNode.id)
      .then((d) => { if (!cancelled) setSelectedNodeDetail(d); })
      .catch(() => { if (!cancelled) setSelectedNodeDetail(null); })
      .finally(() => { if (!cancelled) setLoadingNodeDetail(false); });
    return () => { cancelled = true; };
  }, [selectedNode]);

  // Fetch full node details when a bridge pair is opened
  useEffect(() => {
    if (!selectedBridge) { setBridgeDetails([null, null]); return; }
    let cancelled = false;
    setLoadingBridgeDetails(true);
    setBridgeDetails([null, null]);
    Promise.all([getNode(selectedBridge.node_a.id), getNode(selectedBridge.node_b.id)])
      .then(([a, b]) => { if (!cancelled) setBridgeDetails([a, b]); })
      .catch(() => { if (!cancelled) setBridgeDetails([null, null]); })
      .finally(() => { if (!cancelled) setLoadingBridgeDetails(false); });
    return () => { cancelled = true; };
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
          const data = await listBridges({ limit: 30, minSimilarity: 0.7, crossTag });
          if (!cancelled) setBridges(data);
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
  }, [tab, orphans, stale, bridges, crossTag]);

  function closePanel() {
    setSelectedBridge(null);
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
        <h2 className="text-xl font-semibold">Discover</h2>
        <p className="text-sm text-gray-500 mt-1">
          Re-encounter notes you&apos;ve forgotten or never linked.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-600">{TAB_DESCRIPTIONS[tab]}</p>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {tab === "orphans" && (
        <>
          {loading && orphans === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orphans && orphans.length === 0 ? (
            <p className="text-sm text-gray-400">
              No orphan notes — every note in your knowledge base is linked.
            </p>
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
            <p className="text-sm text-gray-400">Loading…</p>
          ) : stale && stale.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet.</p>
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
            <p className="text-sm text-gray-400">
              Scanning embeddings — this can take a moment on large corpora.
            </p>
          ) : bridges && bridges.length === 0 ? (
            <p className="text-sm text-gray-400">
              {crossTag
                ? "No cross-tag bridges found. Toggle off to see all candidates."
                : "No bridge candidates found. Try lowering the similarity threshold or adding more notes."}
            </p>
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

      {/* Bridge pair slide-out */}
      {selectedBridge && (
        <SlideOutPanel
          title={`Bridge — ${Math.round(selectedBridge.similarity * 100)}% similar`}
          onClose={closePanel}
        >
          <div className="flex flex-col gap-4">
            {loadingBridgeDetails ? (
              <div className="space-y-3">
                <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                <div className="h-20 bg-gray-50 rounded animate-pulse" />
                <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
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
              if (r.no_connection || !r.edge_type || !r.from_id || !r.to_id) return;
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
            <p className="text-xs text-gray-500 font-medium mb-3">Create connection</p>
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
                          !(b.node_a.id === selectedBridge.node_a.id &&
                            b.node_b.id === selectedBridge.node_b.id),
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
          title={selectedNode.type.charAt(0).toUpperCase() + selectedNode.type.slice(1)}
          onClose={closePanel}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-sm">{selectedNode.title}</span>
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
                {selectedNode.tags.map((t) => <TagChip key={t.id} tag={t} />)}
              </div>
            )}
            {loadingNodeDetail ? (
              <div className="space-y-1.5 mt-1">
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-full" />
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-5/6" />
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-3/4" />
              </div>
            ) : (selectedNodeDetail?.content || selectedNodeDetail?.summary) ? (
              <p className="text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap pr-1">
                {selectedNodeDetail.content || selectedNodeDetail.summary}
              </p>
            ) : selectedNode.summary ? (
              <p className="text-xs text-gray-500 leading-relaxed">{selectedNode.summary}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-3">Create connection</p>
            <EdgeForm
              fromId={selectedNode.id}
              toId={nodePickTarget?.id ?? null}
              excludeIds={[selectedNode.id]}
              onPickTarget={(n) => setNodePickTarget(n)}
              onSuccess={() => {
                // Remove from orphans/stale list
                if (tab === "orphans") {
                  setOrphans((prev) => prev ? prev.filter((n) => n.id !== selectedNode.id) : prev);
                } else {
                  setStale((prev) => prev ? prev.filter((n) => n.id !== selectedNode.id) : prev);
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
