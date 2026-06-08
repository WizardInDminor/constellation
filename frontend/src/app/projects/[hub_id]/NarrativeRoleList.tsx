"use client";

/**
 * Slice 5: list views for narrative-role nodes (characters / themes /
 * locations / lore). Each is a structure or permanent node tagged with
 * one of the reserved 'narrative:*' tags. The full per-role sheets ship
 * in Phase 10; Slice 5 ships the list + quick-create + Ctrl+click edit.
 */

import { useEffect, useState } from "react";
import {
  createStructureNode,
  createPermanentNode,
  createTag,
  getNode,
  listNodes,
  listTags,
  updateNode,
} from "@/lib/api";
import type { NodeDetail, NodeSummary, TagRef } from "@/lib/api";
import { useNodeInteraction } from "@/components/NodeInteractionPopup";

interface Props {
  /** The reserved tag identifying nodes belonging to this role. */
  tagName: string;
  /** What we call the role in headers + buttons (e.g. "Character"). */
  roleLabel: string;
  /** Plural form (e.g. "Characters"). */
  roleLabelPlural: string;
  /** Whether new nodes should be `structure` (default) or `permanent`. */
  nodeKind: "structure" | "permanent";
  /** Optional secondary tag (e.g. specific lore category) for the
   *  quick-create — appears as a dropdown above title. */
  categoryTags?: { value: string; label: string }[];
}

export function NarrativeRoleList({
  tagName,
  roleLabel,
  roleLabelPlural,
  nodeKind,
  categoryTags,
}: Props) {
  const [items, setItems] = useState<NodeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const tags = await listTags();
      const tag = tags.find((t) => t.name === tagName);
      if (!tag) {
        setItems([]);
        return;
      }
      // Pull a generous slice (the corpus of narrative-role nodes is
      // expected to be O(10-100) per project).
      const r = await listNodes(undefined, 1, 100);
      const filtered = r.items.filter((n) =>
        // We don't have tags on NodeSummary universally, but list_nodes
        // does fetch tags. Defensive cast.
        ((n as unknown as { tags?: TagRef[] }).tags ?? []).some(
          (t) => t.name === tagName,
        ),
      );
      setItems(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagName]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-label">{roleLabelPlural}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Slice 5 lists; full per-{roleLabel.toLowerCase()} sheets land in
            Phase 10.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-secondary btn-sm shrink-0"
        >
          + New {roleLabel.toLowerCase()}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {items === null ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="card px-3 py-2.5">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton mt-2 h-3 w-full" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm font-medium text-gray-700">
            No {roleLabelPlural.toLowerCase()} yet
          </p>
          <p className="text-xs text-gray-500">
            Click “New {roleLabel.toLowerCase()}” to add the first one.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((n) => (
            <NarrativeRoleItem key={n.id} item={n} onChanged={refresh} />
          ))}
        </ul>
      )}

      {creating && (
        <QuickCreateDialog
          tagName={tagName}
          roleLabel={roleLabel}
          nodeKind={nodeKind}
          categoryTags={categoryTags}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function NarrativeRoleItem({
  item,
  onChanged,
}: {
  item: NodeSummary;
  onChanged: () => void;
}) {
  const { anchorProps, popup } = useNodeInteraction(item.id, onChanged);
  const categoryTag = (
    (item as unknown as { tags?: TagRef[] }).tags ?? []
  ).find((t) => t.name.startsWith("narrative:lore-"));
  return (
    <li>
      <button
        {...anchorProps}
        className="card-interactive block w-full px-3 py-2.5 text-left"
        title="Click for quick-edit (Ctrl+click also opens this)"
      >
        <p className="text-sm font-medium text-gray-900 truncate">
          {item.title}
        </p>
        {categoryTag && (
          <p className="section-label mt-1">
            {categoryTag.name.replace("narrative:lore-", "").replace(/-/g, " ")}
          </p>
        )}
        {item.summary && (
          <p className="text-xs text-gray-500 truncate mt-1">{item.summary}</p>
        )}
      </button>
      {popup}
    </li>
  );
}

// ---------------------------------------------------------------------------
// QuickCreateDialog
// ---------------------------------------------------------------------------

function QuickCreateDialog({
  tagName,
  roleLabel,
  nodeKind,
  categoryTags,
  onClose,
  onCreated,
}: {
  tagName: string;
  roleLabel: string;
  nodeKind: "structure" | "permanent";
  categoryTags?: { value: string; label: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [archetype, setArchetype] = useState("");
  const [category, setCategory] = useState(categoryTags?.[0]?.value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Ensure the role tag exists.
      const existingTags = await listTags();
      let roleTag = existingTags.find((t) => t.name === tagName);
      if (!roleTag) {
        roleTag = await createTag(tagName);
      }

      const tagIds = [roleTag.id];

      // Optional secondary category tag (lore-history etc.)
      if (category) {
        let catTag = existingTags.find((t) => t.name === category);
        if (!catTag) catTag = await createTag(category);
        tagIds.push(catTag.id);
      }

      const fullContent = archetype
        ? `**Archetype:** ${archetype}\n\n${description.trim()}`
        : description.trim();

      const created =
        nodeKind === "structure"
          ? await createStructureNode({
              title: title.trim(),
              content: fullContent,
            })
          : await createPermanentNode({
              title: title.trim(),
              content: fullContent,
            });

      // Attach role tags (and category if set).
      await updateNode(created.id, { tag_ids: tagIds });

      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`New ${roleLabel.toLowerCase()}`}
        className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            New {roleLabel.toLowerCase()}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="role-title" className="label">
              Title
            </label>
            <input
              id="role-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />
          </div>
          {categoryTags && categoryTags.length > 0 && (
            <div>
              <label htmlFor="role-category" className="label">
                Category
              </label>
              <select
                id="role-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              >
                {categoryTags.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {roleLabel.toLowerCase() === "character" && (
            <div>
              <label htmlFor="role-archetype" className="label">
                Archetype
              </label>
              <select
                id="role-archetype"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                className="input"
              >
                <option value="">— unset —</option>
                <option>Protagonist</option>
                <option>Antagonist</option>
                <option>Supporting</option>
                <option>Other</option>
                <option>Complex</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="role-description" className="label">
              Description
            </label>
            <textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="textarea"
            />
          </div>
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="btn btn-primary"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
