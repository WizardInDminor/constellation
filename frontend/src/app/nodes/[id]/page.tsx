"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import type {
  NodeDetail,
  TagRef,
  EdgeType,
  LinkSuggestion,
  NodeRef,
  SourceSummary,
} from "@/lib/api";
import { NodePicker } from "@/components/NodePicker";
import { EDGE_TYPES, EDGE_COLORS, EDGE_TYPE_META, directionGlyph } from "@/lib/edgeTypes";

const SOURCE_TYPES = ["datasheet", "manual", "book", "article", "video", "podcast", "other"] as const;

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
      {value ? (
        markdown ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          value
        )
      ) : (
        <span className="text-gray-300 italic">Click to edit</span>
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
          <NodePicker onSelect={setTarget} exclude={node.id} previewOnHover />
          {target && (
            <>
              <div className="flex flex-col gap-1 text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
                <div className="flex gap-2">
                  <span className="uppercase tracking-wide text-gray-400 shrink-0">From</span>
                  <span className="truncate text-gray-800">{node.title}</span>
                </div>
                <div className="text-center text-gray-400">{directionGlyph(edgeType)}</div>
                <div className="flex gap-2">
                  <span className="uppercase tracking-wide text-gray-400 shrink-0">To</span>
                  <span className="truncate text-gray-800">{target.title}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={edgeType}
                  onChange={(e) => setEdgeType(e.target.value as EdgeType)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  {EDGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EDGE_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">{EDGE_TYPE_META[edgeType].description}</p>
              </div>
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
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded self-start ${EDGE_COLORS[t]}`}
            title={EDGE_TYPE_META[t].description}
          >
            {EDGE_TYPE_META[t].label}
          </span>
          {byType[t].map((e) => (
            <div key={e.id} className="flex items-center justify-between pl-2 group">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-gray-400 shrink-0">{directionGlyph(t)}</span>
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
                className={`text-xs px-1.5 py-0.5 rounded ${EDGE_COLORS[e.type]}`}
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
  const [openMessage, setOpenMessage] = useState<{ kind: "error" | "warning"; text: string } | null>(null);

  // New-source form state
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<(typeof SOURCE_TYPES)[number]>("other");
  const [newUrl, setNewUrl] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const attached = sources.find((s) => s.id === node.source_id) ?? null;
  const knownAttached = node.source_id !== null && node.source_id !== undefined;

  useEffect(() => {
    if (attaching || knownAttached) {
      listSources().then(setSources).catch(() => {});
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
      setNewError(err instanceof Error ? err.message : "Failed to create source");
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
      setOpenMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not open source" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Source</h3>
        {knownAttached && (
          <button
            onClick={detach}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            Detach
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

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
            <span className="text-xs text-gray-400 italic">Loading source…</span>
          )}
        </div>
      ) : attaching ? (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources…"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <ul className="max-h-40 overflow-y-auto border border-gray-100 rounded divide-y divide-gray-100">
            {filtered.length === 0 && (
              <li className="text-xs text-gray-400 italic px-2 py-1.5">No sources match.</li>
            )}
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => attach(s.id)}
                  disabled={saving}
                  className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span className="text-sm font-medium truncate block">{s.title}</span>
                  <span className="text-xs text-gray-400 capitalize">{s.type}</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={() => setShowNew((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 self-start"
          >
            {showNew ? "▲ Cancel new source" : "+ New source"}
          </button>

          {showNew && (
            <form
              onSubmit={handleCreateAndAttach}
              className="space-y-2 rounded border border-indigo-200 bg-indigo-50 p-3"
            >
              {newError && <p className="text-xs text-red-600">{newError}</p>}
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title *"
                required
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as (typeof SOURCE_TYPES)[number])}
                  className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL or file:// path"
                  className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowNew(false); setNewError(null); }}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newTitle.trim()}
                  className="text-xs bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create & attach"}
                </button>
              </div>
            </form>
          )}

          <button
            onClick={() => { setAttaching(false); setQuery(""); setShowNew(false); }}
            className="text-xs text-gray-400 hover:text-gray-700 self-start"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAttaching(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800 self-start"
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Critic mode</h3>
        <button
          onClick={run}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
        >
          {loading ? "Asking…" : answer ? "Re-run" : "Generate reader questions"}
        </button>
      </div>

      {!answer && !loading && !error && (
        <p className="text-xs text-gray-400">
          Ask Claude to enumerate the questions a careful reader would raise about this note.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {answer && (
        <div className="prose prose-sm max-w-none text-sm text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
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
  const router = useRouter();

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      <div className="flex flex-col gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/inbox" className="text-sm text-indigo-600 hover:underline">← Back to inbox</Link>
      </div>
    );
  }

  if (!node) return <div className="text-sm text-gray-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/notes" className="text-sm text-gray-400 hover:text-gray-700">← Notes</Link>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
            {node.type}
          </span>
        </div>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Delete this note? This cannot be undone.</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="text-sm text-gray-400 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {node.type === "fleeting" && (
              <Link
                href={`/inbox/process/${nodeId}`}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Process →
              </Link>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              Delete note
            </button>
          </div>
        )}
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
              markdown
              className="text-sm text-gray-700 leading-relaxed"
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
          {node.type !== "fleeting" && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <SourcePanel node={node} onChange={reload} />
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <EdgePanel node={node} onRefresh={reload} />
          </div>
          {node.type !== "fleeting" && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <SuggestLinksPanel nodeId={nodeId} onEdgeCreated={reload} />
            </div>
          )}
          {node.type !== "fleeting" && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <CriticPanel node={node} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
