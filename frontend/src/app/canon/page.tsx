"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  canonAsk,
  getCanonView,
  getOpenThreads,
  type CanonAskResponse,
  type CanonView,
  type NodeSummary,
  type OpenThreadEdge,
} from "@/lib/api";
import { NoteContent } from "@/components/NoteContent";
import { EDGE_COLORS, EDGE_TYPE_META } from "@/lib/edgeTypes";

// The Canon saved-views (ADR-073). Each maps to a deterministic backend filter;
// "open_threads" has its own richer shape (tensions + unresolved nodes).
const VIEWS: { key: CanonView; label: string; blurb: string }[] = [
  {
    key: "images_carrying_charge",
    label: "Images Carrying Charge",
    blurb: "High- and goosebump-charge images. The felt-sense material.",
  },
  {
    key: "emerging_truths",
    label: "Emerging Truths",
    blurb: "Emerging or provisional — central but not yet canon.",
  },
  {
    key: "do_not_name_yet",
    label: "Do Not Name Yet",
    blurb: "Load-bearing mysteries kept deliberately open.",
  },
  {
    key: "speculative",
    label: "Speculative",
    blurb: "Possibilities being explored, not committed.",
  },
  {
    key: "open_threads",
    label: "Open Threads",
    blurb: "Unresolved questions and tensions.",
  },
];

const CHARGE_BADGE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-800",
  goosebump: "bg-red-100 text-red-800",
};

const CANON_BADGE: Record<string, string> = {
  canon: "bg-green-100 text-green-800",
  provisional: "bg-sky-100 text-sky-800",
  speculative: "bg-violet-100 text-violet-800",
  image_only: "bg-fuchsia-100 text-fuchsia-800",
  discarded: "bg-gray-200 text-gray-500",
};

function NodeCard({ n }: { n: NodeSummary }) {
  return (
    <Link
      href={`/nodes/${n.id}`}
      className="card flex flex-col gap-1.5 p-3 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 break-words">
          {n.title}
        </span>
        <span className="badge shrink-0 bg-gray-100 text-gray-500 capitalize">
          {n.type}
        </span>
      </div>
      {n.summary && (
        <p className="text-xs text-gray-500 line-clamp-2">{n.summary}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {n.charge && (
          <span className={`badge ${CHARGE_BADGE[n.charge] ?? "bg-gray-100"}`}>
            {n.charge}
          </span>
        )}
        {n.canon_status && (
          <span
            className={`badge ${CANON_BADGE[n.canon_status] ?? "bg-gray-100"}`}
          >
            {n.canon_status.replace("_", " ")}
          </span>
        )}
        {n.node_status && (
          <span className="badge bg-slate-100 text-slate-600">
            {n.node_status}
          </span>
        )}
        {n.do_not_name_yet && (
          <span className="badge bg-stone-200 text-stone-700">
            do not name yet
          </span>
        )}
      </div>
    </Link>
  );
}

function TensionRow({ e }: { e: OpenThreadEdge }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/nodes/${e.from_node.id}`}
          className="text-indigo-700 hover:underline"
        >
          {e.from_node.title}
        </Link>
        <span className={`badge ${EDGE_COLORS[e.type]}`}>
          {EDGE_TYPE_META[e.type].label}
        </span>
        <Link
          href={`/nodes/${e.to_node.id}`}
          className="text-indigo-700 hover:underline"
        >
          {e.to_node.title}
        </Link>
      </div>
      {e.note && <p className="text-xs text-gray-500 italic">{e.note}</p>}
    </div>
  );
}

export default function CanonPage() {
  const [view, setView] = useState<CanonView>("images_carrying_charge");
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [tensions, setTensions] = useState<OpenThreadEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [narration, setNarration] = useState<CanonAskResponse | null>(null);
  const [narrating, setNarrating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNarration(null);
    setTensions([]);
    try {
      if (view === "open_threads") {
        const res = await getOpenThreads();
        setTensions(res.tensions);
        setNodes(res.unresolved_nodes);
      } else {
        const res = await getCanonView(view);
        setNodes(res.nodes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load view");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  async function narrate() {
    setNarrating(true);
    try {
      setNarration(await canonAsk(view));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Narration failed");
    } finally {
      setNarrating(false);
    }
  }

  const active = VIEWS.find((v) => v.key === view)!;
  const empty = !loading && nodes.length === 0 && tensions.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canon</h1>
        <p className="text-sm text-gray-500">
          Saved views over uncertainty — charge, emergence, and what to keep
          open. Uncertainty is first-class here: nothing is flattened into fact
          before its time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`btn btn-sm ${view === v.key ? "btn-primary" : "btn-ghost"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">{active.blurb}</p>
        <button
          onClick={narrate}
          disabled={narrating || empty}
          className="btn btn-ghost btn-sm"
        >
          {narrating ? "Asking…" : "Narrate with AI"}
        </button>
      </div>

      {error && <p className="alert-error">{error}</p>}

      {narration && (
        <div className="card flex flex-col gap-2 border-indigo-100 bg-indigo-50/40 p-4">
          <span className="section-label">AI narration</span>
          <div className="prose prose-sm max-w-none text-sm text-gray-700">
            <NoteContent content={narration.answer} />
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {empty && (
        <p className="text-sm text-gray-400">
          Nothing here yet. Mark nodes with charge / status on their detail page
          to populate this view.
        </p>
      )}

      {view === "open_threads" && tensions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="section-label">Unresolved tensions</span>
          {tensions.map((e) => (
            <TensionRow key={e.id} e={e} />
          ))}
        </div>
      )}

      {nodes.length > 0 && (
        <div className="flex flex-col gap-2">
          {view === "open_threads" && (
            <span className="section-label">Unresolved nodes</span>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {nodes.map((n) => (
              <NodeCard key={n.id} n={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
