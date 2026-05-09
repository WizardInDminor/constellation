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
      <div className="flex flex-col gap-3">
        <div className="text-sm text-gray-500">Fetching AI suggestions…</div>
        <div className="h-1 w-full bg-gray-100 rounded overflow-hidden">
          <div className="h-full bg-indigo-400 animate-pulse w-1/2" />
        </div>
      </div>
    );
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/inbox" className="text-sm text-gray-400 hover:text-gray-700">
          ← Inbox
        </Link>
        <h2 className="text-lg font-semibold">Process note</h2>
        <button
          type="button"
          onClick={regenerate}
          className="ml-auto text-xs text-gray-400 hover:text-indigo-600"
        >
          Re-generate
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fleeting note */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">
            Fleeting
          </span>
          <h3 className="font-semibold">{fleeting?.title}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{fleeting?.content}</p>
        </div>

        {/* Candidate cards */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <span className="text-xs font-medium text-indigo-600 uppercase tracking-wide">
            AI suggestions — accept, edit, or discard
          </span>

          {fields.map((field, index) => {
            const isAccepted = watchedCandidates[index]?.accepted ?? true;
            return (
              <div
                key={field.id}
                className={`border rounded-lg p-4 flex flex-col gap-3 transition-opacity ${
                  isAccepted ? "border-indigo-200 bg-white" : "border-gray-100 bg-gray-50 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Note {index + 1}</span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register(`candidates.${index}.accepted`)}
                      className="accent-indigo-600"
                    />
                    Accept
                  </label>
                </div>
                <input
                  {...register(`candidates.${index}.title`)}
                  disabled={!isAccepted}
                  placeholder="Title"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-transparent disabled:border-transparent"
                />
                <textarea
                  {...register(`candidates.${index}.content`)}
                  disabled={!isAccepted}
                  rows={4}
                  placeholder="Content"
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-transparent disabled:border-transparent"
                />
                <input
                  {...register(`candidates.${index}.summary`)}
                  disabled={!isAccepted}
                  placeholder="One-sentence summary (optional)"
                  className="w-full border border-gray-100 rounded px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:bg-transparent disabled:border-transparent"
                />
              </div>
            );
          })}

          {confirmZero ? (
            <div className="flex flex-col gap-2 border border-amber-200 bg-amber-50 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                Mark as processed without saving any notes?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmMarkProcessed}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmZero(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 self-end"
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
