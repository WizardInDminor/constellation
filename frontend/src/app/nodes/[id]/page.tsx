"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getNode,
  updateNode,
  deleteNode,
  listTags,
  createTag,
  createEdge,
  deleteEdge,
  suggestLinks,
  listSources,
  createSource,
  openSource,
  ragQuery,
} from "@/lib/api";
import { NoteContent } from "@/components/NoteContent";
import { MarkdownTextarea } from "@/components/MarkdownTextarea";
import { exportMermaidPngFromContainer } from "@/components/MermaidBlock";
import type {
  NodeDetail,
  TagRef,
  EdgeType,
  LinkSuggestion,
  NodeRef,
  SourceSummary,
  CanonStatus,
  NodeStatusValue,
  Charge,
} from "@/lib/api";
import { NodePicker } from "@/components/NodePicker";
import {
  EDGE_TYPES,
  EDGE_COLORS,
  EDGE_TYPE_META,
  directionGlyph,
} from "@/lib/edgeTypes";

const SOURCE_TYPES = [
  "datasheet",
  "manual",
  "book",
  "article",
  "video",
  "podcast",
  "other",
] as const;

// ── constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  fleeting: "bg-amber-100 text-amber-700",
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
};

// ── EditableField ─────────────────────────────────────────────────────────────

function EditableField({
  value,
  onSave,
  multiline = false,
  markdown = false,
  className = "",
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  markdown?: boolean;
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
    "aria-label": multiline ? "Edit content" : "Edit title",
    className: `w-full ${className}`,
  };

  if (editing) {
    return multiline ? (
      <MarkdownTextarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        previewValue={draft}
        aria-label="Edit content"
        rows={10}
        className={`textarea ${className}`}
      />
    ) : (
      <input {...sharedProps} className={`input ${className}`} />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`cursor-text rounded-md px-2 py-1 break-words hover:bg-gray-50 hover:shadow-sm transition-colors ${className}`}
    >
      {value ? (
        markdown ? (
          <NoteContent content={value} className="prose prose-sm max-w-none" />
        ) : (
          value
        )
      ) : (
        <span className="text-gray-400 italic">Click to edit</span>
      )}
    </div>
  );
}

// ── TagEditor ─────────────────────────────────────────────────────────────────

function TagEditor({
  currentTags,
  allTags,
  onUpdate,
}: {
  currentTags: TagRef[];
  allTags: TagRef[];
  onUpdate: (tagIds: string[]) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const current = new Set(currentTags.map((t) => t.id));
  const suggestions = allTags.filter(
    (t) =>
      !current.has(t.id) && t.name.toLowerCase().includes(input.toLowerCase()),
  );

  async function addTag(tag: TagRef) {
    if (current.has(tag.id)) return;
    setSaving(true);
    await onUpdate([...currentTags.map((t) => t.id), tag.id]);
    setInput("");
    setSaving(false);
  }

  async function removeTag(tagId: string) {
    setSaving(true);
    await onUpdate(currentTags.filter((t) => t.id !== tagId).map((t) => t.id));
    setSaving(false);
  }

  async function createAndAdd() {
    const name = input.trim();
    if (!name) return;
    setSaving(true);
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    const tag = existing ?? (await createTag(name));
    await onUpdate([...currentTags.map((t) => t.id), tag.id]);
    setInput("");
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {currentTags.map((t) => (
          <span key={t.id} className="badge gap-1 bg-indigo-50 text-indigo-700">
            {t.name}
            <button
              onClick={() => removeTag(t.id)}
              disabled={saving}
              aria-label={`Remove tag ${t.name}`}
              className="text-indigo-400 hover:text-indigo-700 leading-none disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createAndAdd();
            }
          }}
          placeholder="Add tag…"
          aria-label="Add tag"
          disabled={saving}
          className="input"
        />
        {input && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-xs max-h-40 overflow-y-auto">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => addTag(t)}
                  className="w-full text-left px-2 py-1.5 hover:bg-indigo-50"
                >
                  {t.name}
                </button>
              </li>
            ))}
            {!allTags.some(
              (t) => t.name.toLowerCase() === input.trim().toLowerCase(),
            ) && (
              <li>
                <button
                  onClick={createAndAdd}
                  className="w-full text-left px-2 py-1.5 text-indigo-600 hover:bg-indigo-50"
                >
                  + Create &ldquo;{input.trim()}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
        {input && suggestions.length === 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-xs">
            <li>
              <button
                onClick={createAndAdd}
                className="w-full text-left px-2 py-1.5 text-indigo-600 hover:bg-indigo-50"
              >
                + Create &ldquo;{input.trim()}&rdquo;
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

// ── CanonPanel (ADR-076) ──────────────────────────────────────────────────────

const CANON_STATUS_OPTIONS = [
  ["", "—"],
  ["canon", "Canon"],
  ["provisional", "Provisional"],
  ["speculative", "Speculative"],
  ["image_only", "Image only"],
  ["discarded", "Discarded"],
] as const;

const NODE_STATUS_OPTIONS = [
  ["", "—"],
  ["emerging", "Emerging"],
  ["stable", "Stable"],
  ["contradicted", "Contradicted"],
  ["unresolved", "Unresolved"],
  ["retired", "Retired"],
] as const;

const CHARGE_OPTIONS = [
  ["", "—"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["goosebump", "Goosebump"],
] as const;

/**
 * Editor for a node's Canon uncertainty metadata. Every control writes through
 * `updateNode`; an empty select value sends null (clears the column) so the
 * author can un-set a status without deleting the note.
 */
function CanonPanel({
  node,
  onChange,
}: {
  node: NodeDetail;
  onChange: (n: NodeDetail) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function save(patch: Parameters<typeof updateNode>[1]) {
    setSaving(true);
    try {
      onChange(await updateNode(node.id, patch));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Canon status</h3>
        {node.do_not_name_yet && (
          <span
            className="badge bg-stone-200 text-stone-700"
            title="Load-bearing mystery — kept open on purpose"
          >
            do not name yet
          </span>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Canon status
        <select
          value={node.canon_status ?? ""}
          disabled={saving}
          aria-label="Canon status"
          className="input"
          onChange={(e) =>
            save({
              canon_status: (e.target.value || null) as CanonStatus | null,
            })
          }
        >
          {CANON_STATUS_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Development status
        <select
          value={node.node_status ?? ""}
          disabled={saving}
          aria-label="Development status"
          className="input"
          onChange={(e) =>
            save({
              node_status: (e.target.value || null) as NodeStatusValue | null,
            })
          }
        >
          {NODE_STATUS_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Charge
        <select
          value={node.charge ?? ""}
          disabled={saving}
          aria-label="Charge"
          className="input"
          onChange={(e) =>
            save({ charge: (e.target.value || null) as Charge | null })
          }
        >
          {CHARGE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={!!node.do_not_name_yet}
          disabled={saving}
          onChange={(e) => save({ do_not_name_yet: e.target.checked })}
        />
        Do not name yet (protect this mystery)
      </label>
    </div>
  );
}

// ── EdgePanel ─────────────────────────────────────────────────────────────────

function EdgePanel({
  node,
  onRefresh,
}: {
  node: NodeDetail;
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<NodeRef | null>(null);
  const [edgeType, setEdgeType] = useState<EdgeType>("SUPPORTS");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);

  const allEdges = [...node.outgoing_edges, ...node.incoming_edges];

  // Group outgoing by type for display
  const byType = EDGE_TYPES.reduce<
    Record<EdgeType, typeof node.outgoing_edges>
  >(
    (acc, t) => {
      acc[t] = [];
      return acc;
    },
    {} as Record<EdgeType, typeof node.outgoing_edges>,
  );
  for (const e of node.outgoing_edges) byType[e.type].push(e);

  async function handleDelete(edgeId: string) {
    await deleteEdge(edgeId);
    onRefresh();
  }

  async function handleCreate() {
    if (!target) return;
    setSaving(true);
    setEdgeError(null);
    try {
      await createEdge({
        from_id: node.id,
        to_id: target.id,
        type: edgeType,
        note: note || undefined,
      });
      setAddOpen(false);
      setTarget(null);
      setNote("");
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg.includes("409") || msg.includes("already exists")) {
        setEdgeError("This connection already exists.");
      } else {
        setEdgeError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Connections</h3>
        <button
          onClick={() => {
            setAddOpen((o) => !o);
            setEdgeError(null);
          }}
          className="btn btn-ghost btn-sm"
        >
          {addOpen ? "Cancel" : "+ Add"}
        </button>
      </div>

      {addOpen && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 flex flex-col gap-3">
          <NodePicker onSelect={setTarget} exclude={node.id} previewOnHover />
          {target && (
            <>
              <div className="flex flex-col gap-1 text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
                <div className="flex gap-2">
                  <span className="uppercase tracking-wide text-gray-400 shrink-0">
                    From
                  </span>
                  <span className="truncate text-gray-800">{node.title}</span>
                </div>
                <div className="text-center text-gray-400">
                  {directionGlyph(edgeType)}
                </div>
                <div className="flex gap-2">
                  <span className="uppercase tracking-wide text-gray-400 shrink-0">
                    To
                  </span>
                  <span className="truncate text-gray-800">{target.title}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={edgeType}
                  onChange={(e) => setEdgeType(e.target.value as EdgeType)}
                  aria-label="Connection type"
                  className="input"
                >
                  {EDGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EDGE_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  {EDGE_TYPE_META[edgeType].description}
                </p>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why does this connection exist? (optional)"
                aria-label="Connection note"
                rows={2}
                className="textarea"
              />
              {edgeError && <p className="alert-error">{edgeError}</p>}
              <button
                onClick={handleCreate}
                disabled={saving}
                className="btn btn-primary btn-sm self-end"
              >
                {saving ? "Saving…" : "Create connection"}
              </button>
            </>
          )}
        </div>
      )}

      {allEdges.length === 0 && !addOpen && (
        <p className="text-xs text-gray-400">No connections yet.</p>
      )}

      {EDGE_TYPES.filter((t) => byType[t].length > 0).map((t) => (
        <div key={t} className="flex flex-col gap-1">
          <span
            className={`badge self-start ${EDGE_COLORS[t]}`}
            title={EDGE_TYPE_META[t].description}
          >
            {EDGE_TYPE_META[t].label}
          </span>
          {byType[t].map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between pl-2 group"
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-gray-400 shrink-0">
                  {directionGlyph(t)}
                </span>
                <Link
                  href={`/nodes/${e.neighbor.id}`}
                  className="text-sm text-indigo-700 hover:underline truncate"
                >
                  {e.neighbor.title}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {e.note && (
                  <span className="text-xs text-gray-400 italic hidden group-hover:inline truncate max-w-32">
                    {e.note}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(e.id)}
                  aria-label={`Remove connection to ${e.neighbor.title}`}
                  className="text-sm leading-none text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {node.incoming_edges.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-400 font-medium">
            Referenced by
          </span>
          {node.incoming_edges.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between pl-2 group"
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-gray-400 shrink-0">
                  {EDGE_TYPE_META[e.type].directional ? "←" : "↔"}
                </span>
                <Link
                  href={`/nodes/${e.neighbor.id}`}
                  className="text-sm text-gray-600 hover:text-indigo-700 hover:underline truncate"
                >
                  {e.neighbor.title}
                </Link>
              </div>
              <span
                className={`badge shrink-0 ${EDGE_COLORS[e.type]}`}
                title={EDGE_TYPE_META[e.type].description}
              >
                {EDGE_TYPE_META[e.type].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SourcePanel ───────────────────────────────────────────────────────────────

function SourcePanel({
  node,
  onChange,
}: {
  node: NodeDetail;
  onChange: () => void;
}) {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMessage, setOpenMessage] = useState<{
    kind: "error" | "warning";
    text: string;
  } | null>(null);

  // New-source form state
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] =
    useState<(typeof SOURCE_TYPES)[number]>("other");
  const [newUrl, setNewUrl] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const attached = sources.find((s) => s.id === node.source_id) ?? null;
  const knownAttached = node.source_id !== null && node.source_id !== undefined;

  useEffect(() => {
    if (attaching || knownAttached) {
      listSources()
        .then(setSources)
        .catch(() => {});
    }
  }, [attaching, knownAttached]);

  const filtered = query.trim()
    ? sources.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : sources.slice(0, 20);

  async function attach(sourceId: string) {
    setSaving(true);
    setError(null);
    try {
      await updateNode(node.id, { source_id: sourceId });
      setAttaching(false);
      setQuery("");
      setShowNew(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to attach source");
    } finally {
      setSaving(false);
    }
  }

  async function detach() {
    setSaving(true);
    setError(null);
    try {
      await updateNode(node.id, { source_id: null });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to detach source");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAndAttach(e: React.FormEvent) {
    e.preventDefault();
    setNewError(null);
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createSource({
        title: newTitle.trim(),
        type: newType,
        url: newUrl.trim() || null,
      });
      await updateNode(node.id, { source_id: created.id });
      setNewTitle("");
      setNewUrl("");
      setNewType("other");
      setShowNew(false);
      setAttaching(false);
      onChange();
    } catch (err) {
      setNewError(
        err instanceof Error ? err.message : "Failed to create source",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOpen() {
    if (!node.source_id) return;
    setOpenMessage(null);
    try {
      const result = await openSource(node.source_id);
      if (result.warning) {
        setOpenMessage({ kind: "warning", text: result.warning });
      }
    } catch (e) {
      setOpenMessage({
        kind: "error",
        text: e instanceof Error ? e.message : "Could not open source",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Source</h3>
        {knownAttached && (
          <button
            onClick={detach}
            disabled={saving}
            className="btn btn-ghost btn-sm text-gray-400 hover:text-red-600"
          >
            Detach
          </button>
        )}
      </div>

      {error && <p className="alert-error">{error}</p>}

      {knownAttached ? (
        <div className="flex flex-col gap-1.5 border border-blue-100 bg-blue-50/50 rounded px-3 py-2">
          {attached ? (
            <>
              <Link
                href={`/sources/${attached.id}`}
                className="text-sm font-medium text-blue-800 hover:underline truncate"
              >
                {attached.title}
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="capitalize">{attached.type}</span>
                {attached.author && <span>· {attached.author}</span>}
                <button
                  onClick={handleOpen}
                  className="ml-auto text-indigo-600 hover:text-indigo-800"
                >
                  Open source →
                </button>
              </div>
              {openMessage && (
                <p
                  className={
                    openMessage.kind === "error"
                      ? "text-xs text-red-600"
                      : "text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                  }
                >
                  {openMessage.text}
                </p>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">
              Loading source…
            </span>
          )}
        </div>
      ) : attaching ? (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources…"
            aria-label="Search sources"
            className="input"
          />
          <ul className="max-h-40 overflow-y-auto border border-gray-100 rounded divide-y divide-gray-100">
            {filtered.length === 0 && (
              <li className="text-xs text-gray-400 italic px-2 py-1.5">
                No sources match.
              </li>
            )}
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => attach(s.id)}
                  disabled={saving}
                  className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span className="text-sm font-medium truncate block">
                    {s.title}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">
                    {s.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={() => setShowNew((v) => !v)}
            className="btn btn-ghost btn-sm self-start text-indigo-600 hover:text-indigo-700"
          >
            {showNew ? "▲ Cancel new source" : "+ New source"}
          </button>

          {showNew && (
            <form
              onSubmit={handleCreateAndAttach}
              className="flex flex-col gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-3"
            >
              {newError && <p className="alert-error">{newError}</p>}
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title *"
                aria-label="Source title"
                required
                className="input"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as (typeof SOURCE_TYPES)[number])
                  }
                  aria-label="Source type"
                  className="input capitalize"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL or file:// path"
                  aria-label="Source URL or file path"
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNew(false);
                    setNewError(null);
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newTitle.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? "Saving…" : "Create & attach"}
                </button>
              </div>
            </form>
          )}

          <button
            onClick={() => {
              setAttaching(false);
              setQuery("");
              setShowNew(false);
            }}
            className="btn btn-ghost btn-sm self-start"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAttaching(true)}
          className="btn btn-ghost btn-sm self-start text-indigo-600 hover:text-indigo-700"
        >
          + Attach source
        </button>
      )}
    </div>
  );
}

// ── CriticPanel ───────────────────────────────────────────────────────────────

function CriticPanel({ node }: { node: NodeDetail }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await ragQuery(`${node.title}\n\n${node.content}`, {
        mode: "critic",
      });
      setAnswer(res.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Critic mode failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-label">Critic mode</h3>
        <button
          onClick={run}
          disabled={loading}
          className="btn btn-ghost btn-sm text-indigo-600 hover:text-indigo-700"
        >
          {loading
            ? "Asking…"
            : answer
              ? "Re-run"
              : "Generate reader questions"}
        </button>
      </div>

      {!answer && !loading && !error && (
        <p className="text-xs text-gray-500">
          Ask Claude to enumerate the questions a careful reader would raise
          about this note.
        </p>
      )}

      {error && <p className="alert-error">{error}</p>}

      {answer && (
        <div className="prose prose-sm max-w-none text-sm text-gray-700">
          <NoteContent content={answer} />
        </div>
      )}
    </div>
  );
}

// ── SuggestLinksPanel ─────────────────────────────────────────────────────────

function SuggestLinksPanel({
  nodeId,
  onEdgeCreated,
}: {
  nodeId: string;
  onEdgeCreated: () => void;
}) {
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setDismissed(new Set());
    setAcceptErrors({});
    try {
      const res = await suggestLinks(nodeId);
      setSuggestions(res.suggestions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get suggestions",
      );
    } finally {
      setLoading(false);
    }
  }

  async function accept(s: LinkSuggestion) {
    setAccepting(s.node_id);
    try {
      await createEdge({
        from_id: nodeId,
        to_id: s.node_id,
        type: s.edge_type,
        note: s.rationale,
      });
      setDismissed((d) => new Set([...d, s.node_id]));
      onEdgeCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg.includes("409") || msg.includes("already exists")) {
        setAcceptErrors((prev) => ({
          ...prev,
          [s.node_id]: "Already connected.",
        }));
        setDismissed((d) => new Set([...d, s.node_id]));
      } else {
        setAcceptErrors((prev) => ({ ...prev, [s.node_id]: msg }));
      }
    } finally {
      setAccepting(null);
    }
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.node_id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-label">AI suggestions</h3>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-ghost btn-sm text-indigo-600 hover:text-indigo-700"
        >
          {loading
            ? "Thinking…"
            : suggestions.length > 0
              ? "Re-suggest"
              : "Suggest connections"}
        </button>
      </div>

      {error && <p className="alert-error">{error}</p>}

      {visible.length === 0 && !loading && suggestions.length > 0 && (
        <p className="text-xs text-gray-500">All suggestions reviewed.</p>
      )}

      {visible.map((s) => (
        <div key={s.node_id} className="card flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/nodes/${s.node_id}`}
              className="text-sm font-medium text-indigo-700 hover:underline break-words"
            >
              {s.node_title}
            </Link>
            <span className={`badge shrink-0 ${EDGE_COLORS[s.edge_type]}`}>
              {s.edge_type}
            </span>
          </div>
          <p className="text-xs text-gray-500 italic">{s.rationale}</p>
          {acceptErrors[s.node_id] && (
            <p className="text-xs text-amber-600">{acceptErrors[s.node_id]}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => accept(s)}
              disabled={accepting === s.node_id}
              className="btn btn-primary btn-sm"
            >
              {accepting === s.node_id ? "Saving…" : "Accept"}
            </button>
            <button
              onClick={() => setDismissed((d) => new Set([...d, s.node_id]))}
              className="btn btn-ghost btn-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NodePage ──────────────────────────────────────────────────────────────────

export default function NodePage() {
  const params = useParams<{ id: string }>();
  const nodeId = params.id;
  const router = useRouter();

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Used by the Export menu (Slice 3) to find rendered mermaid SVGs.
  const contentRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(() => {
    getNode(nodeId)
      .then(setNode)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [nodeId]);

  useEffect(() => {
    reload();
    listTags()
      .then(setAllTags)
      .catch(() => {});
  }, [reload]);

  async function saveField(field: "title" | "content", value: string) {
    const updated = await updateNode(nodeId, { [field]: value });
    setNode(updated);
  }

  async function saveTags(tagIds: string[]) {
    const updated = await updateNode(nodeId, { tag_ids: tagIds });
    setNode(updated);
    listTags()
      .then(setAllTags)
      .catch(() => {});
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteNode(nodeId);
      router.push("/notes");
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="alert-error">{error}</div>
        <Link href="/inbox" className="text-sm text-indigo-600 hover:underline">
          ← Back to inbox
        </Link>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-5 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="card flex flex-col gap-4 p-6">
              <div className="skeleton h-7 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-4/5" />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="card h-32 p-4">
              <div className="skeleton h-full w-full" />
            </div>
            <div className="card h-32 p-4">
              <div className="skeleton h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/notes"
            className="text-sm text-gray-500 hover:text-gray-800 shrink-0"
          >
            ← Notes
          </Link>
          <span
            className={`badge capitalize shrink-0 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
          >
            {node.type}
          </span>
        </div>
        {showDeleteConfirm ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-500">
              Delete this note? This cannot be undone.
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-danger btn-sm"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ExportMenu node={node} contentRef={contentRef} />
            {node.type === "fleeting" && (
              <Link
                href={`/inbox/process/${nodeId}`}
                className="btn btn-primary btn-sm"
              >
                Process →
              </Link>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn btn-ghost btn-sm text-gray-500 hover:text-red-600"
            >
              Delete note
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div ref={contentRef} className="card flex flex-col gap-4 p-6">
            <EditableField
              value={node.title}
              onSave={(v) => saveField("title", v)}
              className="text-xl font-bold"
            />
            <EditableField
              value={node.content}
              onSave={(v) => saveField("content", v)}
              multiline
              markdown
              className="text-sm text-gray-700 leading-relaxed"
            />
          </div>

          <div className="card p-4">
            <h3 className="section-label mb-3">Tags</h3>
            <TagEditor
              currentTags={node.tags}
              allTags={allTags}
              onUpdate={saveTags}
            />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>Created {new Date(node.created_at).toLocaleString()}</span>
            <span>Updated {new Date(node.updated_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          {node.type !== "fleeting" && (
            <div className="card p-4">
              <SourcePanel node={node} onChange={reload} />
            </div>
          )}
          {node.type !== "fleeting" && (
            <div className="card p-4">
              <CanonPanel node={node} onChange={setNode} />
            </div>
          )}
          <div className="card p-4">
            <EdgePanel node={node} onRefresh={reload} />
          </div>
          {node.type !== "fleeting" && (
            <div className="card p-4">
              <SuggestLinksPanel nodeId={nodeId} onEdgeCreated={reload} />
            </div>
          )}
          {node.type !== "fleeting" && (
            <div className="card p-4">
              <CriticPanel node={node} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Export menu (Slice 3) ────────────────────────────────────────────────────

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "note"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportMenu({
  node,
  contentRef,
}: {
  node: NodeDetail;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const slug = slugify(node.title);

  async function handlePng() {
    setStatus(null);
    setOpen(false);
    const container = contentRef.current;
    if (!container) return;
    try {
      const ok = await exportMermaidPngFromContainer(container, `${slug}.png`);
      if (!ok) setStatus("No mermaid diagram found in this note.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "PNG export failed");
    }
  }

  function handleMarkdown() {
    setStatus(null);
    setOpen(false);
    downloadBlob(
      new Blob([node.content], { type: "text/markdown" }),
      `${slug}.md`,
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-ghost btn-sm"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-44 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md text-sm">
          <button
            onClick={handlePng}
            className="block w-full px-3 py-2 text-left hover:bg-gray-50"
          >
            PNG (Mermaid chart)
          </button>
          <button
            onClick={handleMarkdown}
            className="block w-full px-3 py-2 text-left hover:bg-gray-50"
          >
            Markdown (.md)
          </button>
        </div>
      )}
      {status && <span className="ml-2 text-xs text-amber-600">{status}</span>}
    </div>
  );
}
