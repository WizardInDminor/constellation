"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStructureNode } from "@/lib/api";
import Link from "next/link";

export default function NewStructurePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const node = await createStructureNode({
        title: title.trim(),
        content: content.trim(),
      });
      router.push(`/nodes/${node.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/" className="btn btn-ghost btn-sm">
          ← Home
        </Link>
        <h2 className="page-title">New structure note</h2>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-6">
        <div>
          <label htmlFor="structure-title" className="label">
            Title
          </label>
          <input
            id="structure-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Map of content title"
            required
            className="input font-medium"
          />
        </div>

        <div>
          <label htmlFor="structure-content" className="label">
            Content
          </label>
          <textarea
            id="structure-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Curated overview of this domain…"
            rows={10}
            className="textarea"
          />
          <p className="field-hint">
            A structure note curates and links related notes into a map of
            content. Markdown is supported.
          </p>
        </div>

        {error && <p className="alert-error">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="btn btn-primary"
          >
            {saving ? "Creating…" : "Create structure note"}
          </button>
        </div>
      </form>
    </div>
  );
}
