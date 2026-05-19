"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listSources,
  createSource,
  getSource,
  openSource,
  updateSource,
  deleteSource,
} from "@/lib/api";
import type { SourceSummary, SourceDetail, SourceCreate, SourceUpdate } from "@/lib/api";

const SOURCE_TYPES = ["datasheet", "manual", "book", "article", "video", "podcast", "other"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const TYPE_COLORS: Record<SourceType, string> = {
  datasheet: "bg-orange-100 text-orange-800",
  manual: "bg-yellow-100 text-yellow-800",
  book: "bg-blue-100 text-blue-800",
  article: "bg-green-100 text-green-800",
  video: "bg-red-100 text-red-800",
  podcast: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-700",
};

function NewSourceForm({
  onCreated,
  existing,
}: {
  onCreated: (s: SourceDetail) => void;
  existing: SourceSummary[];
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SourceType>("article");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = url.trim();
  const duplicate = trimmedUrl
    ? existing.find((s) => (s.url ?? "").toLowerCase() === trimmedUrl.toLowerCase())
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createSource({
        title: title.trim(),
        type,
        url: url.trim() || undefined,
        author: author.trim() || undefined,
        published_at: publishedAt || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h3 className="text-sm font-medium text-gray-900">New source</h3>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Source title"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Type *</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SourceType)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Author</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Optional"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-600 mb-1">URL or file path</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="https://… or file:///path/to/doc.pdf — supports ~ and $HOME"
          />
          {duplicate && (
            <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              This URL already exists on “{duplicate.title}”. Consider editing that source instead of creating a new one.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Published</label>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create source"}
        </button>
      </div>
    </form>
  );
}

function SourceDetailPanel({
  sourceId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  sourceId: string;
  onClose: () => void;
  onUpdated: (s: SourceDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [opening, setOpening] = useState(false);
  const [openMessage, setOpenMessage] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editType, setEditType] = useState<SourceType>("article");
  const [editUrl, setEditUrl] = useState("");
  const [editPublishedAt, setEditPublishedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getSource(sourceId).then(setDetail).catch(() => {});
  }, [sourceId]);

  function enterEdit() {
    if (!detail) return;
    setEditTitle(detail.title);
    setEditAuthor(detail.author ?? "");
    setEditType(detail.type as SourceType);
    setEditUrl(detail.url ?? "");
    setEditPublishedAt(detail.published_at ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      const update: SourceUpdate = {
        title: editTitle.trim(),
        author: editAuthor.trim() || undefined,
        type: editType,
        url: editUrl.trim() || undefined,
        published_at: editPublishedAt || undefined,
      };
      const updated = await updateSource(detail.id, update);
      setDetail(updated);
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update source");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSource(detail.id);
      onDeleted(detail.id);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete source";
      // surface 409 reason if present
      setDeleteError(msg.startsWith("409") ? msg.replace(/^409:\s*/, "") : msg);
      setDeleting(false);
    }
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  const isFile = detail.url?.startsWith("file://");
  const isWeb = detail.url?.startsWith("http://") || detail.url?.startsWith("https://");

  const handleOpen = async () => {
    setOpening(true);
    setOpenMessage(null);
    try {
      const result = await openSource(detail.id);
      if (result.warning) {
        setOpenMessage({ kind: "warning", text: result.warning });
      }
    } catch (err) {
      setOpenMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to open" });
    } finally {
      setOpening(false);
    }
  };

  const handleCopyPath = () => {
    if (detail.url) navigator.clipboard.writeText(detail.url).catch(() => {});
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{detail.title}</h2>
            {detail.author && !editing && <p className="text-sm text-gray-500">{detail.author}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">✕</button>
        </div>

        {editing ? (
          <div className="space-y-3 border border-blue-200 bg-blue-50 rounded-lg p-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Title *</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Type *</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as SourceType)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Author</label>
                <input
                  type="text"
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">URL or file path</label>
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="https://… or file:///path — supports ~ and $HOME"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Published</label>
              <input
                type="date"
                value={editPublishedAt}
                onChange={(e) => setEditPublishedAt(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[detail.type as SourceType] ?? "bg-gray-100 text-gray-700"}`}>
                {detail.type}
              </span>
              {detail.published_at && (
                <span className="text-xs text-gray-400">{detail.published_at}</span>
              )}
            </div>

            {detail.url && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 break-all font-mono bg-gray-50 rounded px-3 py-2">{detail.url}</p>
                <div className="flex gap-2 flex-wrap">
                  {(isFile || isWeb) && (
                    <button
                      onClick={handleOpen}
                      disabled={opening}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {opening ? "Opening…" : isFile ? "Open file" : "Open link"}
                    </button>
                  )}
                  {isWeb && (
                    <a
                      href={detail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Open in browser ↗
                    </a>
                  )}
                  <button
                    onClick={handleCopyPath}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Copy path
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
              </div>
            )}

            {detail.literature_notes && detail.literature_notes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Literature notes ({detail.literature_notes.length})</p>
                <ul className="space-y-1">
                  {detail.literature_notes.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={`/nodes/${n.id}`}
                        className="text-sm text-blue-600 hover:underline"
                        onClick={onClose}
                      >
                        {n.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <button
                onClick={enterEdit}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete this source?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                    disabled={deleting}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Delete
                </button>
              )}
            </div>
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listSources().then(setSources).finally(() => setLoading(false));
  }, []);

  const handleCreated = (s: SourceDetail) => {
    setSources((prev) => [...prev, s].sort((a, b) => a.title.localeCompare(b.title)));
    setShowNew(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Sources</h1>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showNew ? "Cancel" : "+ New source"}
        </button>
      </div>

      {showNew && (
        <div className="mb-6">
          <NewSourceForm onCreated={handleCreated} existing={sources} />
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && sources.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          No sources yet.{" "}
          <button onClick={() => setShowNew(true)} className="text-blue-600 hover:underline">
            Add the first one.
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {sources.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelectedId(s.id)}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-gray-50 rounded px-2 -mx-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{s.title}</p>
                  {s.author && <p className="truncate text-xs text-gray-400">{s.author}</p>}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {s.published_at && (
                    <span className="text-xs text-gray-400">{s.published_at.slice(0, 10)}</span>
                  )}
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[s.type as SourceType] ?? "bg-gray-100 text-gray-700"}`}>
                    {s.type}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && (
        <SourceDetailPanel
          sourceId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={(s) => {
            setSources((prev) =>
              prev
                .map((x) => (x.id === s.id ? { ...x, title: s.title, author: s.author, type: s.type, url: s.url, published_at: s.published_at } : x))
                .sort((a, b) => a.title.localeCompare(b.title)),
            );
          }}
          onDeleted={(id) => {
            setSources((prev) => prev.filter((x) => x.id !== id));
          }}
        />
      )}
    </div>
  );
}
