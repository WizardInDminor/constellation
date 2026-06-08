"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import {
  getNode,
  suggestPermanent,
  createPermanentNode,
  markNodeProcessed,
} from "@/lib/api";
import type { NodeDetail } from "@/lib/api";
import Link from "next/link";

type CandidateField = {
  title: string;
  content: string;
  summary: string;
  accepted: boolean;
};

type FormValues = {
  candidates: CandidateField[];
};

function draftKey(nodeId: string) {
  return `constellation:process-draft:${nodeId}`;
}

function saveDraft(nodeId: string, candidates: CandidateField[]) {
  try {
    sessionStorage.setItem(draftKey(nodeId), JSON.stringify(candidates));
  } catch {
    // sessionStorage unavailable — silent fallback
  }
}

function loadDraft(nodeId: string): CandidateField[] | null {
  try {
    const raw = sessionStorage.getItem(draftKey(nodeId));
    return raw ? (JSON.parse(raw) as CandidateField[]) : null;
  } catch {
    return null;
  }
}

function clearDraft(nodeId: string) {
  try {
    sessionStorage.removeItem(draftKey(nodeId));
  } catch {
    // ignore
  }
}

export default function ProcessPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const nodeId = params.id;

  const [fleeting, setFleeting] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);

  const { register, control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: { candidates: [] },
  });
  const { fields, replace } = useFieldArray({ control, name: "candidates" });
  const watchedCandidates = watch("candidates");
  const acceptedCount = watchedCandidates.filter((c) => c.accepted).length;

  // Persist draft whenever candidates change
  useEffect(() => {
    if (watchedCandidates.length > 0) {
      saveDraft(nodeId, watchedCandidates);
    }
  }, [nodeId, watchedCandidates]);

  async function regenerate() {
    clearDraft(nodeId);
    setLoading(true);
    setError(null);
    try {
      const suggestions = await suggestPermanent(nodeId);
      replace(
        suggestions.candidates.map((c) => ({
          title: c.title,
          content: c.content,
          summary: c.summary ?? "",
          accepted: true,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const draft = loadDraft(nodeId);
        if (draft) {
          const node = await getNode(nodeId);
          setFleeting(node);
          replace(draft);
        } else {
          const [node, suggestions] = await Promise.all([
            getNode(nodeId),
            suggestPermanent(nodeId),
          ]);
          setFleeting(node);
          replace(
            suggestions.candidates.map((c) => ({
              title: c.title,
              content: c.content,
              summary: c.summary ?? "",
              accepted: true,
            })),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [nodeId, replace]);

  async function onSubmit(values: FormValues) {
    const accepted = values.candidates.filter((c) => c.accepted);
    if (accepted.length === 0) {
      setConfirmZero(true);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        accepted.map((c) =>
          createPermanentNode({
            title: c.title,
            content: c.content,
            summary: c.summary || undefined,
          }),
        ),
      );
      await markNodeProcessed(nodeId);
      clearDraft(nodeId);
      router.push("/inbox");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  async function confirmMarkProcessed() {
    setSaving(true);
    try {
      await markNodeProcessed(nodeId);
      clearDraft(nodeId);
      router.push("/inbox");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="section-label">Fetching AI suggestions…</div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="card flex flex-col gap-3 p-4">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
          </div>
          <div className="card flex flex-col gap-3 p-4">
            <div className="skeleton h-3 w-40" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <div className="alert-error">{error}</div>
        <Link
          href="/inbox"
          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          ← Back to inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inbox" className="btn btn-ghost btn-sm">
          ← Inbox
        </Link>
        <h1 className="page-title">Process note</h1>
        <button
          type="button"
          onClick={regenerate}
          className="btn btn-secondary btn-sm ml-auto"
        >
          Re-generate
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Fleeting note */}
        <div className="card flex flex-col gap-2 p-4">
          <span className="badge bg-amber-100 text-amber-700">Fleeting</span>
          <h2 className="font-semibold text-gray-900">{fleeting?.title}</h2>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-600">
            {fleeting?.content}
          </p>
        </div>

        {/* Candidate cards */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <span className="section-label text-indigo-600">
            AI suggestions — accept, edit, or discard
          </span>

          {fields.map((field, index) => {
            const isAccepted = watchedCandidates[index]?.accepted ?? true;
            return (
              <div
                key={field.id}
                className={`card flex flex-col gap-3 p-4 transition-opacity ${
                  isAccepted ? "border-indigo-200" : "bg-gray-50 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="section-label">Note {index + 1}</span>
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-gray-600">
                    <input
                      type="checkbox"
                      {...register(`candidates.${index}.accepted`)}
                      className="accent-indigo-600"
                    />
                    Accept
                  </label>
                </div>
                <div>
                  <label htmlFor={`candidate-${index}-title`} className="label">
                    Title
                  </label>
                  <input
                    id={`candidate-${index}-title`}
                    {...register(`candidates.${index}.title`)}
                    disabled={!isAccepted}
                    placeholder="Title"
                    className="input font-medium"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`candidate-${index}-content`}
                    className="label"
                  >
                    Content
                  </label>
                  <textarea
                    id={`candidate-${index}-content`}
                    {...register(`candidates.${index}.content`)}
                    disabled={!isAccepted}
                    rows={4}
                    placeholder="Content"
                    className="textarea"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`candidate-${index}-summary`}
                    className="label"
                  >
                    Summary
                  </label>
                  <input
                    id={`candidate-${index}-summary`}
                    {...register(`candidates.${index}.summary`)}
                    disabled={!isAccepted}
                    placeholder="One-sentence summary (optional)"
                    className="input"
                  />
                  <p className="field-hint">
                    Optional. A short gloss for the note.
                  </p>
                </div>
              </div>
            );
          })}

          {confirmZero ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Mark as processed without saving any notes?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmMarkProcessed}
                  disabled={saving}
                  className="btn btn-sm bg-amber-600 text-white shadow-sm hover:bg-amber-700 active:bg-amber-800"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmZero(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary self-end"
            >
              {saving
                ? "Saving…"
                : acceptedCount > 0
                  ? `Save ${acceptedCount} note${acceptedCount !== 1 ? "s" : ""}`
                  : "Mark as processed"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
