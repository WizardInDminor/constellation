"use client";

/**
 * Left panel — scope editing, coverage stats, and the mode-specific
 * intelligence (Slice 2). Read-only in Slice 1; this rewrite makes it
 * editable and adds the three mode variants.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createTag,
  getCoverage,
  getNode,
  listNodes,
  listTags,
  patchProjectScope,
  searchNodes,
} from "@/lib/api";
import type {
  CoverageTag,
  NodeRef,
  NodeSummary,
  ProjectDetail,
  ProjectScope,
  TagRef,
} from "@/lib/api";
import { useNodeInteraction } from "@/components/NodeInteractionPopup";

interface Props {
  project: ProjectDetail;
  onScopeChanged: (next: ProjectScope) => void;
}

export function LeftPanel({ project, onScopeChanged }: Props) {
  const scope = project.scope;
  // Render the quick-corrections panel whenever prior_knowledge exists and
  // no session is yet active — mode-agnostic. Learning mode is where this
  // surface is *most* useful, but a research project with a prior-knowledge
  // entry should still see it (mode sets defaults, not gates).
  const showQuickCorrections =
    !!scope.prior_knowledge?.trim() && !project.active_session;

  return (
    <div className="px-3 py-4 space-y-5 text-xs">
      <ScopeStats project={project} />
      <PinnedNotesSection scope={scope} onScopeChanged={onScopeChanged} />
      <TagsSection scope={scope} onScopeChanged={onScopeChanged} />
      <PrimaryTagSection scope={scope} onScopeChanged={onScopeChanged} />
      <CoveragePanel hubId={scope.hub_node_id} mode={scope.mode} />
      {showQuickCorrections && <QuickCorrectionsPanel scope={scope} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scope stats — note count, last visit, primary-tag status
// ---------------------------------------------------------------------------

function ScopeStats({ project }: { project: ProjectDetail }) {
  return (
    <div>
      <p className="section-label mb-1.5">Scope</p>
      <div className="space-y-1 text-gray-500">
        <Row
          label="Pinned"
          value={String(project.scope.pinned_node_ids.length)}
        />
        <Row label="Tags" value={String(project.scope.tag_ids.length)} />
        <Row
          label="Last visit"
          value={relativeOrNever(project.scope.last_visited_at ?? null)}
        />
      </div>
      {project.scope.primary_tag_id === null && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          No primary tag set. Set one below to enable
          <code className="font-mono text-[10px] mx-1">con --project</code>
          and the Ask scope toggle.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned notes — editable list with NodeInteractionPopup on each entry
// ---------------------------------------------------------------------------

function PinnedNotesSection({
  scope,
  onScopeChanged,
}: {
  scope: ProjectScope;
  onScopeChanged: (next: ProjectScope) => void;
}) {
  const [pinned, setPinned] = useState<NodeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<NodeRef[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (scope.pinned_node_ids.length === 0) {
      setPinned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      scope.pinned_node_ids.map((id) =>
        getNode(id)
          .then((n) => ({ id: n.id, title: n.title, type: n.type }) as NodeRef)
          .catch(() => null),
      ),
    ).then((items) => {
      if (cancelled) return;
      setPinned(items.filter((x): x is NodeRef => x !== null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [scope.pinned_node_ids]);

  useEffect(() => {
    if (!pickerOpen || !search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchNodes(search.trim(), 8)
        .then((rs) => {
          if (cancelled) return;
          const existing = new Set(scope.pinned_node_ids);
          setResults(rs.filter((r) => !existing.has(r.id)));
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerOpen, search, scope.pinned_node_ids]);

  async function addPin(id: string) {
    const next = await patchProjectScope(scope.hub_node_id, {
      pinned_node_ids: [...scope.pinned_node_ids, id],
    });
    onScopeChanged(next);
    setSearch("");
    setResults([]);
  }
  async function removePin(id: string) {
    const next = await patchProjectScope(scope.hub_node_id, {
      pinned_node_ids: scope.pinned_node_ids.filter((p) => p !== id),
    });
    onScopeChanged(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="section-label">Pinned notes</p>
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
          aria-expanded={pickerOpen}
        >
          {pickerOpen ? "done" : "+ add"}
        </button>
      </div>
      {loading ? (
        <ul className="space-y-1.5" aria-busy="true">
          <li className="skeleton h-3 w-full" />
          <li className="skeleton h-3 w-4/5" />
          <li className="skeleton h-3 w-2/3" />
        </ul>
      ) : pinned.length === 0 && !pickerOpen ? (
        <p className="text-gray-400">No pinned notes.</p>
      ) : (
        <ul className="space-y-1">
          {pinned.map((n) => (
            <PinnedRow key={n.id} node={n} onRemove={() => removePin(n.id)} />
          ))}
        </ul>
      )}
      {pickerOpen && (
        <div className="mt-2 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes to pin…"
            autoFocus
            aria-label="Search notes to pin"
            className="input"
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto scrollbar-thin rounded-md border border-gray-200 bg-white shadow-md">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addPin(r.id)}
                  className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50 truncate"
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PinnedRow({
  node,
  onRemove,
}: {
  node: NodeRef;
  onRemove: () => void;
}) {
  const { anchorProps, popup } = useNodeInteraction(node.id);
  return (
    <li className="flex items-center gap-1.5 group">
      <Link
        href={`/nodes/${node.id}`}
        {...anchorProps}
        className="block truncate text-gray-700 hover:text-indigo-600 flex-1 min-w-0"
        title={`${node.title} (Ctrl+click to edit)`}
      >
        {node.title}
      </Link>
      <button
        onClick={onRemove}
        className="shrink-0 text-[10px] text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
        title="Unpin"
        aria-label={`Unpin ${node.title}`}
      >
        ×
      </button>
      {popup}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tags — chip row with add/remove
// ---------------------------------------------------------------------------

function TagsSection({
  scope,
  onScopeChanged,
}: {
  scope: ProjectScope;
  onScopeChanged: (next: ProjectScope) => void;
}) {
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    listTags()
      .then(setAllTags)
      .catch(() => {});
  }, []);

  const selectedTags = useMemo(
    () => allTags.filter((t) => scope.tag_ids.includes(t.id)),
    [allTags, scope.tag_ids],
  );
  const suggestions = useMemo(() => {
    const selected = new Set(scope.tag_ids);
    return allTags.filter(
      (t) =>
        !selected.has(t.id) &&
        t.name.toLowerCase().includes(tagInput.toLowerCase()),
    );
  }, [allTags, scope.tag_ids, tagInput]);

  async function addTag(t: TagRef) {
    const next = await patchProjectScope(scope.hub_node_id, {
      tag_ids: [...scope.tag_ids, t.id],
    });
    onScopeChanged(next);
    setTagInput("");
  }
  async function removeTag(id: string) {
    const next = await patchProjectScope(scope.hub_node_id, {
      tag_ids: scope.tag_ids.filter((x) => x !== id),
    });
    onScopeChanged(next);
  }
  async function createAndAdd() {
    const name = tagInput.trim();
    if (!name) return;
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    const tag = existing ?? (await createTag(name));
    if (!existing) setAllTags([...allTags, tag]);
    addTag(tag);
  }

  return (
    <div>
      <p className="section-label mb-1.5">Tags</p>
      <div className="flex flex-wrap items-center gap-1">
        {selectedTags.map((t) => (
          <span key={t.id} className="badge gap-1 bg-gray-100 text-gray-700">
            {t.name}
            <button
              onClick={() => removeTag(t.id)}
              className="text-gray-400 hover:text-red-500"
              aria-label={`Remove ${t.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createAndAdd();
              }
            }}
            placeholder="+ tag"
            aria-label="Add a tag"
            className="input w-20 px-2 py-0.5 text-xs"
          />
          {tagInput && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-32 w-32 overflow-y-auto scrollbar-thin rounded-md border border-gray-200 bg-white shadow-md">
              {suggestions.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTag(t)}
                  className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primary tag — the cross-surface anchor used by Ask and `con --project`
// ---------------------------------------------------------------------------

function PrimaryTagSection({
  scope,
  onScopeChanged,
}: {
  scope: ProjectScope;
  onScopeChanged: (next: ProjectScope) => void;
}) {
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  useEffect(() => {
    listTags()
      .then(setAllTags)
      .catch(() => {});
  }, []);

  // Available choices: only project tags (set membership matters most here).
  // Allow choosing any tag, but UX makes "project tags" obvious.
  const projectTags = allTags.filter((t) => scope.tag_ids.includes(t.id));

  async function setPrimary(id: string | null) {
    const next = await patchProjectScope(scope.hub_node_id, {
      primary_tag_id: id,
    });
    onScopeChanged(next);
  }

  return (
    <div>
      <p className="section-label mb-1.5">
        Primary tag
        <span className="ml-1 font-normal normal-case tracking-normal text-gray-300">
          (CLI + Ask anchor)
        </span>
      </p>
      {projectTags.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          Add a tag above first, then choose it as primary.
        </p>
      ) : (
        <select
          value={scope.primary_tag_id ?? ""}
          onChange={(e) => setPrimary(e.target.value || null)}
          aria-label="Primary tag"
          className="input text-xs"
        >
          <option value="">— none —</option>
          {projectTags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage panel — three mode variants (research / narrative / learning)
// ---------------------------------------------------------------------------

function CoveragePanel({
  hubId,
  mode,
}: {
  hubId: string;
  mode: ProjectScope["mode"];
}) {
  const [tags, setTags] = useState<CoverageTag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCoverage(hubId)
      .then((c) => setTags(c.tags))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load coverage"),
      );
  }, [hubId]);

  if (error) return null; // empty-state-hide per session-1 design

  return (
    <div>
      <p className="section-label mb-1.5">
        {mode === "narrative"
          ? "Coverage"
          : mode === "learning"
            ? "Phase coverage"
            : "Sub-topics"}
      </p>
      {tags === null ? (
        <div className="space-y-1.5" aria-busy="true">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ) : tags.length === 0 ? (
        <p className="text-gray-400 text-[11px]">
          Add project tags above to see coverage.
        </p>
      ) : (
        <ul className="space-y-1">
          {tags.map((t) => (
            <li
              key={t.tag_id}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="truncate text-gray-700">{t.tag_name}</span>
              <span className="font-mono text-gray-400 shrink-0 ml-2">
                {t.note_count}n · {t.avg_edges.toFixed(1)}e
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-gray-300 mt-1">
        {mode === "narrative"
          ? "Per character/theme/event tag — count, avg edges."
          : "Thin-to-dense. n = notes, e = avg outgoing edges."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick corrections — Session 1 only, learning mode
// ---------------------------------------------------------------------------

function QuickCorrectionsPanel({ scope }: { scope: ProjectScope }) {
  return (
    <div>
      <p className="section-label mb-1.5">
        Prior knowledge
        <span className="ml-1 font-normal normal-case tracking-normal text-gray-300">
          (Session 1)
        </span>
      </p>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 whitespace-pre-wrap">
        {scope.prior_knowledge}
      </div>
      <p className="text-[10px] text-gray-300 mt-1">
        Surfaces during Session 1 only. Once you start a session this slot
        switches to “My notes” (Phase 10).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-mono">{value}</span>
    </div>
  );
}

function relativeOrNever(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
