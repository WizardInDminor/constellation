"use client";

/**
 * A markdown-aware textarea with a lightweight Write/Preview toggle.
 *
 * Note entry is markdown-first (ADR-034), so every textarea where note content
 * is written gains a small Write/Preview tab pair. "Write" is a plain textarea
 * (unchanged behavior); "Preview" renders the current value through
 * `<NoteContent>` so formatting and math can be verified inline. This is
 * deliberately not a split-pane editor — it's a fast correctness check.
 *
 * Works with controlled (`value`/`onChange`), uncontrolled (`defaultValue` +
 * `ref`), and react-hook-form (`register(...)`) usage. For react-hook-form,
 * pass the watched field value as `previewValue` so Preview reflects the
 * current input. The textarea stays mounted while previewing (hidden) so its
 * DOM value and ref remain intact.
 */

import { forwardRef, useState } from "react";
import { NoteContent } from "./NoteContent";

type Mode = "write" | "preview";

interface MarkdownTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Explicit value to render in Preview (e.g. a react-hook-form `watch`). */
  previewValue?: string;
  /** Classes for the rendered preview container. */
  previewClassName?: string;
  /** Classes for the Write/Preview tab strip wrapper. */
  toggleClassName?: string;
}

export const MarkdownTextarea = forwardRef<
  HTMLTextAreaElement,
  MarkdownTextareaProps
>(function MarkdownTextarea(
  {
    previewValue,
    previewClassName,
    toggleClassName,
    className,
    onChange,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const [mode, setMode] = useState<Mode>("write");
  // Track input for preview when no explicit `previewValue`/`value` is given
  // (i.e. uncontrolled refs). Seed from defaultValue.
  const [tracked, setTracked] = useState(
    value !== undefined
      ? String(value)
      : defaultValue !== undefined
        ? String(defaultValue)
        : "",
  );

  const previewText =
    previewValue !== undefined
      ? previewValue
      : value !== undefined
        ? String(value)
        : tracked;

  const tabBase =
    "px-2 py-0.5 text-xs rounded transition-colors focus:outline-none";
  const activeTab = "bg-indigo-100 text-indigo-700 font-medium";
  const idleTab = "text-gray-400 hover:text-gray-600";

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-1 self-end ${toggleClassName ?? ""}`}
      >
        <button
          type="button"
          onClick={() => setMode("write")}
          className={`${tabBase} ${mode === "write" ? activeTab : idleTab}`}
          aria-pressed={mode === "write"}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={`${tabBase} ${mode === "preview" ? activeTab : idleTab}`}
          aria-pressed={mode === "preview"}
        >
          Preview
        </button>
      </div>

      {/* Keep the textarea mounted (hidden while previewing) so uncontrolled
          DOM values and the forwarded ref survive the toggle. */}
      <textarea
        ref={ref}
        {...rest}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onChange={(e) => {
          if (value === undefined && previewValue === undefined) {
            setTracked(e.target.value);
          }
          onChange?.(e);
        }}
        className={`${className ?? ""} ${mode === "preview" ? "hidden" : ""}`}
      />

      {mode === "preview" &&
        (previewText.trim() ? (
          <NoteContent
            content={previewText}
            className={
              previewClassName ??
              "prose prose-sm max-w-none rounded border border-gray-200 bg-white px-3 py-2"
            }
          />
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs italic text-gray-400">
            Nothing to preview
          </div>
        ))}
    </div>
  );
});
