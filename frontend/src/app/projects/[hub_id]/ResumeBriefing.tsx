"use client";

/**
 * Resume briefing — runs the saved Synthesize prompt against the project
 * scope and saves the output as a permanent note with CITES edges (per
 * ADR-051). Synthesis history surfaces previous briefings in reverse
 * chronological order.
 *
 * The synthesis scope is: pinned notes ∪ tag-tagged notes. Session
 * fleetings are included via the ADR-069 toggle when an active session
 * exists.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listNodes,
  patchProjectScope,
  ragScopedWithSession,
  saveAnswer,
} from "@/lib/api";
import type { NodeSummary, ProjectScope, WorkSession } from "@/lib/api";

const DEFAULT_BRIEFING_PROMPT =
  "List open decisions, unfinished work, and anything captured since my last " +
  "visit. Structure as: Status / Open Questions / Next Steps.";

interface Props {
  scope: ProjectScope;
  activeSession: WorkSession | null;
  onScopeChanged: (next: ProjectScope) => void;
}

export function ResumeBriefing({
  scope,
  activeSession,
  onScopeChanged,
}: Props) {
  const [prompt, setPrompt] = useState(
    scope.briefing_prompt ?? DEFAULT_BRIEFING_PROMPT,
  );
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeFleeting, setIncludeFleeting] = useState(false);

  useEffect(() => {
    setPrompt(scope.briefing_prompt ?? DEFAULT_BRIEFING_PROMPT);
  }, [scope.briefing_prompt]);

  async function savePrompt() {
    const next = await patchProjectScope(scope.hub_node_id, {
      briefing_prompt: prompt,
    });
    onScopeChanged(next);
    setEditing(false);
  }

  async function runBriefing() {
    setRunning(true);
    setResult(null);
    setSavedId(null);
    setError(null);
    try {
      // Collect scope IDs. We pull a paginated slice of project-tagged notes
      // plus pinned IDs. For Slice 2 we cap the pool at 50 notes — large
      // enough for real projects, small enough to keep latency reasonable.
      const nodeIds = new Set(scope.pinned_node_ids);
      if (scope.tag_ids.length > 0) {
        // The /notes endpoint doesn't currently take a tag filter on the
        // server. We page through structure/permanent/literature notes and
        // intersect client-side. (B2 filter framework covers this in the
        // Notes view; the briefing flow is one-shot and the server lacks a
        // tag-filter endpoint, so we approximate.)
        const candidates = await listNodes(undefined, 1, 100);
        for (const n of candidates.items as NodeSummary[]) {
          // The node summary doesn't include tags, so we include all
          // non-fleeting notes in the candidate pool and let the synthesize
          // call do its job. The pinned set provides hard guarantees.
          if (n.type !== "fleeting") nodeIds.add(n.id);
        }
      }
      if (nodeIds.size === 0) {
        setError(
          "Empty project scope — pin at least one note or set project tags first.",
        );
        return;
      }
      const response = await ragScopedWithSession(prompt, Array.from(nodeIds), {
        includeSessionFleetings: includeFleeting,
        sessionId: activeSession?.id ?? null,
      });
      setResult(response.answer);

      // Save as a permanent note with CITES edges per ADR-051
      const today = new Date().toISOString().slice(0, 10);
      const saved = await saveAnswer({
        query: prompt,
        answer: response.answer,
        provenance_ids: response.provenance.map((p) => p.node_id),
        title: `Briefing — ${today}`,
      });
      setSavedId(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Briefing failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label">Resume briefing</h2>
        <button
          onClick={() => setEditing((e) => !e)}
          className="btn btn-ghost btn-sm text-indigo-600 hover:text-indigo-700"
        >
          {editing ? "Cancel" : "Edit prompt"}
        </button>
      </div>

      {editing ? (
        <>
          <label htmlFor="briefing-prompt" className="sr-only">
            Briefing prompt
          </label>
          <textarea
            id="briefing-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="textarea text-xs"
          />
          <div className="flex justify-end">
            <button onClick={savePrompt} className="btn btn-primary btn-sm">
              Save prompt
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-600 whitespace-pre-wrap">{prompt}</p>
      )}

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={includeFleeting}
          disabled={!activeSession}
          onChange={(e) => setIncludeFleeting(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        Include today&apos;s unprocessed captures
        {!activeSession && (
          <span className="text-gray-400">(start a session to enable)</span>
        )}
      </label>

      <button
        onClick={runBriefing}
        disabled={running}
        className="btn btn-primary btn-sm w-full"
      >
        {running ? "Running…" : "Run briefing"}
      </button>

      {error && <div className="alert-error">{error}</div>}

      {result && (
        <div className="space-y-2">
          <div className="card scrollbar-thin px-3 py-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
            {result}
          </div>
          {savedId && (
            <Link
              href={`/nodes/${savedId}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              Open saved briefing →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
