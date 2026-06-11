"use client";

/**
 * EntityArc — generic evolution-over-time view (Phase C, ADR-081).
 *
 * Shows how ANY entity changed: its appearances ordered chronologically, each
 * with the edge note read as the interpretation at that point, plus future
 * payoff points (pending/unwritten appearances). Works for symbols, characters,
 * themes, world rules, open questions, research concepts, learning topics —
 * anything with ordered connections. Ordering is derived server-side from
 * existing data (timeline position / created_at); this is presentation only.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import { type EntityArc as EntityArcData, getEntityArc } from "@/lib/api";
import {
  type ArcAppearanceLike,
  ORDERING_BASIS_LABEL,
  type OrderingBasis,
  appearanceTimeLabel,
  arcIsMeaningful,
  pendingCount,
} from "@/lib/entityArc";

export function EntityArc({
  nodeId,
  title = "Evolution",
}: {
  nodeId: string;
  title?: string;
}) {
  const [arc, setArc] = useState<EntityArcData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setArc(null);
    setError(null);
    getEntityArc(nodeId)
      .then((a) => {
        if (!cancelled) setArc(a);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load arc");
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  if (error) {
    return (
      <section className="card p-4">
        <h3 className="section-label">{title}</h3>
        <p className="alert-error mt-2">{error}</p>
      </section>
    );
  }
  if (arc === null) {
    return (
      <section className="card p-4" aria-busy="true">
        <h3 className="section-label">{title}</h3>
        <div className="skeleton mt-2 h-4 w-2/3" />
        <div className="skeleton mt-2 h-4 w-full" />
      </section>
    );
  }

  // Hide entirely when there's no sequence worth showing — keeps the node page
  // uncluttered for leaf notes.
  if (!arcIsMeaningful(arc)) return null;

  const pending = pendingCount(arc.appearances);

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="section-label">{title}</h3>
        <span className="text-[11px] text-gray-400">
          {arc.appearances.length} appearance
          {arc.appearances.length === 1 ? "" : "s"}
          {pending > 0 && ` · ${pending} pending`}
        </span>
      </div>
      <p className="mb-3 text-[11px] text-gray-400">
        {ORDERING_BASIS_LABEL[arc.ordering_basis as OrderingBasis]}
      </p>

      <ol className="relative ml-1 border-l border-gray-200">
        {arc.appearances.map((a, i) => (
          <ArcStep key={a.edge_id} appearance={a} index={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function ArcStep({
  appearance,
  index,
}: {
  appearance: ArcAppearanceLike & {
    edge_id: string;
    node: { id: string; title: string };
    edge_type: string;
  };
  index: number;
}) {
  return (
    <li className="relative mb-3 pl-4 last:mb-0">
      <span
        className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${
          appearance.is_pending ? "bg-amber-400" : "bg-indigo-500"
        }`}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/nodes/${appearance.node.id}`}
          className="truncate text-xs font-medium text-indigo-600 hover:underline"
          title={appearance.node.title}
        >
          <span className="mr-1 text-gray-300">{index}.</span>
          {appearance.node.title}
        </Link>
        <span className="shrink-0 text-[10px] text-gray-400">
          {appearanceTimeLabel(appearance)}
        </span>
      </div>
      {appearance.meaning && (
        <p className="mt-0.5 text-xs text-gray-700">{appearance.meaning}</p>
      )}
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
        <span className="font-mono">
          {appearance.edge_type.toLowerCase().replace(/_/g, " ")}
        </span>
        {appearance.is_pending && (
          <span className="badge bg-amber-100 text-amber-800">
            future payoff
          </span>
        )}
      </div>
    </li>
  );
}
