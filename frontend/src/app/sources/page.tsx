"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSources, createSource, getSource, openSource } from "@/lib/api";
import type { SourceSummary, SourceDetail, SourceCreate } from "@/lib/api";

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

function NewSourceForm({ onCreated }: { onCreated: (s: SourceDetail) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SourceType>("article");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data: Omit<SourceCreate, "id"> = {
        title: title.trim(),
        type,
        url: url.trim() || undefined,
        author: author.trim() || undefined,
        published_at: publishedAt || undefined,
      };
      const created = await createSource(data);
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
            placeholder="https://… or file:///path/to/doc.pdf"
          />
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

function SourceDetailPanel({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    getSource(sourceId).then(setDetail).catch(() => {});
  }, [sourceId]);

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
    setOpenError(null);
    try {
      await openSource(detail.id);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open");
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
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{detail.title}</h2>
            {detail.author && <p className="text-sm text-gray-500">{detail.author}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">✕</button>
        </div>

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
            <div className="flex gap-2">
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
            {openError && <p className="text-xs text-red-600">{openError}</p>}
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
          <NewSourceForm onCreated={handleCreated} />
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
        <SourceDetailPanel sourceId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
