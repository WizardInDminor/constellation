"use client";

import { NODE_COLORS, EDGE_COLORS } from "../colors";
import {
  ALL_EDGE_TYPES,
  ALL_NODE_TYPES,
  type FilterState,
} from "../filterGraph";

interface Props {
  state: FilterState;
  allTags: string[];
  onChange: (next: FilterState) => void;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

export function FilterBar({ state, allTags, onChange }: Props) {
  return (
    <div className="flex select-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-700 bg-gray-900 px-4 py-2 text-xs">
      {/* Node types */}
      <div className="flex flex-wrap items-center gap-1">
        {ALL_NODE_TYPES.map((type) => {
          const active = state.nodeTypes.has(type);
          const color = NODE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() =>
                onChange({ ...state, nodeTypes: toggle(state.nodeTypes, type) })
              }
              aria-pressed={active}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-medium transition-opacity ${
                active ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`}
              style={{
                borderColor: color + "66",
                backgroundColor: active ? color + "22" : "transparent",
                color: active ? color : "#9CA3AF",
              }}
              title={`Toggle ${type} nodes`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {type}
            </button>
          );
        })}
      </div>

      <div className="h-4 w-px bg-gray-600" />

      {/* Edge types */}
      <div className="flex flex-wrap items-center gap-1">
        {ALL_EDGE_TYPES.map((type) => {
          const active = state.edgeTypes.has(type);
          const color = EDGE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() =>
                onChange({ ...state, edgeTypes: toggle(state.edgeTypes, type) })
              }
              aria-pressed={active}
              className={`rounded border px-1.5 py-0.5 font-mono transition-opacity ${
                active ? "opacity-100" : "opacity-35 hover:opacity-60"
              }`}
              style={{
                borderColor: color + "55",
                backgroundColor: active ? color + "1a" : "transparent",
                color: active ? color : "#6B7280",
              }}
              title={`Toggle ${type} edges`}
            >
              {type}
            </button>
          );
        })}
      </div>

      <div className="h-4 w-px bg-gray-600" />

      {/* Tag filter */}
      {allTags.length > 0 && (
        <select
          value={state.selectedTag ?? ""}
          onChange={(e) =>
            onChange({ ...state, selectedTag: e.target.value || null })
          }
          aria-label="Filter by tag"
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}

      {/* Hide isolated */}
      <label className="flex cursor-pointer items-center gap-1.5 text-gray-400 transition-colors hover:text-gray-200">
        <input
          type="checkbox"
          checked={state.hideIsolated}
          onChange={(e) =>
            onChange({ ...state, hideIsolated: e.target.checked })
          }
          className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
        />
        Hide isolated
      </label>

      <div className="h-4 w-px bg-gray-600" />

      {/* Search */}
      <input
        type="search"
        placeholder="Highlight nodes…"
        value={state.searchQuery}
        onChange={(e) => onChange({ ...state, searchQuery: e.target.value })}
        aria-label="Highlight nodes by title"
        className="w-40 rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* Focus chip (driven by ?ids= URL param) */}
      {state.focusIds && state.focusIds.size > 0 && (
        <div className="ml-auto flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-0.5 text-indigo-200">
          <span>
            Focused on {state.focusIds.size} node
            {state.focusIds.size === 1 ? "" : "s"} + neighbors
          </span>
          <button
            onClick={() => onChange({ ...state, focusIds: null })}
            className="leading-none text-indigo-200 transition-colors hover:text-white"
            aria-label="Clear focus"
            title="Clear focus"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
