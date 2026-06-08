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
import type {
  EdgeType,
  NodeDetail,
  NodeRef,
  TagRef,
} from "@/lib/api";
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">
              {node?.title ?? "Loading…"}
            </h2>
            {node && (
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
                {node.type}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {!node ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* Content */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Content
              </label>
              <MarkdownTextarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs"
                  >
                    {t.name}
                    <button
                      onClick={() => removeTag(t.id)}
                      className="text-gray-400 hover:text-rose-500"
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
                        createAndAddTag();
                      }
                    }}
                    placeholder="add tag…"
                    className="rounded border border-gray-200 px-2 py-0.5 text-xs w-32 focus:border-blue-500 focus:outline-none"
                  />
                  {tagInput && tagSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-32 w-40 overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
                      {tagSuggestions.slice(0, 6).map((t) => (
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

            {/* Edges */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Edges out
              </label>
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
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    {edgeResults.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
                        {edgeResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              setEdgeTarget(r);
                              setEdgeSearch(r.title);
                              setEdgeResults([]);
                            }}
                            className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
                          >
                            {r.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="rounded bg-blue-50 px-2 py-0.5 truncate">
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
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-xs"
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
                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addingEdge ? "Adding…" : "Add edge"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCore}
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
