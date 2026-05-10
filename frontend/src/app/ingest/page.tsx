"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ingestDocument,
  getPendingIngest,
  clearPendingIngest,
  createLiteratureNode,
  createStructureNode,
  createEdge,
  getSource,
  listSources,
  listTags,
  createTag,
} from "@/lib/api";
import type {
  ChunkResult,
  IngestDocumentResponse,
  LiteratureCandidate,
  SourceSummary,
} from "@/lib/api";

const SOURCE_TYPES = [
  "datasheet",
  "manual",
  "book",
  "article",
  "video",
  "podcast",
  "other",
] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Types for review state
// ---------------------------------------------------------------------------

type CandidateState = LiteratureCandidate & {
  checked: boolean;
  editTitle: string;
  editContent: string;
};

type ChunkState = {
  chunk_index: number;
  heading: string | null;
  error: string | null;
  candidates: CandidateState[];
};

function toChunkState(chunks: ChunkResult[]): ChunkState[] {
  return chunks.map((c) => ({
    chunk_index: c.chunk_index,
    heading: c.heading ?? null,
    error: c.error ?? null,
    candidates: c.candidates.map((cand) => ({
      ...cand,
      checked: true,
      editTitle: cand.title,
      editContent: cand.content,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Step 1: Upload form
// ---------------------------------------------------------------------------

function UploadForm({
  onResult,
}: {
  onResult: (r: IngestDocumentResponse) => void;
}) {
  const [content, setContent] = useState("");
  const [sourceMode, setSourceMode] = useState<"new" | "existing">("new");
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SourceType>("datasheet");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSources().then(setSources).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }
    if (sourceMode === "existing" && !selectedSourceId) {
      setError("Select a source.");
      return;
    }
    if (sourceMode === "new" && !title.trim()) {
      setError("Source title is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body =
        sourceMode === "existing"
          ? { content, source_id: selectedSourceId }
          : {
              content,
              source: {
                title: title.trim(),
                type,
                author: author.trim() || undefined,
                url: url.trim() || undefined,
              },
            };
      const result = await ingestDocument(body);
      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import document</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste document content to extract literature notes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document content
          </label>
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            rows={16}
            placeholder="Paste markdown or plain text here…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Source mode toggle */}
        <div>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={sourceMode === "new"}
                onChange={() => setSourceMode("new")}
                disabled={loading}
              />
              <span className="text-sm text-gray-700">New source</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={sourceMode === "existing"}
                onChange={() => setSourceMode("existing")}
                disabled={loading || sources.length === 0}
              />
              <span className="text-sm text-gray-700">
                Existing source
                {sources.length === 0 && (
                  <span className="ml-1 text-gray-400">(none yet)</span>
                )}
              </span>
            </label>
          </div>

          {sourceMode === "new" ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="MCP4922 Datasheet"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Type *
                </label>
                <select
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as SourceType)}
                  disabled={loading}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Author
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Optional"
                  disabled={loading}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">URL</label>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="file:/// or https://…"
                  disabled={loading}
                />
              </div>
            </div>
          ) : (
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select a source…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.type})
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Processing sections… this may take up to a minute for large documents." : "Process document"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Review
// ---------------------------------------------------------------------------

function ReviewPage({
  sourceId,
  chunks: initialChunks,
  onStartOver,
}: {
  sourceId: string;
  chunks: ChunkResult[];
  onStartOver: () => void;
}) {
  const router = useRouter();
  const [chunks, setChunks] = useState<ChunkState[]>(() =>
    toChunkState(initialChunks)
  );
  const [accepting, setAccepting] = useState(false);
  const [progress, setProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [error, setError] = useState<string | null>(null);

  // Import options state
  const [sourceTitle, setSourceTitle] = useState("");
  const [autoTag, setAutoTag] = useState("");
  const [createHub, setCreateHub] = useState(true);
  const [hubTitle, setHubTitle] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Fetch source title on mount to pre-fill hub note title
  useEffect(() => {
    getSource(sourceId)
      .then((s) => {
        setSourceTitle(s.title);
        setHubTitle(s.title);
      })
      .catch(() => {});
  }, [sourceId]);

  const totalChecked = chunks.reduce(
    (sum, c) => sum + c.candidates.filter((cand) => cand.checked).length,
    0
  );

  const toggleCandidate = (ci: number, candi: number) => {
    setChunks((prev) =>
      prev.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              candidates: c.candidates.map((cand, j) =>
                j !== candi ? cand : { ...cand, checked: !cand.checked }
              ),
            }
      )
    );
  };

  const updateTitle = (ci: number, candi: number, val: string) => {
    setChunks((prev) =>
      prev.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              candidates: c.candidates.map((cand, j) =>
                j !== candi ? cand : { ...cand, editTitle: val }
              ),
            }
      )
    );
  };

  const updateContent = (ci: number, candi: number, val: string) => {
    setChunks((prev) =>
      prev.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              candidates: c.candidates.map((cand, j) =>
                j !== candi ? cand : { ...cand, editContent: val }
              ),
            }
      )
    );
  };

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    // 1. Resolve or create the auto-tag (non-fatal if it fails)
    let autoTagId: string | undefined;
    const tagName = autoTag.trim();
    if (tagName) {
      try {
        const allTags = await listTags();
        const existing = allTags.find(
          (t) => t.name.toLowerCase() === tagName.toLowerCase()
        );
        autoTagId = existing ? existing.id : (await createTag(tagName)).id;
      } catch {
        // proceed without the tag
      }
    }

    // 2. Build the accept list and create literature notes
    const toAccept: { key: string; title: string; content: string; summary: string }[] = [];
    for (const chunk of chunks) {
      for (const cand of chunk.candidates) {
        if (cand.checked) {
          const key = `${chunk.chunk_index}-${cand.title}`;
          toAccept.push({
            key,
            title: cand.editTitle,
            content: cand.editContent,
            summary: cand.summary,
          });
          setProgress((p) => ({ ...p, [key]: "pending" }));
        }
      }
    }

    let anyError = false;
    const acceptedIds: string[] = [];
    for (const item of toAccept) {
      try {
        const node = await createLiteratureNode({
          title: item.title,
          content: item.content,
          summary: item.summary,
          source_id: sourceId,
          tag_ids: autoTagId ? [autoTagId] : undefined,
        });
        acceptedIds.push(node.id);
        setProgress((p) => ({ ...p, [item.key]: "done" }));
      } catch {
        setProgress((p) => ({ ...p, [item.key]: "error" }));
        anyError = true;
      }
    }

    if (anyError) {
      setError("Some notes failed to save. Check the errors above and try again.");
      setAccepting(false);
      return;
    }

    // 3. Create hub structure note + COLLECTS edges (non-fatal)
    if (createHub && hubTitle.trim() && acceptedIds.length > 0) {
      try {
        const hub = await createStructureNode({
          title: hubTitle.trim(),
          content: `Notes imported from: ${sourceTitle}`,
        });
        for (const nodeId of acceptedIds) {
          await createEdge({
            from_id: hub.id,
            to_id: nodeId,
            type: "COLLECTS",
          }).catch(() => {});
        }
      } catch {
        // hub creation failure is non-fatal; literature notes are already saved
      }
    }

    await clearPendingIngest(sourceId).catch(() => {});
    router.push(`/sources/${sourceId}`);
  };

  const totalCandidates = chunks.reduce((s, c) => s + c.candidates.length, 0);
  const chunksWithCandidates = chunks.filter((c) => c.candidates.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review candidates</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalCandidates} candidate{totalCandidates !== 1 ? "s" : ""} across{" "}
            {chunksWithCandidates} section{chunksWithCandidates !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={onStartOver}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Start over
        </button>
      </div>

      <div className="space-y-6">
        {chunks.map((chunk, ci) => (
          <div key={chunk.chunk_index} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Section {chunk.chunk_index + 1}
              </span>
              {chunk.heading && (
                <span className="ml-2 text-sm font-medium text-gray-800">
                  {chunk.heading}
                </span>
              )}
            </div>

            {chunk.error ? (
              <div className="px-4 py-3 text-sm text-amber-700 bg-amber-50">
                AI could not process this section: {chunk.error}
              </div>
            ) : chunk.candidates.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">
                No candidates extracted from this section.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {chunk.candidates.map((cand, candi) => {
                  const key = `${chunk.chunk_index}-${cand.title}`;
                  const prog = progress[key];
                  return (
                    <div
                      key={candi}
                      className={`px-4 py-3 ${
                        prog === "done"
                          ? "bg-green-50 opacity-60"
                          : prog === "error"
                          ? "bg-red-50"
                          : cand.checked
                          ? ""
                          : "opacity-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={cand.checked}
                          onChange={() => toggleCandidate(ci, candi)}
                          disabled={accepting}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
                        />
                        <div className="flex-1 space-y-2 min-w-0">
                          <input
                            type="text"
                            value={cand.editTitle}
                            onChange={(e) => updateTitle(ci, candi, e.target.value)}
                            disabled={accepting || !cand.checked}
                            className="w-full rounded border-0 bg-transparent p-0 text-sm font-medium text-gray-900 focus:ring-0 focus:outline-none border-b border-transparent focus:border-gray-300"
                          />
                          <textarea
                            value={cand.editContent}
                            onChange={(e) => updateContent(ci, candi, e.target.value)}
                            disabled={accepting || !cand.checked}
                            rows={3}
                            className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 resize-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                          />
                          <p className="text-xs text-gray-400 italic">{cand.summary}</p>
                          {prog === "done" && (
                            <span className="text-xs text-green-600 font-medium">Saved</span>
                          )}
                          {prog === "error" && (
                            <span className="text-xs text-red-600 font-medium">Failed to save</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Import options */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setOptionsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
          disabled={accepting}
        >
          <span>Import options</span>
          <span className="text-gray-400">{optionsOpen ? "▲" : "▼"}</span>
        </button>

        {optionsOpen && (
          <div className="px-4 py-4 space-y-4 bg-white border-t border-gray-200">
            {/* Auto-tag */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 whitespace-nowrap shrink-0">
                Tag all accepted notes with:
              </label>
              <input
                type="text"
                value={autoTag}
                onChange={(e) => setAutoTag(e.target.value)}
                disabled={accepting}
                placeholder="e.g. mcp4922"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Hub note */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createHub}
                  onChange={(e) => setCreateHub(e.target.checked)}
                  disabled={accepting}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">Create a hub note for this import</span>
              </label>
              {createHub && (
                <input
                  type="text"
                  value={hubTitle}
                  onChange={(e) => setHubTitle(e.target.value)}
                  disabled={accepting}
                  placeholder="Hub note title"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-0 bg-white border-t border-gray-200 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {totalChecked} note{totalChecked !== 1 ? "s" : ""} selected
        </span>
        <button
          onClick={handleAccept}
          disabled={accepting || totalChecked === 0}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {accepting
            ? "Saving…"
            : `Accept ${totalChecked} selected note${totalChecked !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page orchestrator
// ---------------------------------------------------------------------------

export default function IngestPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
      <IngestPageInner />
    </Suspense>
  );
}

function IngestPageInner() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [result, setResult] = useState<IngestDocumentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // If ?source_id= is in the URL (CLI handoff), load the pending ingest
  const urlSourceId = searchParams.get("source_id");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!urlSourceId || loadedRef.current) return;
    loadedRef.current = true;

    getPendingIngest(urlSourceId)
      .then((pending) => {
        setResult({
          source_id: pending.source_id,
          pending_ingest_id: pending.id,
          chunks_processed: pending.chunks.length,
          total_candidates: pending.chunks.reduce(
            (s, c) => s + c.candidates.length,
            0
          ),
          chunks: pending.chunks,
        });
        setStep("review");
      })
      .catch(() => {
        setLoadError(
          "No pending import found for this source. It may have expired (7-day TTL) or already been accepted."
        );
      });
  }, [urlSourceId]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          onClick={() => {
            setLoadError(null);
            setStep("upload");
          }}
          className="text-sm text-indigo-600 hover:underline"
        >
          Start a new import
        </button>
      </div>
    );
  }

  if (step === "review" && result) {
    return (
      <ReviewPage
        sourceId={result.source_id}
        chunks={result.chunks}
        onStartOver={() => {
          setStep("upload");
          setResult(null);
          // Clear source_id from URL without navigation
          window.history.replaceState({}, "", "/ingest");
        }}
      />
    );
  }

  return (
    <UploadForm
      onResult={(r) => {
        setResult(r);
        setStep("review");
      }}
    />
  );
}
