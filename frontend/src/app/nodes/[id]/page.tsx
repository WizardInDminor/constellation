"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getNode,
  updateNode,
  listTags,
  createTag,
  createEdge,
  deleteEdge,
  searchNodes,
  suggestLinks,
} from "@/lib/api";
import type { NodeDetail, TagRef, EdgeType, LinkSuggestion, NodeRef } from "@/lib/api";

// ── constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  fleeting: "bg-amber-100 text-amber-700",
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
};

const EDGE_TYPES: EdgeType[] = [
  "SUPPORTS",
  "CONTRADICTS",
  "ELABORATES",
  "ANALOGOUS_TO",
  "QUESTIONS",
  "INSPIRED_BY",
  "COLLECTS",
];

const EDGE_COLORS: Record<EdgeType, string> = {
  SUPPORTS: "bg-green-100 text-green-700",
  CONTRADICTS: "bg-red-100 text-red-700",
  ELABORATES: "bg-blue-100 text-blue-700",
  ANALOGOUS_TO: "bg-purple-100 text-purple-700",
  QUESTIONS: "bg-amber-100 text-amber-700",
  INSPIRED_BY: "bg-pink-100 text-pink-700",
  COLLECTS: "bg-indigo-100 text-indigo-700",
};

// ── EditableField ─────────────────────────────────────────────────────────────

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

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  async function handleBlur() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!multiline && e.key === "Enter") { e.preventDefault(); ref.current?.blur(); }
    if (e.key === "Escape") { setDraft(value); setEditing(false); }
  }

  const sharedProps = {
    ref,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: `w-full bg-white border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`,
  };

  if (editing) {
    return multiline ? <textarea {...sharedProps} rows={10} /> : <input {...sharedProps} />;
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
    (t) => !current.has(t.id) && t.name.toLowerCase().includes(input.toLowerCase()),
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
    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? (await createTag(name));
    await onUpdate([...currentTags.map((t) => t.id), tag.id]);
    setInput("");
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {currentTags.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
          >
            {t.name}
            <button
              onClick={() => removeTag(t.id)}
              disabled={saving}
              className="text-indigo-400 hover:text-indigo-700 leading-none"
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
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAndAdd(); } }}
          placeholder="Add tag…"
          disabled={saving}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
            {!allTags.some((t) => t.name.toLowerCase() === input.trim().toLowerCase()) && (
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

// ── NodePicker ────────────────────────────────────────────────────────────────

function NodePicker({
  onSelect,
  exclude,
}: {
  onSelect: (node: NodeRef) => void;
  exclude: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NodeRef[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const res = await searchNodes(v);
      setResults(res.filter((n) => n.id !== exclude));
      setOpen(true);
    }, 250);
  }

  function select(node: NodeRef) {
    setQuery(node.title);
    setResults([]);
    setOpen(false);
    onSelect(node);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search for a note…"
        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-sm max-h-48 overflow-y-auto">
          {results.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => select(n)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
              >
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[n.type] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {n.type}
                </span>
                <span className="truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
  const byType = EDGE_TYPES.reduce<Record<EdgeType, typeof node.outgoing_edges>>(
    (acc, t) => { acc[t] = []; return acc; },
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
      await createEdge({ from_id: node.id, to_id: target.id, type: edgeType, note: note || undefined });
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
        <h3 className="text-sm font-semibold text-gray-700">Connections</h3>
        <button
          onClick={() => { setAddOpen((o) => !o); setEdgeError(null); }}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          {addOpen ? "Cancel" : "+ Add"}
        </button>
      </div>

      {addOpen && (
        <div className="border border-indigo-100 rounded-lg p-3 flex flex-col gap-3 bg-indigo-50/40">
          <NodePicker onSelect={setTarget} exclude={node.id} />
          {target && (
            <>
              <select
                value={edgeType}
                onChange={(e) => setEdgeType(e.target.value as EdgeType)}
                className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                {EDGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why does this connection exist? (optional)"
                rows={2}
                className="text-sm border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              {edgeError && <p className="text-xs text-red-600">{edgeError}</p>}
              <button
                onClick={handleCreate}
                disabled={saving}
                className="self-end px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
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
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded self-start ${EDGE_COLORS[t]}`}>
            {t}
          </span>
          {byType[t].map((e) => (
            <div key={e.id} className="flex items-center justify-between pl-2 group">
              <Link
                href={`/nodes/${e.neighbor.id}`}
                className="text-sm text-indigo-700 hover:underline truncate"
              >
                {e.neighbor.title}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {e.note && (
                  <span className="text-xs text-gray-400 italic hidden group-hover:inline truncate max-w-32">
                    {e.note}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(e.id)}
                  className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
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
          <span className="text-xs text-gray-400 font-medium">Referenced by</span>
          {node.incoming_edges.map((e) => (
            <div key={e.id} className="flex items-center justify-between pl-2 group">
              <Link
                href={`/nodes/${e.neighbor.id}`}
                className="text-sm text-gray-600 hover:text-indigo-700 hover:underline truncate"
              >
                {e.neighbor.title}
              </Link>
              <span className={`text-xs px-1.5 py-0.5 rounded ${EDGE_COLORS[e.type]}`}>
                {e.type}
              </span>
            </div>
          ))}
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
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
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
        setAcceptErrors((prev) => ({ ...prev, [s.node_id]: "Already connected." }));
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">AI Suggestions</h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
        >
          {loading ? "Thinking…" : suggestions.length > 0 ? "Re-suggest" : "Suggest connections"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {visible.length === 0 && !loading && suggestions.length > 0 && (
        <p className="text-xs text-gray-400">All suggestions reviewed.</p>
      )}

      {visible.map((s) => (
        <div
          key={s.node_id}
          className="border border-gray-100 rounded-lg p-3 flex flex-col gap-2 bg-white"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/nodes/${s.node_id}`}
              className="text-sm font-medium text-indigo-700 hover:underline"
            >
              {s.node_title}
            </Link>
            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${EDGE_COLORS[s.edge_type]}`}>
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
              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {accepting === s.node_id ? "Saving…" : "Accept"}
            </button>
            <button
              onClick={() => setDismissed((d) => new Set([...d, s.node_id]))}
              className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
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

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getNode(nodeId)
      .then(setNode)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [nodeId]);

  useEffect(() => {
    reload();
    listTags().then(setAllTags).catch(() => {});
  }, [reload]);

  async function saveField(field: "title" | "content", value: string) {
    const updated = await updateNode(nodeId, { [field]: value });
    setNode(updated);
  }

  async function saveTags(tagIds: string[]) {
    const updated = await updateNode(nodeId, { tag_ids: tagIds });
    setNode(updated);
    listTags().then(setAllTags).catch(() => {});
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/inbox" className="text-sm text-indigo-600 hover:underline">← Back to inbox</Link>
      </div>
    );
  }

  if (!node) return <div className="text-sm text-gray-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/notes" className="text-sm text-gray-400 hover:text-gray-700">← Notes</Link>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
          {node.type}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 flex flex-col gap-4">
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

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Tags</h3>
            <TagEditor
              currentTags={node.tags}
              allTags={allTags}
              onUpdate={saveTags}
            />
          </div>

          <div className="text-xs text-gray-400 flex gap-4">
            <span>Created {new Date(node.created_at).toLocaleString()}</span>
            <span>Updated {new Date(node.updated_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <EdgePanel node={node} onRefresh={reload} />
          </div>
          {node.type !== "fleeting" && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <SuggestLinksPanel nodeId={nodeId} onEdgeCreated={reload} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
