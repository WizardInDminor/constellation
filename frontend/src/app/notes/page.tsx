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
      className="badge bg-gray-100 text-gray-500"
      style={
        tag.color
          ? { backgroundColor: tag.color + "33", color: tag.color }
          : undefined
      }
    >
      {tag.name}
    </span>
  );
}

function NoteCard({ node }: { node: NodeSummary }) {
  return (
    <Link
      href={`/nodes/${node.id}`}
      className="card-interactive flex items-start justify-between gap-4 px-4 py-3"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-medium text-sm truncate">{node.title}</span>
        {node.summary && (
          <span className="text-xs text-gray-500 line-clamp-2">
            {node.summary}
          </span>
        )}
        {node.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {node.tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
      <span
        className={`badge shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
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
      onMouseEnter={() => {
        timer.current = setTimeout(() => setShow(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setShow(false);
      }}
    >
      <NoteCard node={node} />
      <NotePreviewPopover node={node} anchorRef={ref} visible={show} />
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="card flex items-start justify-between gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="skeleton h-4 w-2/3 mb-2" />
        <div className="skeleton h-3 w-full" />
      </div>
      <div className="skeleton h-5 w-16 rounded-full shrink-0" />
    </li>
  );
}

const THIN_SUMMARY_CHARS = 30;

export default function NotesPage() {
  const [notes, setNotes] = useState<NodeSummary[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(["permanent", "structure"]),
  );
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  // Schema-level filters (ADR-055) — refetched when any of these toggle.
  const [noSummary, setNoSummary] = useState(false);
  const [noOutgoing, setNoOutgoing] = useState(false);
  const [noEdges, setNoEdges] = useState(false);
  const [thinSummary, setThinSummary] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const filters = {
          noSummary,
          noOutgoing,
          noEdges,
          summaryMaxLength: thinSummary ? THIN_SUMMARY_CHARS : undefined,
        };
        const [permanent, structure, literature, tags] = await Promise.all([
          listNodes("permanent", 1, 100, filters),
          listNodes("structure", 1, 100, filters),
          listNodes("literature", 1, 100, filters),
          listTags(),
        ]);
        const merged = [
          ...permanent.items,
          ...structure.items,
          ...literature.items,
        ].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
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
  }, [noSummary, noOutgoing, noEdges, thinSummary]);

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

  const schemaFiltersActive = noSummary || noOutgoing || noEdges || thinSummary;
  const isFiltered =
    activeTypes.size < ALL_TYPES.length ||
    activeTags.size > 0 ||
    schemaFiltersActive;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="page-title">Notes</h2>
        <div className="alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="page-title">Notes</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {!loading && activeTags.size === 1 && (
            <Link
              href={`/cluster-links?tag_id=${Array.from(activeTags)[0]}`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              Suggest cross-links →
            </Link>
          )}
          {!loading &&
            isFiltered &&
            filtered.length > 0 &&
            filtered.length <= 25 && (
              <Link
                href={`/graph?ids=${filtered.map((n) => n.id).join(",")}`}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                Open in graph →
              </Link>
            )}
          <span className="text-sm text-gray-500">
            {loading
              ? "Loading…"
              : isFiltered
                ? `${filtered.length} of ${notes.length}`
                : `${notes.length} saved`}
          </span>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card flex flex-col gap-4 p-4">
        {/* Type filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1 shrink-0">Type</span>
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              aria-pressed={activeTypes.has(type)}
              className={`badge border transition-colors ${
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label mr-1 shrink-0">Tags</span>
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                aria-pressed={activeTags.has(tag.id)}
                className={`badge border transition-colors ${
                  activeTags.has(tag.id)
                    ? "border-transparent"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
                style={
                  activeTags.has(tag.id) && tag.color
                    ? {
                        backgroundColor: tag.color + "33",
                        color: tag.color,
                        borderColor: "transparent",
                      }
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
                className="btn btn-ghost btn-sm ml-1"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Schema filters (ADR-055) — AND-compose with type/tag chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label mr-1 shrink-0">Find</span>
          {[
            { active: noSummary, set: setNoSummary, label: "no summary" },
            {
              active: thinSummary,
              set: setThinSummary,
              label: `thin summary (<${THIN_SUMMARY_CHARS} chars)`,
            },
            {
              active: noOutgoing,
              set: setNoOutgoing,
              label: "no outgoing edges",
            },
            { active: noEdges, set: setNoEdges, label: "no edges at all" },
          ].map(({ active, set, label }) => (
            <button
              key={label}
              onClick={() => set(!active)}
              aria-pressed={active}
              className={`badge border transition-colors ${
                active
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
          {schemaFiltersActive && (
            <button
              onClick={() => {
                setNoSummary(false);
                setThinSummary(false);
                setNoOutgoing(false);
                setNoEdges(false);
              }}
              className="btn btn-ghost btn-sm ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {notes.length === 0 ? (
            <>
              <p className="font-medium text-gray-700">No notes yet</p>
              <p className="text-sm text-gray-500">
                Process some inbox notes to turn them into permanent or
                structure notes.
              </p>
              <Link href="/inbox" className="btn btn-primary btn-sm mt-2">
                Go to inbox
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium text-gray-700">No matching notes</p>
              <p className="text-sm text-gray-500">
                No notes match the active filters. Try clearing some filters.
              </p>
            </>
          )}
        </div>
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
