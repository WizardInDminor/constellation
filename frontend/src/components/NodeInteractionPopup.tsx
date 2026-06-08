"use client";

/**
 * NodeInteractionPopup — universal "tap a node, edit it without leaving
 * context" component (philosophy doc §6.9).
 *
 * Renders a centered modal overlay with:
 *   - title + content editor
 *   - tag chips (add/remove via NodePicker-style search)
 *   - existing edges (with remove)
 *   - "Add edge" affordance (target picker + edge type)
 *
 * Submit calls the underlying PATCH /nodes/{id} (for content/tags) and the
 * existing edge endpoints. The parent passes `onSaved(updatedNode)` so the
 * underlying view can refresh without a page reload.
 *
 * NOT a full editor — explicitly bounded by the "containment rule"
 * (philosophy doc §6.9): if the change doesn't fit in the popup, the user
 * navigates to the dedicated surface. The popup keeps the writer in
 * context.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEdge,
  createTag,
  deleteEdge,
  getNode,
  listTags,
  searchNodes,
  updateNode,
} from "@/lib/api";
import type { EdgeType, NodeDetail, NodeRef, TagRef } from "@/lib/api";
import { EDGE_TYPES, EDGE_TYPE_META } from "@/lib/edgeTypes";
import { MarkdownTextarea } from "./MarkdownTextarea";

interface Props {
  nodeId: string;
  onClose: () => void;
  onSaved?: (node: NodeDetail) => void;
}

export function NodeInteractionPopup({ nodeId, onClose, onSaved }: Props) {
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<TagRef[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline "add edge" state
  const [edgeTarget, setEdgeTarget] = useState<NodeRef | null>(null);
  const [edgeSearch, setEdgeSearch] = useState("");
  const [edgeResults, setEdgeResults] = useState<NodeRef[]>([]);
  const [edgeType, setEdgeType] = useState<EdgeType>("SUPPORTS");
  const [addingEdge, setAddingEdge] = useState(false);

  // Load the node + all tags once on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([getNode(nodeId), listTags()])
      .then(([n, t]) => {
        if (cancelled) return;
        setNode(n);
        setContent(n.content);
        setTags(n.tags);
        setAllTags(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load node");
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Edge target search — debounced FTS via existing /nodes/search
  useEffect(() => {
    if (!edgeSearch.trim()) {
      setEdgeResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchNodes(edgeSearch.trim(), 8);
        if (!cancelled) {
          setEdgeResults(results.filter((r) => r.id !== nodeId));
        }
      } catch {
        if (!cancelled) setEdgeResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [edgeSearch, nodeId]);

  const tagSuggestions = useMemo(() => {
    const selected = new Set(tags.map((t) => t.id));
    return allTags.filter(
      (t) =>
        !selected.has(t.id) &&
        t.name.toLowerCase().includes(tagInput.toLowerCase()),
    );
  }, [allTags, tags, tagInput]);

  function addTag(tag: TagRef) {
    if (tags.find((t) => t.id === tag.id)) return;
    setTags([...tags, tag]);
    setTagInput("");
  }
  function removeTag(id: string) {
    setTags(tags.filter((t) => t.id !== id));
  }
  async function createAndAddTag() {
    const name = tagInput.trim();
    if (!name) return;
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    const tag = existing ?? (await createTag(name));
    if (!existing) setAllTags([...allTags, tag]);
    addTag(tag);
  }

  const handleSaveCore = useCallback(async () => {
    if (!node) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateNode(nodeId, {
        content,
        tag_ids: tags.map((t) => t.id),
      });
      setNode(updated);
      onSaved?.(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }, [node, nodeId, content, tags, onSaved, onClose]);

  async function handleAddEdge() {
    if (!node || !edgeTarget || addingEdge) return;
    setAddingEdge(true);
    setError(null);
    try {
      await createEdge({
        from_id: nodeId,
        to_id: edgeTarget.id,
        type: edgeType,
      });
      // Reload node so edges list updates
      const fresh = await getNode(nodeId);
      setNode(fresh);
      setEdgeTarget(null);
      setEdgeSearch("");
      setEdgeResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edge creation failed");
    } finally {
      setAddingEdge(false);
    }
  }

  async function handleRemoveEdge(edgeId: string) {
    try {
      await deleteEdge(edgeId);
      const fresh = await getNode(nodeId);
      setNode(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={node ? `Edit note: ${node.title}` : "Edit note"}
        className="scrollbar-thin w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h2 className="page-title text-base truncate">
              {node?.title ?? "Loading…"}
            </h2>
            {node && <p className="section-label mt-0.5">{node.type}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-xl leading-none text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <div className="alert-error mb-4">{error}</div>}

        {!node ? (
          <div className="space-y-2">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Content */}
            <div>
              <label htmlFor="nip-content" className="label">
                Content
              </label>
              <MarkdownTextarea
                id="nip-content"
                previewValue={content}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="textarea font-mono"
              />
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="nip-tag-input" className="label">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span key={t.id} className="badge bg-gray-100 text-gray-700">
                    {t.name}
                    <button
                      onClick={() => removeTag(t.id)}
                      className="ml-1 text-gray-400 hover:text-rose-500"
                      aria-label={`Remove ${t.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <input
                    id="nip-tag-input"
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createAndAddTag();
                      }
                    }}
                    placeholder="add tag…"
                    className="input w-32"
                  />
                  {tagInput && tagSuggestions.length > 0 && (
                    <div className="card scrollbar-thin absolute z-10 mt-1 max-h-32 w-40 overflow-y-auto shadow-lg">
                      {tagSuggestions.slice(0, 6).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addTag(t)}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Edges */}
            <div>
              <div className="label">Edges out</div>
              {node.outgoing_edges.length === 0 ? (
                <p className="text-xs text-gray-400">No outgoing edges.</p>
              ) : (
                <ul className="space-y-1">
                  {node.outgoing_edges.map((e) => {
                    const meta = EDGE_TYPE_META[e.type];
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700"
                          title={meta?.description}
                        >
                          {e.type}
                        </span>
                        <span className="truncate">→ {e.neighbor.title}</span>
                        <button
                          onClick={() => handleRemoveEdge(e.id)}
                          className="ml-auto text-gray-400 hover:text-rose-500"
                          aria-label="Remove edge"
                        >
                          remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add edge */}
              <div className="mt-2 space-y-1.5">
                {!edgeTarget ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={edgeSearch}
                      onChange={(e) => setEdgeSearch(e.target.value)}
                      placeholder="Find note to link…"
                      aria-label="Find note to link"
                      className="input"
                    />
                    {edgeResults.length > 0 && (
                      <div className="card scrollbar-thin absolute z-10 mt-1 max-h-40 w-full overflow-y-auto shadow-lg">
                        {edgeResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              setEdgeTarget(r);
                              setEdgeSearch(r.title);
                              setEdgeResults([]);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
                          >
                            {r.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="rounded bg-indigo-50 text-indigo-800 px-2 py-0.5 truncate">
                      → {edgeTarget.title}
                    </span>
                    <button
                      onClick={() => {
                        setEdgeTarget(null);
                        setEdgeSearch("");
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      change
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={edgeType}
                    onChange={(e) => setEdgeType(e.target.value as EdgeType)}
                    aria-label="Edge type"
                    className="input w-auto"
                  >
                    {EDGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddEdge}
                    disabled={!edgeTarget || addingEdge}
                    className="btn btn-secondary btn-sm"
                  >
                    {addingEdge ? "Adding…" : "Add edge"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button onClick={onClose} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleSaveCore}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useNodeInteraction — convenience hook for deployment sites
// ---------------------------------------------------------------------------

/**
 * Wraps an element so Ctrl+click on it (or long-press on touch) opens the
 * NodeInteractionPopup for the given node ID. Returns props to spread on
 * the anchor element plus the popup element itself (or null when closed).
 *
 * Usage:
 *   const { anchorProps, popup } = useNodeInteraction(nodeId, onSaved);
 *   return <li {...anchorProps}>{title}{popup}</li>;
 */
export function useNodeInteraction(
  nodeId: string,
  onSaved?: (node: NodeDetail) => void,
) {
  const [open, setOpen] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const anchorProps = {
    onClick: (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    },
    onTouchStart: () => {
      const timer = setTimeout(() => setOpen(true), 500);
      setLongPressTimer(timer);
    },
    onTouchEnd: () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        setLongPressTimer(null);
      }
    },
    onTouchMove: () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        setLongPressTimer(null);
      }
    },
  };

  const popup = open ? (
    <NodeInteractionPopup
      nodeId={nodeId}
      onClose={() => setOpen(false)}
      onSaved={onSaved}
    />
  ) : null;

  return { anchorProps, popup, open };
}
