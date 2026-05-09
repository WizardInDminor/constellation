"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPermanentNode,
  createLiteratureNode,
  createSource,
  createTag,
  listSources,
  listTags,
} from "@/lib/api";
import type { TagRef, SourceSummary, SourceDetail } from "@/lib/api";

const SOURCE_TYPES = ["datasheet", "manual", "book", "article", "video", "podcast", "other"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IntentionalCaptureDialog({ open, onClose }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tags
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagRef[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Source picker
  const [allSources, setAllSources] = useState<SourceSummary[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceSummary | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);

  // Inline source creation
  const [showNewSource, setShowNewSource] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceType, setNewSourceType] = useState<(typeof SOURCE_TYPES)[number]>("article");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceSaving, setNewSourceSaving] = useState(false);
  const [newSourceError, setNewSourceError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => titleRef.current?.focus());
      listTags().then(setAllTags).catch(() => {});
      listSources().then(setAllSources).catch(() => {});
    } else {
      // Reset on close
      setTitle("");
      setContent("");
      setSummary("");
      setSelectedTags([]);
      setTagInput("");
      setSelectedSource(null);
      setSourceQuery("");
      setShowNewSource(false);
      setNewSourceTitle("");
      setNewSourceType("article");
      setNewSourceUrl("");
      setNewSourceError(null);
      setError(null);
    }
  }, [open]);

  // Tag helpers
  const selectedTagIds = new Set(selectedTags.map((t) => t.id));
  const tagSuggestions = allTags.filter(
    (t) => !selectedTagIds.has(t.id) && t.name.toLowerCase().includes(tagInput.toLowerCase()),
  );

  function addTag(tag: TagRef) {
    if (!selectedTagIds.has(tag.id)) setSelectedTags((ts) => [...ts, tag]);
    setTagInput("");
  }

  function removeTag(id: string) {
    setSelectedTags((ts) => ts.filter((t) => t.id !== id));
  }

  async function createAndAddTag() {
    const name = tagInput.trim();
    if (!name) return;
    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? (await createTag(name));
    if (!existing) setAllTags((ts) => [...ts, tag]);
    addTag(tag);
  }

  // Source helpers
  const filteredSources = allSources.filter((s) =>
    s.title.toLowerCase().includes(sourceQuery.toLowerCase()),
  );

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceTitle.trim()) return;
    setNewSourceSaving(true);
    setNewSourceError(null);
    try {
      const created: SourceDetail = await createSource({
        title: newSourceTitle.trim(),
        type: newSourceType,
        url: newSourceUrl.trim() || undefined,
      });
      setAllSources((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
      setSelectedSource(created);
      setShowNewSource(false);
      setNewSourceTitle("");
      setNewSourceUrl("");
    } catch (err) {
      setNewSourceError(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      setNewSourceSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tagIds = selectedTags.map((t) => t.id);
      if (selectedSource) {
        await createLiteratureNode({
          title: title.trim(),
          content: content.trim(),
          summary: summary.trim() || undefined,
          source_id: selectedSource.id,
          tag_ids: tagIds,
        });
      } else {
        await createPermanentNode({
          title: title.trim(),
          content: content.trim(),
          summary: summary.trim() || undefined,
          tag_ids: tagIds,
        });
      }
      onClose();
      router.push("/notes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-5 flex flex-col gap-4 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Intentional capture</p>
          <span className="text-xs text-gray-400 font-mono">Ctrl+⇧+Space</span>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Content"
          required
          rows={6}
          className="w-full resize-none border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-sentence summary (optional)"
          className="w-full border border-gray-100 rounded px-3 py-1.5 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500">Tags</label>
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((t) => (
              <span key={t.id} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                {t.name}
                <button type="button" onClick={() => removeTag(t.id)} className="text-indigo-400 hover:text-indigo-700">×</button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAndAddTag(); } }}
              placeholder="Add tag…"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            {tagInput && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-xs max-h-32 overflow-y-auto">
                {tagSuggestions.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => addTag(t)} className="w-full text-left px-2 py-1.5 hover:bg-indigo-50">{t.name}</button>
                  </li>
                ))}
                {!allTags.some((t) => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && (
                  <li>
                    <button type="button" onClick={createAndAddTag} className="w-full text-left px-2 py-1.5 text-indigo-600 hover:bg-indigo-50">
                      + Create &ldquo;{tagInput.trim()}&rdquo;
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Source */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500">
            Source <span className="font-normal text-gray-400">(optional — creates a literature note)</span>
          </label>
          {selectedSource ? (
            <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded px-3 py-2 text-sm">
              <span className="truncate text-blue-800">{selectedSource.title}</span>
              <button
                type="button"
                onClick={() => { setSelectedSource(null); setSourceQuery(""); setShowNewSource(false); }}
                className="text-blue-400 hover:text-blue-700 ml-2 shrink-0"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <input
                  value={sourceQuery}
                  onChange={(e) => { setSourceQuery(e.target.value); setSourceOpen(true); }}
                  onFocus={() => setSourceOpen(true)}
                  placeholder="Search sources…"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
                {sourceOpen && filteredSources.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-sm max-h-40 overflow-y-auto">
                    {filteredSources.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => { setSelectedSource(s); setSourceQuery(""); setSourceOpen(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex flex-col"
                        >
                          <span className="font-medium truncate">{s.title}</span>
                          {s.author && <span className="text-xs text-gray-400">{s.author}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Inline new-source creation */}
              <button
                type="button"
                onClick={() => setShowNewSource((v) => !v)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                {showNewSource ? "▲ Cancel new source" : "+ New source"}
              </button>

              {showNewSource && (
                <form
                  onSubmit={handleCreateSource}
                  className="space-y-2 rounded border border-indigo-200 bg-indigo-50 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {newSourceError && <p className="text-xs text-red-600">{newSourceError}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input
                        value={newSourceTitle}
                        onChange={(e) => setNewSourceTitle(e.target.value)}
                        placeholder="Title *"
                        required
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                    </div>
                    <select
                      value={newSourceType}
                      onChange={(e) => setNewSourceType(e.target.value as (typeof SOURCE_TYPES)[number])}
                      className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    >
                      {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      placeholder="URL or file:// path"
                      className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={newSourceSaving || !newSourceTitle.trim()}
                      className="text-xs bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {newSourceSaving ? "Creating…" : "Create & select"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : selectedSource ? "Save literature note" : "Save permanent note"}
          </button>
        </div>
      </form>
    </div>
  );
}
