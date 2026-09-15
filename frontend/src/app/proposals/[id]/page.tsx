"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getProposal,
  transitionProposal,
  updateProposal,
  type ProposalDetail,
  type ProposalStatus,
  type ProvenanceRecord,
} from "@/lib/api";
import { formatAbsolute, timeAgo } from "@/app/inbox/timeFormat";
import { NoteContent } from "@/components/NoteContent";
import { MarkdownTextarea } from "@/components/MarkdownTextarea";
import { STATUS_BADGE } from "../shared";

const OPEN_STATUSES: ProposalStatus[] = ["captured", "proposed", "under_review"];

function ProvenanceCard({
  label,
  record,
}: {
  label: string;
  record: ProvenanceRecord;
}) {
  return (
    <div className="card flex flex-col gap-1 p-3 text-xs text-gray-600">
      <span className="section-label">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="capitalize">
          {record.actor_type.replace("_", " ")}
          {record.client_name ? ` — ${record.client_name}` : ""}
        </span>
        {record.source_conversation_id && (
          <span title="Source conversation">
            conv: {record.source_conversation_id}
          </span>
        )}
        {record.source_session_id && (
          <span title="Source session">session: {record.source_session_id}</span>
        )}
        <span>{formatAbsolute(record.created_at)}</span>
      </div>
    </div>
  );
}

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await getProposal(params.id);
      setProposal(p);
      setEditTitle(p.title);
      setEditSummary(p.summary ?? "");
      setEditContent((p.payload?.content as string | undefined) ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposal");
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function applyTransition(to: ProposalStatus) {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const result = await transitionProposal(proposal.id, {
        to_status: to,
        resolution_note: resolutionNote || null,
      });
      if (to === "accepted" && result.created_node_id) {
        router.push(`/nodes/${result.created_node_id}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      await updateProposal(proposal.id, {
        title: editTitle,
        summary: editSummary || null,
        payload: { ...(proposal.payload ?? {}), content: editContent },
        change_summary: "Edited in review",
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!proposal) {
    return (
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="alert-error">{error}</p>
        ) : (
          <p className="text-sm text-gray-400">Loading…</p>
        )}
      </div>
    );
  }

  const isOpen = OPEN_STATUSES.includes(proposal.status);
  const content = (proposal.payload?.content as string | undefined) ?? "";
  const relatedObjects = proposal.related_objects ?? [];
  const revisions = proposal.revisions ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-2">
        <Link href="/proposals" className="text-xs text-indigo-600 hover:underline">
          ← All proposals
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{proposal.title}</h1>
          <span className={`badge shrink-0 ${STATUS_BADGE[proposal.status]}`}>
            {proposal.status.replace("_", " ")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="badge bg-indigo-50 text-indigo-700 capitalize">
            {proposal.proposal_type.replace("_", " ")}
          </span>
          <span title={proposal.created_at}>
            created {timeAgo(proposal.created_at)}
          </span>
          {proposal.resolved_at && (
            <span title={proposal.resolved_at}>
              resolved {timeAgo(proposal.resolved_at)}
            </span>
          )}
        </div>
      </div>

      {error && <p className="alert-error">{error}</p>}

      {editing ? (
        <div className="card flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Title
            <input
              className="input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Summary
            <input
              className="input"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Content
            <MarkdownTextarea
              className="input"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy}>
              Save edit
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-4">
          {proposal.summary && (
            <p className="text-sm text-gray-600">{proposal.summary}</p>
          )}
          {content ? (
            <div className="prose prose-sm max-w-none text-sm text-gray-700">
              <NoteContent content={content} />
            </div>
          ) : (
            <p className="text-xs text-gray-400">No draft content in payload.</p>
          )}
          {isOpen && (
            <button
              className="btn btn-ghost btn-sm self-start"
              onClick={() => setEditing(true)}
            >
              Edit before deciding
            </button>
          )}
        </div>
      )}

      {relatedObjects.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="section-label">
            Proposed links ({relatedObjects.length}) — created only on
            accept
          </span>
          {relatedObjects.map((r, i) => (
            <div key={i} className="card flex flex-wrap items-center gap-2 p-2 text-sm">
              <span className="badge bg-gray-100 text-gray-600">
                {r.direction === "outgoing" ? "→" : "←"} {r.relationship_type}
              </span>
              <Link
                href={`/nodes/${r.object_id}`}
                className="text-indigo-700 hover:underline"
              >
                {r.object_id}
              </Link>
              {r.note && <span className="text-xs text-gray-500">{r.note}</span>}
            </div>
          ))}
        </div>
      )}

      {proposal.accepted_node_id && (
        <p className="text-sm">
          Accepted as{" "}
          <Link
            href={`/nodes/${proposal.accepted_node_id}`}
            className="text-indigo-700 hover:underline"
          >
            node {proposal.accepted_node_id}
          </Link>
        </p>
      )}
      {proposal.resolution_note && (
        <p className="text-sm text-gray-600 italic">
          Resolution: {proposal.resolution_note}
        </p>
      )}

      {isOpen && (
        <div className="card flex flex-col gap-3 border-amber-100 bg-amber-50/40 p-4">
          <span className="section-label">Resolve</span>
          <input
            className="input"
            placeholder="Resolution note (optional)"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => applyTransition("accepted")}
              disabled={busy}
            >
              Accept
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => applyTransition("rejected")}
              disabled={busy}
            >
              Reject
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => applyTransition("superseded")}
              disabled={busy}
            >
              Supersede
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Accepting creates a provisional node (plus the proposed links) and
            records who resolved it. Nothing becomes settled canon
            automatically.
          </p>
        </div>
      )}

      <ProvenanceCard label="Source" record={proposal.source_provenance} />
      {proposal.resolution_provenance && (
        <ProvenanceCard
          label="Resolved by"
          record={proposal.resolution_provenance}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="section-label">
          Revision history ({revisions.length})
        </span>
        {revisions.map((rev) => (
          <div key={rev.id} className="card flex flex-col gap-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="badge bg-gray-100 text-gray-600">
                v{rev.revision_number}
              </span>
              <span>{formatAbsolute(rev.created_at)}</span>
              {rev.change_summary && <span>— {rev.change_summary}</span>}
            </div>
            <span className="text-gray-800">{rev.title}</span>
            {rev.summary && (
              <span className="text-xs text-gray-500">{rev.summary}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
