"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createFleetingNode } from "@/lib/api";
import { MarkdownTextarea } from "./MarkdownTextarea";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CaptureDialog({ open, onClose }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      // Defer focus so the DOM is settled after the conditional render
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = textareaRef.current?.value.trim() ?? "";
    if (!value) return;

    const newlineIdx = value.indexOf("\n");
    const title = newlineIdx === -1 ? value : value.slice(0, newlineIdx).trim();
    // If there's no second line, use the title as the content too
    const content = newlineIdx === -1 ? value : value.slice(newlineIdx + 1).trim() || value;

    await createFleetingNode(title, content);
    if (textareaRef.current) textareaRef.current.value = "";
    onClose();
    router.push("/inbox");
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-4 flex flex-col gap-3"
      >
        <p className="text-xs text-gray-400">
          First line becomes the title · Ctrl+Enter to capture · Esc to close
        </p>
        <MarkdownTextarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          placeholder="What are you thinking?"
          rows={6}
          className="w-full resize-none border border-gray-200 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Capture
          </button>
        </div>
      </form>
    </div>
  );
}
