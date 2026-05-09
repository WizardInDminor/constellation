"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getNode, updateNode } from "@/lib/api";
import type { NodeDetail } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  fleeting: "bg-amber-100 text-amber-700",
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
};

function EditableField({
  value,
  onSave,
  multiline = false,
  className = "",
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function handleBlur() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  const sharedProps = {
    ref,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: `w-full bg-white border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`,
  };

  if (editing) {
    return multiline ? (
      <textarea {...sharedProps} rows={10} />
    ) : (
      <input {...sharedProps} />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`cursor-text rounded px-2 py-1 hover:bg-white hover:shadow-sm transition-colors ${className}`}
    >
      {value || <span className="text-gray-300 italic">Click to edit</span>}
    </div>
  );
}

export default function NodePage() {
  const params = useParams<{ id: string }>();
  const nodeId = params.id;

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNode(nodeId)
      .then(setNode)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [nodeId]);

  async function saveField(field: "title" | "content", value: string) {
    const updated = await updateNode(nodeId, { [field]: value });
    setNode(updated);
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/inbox" className="text-sm text-indigo-600 hover:underline">
          ← Back to inbox
        </Link>
      </div>
    );
  }

  if (!node) {
    return <div className="text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/inbox" className="text-sm text-gray-400 hover:text-gray-700">
          ← Inbox
        </Link>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4">
        <EditableField
          value={node.title}
          onSave={(v) => saveField("title", v)}
          className="text-xl font-bold"
        />
        <EditableField
          value={node.content}
          onSave={(v) => saveField("content", v)}
          multiline
          className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed"
        />
      </div>

      <div className="text-xs text-gray-400 flex gap-4">
        <span>Created {new Date(node.created_at).toLocaleString()}</span>
        <span>Updated {new Date(node.updated_at).toLocaleString()}</span>
        {node.processed_at && (
          <span>Processed {new Date(node.processed_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
