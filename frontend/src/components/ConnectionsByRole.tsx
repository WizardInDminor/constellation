"use client";

/**
 * ConnectionsByRole — reusable Relationship Explorer panel (Phase B, ADR-078).
 *
 * Generic: given any node's detail (with edges carrying denormalised neighbor
 * type/tags/story-flag), it shows the node's connections grouped by the role
 * the neighbour plays — Scenes, Characters, Symbols, World Rules… for a
 * narrative project; Sources, Maps & Structures, Notes… for a research corpus.
 * Each group collapses/expands and shows a count; each item shows WHY it is
 * connected (the edge, direction-aware) and a resolved badge where relevant.
 *
 * Pure grouping lives in lib/connectionsByRole.ts; this file is presentation.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  type Connection,
  type RoleKey,
  connectionReason,
  connectionsFromDetail,
  groupConnectionsByRole,
} from "@/lib/connectionsByRole";
import { STATUS_META, statusFromTags } from "@/lib/lifecycleStatus";

interface NodeDetailLike {
  tags?: { name: string }[];
  outgoing_edges?: unknown[];
  incoming_edges?: unknown[];
}

interface Props {
  detail: NodeDetailLike;
  /** Heading; defaults to "Connections". */
  title?: string;
}

// Per-role accent for the count chip. Narrative roles get warm hues, generic
// knowledge roles cool — purely for at-a-glance scanning.
const ROLE_ACCENT: Record<RoleKey, string> = {
  scenes: "bg-amber-100 text-amber-800",
  characters: "bg-rose-100 text-rose-800",
  themes: "bg-purple-100 text-purple-800",
  symbols: "bg-orange-100 text-orange-800",
  locations: "bg-teal-100 text-teal-800",
  factions: "bg-red-100 text-red-800",
  worldRules: "bg-indigo-100 text-indigo-800",
  openQuestions: "bg-yellow-100 text-yellow-800",
  artifacts: "bg-lime-100 text-lime-800",
  lore: "bg-stone-100 text-stone-700",
  structures: "bg-violet-100 text-violet-800",
  sources: "bg-sky-100 text-sky-800",
  literature: "bg-blue-100 text-blue-800",
  notes: "bg-emerald-100 text-emerald-800",
  other: "bg-gray-100 text-gray-700",
};

export function ConnectionsByRole({ detail, title = "Connections" }: Props) {
  // Evidence/consequence framing: when the subject node is a world-rule (a
  // claim/regime), the scenes connected to it are the ones that *demonstrate*
  // it. This override is a domain-config decision, kept out of the pure helper.
  const isWorldRule = (detail.tags ?? []).some(
    (t) => t.name === "narrative:lore-world-rule",
  );

  const groups = useMemo(() => {
    const conns = connectionsFromDetail(detail as never);
    return groupConnectionsByRole(conns, {
      labelOverrides: isWorldRule ? { scenes: "Demonstrated In" } : undefined,
    });
  }, [detail, isWorldRule]);

  const total = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );

  if (total === 0) {
    return (
      <section className="card p-4">
        <h3 className="section-label">{title}</h3>
        <p className="mt-2 text-xs text-gray-400">
          No connections yet. Link this node to build its neighbourhood.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="section-label">{title}</h3>
        <span className="text-[11px] text-gray-400">
          {total} across {groups.length}{" "}
          {groups.length === 1 ? "role" : "roles"}
        </span>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <RoleSection
            key={g.key}
            roleKey={g.key}
            label={g.label}
            items={g.items}
          />
        ))}
      </div>
    </section>
  );
}

function RoleSection({
  roleKey,
  label,
  items,
}: {
  roleKey: RoleKey;
  label: string;
  items: Connection[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-gray-200">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <span
          className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▶
        </span>
        <span>{label}</span>
        <span
          className={`badge ml-auto ${ROLE_ACCENT[roleKey]}`}
          aria-label={`${items.length} ${label}`}
        >
          {items.length}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {items.map((c) => {
            // Surface the lifecycle status of connected Open Questions inline.
            const status =
              roleKey === "openQuestions"
                ? statusFromTags(c.neighborTags)
                : null;
            return (
              <li key={c.edgeId} className="px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/nodes/${c.neighbor.id}`}
                    className="truncate text-indigo-600 hover:underline"
                    title={c.neighbor.title}
                  >
                    {c.neighbor.title}
                  </Link>
                  {status && (
                    <span
                      className={`badge shrink-0 ${STATUS_META[status].badge}`}
                    >
                      {STATUS_META[status].label}
                    </span>
                  )}
                  <span
                    className={`shrink-0 font-mono text-[10px] ${
                      c.resolvedAt ? "text-emerald-600" : "text-gray-400"
                    }`}
                  >
                    {connectionReason(c)}
                  </span>
                </div>
                {c.note && (
                  <p
                    className="mt-0.5 truncate text-[11px] text-gray-400"
                    title={c.note}
                  >
                    {c.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
