"use client";

import { useRef, useState } from "react";
import { searchNodes } from "@/lib/api";
import type { NodeRef, NodeSummary } from "@/lib/api";
import { NotePreviewPopover } from "./NotePreviewPopover";

const TYPE_COLORS: Record<string, string> = {
  fleeting: "bg-amber-100 text-amber-700",
  permanent: "bg-green-100 text-green-700",
  literature: "bg-blue-100 text-blue-700",
  structure: "bg-purple-100 text-purple-700",
};

interface NodePickerProps {
  onSelect: (node: NodeRef) => void;
  exclude?: string | string[];
  placeholder?: string;
  /** When true, hovering a result mounts NotePreviewPopover for that row. */
  previewOnHover?: boolean;
}

const HOVER_DELAY_MS = 300;

function NodePickerRow({
  node,
  onSelect,
  previewOnHover,
}: {
  node: NodeRef;
  onSelect: (node: NodeRef) => void;
  previewOnHover: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleShow() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS);
  }
  function cancelAndHide() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setHovered(false);
  }

  // NotePreviewPopover wants a NodeSummary; search returns NodeRef. The popover
  // fetches NodeDetail on hover, so the missing fields below are unused.
  const now = new Date().toISOString();
  const summary: NodeSummary = {
    id: node.id,
    title: node.title,
    type: node.type,
    summary: null,
    created_at: now,
    updated_at: now,
    processed_at: null,
    tags: [],
  };

  return (
    <li>
      <button
        ref={ref}
        onClick={() => onSelect(node)}
        onMouseEnter={previewOnHover ? scheduleShow : undefined}
        onMouseLeave={previewOnHover ? cancelAndHide : undefined}
        onFocus={previewOnHover ? scheduleShow : undefined}
        onBlur={previewOnHover ? cancelAndHide : undefined}
        className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
      >
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {node.type}
        </span>
        <span className="truncate">{node.title}</span>
      </button>
      {previewOnHover && (
        <NotePreviewPopover node={summary} anchorRef={ref} visible={hovered} />
      )}
    </li>
  );
}

export function NodePicker({
  onSelect,
  exclude,
  placeholder = "Search for a note…",
  previewOnHover = false,
}: NodePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NodeRef[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeIds = new Set(
    exclude === undefined ? [] : Array.isArray(exclude) ? exclude : [exclude],
  );

  function handleChange(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const res = await searchNodes(v);
      setResults(res.filter((n) => !excludeIds.has(n.id)));
      setOpen(true);
    }, 250);
  }

  function select(node: NodeRef) {
    setQuery(node.title);
    setResults([]);
    setOpen(false);
    onSelect(node);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      {query && (
        <button
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
        >
          ×
        </button>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow text-sm max-h-48 overflow-y-auto">
          {results.map((n) => (
            <NodePickerRow
              key={n.id}
              node={n}
              onSelect={select}
              previewOnHover={previewOnHover}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
