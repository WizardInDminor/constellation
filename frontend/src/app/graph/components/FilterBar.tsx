"use client";

import { NODE_COLORS, EDGE_COLORS } from "../colors";
import { ALL_EDGE_TYPES, ALL_NODE_TYPES, type FilterState } from "../filterGraph";

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
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-700 text-xs select-none">
      {/* Node types */}
      <div className="flex items-center gap-1">
        {ALL_NODE_TYPES.map((type) => {
          const active = state.nodeTypes.has(type);
          const color = NODE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => onChange({ ...state, nodeTypes: toggle(state.nodeTypes, type) })}
              className={`flex items-center gap-1 rounded px-2 py-0.5 border transition-opacity ${
                active ? "opacity-100" : "opacity-40"
              }`}
              style={{
                borderColor: color + "66",
                backgroundColor: active ? color + "22" : "transparent",
                color: active ? color : "#9CA3AF",
              }}
              title={`Toggle ${type} nodes`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {type}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-gray-600" />

      {/* Edge types */}
      <div className="flex items-center gap-1 flex-wrap">
        {ALL_EDGE_TYPES.map((type) => {
          const active = state.edgeTypes.has(type);
          const color = EDGE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => onChange({ ...state, edgeTypes: toggle(state.edgeTypes, type) })}
              className={`rounded px-1.5 py-0.5 border font-mono transition-opacity ${
                active ? "opacity-100" : "opacity-35"
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

      <div className="w-px h-4 bg-gray-600" />

      {/* Tag filter */}
      {allTags.length > 0 && (
        <select
          value={state.selectedTag ?? ""}
          onChange={(e) =>
            onChange({ ...state, selectedTag: e.target.value || null })
          }
          className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-0.5 text-xs"
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
      <label className="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-gray-200">
        <input
          type="checkbox"
          checked={state.hideIsolated}
          onChange={(e) => onChange({ ...state, hideIsolated: e.target.checked })}
          className="rounded border-gray-600 bg-gray-800 text-indigo-500"
        />
        Hide isolated
      </label>

      <div className="w-px h-4 bg-gray-600" />

      {/* Search */}
      <input
        type="search"
        placeholder="Highlight nodes…"
        value={state.searchQuery}
        onChange={(e) => onChange({ ...state, searchQuery: e.target.value })}
        className="bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 rounded px-2 py-0.5 text-xs w-40"
      />
    </div>
  );
}
