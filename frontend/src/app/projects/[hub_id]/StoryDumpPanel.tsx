"use client";

/**
 * Story Dump → node extraction surface (Slice 5; philosophy doc §2.7).
 *
 * Free-form narrative dump → AI proposes candidate nodes → user reviews
 * and accepts individually. The narrative analog of the document-ingest
 * review flow.
 */

import { useState } from "react";
import {
  createEdge,
  createStoryEvent,
  createStructureNode,
  createTag,
  narrativeDump,
  updateNode,
} from "@/lib/api";
import type {
  NarrativeCandidate,
  NarrativeDumpResponse,
  ProjectScope,
} from "@/lib/api";

const DUMP_TYPES: { value: "story-arc" | "character" | "themes"; label: string; hint: string }[] = [
  {
    value: "story-arc",
    label: "Story arc",
    hint: "Extract candidate STORY EVENTS (scenes / beats).",
  },
  {
    value: "character",
    label: "Character",
    hint: "Extract candidate CHARACTER nodes.",
  },
  {
    value: "themes",
    label: "Themes & subtext",
    hint: "Extract candidate THEME nodes (motifs, recurring ideas).",
  },
];

interface Props {
  scope: ProjectScope;
  defaultTimelineId?: string | null; // pass for story-arc accept flow
}

export function StoryDumpPanel({ scope, defaultTimelineId }: Props) {
  const [text, setText] = useState("");
  const [dumpType, setDumpType] = useState<"story-arc" | "character" | "themes">(
    "story-arc",
  );
  const [response, setResponse] = useState<NarrativeDumpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<Set<number>>(new Set());

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const r = await narrativeDump({
        dump_text: text.trim(),
        dump_type: dumpType,
      });
      setResponse(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function acceptCandidate(idx: number, c: NarrativeCandidate) {
    setAccepting((prev) => new Set(prev).add(idx));
    try {
      if (c.subtype === "event") {
        if (!defaultTimelineId) {
          throw new Error("No default timeline for event placement.");
        }
        // Append at end: pick a position past the highest existing
        // discourse_position — simple "+ 100" of the index here.
        await createStoryEvent({
          title: c.title,
          content: c.description,
          timeline_node_id: defaultTimelineId,
          discourse_position: 1000 + idx * 100,
          story_time: c.story_time ?? null,
          prose_status: null,
          manuscript_location: null,
          auto_follows_from: true,
        });
      } else if (c.subtype === "character") {
        // Create structure node + tag with narrative:character.
        const node = await createStructureNode({
          title: c.title,
          content: c.description,
        });
        const tag = await createTag("narrative:character").catch(() => null);
        const tagId =
          tag?.id ??
          (await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/tags`,
          )
            .then((r) => r.json())
            .then(
              (
                tags: { id: string; name: string }[],
              ): string | undefined =>
                tags.find((t) => t.name === "narrative:character")?.id,
            ));
        if (tagId) {
          await updateNode(node.id, { tag_ids: [...node.tags.map((t) => t.id), tagId] });
        }
      } else {
        // theme
        const node = await createStructureNode({
          title: c.title,
          content: c.description,
        });
        const tag = await createTag("narrative:theme").catch(() => null);
        const tagId =
          tag?.id ??
          (await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/tags`,
          )
            .then((r) => r.json())
            .then(
              (
                tags: { id: string; name: string }[],
              ): string | undefined =>
                tags.find((t) => t.name === "narrative:theme")?.id,
            ));
        if (tagId) {
          await updateNode(node.id, { tag_ids: [...node.tags.map((t) => t.id), tagId] });
        }
      }
      // Mark accepted by removing the candidate from the response list.
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.filter((_, i) => i !== idx),
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAccepting((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }

  function dismissCandidate(idx: number) {
    setResponse((prev) =>
      prev
        ? { ...prev, candidates: prev.candidates.filter((_, i) => i !== idx) }
        : prev,
    );
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Story dump</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Paste narrative thinking; the assistant extracts candidate nodes
          (events, characters, or themes). Review individually before
          anything becomes graph data.
        </p>
      </div>

      <form onSubmit={handleExtract} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Dump narrative thinking here — a character rant, a sequence of beats, a tangle of theme observations."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            {DUMP_TYPES.map((dt) => (
              <button
                key={dt.value}
                type="button"
                onClick={() => setDumpType(dt.value)}
                className={`px-2.5 py-1 text-xs border-l first:border-l-0 border-gray-200 ${
                  dumpType === dt.value
                    ? "bg-amber-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                title={dt.hint}
              >
                {dt.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Extracting…" : "Extract nodes →"}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          {DUMP_TYPES.find((d) => d.value === dumpType)?.hint}
        </p>
      </form>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {response && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {response.candidates.length} candidate
            {response.candidates.length === 1 ? "" : "s"}. Accept or dismiss
            individually.
          </p>
          {response.candidates.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              All candidates reviewed.
            </p>
          )}
          <ul className="space-y-2">
            {response.candidates.map((c, idx) => (
              <li
                key={idx}
                className="rounded border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.title}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">
                      {c.subtype}
                      {c.story_time && ` · ${c.story_time}`}
                      {c.archetype && ` · ${c.archetype}`}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {c.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => acceptCandidate(idx, c)}
                      disabled={accepting.has(idx)}
                      className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => dismissCandidate(idx)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
