"use client";

/**
 * LifecycleStatusControl — set a node's lifecycle status (Phase B, Objective 2).
 *
 * Generic: surfaces the open → developing → resolved trajectory for any node
 * that should track one (Open Questions today; research hypotheses tomorrow).
 * Status is stored as a reserved `status:*` tag, so this just rewrites the
 * node's tag set. The relationship-level "what resolved it" lives on the
 * QUESTIONS edge's resolved-state (ADR-059) and shows in the Relationship
 * Explorer.
 */

import { useState } from "react";

import { createTag, listTags, updateNode } from "@/lib/api";
import {
  type LifecycleStatus,
  LIFECYCLE_STATUSES,
  STATUS_META,
  nextTagIdsForStatus,
  statusFromTags,
  statusTagName,
} from "@/lib/lifecycleStatus";

interface NodeDetailLike {
  id: string;
  tags?: { id: string; name: string }[];
}

export function LifecycleStatusControl({
  node,
  onChange,
}: {
  node: NodeDetailLike;
  onChange: () => void;
}) {
  const tags = node.tags ?? [];
  const current = statusFromTags(tags.map((t) => t.name));
  const [saving, setSaving] = useState<LifecycleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: LifecycleStatus) {
    if (status === current || saving) return;
    setSaving(status);
    setError(null);
    try {
      const name = statusTagName(status);
      const existing = await listTags();
      const tag =
        existing.find((t) => t.name === name) ?? (await createTag(name));
      await updateNode(node.id, {
        tag_ids: nextTagIdsForStatus(tags, tag.id),
      });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set status");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card p-4">
      <h3 className="section-label">Status</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {LIFECYCLE_STATUSES.map((s) => {
          const active = s === current;
          const meta = STATUS_META[s];
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={saving !== null}
              aria-pressed={active}
              className={`badge border transition-colors ${
                active
                  ? meta.badge + " border-transparent"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              <span
                className={`mr-1 inline-block h-2 w-2 rounded-full ${meta.dot}`}
              />
              {meta.label}
              {saving === s && "…"}
            </button>
          );
        })}
      </div>
      {error && <p className="alert-error mt-2">{error}</p>}
    </div>
  );
}
