"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEdge,
  createPermanentNode,
  createLiteratureNode,
  createSource,
  createTag,
  listSources,
  listTags,
  searchDedup,
} from "@/lib/api";
import type {
  DedupResult,
  EdgeType,
  SourceDetail,
  SourceSummary,
  TagRef,
} from "@/lib/api";
import { EDGE_TYPES, EDGE_TYPE_META } from "@/lib/edgeTypes";

const SOURCE_TYPES = [
  "datasheet",
  "manual",
  "book",
  "article",
  "video",
  "podcast",
  "other",
] as const;

// ADR-062: capture-time dedup thresholds.
// - DEDUP_SHOW_THRESHOLD: anything ≥ this is offered as a potential link.
//   Set low enough to surface "merely related" notes the user might want to
//   link via SUPPORTS / ELABORATES / etc.
// - DEDUP_DUPLICATE_THRESHOLD: visual flag for "this looks like a duplicate."
//   The user can still proceed; the marker just makes the case salient.
const DEDUP_SHOW_THRESHOLD = 0.65;
const DEDUP_DUPLICATE_THRESHOLD = 0.85;
const DEDUP_DEBOUNCE_MS = 800;
const DEDUP_MIN_CONTENT_CHARS = 40;

interface PendingLink {
  node_id: string;
  node_title: string;
  edge_type: EdgeType;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IntentionalCaptureDialog({ open, onClose }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tags
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagRef[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Source picker
  const [allSources, setAllSources] = useState<SourceSummary[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceSummary | null>(
    null,
  );
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);

  // Inline source creation
  const [showNewSource, setShowNewSource] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceType, setNewSourceType] =
    useState<(typeof SOURCE_TYPES)[number]>("article");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceSaving, setNewSourceSaving] = useState(false);
  const [newSourceError, setNewSourceError] = useState<string | null>(null);

  // ADR-062: dedup panel state. `dedupResults` is the latest debounced
  // /search/dedup payload above DEDUP_SHOW_THRESHOLD. `pendingLinks` is the
  // user's "Will create edge…" list, applied at save time.
  const [dedupResults, setDedupResults] = useState<DedupResult[]>([]);
  const [dedupLoading, setDedupLoading] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => titleRef.current?.focus());
      listTags()
        .then(setAllTags)
        .catch(() => {});
      listSources()
        .then(setAllSources)
        .catch(() => {});
    } else {
      // Reset on close
      setTitle("");
      setContent("");
      setSummary("");
      setSelectedTags([]);
      setTagInput("");
      setSelectedSource(null);
      setSourceQuery("");
      setShowNewSource(false);
      setNewSourceTitle("");
      setNewSourceType("article");
      setNewSourceUrl("");
      setNewSourceError(null);
      setError(null);
      setDedupResults([]);
      setPendingLinks([]);
      setDedupLoading(false);
    }
  }, [open]);

  // ADR-062: debounced dedup search. Fires when content is long enough to
  // produce a meaningful embedding; concatenates title + content as the
  // query so the title is part of the similarity signal.
  const dedupQueryKey = useMemo(
    () => `${title.trim()}\n${content.trim()}`,
    [title, content],
  );
  useEffect(() => {
    if (!open) return;
    if (content.trim().length < DEDUP_MIN_CONTENT_CHARS) {
      setDedupResults([]);
      return;
    }
    let cancelled = false;
    setDedupLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await searchDedup(dedupQueryKey, 8);
        if (cancelled) return;
        const filtered = resp.results.filter(
          (r) => r.similarity >= DEDUP_SHOW_THRESHOLD,
        );
        setDedupResults(filtered);
      } catch {
        if (!cancelled) setDedupResults([]);
      } finally {
        if (!cancelled) setDedupLoading(false);
      }
    }, DEDUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, dedupQueryKey, content]);

  // Tag helpers
  const selectedTagIds = new Set(selectedTags.map((t) => t.id));
  const tagSuggestions = allTags.filter(
    (t) =>
      !selectedTagIds.has(t.id) &&
      t.name.toLowerCase().includes(tagInput.toLowerCase()),
  );

  function addTag(tag: TagRef) {
    if (!selectedTagIds.has(tag.id)) setSelectedTags((ts) => [...ts, tag]);
    setTagInput("");
  }

  function removeTag(id: string) {
    setSelectedTags((ts) => ts.filter((t) => t.id !== id));
  }

  async function createAndAddTag() {
    const name = tagInput.trim();
    if (!name) return;
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    const tag = existing ?? (await createTag(name));
    if (!existing) setAllTags((ts) => [...ts, tag]);
    addTag(tag);
  }

  // Source helpers
  const filteredSources = allSources.filter((s) =>
    s.title.toLowerCase().includes(sourceQuery.toLowerCase()),
  );

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceTitle.trim()) return;
    setNewSourceSaving(true);
    setNewSourceError(null);
    try {
      const created: SourceDetail = await createSource({
        title: newSourceTitle.trim(),
        type: newSourceType,
        url: newSourceUrl.trim() || undefined,
      });
      setAllSources((prev) =>
        [...prev, created].sort((a, b) => a.title.localeCompare(b.title)),
      );
      setSelectedSource(created);
      setShowNewSource(false);
      setNewSourceTitle("");
      setNewSourceUrl("");
    } catch (err) {
      setNewSourceError(
        err instanceof Error ? err.message : "Failed to create source",
      );
    } finally {
      setNewSourceSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tagIds = selectedTags.map((t) => t.id);
      const created = selectedSource
        ? await createLiteratureNode({
            title: title.trim(),
            content: content.trim(),
            summary: summary.trim() || undefined,
            source_id: selectedSource.id,
            tag_ids: tagIds,
          })
        : await createPermanentNode({
            title: title.trim(),
            content: content.trim(),
            summary: summary.trim() || undefined,
            tag_ids: tagIds,
          });

      // ADR-062: apply pending links from the dedup panel. Failures don't
      // roll back the note creation — the note exists, the link can be
      // retried from the graph. Surface a partial-failure error so the user
      // knows to revisit.
      const linkErrors: string[] = [];
      for (const link of pendingLinks) {
        try {
          await createEdge({
            from_id: created.id,
            to_id: link.node_id,
            type: link.edge_type,
          });
        } catch (linkErr) {
          linkErrors.push(
            `${link.node_title}: ${linkErr instanceof Error ? linkErr.message : "edge failed"}`,
          );
        }
      }

      onClose();
      router.push("/notes");
      router.refresh();
      if (linkErrors.length > 0) {
        // Note saved, but some edges failed. The dialog has already closed;
        // surface this as a console-visible message rather than blocking
        // navigation. Future polish: a toast.
        console.warn("Capture saved; some edges failed:", linkErrors);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  function addPendingLink(
    node: { id: string; title: string },
    edge_type: EdgeType,
  ) {
    setPendingLinks((prev) =>
      prev.some((l) => l.node_id === node.id)
        ? prev
        : [...prev, { node_id: node.id, node_title: node.title, edge_type }],
    );
  }

  function removePendingLink(node_id: string) {
    setPendingLinks((prev) => prev.filter((l) => l.node_id !== node_id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 bg-black/50 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Intentional capture"
        className="scrollbar-thin w-full max-w-2xl bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-5 flex flex-col gap-4 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="page-title text-base">Intentional capture</h2>
          <kbd className="text-xs text-gray-400 font-mono shrink-0">
            Ctrl+⇧+Space
          </kbd>
        </div>

        <div>
          <label htmlFor="ic-title" className="label">
            Title
          </label>
          <input
            id="ic-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            required
            className="input font-medium"
          />
        </div>

        <div>
          <label htmlFor="ic-content" className="label">
            Content
          </label>
          <textarea
            id="ic-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content"
            required
            rows={6}
            className="textarea resize-none"
          />
        </div>

        {/* ADR-062: dedup panel — surfaces existing notes close to what's
            being captured so the user can avoid duplicates and link at
            save time. Threshold gating in DEDUP_SHOW_THRESHOLD. */}
        <DedupPanel
          loading={dedupLoading}
          results={dedupResults}
          pendingLinks={pendingLinks}
          onAddLink={addPendingLink}
          onRemoveLink={removePendingLink}
          contentLength={content.trim().length}
        />

        <div>
          <label htmlFor="ic-summary" className="label">
            Summary{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="ic-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-sentence summary"
            className="input text-gray-600"
          />
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <label htmlFor="ic-tag-input" className="label mb-0">
            Tags
          </label>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((t) => (
                <span key={t.id} className="badge bg-indigo-50 text-indigo-700">
                  {t.name}
                  <button
                    type="button"
                    onClick={() => removeTag(t.id)}
                    className="ml-1 text-indigo-400 hover:text-indigo-700"
                    aria-label={`Remove tag ${t.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              id="ic-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createAndAddTag();
                }
              }}
              placeholder="Add tag…"
              className="input"
            />
            {tagInput && (
              <ul className="card scrollbar-thin absolute z-10 mt-1 w-full text-sm max-h-32 overflow-y-auto shadow-lg">
                {tagSuggestions.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => addTag(t)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50"
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
                {!allTags.some(
                  (t) => t.name.toLowerCase() === tagInput.trim().toLowerCase(),
                ) && (
                  <li>
                    <button
                      type="button"
                      onClick={createAndAddTag}
                      className="w-full text-left px-3 py-2 font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      + Create &ldquo;{tagInput.trim()}&rdquo;
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Source */}
        <div className="flex flex-col gap-2">
          <label htmlFor="ic-source" className="label mb-0">
            Source{" "}
            <span className="font-normal text-gray-400">
              (optional — creates a literature note)
            </span>
          </label>
          {selectedSource ? (
            <div className="flex items-center justify-between gap-2 border border-blue-200 bg-blue-50 rounded-md px-3 py-2 text-sm">
              <span className="truncate text-blue-800">
                {selectedSource.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedSource(null);
                  setSourceQuery("");
                  setShowNewSource(false);
                }}
                className="text-blue-400 hover:text-blue-700 shrink-0"
                aria-label="Clear selected source"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <input
                  id="ic-source"
                  value={sourceQuery}
                  onChange={(e) => {
                    setSourceQuery(e.target.value);
                    setSourceOpen(true);
                  }}
                  onFocus={() => setSourceOpen(true)}
                  placeholder="Search sources…"
                  className="input"
                />
                {sourceOpen && filteredSources.length > 0 && (
                  <ul className="card scrollbar-thin absolute z-10 mt-1 w-full text-sm max-h-40 overflow-y-auto shadow-lg">
                    {filteredSources.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSource(s);
                            setSourceQuery("");
                            setSourceOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex flex-col"
                        >
                          <span className="font-medium truncate">
                            {s.title}
                          </span>
                          {s.author && (
                            <span className="text-xs text-gray-400">
                              {s.author}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Inline new-source creation */}
              <button
                type="button"
                onClick={() => setShowNewSource((v) => !v)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                {showNewSource ? "▲ Cancel new source" : "+ New source"}
              </button>

              {showNewSource && (
                <form
                  onSubmit={handleCreateSource}
                  className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {newSourceError && (
                    <div className="alert-error">{newSourceError}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input
                        value={newSourceTitle}
                        onChange={(e) => setNewSourceTitle(e.target.value)}
                        placeholder="Title *"
                        required
                        aria-label="Source title"
                        className="input"
                      />
                    </div>
                    <select
                      value={newSourceType}
                      onChange={(e) =>
                        setNewSourceType(
                          e.target.value as (typeof SOURCE_TYPES)[number],
                        )
                      }
                      aria-label="Source type"
                      className="input"
                    >
                      {SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      placeholder="URL or file:// path"
                      aria-label="Source URL"
                      className="input"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={newSourceSaving || !newSourceTitle.trim()}
                      className="btn btn-primary btn-sm"
                    >
                      {newSourceSaving ? "Creating…" : "Create & select"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {error && <div className="alert-error">{error}</div>}

        {pendingLinks.length > 0 && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
            <p className="section-label mb-1.5 text-indigo-700">
              Will create on save
            </p>
            <ul className="space-y-1 text-xs text-indigo-800">
              {pendingLinks.map((l) => (
                <li key={l.node_id} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded bg-white px-1.5 py-0.5 border border-indigo-200">
                    {l.edge_type}
                  </span>
                  <span className="flex-1 truncate">{l.node_title}</span>
                  <button
                    type="button"
                    onClick={() => removePendingLink(l.node_id)}
                    className="text-indigo-400 hover:text-indigo-700"
                    aria-label="Remove link"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="btn btn-primary"
          >
            {saving
              ? "Saving…"
              : selectedSource
                ? `Save literature note${pendingLinks.length > 0 ? ` + ${pendingLinks.length} link${pendingLinks.length === 1 ? "" : "s"}` : ""}`
                : `Save permanent note${pendingLinks.length > 0 ? ` + ${pendingLinks.length} link${pendingLinks.length === 1 ? "" : "s"}` : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DedupPanel (ADR-062)
// ---------------------------------------------------------------------------
// A capture-time companion panel that surfaces existing notes close to the
// content being captured. Each match offers an inline "+ Link" action with
// an edge-type picker; selected matches become pending edges that are
// created at save time.

function DedupPanelRow({
  result,
  isLinked,
  onAddLink,
}: {
  result: DedupResult;
  isLinked: boolean;
  onAddLink: (node: { id: string; title: string }, edge_type: EdgeType) => void;
}) {
  const [edgeType, setEdgeType] = useState<EdgeType>("SUPPORTS");
  const isLikelyDuplicate = result.similarity >= DEDUP_DUPLICATE_THRESHOLD;
  return (
    <li
      className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${
        isLikelyDuplicate
          ? "bg-amber-50 border border-amber-200"
          : "bg-white border border-gray-200"
      }`}
    >
      <span
        className={`shrink-0 font-mono text-[10px] rounded px-1.5 py-0.5 ${
          isLikelyDuplicate
            ? "bg-amber-100 text-amber-800"
            : "bg-gray-100 text-gray-600"
        }`}
        title={
          isLikelyDuplicate ? "Looks like a possible duplicate" : undefined
        }
      >
        {Math.round(result.similarity * 100)}%
      </span>
      <a
        href={`/nodes/${result.node.id}`}
        target="_blank"
        rel="noreferrer"
        className="flex-1 truncate text-gray-700 hover:text-indigo-700 hover:underline"
        title={result.node.title}
      >
        {result.node.title}
      </a>
      {isLinked ? (
        <span className="text-[10px] text-indigo-600 italic">linked</span>
      ) : (
        <>
          <select
            value={edgeType}
            onChange={(e) => setEdgeType(e.target.value as EdgeType)}
            className="text-[10px] border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            aria-label="Edge type"
          >
            {EDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDGE_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              onAddLink(
                { id: result.node.id, title: result.node.title },
                edgeType,
              )
            }
            className="btn btn-primary btn-sm text-[10px]"
          >
            + Link
          </button>
        </>
      )}
    </li>
  );
}

function DedupPanel({
  loading,
  results,
  pendingLinks,
  onAddLink,
  onRemoveLink: _onRemoveLink,
  contentLength,
}: {
  loading: boolean;
  results: DedupResult[];
  pendingLinks: PendingLink[];
  onAddLink: (node: { id: string; title: string }, edge_type: EdgeType) => void;
  onRemoveLink: (node_id: string) => void;
  contentLength: number;
}) {
  // Don't render anything until the user has typed enough to make a sensible
  // embedding. Keeps the dialog calm at the start of capture.
  if (contentLength < DEDUP_MIN_CONTENT_CHARS) return null;

  const linkedIds = new Set(pendingLinks.map((l) => l.node_id));
  const duplicates = results.filter(
    (r) => r.similarity >= DEDUP_DUPLICATE_THRESHOLD,
  );

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <p className="section-label">Compare to corpus</p>
        {loading && (
          <span className="text-[10px] text-gray-400">searching…</span>
        )}
      </div>
      {duplicates.length > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {duplicates.length === 1
            ? "1 close match — possible duplicate."
            : `${duplicates.length} close matches — possible duplicates.`}
        </p>
      )}
      {results.length === 0 && !loading && (
        <p className="mt-1 text-xs text-gray-400">
          No notes above the similarity threshold.
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <DedupPanelRow
              key={r.node.id}
              result={r}
              isLinked={linkedIds.has(r.node.id)}
              onAddLink={onAddLink}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
