"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listNodes, listTags } from "@/lib/api";
import type { NodeSummary, TagRef } from "@/lib/api";
import { NotePreviewPopover } from "@/components/NotePreviewPopover";

const TYPE_LABELS: Record<string, string> = {
  permanent: "permanent",
  structure: "structure",
  literature: "literature",
};

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
};

const ALL_TYPES = ["permanent", "structure", "literature"] as const;

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

function NoteCard({ node }: { node: NodeSummary }) {
  return (
    <Link
      href={`/nodes/${node.id}`}
      className="flex items-start justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex flex-col gap-1 min-w-0 pr-4">
        <span className="font-medium text-sm truncate">{node.title}</span>
        {node.summary && (
          <span className="text-xs text-gray-500 line-clamp-2">{node.summary}</span>
        )}
        {node.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {node.tags.map((t) => <TagChip key={t.id} tag={t} />)}
          </div>
        )}
      </div>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
      >
        {TYPE_LABELS[node.type] ?? node.type}
      </span>
    </Link>
  );
}

function HoverableNoteCard({ node }: { node: NodeSummary }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <li
      ref={ref}
      onMouseEnter={() => { timer.current = setTimeout(() => setShow(true), 300); }}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false); }}
    >
      <NoteCard node={node} />
      <NotePreviewPopover node={node} anchorRef={ref} visible={show} />
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="bg-white border border-gray-200 rounded-lg px-4 py-3 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-full" />
    </li>
  );
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NodeSummary[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(["permanent", "structure"]),
  );
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const [permanent, structure, literature, tags] = await Promise.all([
          listNodes("permanent", 1, 100),
          listNodes("structure", 1, 100),
          listNodes("literature", 1, 100),
          listTags(),
        ]);
        const merged = [...permanent.items, ...structure.items, ...literature.items].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        setNotes(merged);
        setAllTags(tags);
      } catch (e) {
        setError("Could not reach the backend. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleTag(tagId: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  const filtered = notes.filter(
    (n) =>
      activeTypes.has(n.type) &&
      (activeTags.size === 0 || n.tags.some((t) => activeTags.has(t.id))),
  );

  const isFiltered = activeTypes.size < ALL_TYPES.length || activeTags.size > 0;

  if (error) {
    return <div className="text-red-600 text-sm">{error}</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Notes</h2>
        <div className="flex items-center gap-3">
          {!loading && isFiltered && filtered.length > 0 && filtered.length <= 25 && (
            <Link
              href={`/graph?ids=${filtered.map((n) => n.id).join(",")}`}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              Open in graph →
            </Link>
          )}
          <span className="text-sm text-gray-500">
            {loading ? "Loading…" : isFiltered ? `${filtered.length} of ${notes.length}` : `${notes.length} saved`}
          </span>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeTypes.has(type)
                  ? TYPE_COLORS[type] + " border-transparent"
                  : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Tag filter — only shown when tags exist */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  activeTags.has(tag.id)
                    ? "border-transparent"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
                style={
                  activeTags.has(tag.id) && tag.color
                    ? { backgroundColor: tag.color + "33", color: tag.color, borderColor: "transparent" }
                    : activeTags.has(tag.id)
                    ? { backgroundColor: "#e0e7ff", color: "#4338ca" }
                    : undefined
                }
              >
                {tag.name}
              </button>
            ))}
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </ul>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {notes.length === 0
            ? "No permanent or structure notes yet. Process some inbox notes to get started."
            : "No notes match the active filters."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((node) => (
            <HoverableNoteCard key={node.id} node={node} />
          ))}
        </ul>
      )}
    </div>
  );
}
