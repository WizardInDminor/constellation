"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getProposals,
  listProjects,
  type ProjectSummary,
  type ProposalStatus,
  type ProposalSummary,
  type ProposalType,
} from "@/lib/api";
import { timeAgo } from "@/app/inbox/timeFormat";
import { STATUS_BADGE } from "./shared";

// Inbox filter groups (ADR-084). "Open" is the default working set; resolved
// states remain reachable so the audit trail is one click away (AT-030).
const STATUS_GROUPS: { key: string; label: string; statuses: ProposalStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["captured", "proposed", "under_review"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  {
    key: "closed",
    label: "Superseded / archived",
    statuses: ["superseded", "archived"],
  },
];

const TYPE_OPTIONS: (ProposalType | "all")[] = [
  "all",
  "scene",
  "character",
  "theme",
  "location",
  "world_rule",
  "development_note",
  "edge",
  "general",
];

function ProposalRow({ p }: { p: ProposalSummary }) {
  return (
    <Link
      href={`/proposals/${p.id}`}
      className="card flex flex-col gap-1.5 p-3 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 break-words">
          {p.title}
        </span>
        <span className={`badge shrink-0 ${STATUS_BADGE[p.status] ?? "bg-gray-100"}`}>
          {p.status.replace("_", " ")}
        </span>
      </div>
      {p.summary && (
        <p className="text-xs text-gray-500 line-clamp-2">{p.summary}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="badge bg-indigo-50 text-indigo-700 capitalize">
          {p.proposal_type.replace("_", " ")}
        </span>
        {p.source_client_name && (
          <span title={`Created by ${p.source_client_name}`}>
            from {p.source_client_name}
          </span>
        )}
        {p.related_count > 0 && <span>{p.related_count} linked</span>}
        <span className="ml-auto" title={p.created_at}>
          {timeAgo(p.created_at)}
        </span>
      </div>
    </Link>
  );
}

export default function ProposalsPage() {
  const [group, setGroup] = useState("open");
  const [typeFilter, setTypeFilter] = useState<ProposalType | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses = STATUS_GROUPS.find((g) => g.key === group)!.statuses;
      setProposals(
        await getProposals({
          statuses,
          projectHubId: projectFilter === "all" ? undefined : projectFilter,
          proposalType: typeFilter === "all" ? undefined : typeFilter,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposals");
    } finally {
      setLoading(false);
    }
  }, [group, typeFilter, projectFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
        <p className="text-sm text-gray-500">
          The review inbox. AI-created material lands here as proposals — never
          directly in accepted truth. Accept, edit, reject, or supersede;
          provenance and revision history are preserved.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={`btn btn-sm ${group === g.key ? "btn-primary" : "btn-ghost"}`}
          >
            {g.label}
          </button>
        ))}
        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ProposalType | "all")}
          className="input input-sm ml-auto w-auto"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by project"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="input input-sm w-auto"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.hub.id} value={p.hub.id}>
              {p.hub.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="alert-error">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && proposals.length === 0 && !error && (
        <p className="text-sm text-gray-400">
          Nothing here. Proposals arrive from AI clients (and from your own
          drafts) and wait for your review.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {proposals.map((p) => (
          <ProposalRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
