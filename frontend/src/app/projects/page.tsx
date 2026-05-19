"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createProject,
  listProjects,
  listNodes,
} from "@/lib/api";
import type {
  NodeSummary,
  ProjectMode,
  ProjectSummary,
} from "@/lib/api";

const MODE_BADGE: Record<ProjectMode, string> = {
  research: "bg-blue-100 text-blue-800 border-blue-200",
  narrative: "bg-amber-100 text-amber-800 border-amber-200",
  learning: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const MODE_OPTIONS: { value: ProjectMode; label: string; hint: string }[] = [
  { value: "research", label: "Research", hint: "Reading, synthesis, literature notes" },
  { value: "narrative", label: "Narrative", hint: "Story, characters, timeline" },
  { value: "learning", label: "Learning", hint: "Curriculum, sources, checks" },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "never visited";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "promote" | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function refresh() {
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Workspace-aware structure notes. Each project carries its own scope,
            session history, and briefing prompt.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDialog("promote")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Promote existing
          </button>
          <button
            onClick={() => setDialog("new")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New project
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {projects === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center text-gray-500">
          <p className="text-sm">No projects yet.</p>
          <p className="text-xs mt-1 text-gray-400">
            Create one with “New project,” or promote an existing structure note.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.hub.id}>
              <Link
                href={`/projects/${p.hub.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">
                    {p.hub.title}
                  </h2>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${MODE_BADGE[p.mode]}`}
                  >
                    {p.mode}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <span>{p.note_count} pinned</span>
                  <span>·</span>
                  <span>{formatRelative(p.last_visited_at ?? null)}</span>
                  {p.has_active_session && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active session
                      </span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dialog === "new" && (
        <NewProjectDialog
          onClose={() => setDialog(null)}
          onCreated={(hubId) => router.push(`/projects/${hubId}`)}
        />
      )}
      {dialog === "promote" && (
        <PromoteDialog
          onClose={() => setDialog(null)}
          onPromoted={async (hubId) => {
            await refresh();
            router.push(`/projects/${hubId}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New project dialog — creates a fresh structure note + promotes
// ---------------------------------------------------------------------------

function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (hubId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<ProjectMode>("research");
  const [priorKnowledge, setPriorKnowledge] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createProject({
        title: title.trim(),
        content: content.trim(),
        mode,
        prior_knowledge: priorKnowledge.trim() || null,
      });
      onCreated(result.hub.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <DialogShell onClose={onClose} title="New project">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fire Stoker, Eurorack, Motor encoders"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Hub note content (optional)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Overview, goals, anything you'd put in a project README."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
        <ModeSelect mode={mode} setMode={setMode} />
        {mode === "learning" && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Prior knowledge (optional)
            </label>
            <p className="text-[10px] text-gray-400 mb-1.5">
              What you already know about this topic. Surfaces as the
              Session 1 quick-corrections panel and primes the learning-map
              generator.
            </p>
            <textarea
              value={priorKnowledge}
              onChange={(e) => setPriorKnowledge(e.target.value)}
              rows={3}
              placeholder="e.g. I know basic embedded C. I've used SPI but never quadrature decoding."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        )}
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Promote dialog — pick an existing structure note + promote
// ---------------------------------------------------------------------------

function PromoteDialog({
  onClose,
  onPromoted,
}: {
  onClose: () => void;
  onPromoted: (hubId: string) => void;
}) {
  const [candidates, setCandidates] = useState<NodeSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<ProjectMode>("research");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listNodes("structure", 1, 100)
      .then((p) => setCandidates(p.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createProject({
        hub_node_id: selected,
        content: "",
        mode,
      });
      onPromoted(result.hub.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promote failed");
      setSaving(false);
    }
  }

  return (
    <DialogShell onClose={onClose} title="Promote a structure note">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500">
          Pick any existing structure note to make it a project hub. Its scope
          starts empty; you can pin notes and tags after opening.
        </p>
        <div className="max-h-64 overflow-y-auto rounded border border-gray-200 divide-y divide-gray-100">
          {candidates === null ? (
            <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              No structure notes yet. Create one from the Notes view, or use
              “New project.”
            </p>
          ) : (
            candidates.map((n) => (
              <label
                key={n.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${
                  selected === n.id ? "bg-indigo-50" : ""
                }`}
              >
                <input
                  type="radio"
                  name="hub"
                  value={n.id}
                  checked={selected === n.id}
                  onChange={() => setSelected(n.id)}
                />
                <span className="truncate">{n.title}</span>
              </label>
            ))
          )}
        </div>
        <ModeSelect mode={mode} setMode={setMode} />
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !selected}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Promoting…" : "Promote"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Shared dialog shell + mode selector
// ---------------------------------------------------------------------------

function DialogShell({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModeSelect({
  mode,
  setMode,
}: {
  mode: ProjectMode;
  setMode: (m: ProjectMode) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        Default mode
      </label>
      <p className="text-[11px] text-gray-400 mb-2">
        Mode chooses which panels are prominent on first open. Every feature is
        available in every mode.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {MODE_OPTIONS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded border px-2 py-1.5 text-xs text-left ${
              mode === m.value
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
            title={m.hint}
          >
            <div className="font-medium">{m.label}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">
              {m.hint}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
