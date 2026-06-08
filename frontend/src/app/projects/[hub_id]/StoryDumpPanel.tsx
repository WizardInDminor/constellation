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

const DUMP_TYPES: {
  value: "story-arc" | "character" | "themes";
  label: string;
  hint: string;
}[] = [
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
  const [dumpType, setDumpType] = useState<
    "story-arc" | "character" | "themes"
  >("story-arc");
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
              (tags: { id: string; name: string }[]): string | undefined =>
                tags.find((t) => t.name === "narrative:character")?.id,
            ));
        if (tagId) {
          await updateNode(node.id, {
            tag_ids: [...node.tags.map((t) => t.id), tagId],
          });
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
              (tags: { id: string; name: string }[]): string | undefined =>
                tags.find((t) => t.name === "narrative:theme")?.id,
            ));
        if (tagId) {
          await updateNode(node.id, {
            tag_ids: [...node.tags.map((t) => t.id), tagId],
          });
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
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="section-label">Story dump</h2>
        <p className="text-xs text-gray-500 mt-1">
          Paste narrative thinking; the assistant extracts candidate nodes
          (events, characters, or themes). Review individually before anything
          becomes graph data.
        </p>
      </div>

      <form onSubmit={handleExtract} className="space-y-3">
        <label htmlFor="story-dump-text" className="sr-only">
          Narrative dump text
        </label>
        <textarea
          id="story-dump-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Dump narrative thinking here — a character rant, a sequence of beats, a tangle of theme observations."
          className="textarea font-mono"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-md border border-gray-200 overflow-hidden"
            role="group"
            aria-label="Dump type"
          >
            {DUMP_TYPES.map((dt) => (
              <button
                key={dt.value}
                type="button"
                aria-pressed={dumpType === dt.value}
                onClick={() => setDumpType(dt.value)}
                className={`px-2.5 py-1 text-xs font-medium border-l first:border-l-0 border-gray-200 transition-colors ${
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
            className="btn btn-sm bg-amber-600 text-white shadow-sm hover:bg-amber-700 active:bg-amber-800"
          >
            {loading ? "Extracting…" : "Extract nodes →"}
          </button>
        </div>
        <p className="field-hint">
          {DUMP_TYPES.find((d) => d.value === dumpType)?.hint}
        </p>
      </form>

      {error && <div className="alert-error">{error}</div>}

      {response && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {response.candidates.length} candidate
            {response.candidates.length === 1 ? "" : "s"}. Accept or dismiss
            individually.
          </p>
          {response.candidates.length === 0 && (
            <div className="empty-state">
              <p className="text-sm font-medium text-gray-700">
                All candidates reviewed
              </p>
              <p className="text-xs text-gray-500">
                Paste more narrative thinking above to extract again.
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {response.candidates.map((c, idx) => (
              <li key={idx} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.title}
                    </p>
                    <p className="section-label mt-1">
                      {c.subtype}
                      {c.story_time && ` · ${c.story_time}`}
                      {c.archetype && ` · ${c.archetype}`}
                    </p>
                    <p className="text-xs text-gray-600 mt-1.5">
                      {c.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => acceptCandidate(idx, c)}
                      disabled={accepting.has(idx)}
                      className="btn btn-sm bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800"
                    >
                      {accepting.has(idx) ? "Accepting…" : "Accept"}
                    </button>
                    <button
                      onClick={() => dismissCandidate(idx)}
                      className="btn btn-ghost btn-sm"
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
