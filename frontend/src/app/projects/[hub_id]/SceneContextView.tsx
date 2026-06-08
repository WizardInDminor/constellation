"use client";

/**
 * Scene Context View — Phase 9 Slice 5 (philosophy doc §6.8).
 *
 * THE FUNDAMENTAL CONTRACT:
 *   "The order of creation is invisible."
 *   "Never research your own work."
 *
 * Every open of this view is a LIVE query against the current graph state.
 * Nothing is cached. Soft-deleting an EXPLAINS edge between two opens MUST
 * change the result. The `useEffect` on mount calls `getSceneContext()`
 * which hits `GET /projects/{hub}/scene-context/{event}` — that endpoint
 * walks the graph fresh every call (see backend timeline_repo's
 * assemble_scene_context). There is no client cache. There is no SWR
 * mutation indirection. There is no localStorage shadow copy. Every
 * mount = one fresh DB query.
 *
 * Layout: the three-panel workspace shape (philosophy doc §6.8
 * "Workspace reconfiguration"):
 *   - Left:   scene-connected elements (characters, location, lore — by
 *             relevance)
 *   - Center: drill-down reading surface for the focused element
 *   - Right:  arc notes + parallel thread context + world rules (collapsed
 *             by default; session-aware hint)
 *
 * Ctrl+click on any node card → NodeInteractionPopup → on save, the view
 * re-queries the backend so any edge changes from inside the popup
 * surface immediately.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getNode, getSceneContext } from "@/lib/api";
import type {
  NodeDetail,
  NodeRef,
  SceneContextItem,
  SceneContextResponse,
} from "@/lib/api";
import { NodeInteractionPopup } from "@/components/NodeInteractionPopup";
import { NoteContent } from "@/components/NoteContent";

interface Props {
  hubId: string;
  eventId: string;
  onBack: () => void;
  // Optional session number for the world-rules collapse hint
  // (philosophy doc §6.8). Defaults to undefined → no hint.
  sessionNumber?: number;
}

export function SceneContextView({
  hubId,
  eventId,
  onBack,
  sessionNumber,
}: Props) {
  const [ctx, setCtx] = useState<SceneContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);
  const [worldRulesExpanded, setWorldRulesExpanded] = useState(false);

  // LIVE QUERY. Re-runs on every mount and every refresh() call. No
  // memoisation, no cache. This is the contract — see file header.
  const refresh = useCallback(async () => {
    try {
      const fresh = await getSceneContext(hubId, eventId, sessionNumber);
      setCtx(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scene context");
    }
  }, [hubId, eventId, sessionNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <div className="space-y-3 p-1">
        <div className="alert-error">{error}</div>
        <button onClick={onBack} className="btn btn-secondary btn-sm">
          ← Back to timeline
        </button>
      </div>
    );
  }
  if (!ctx) {
    return (
      <div className="space-y-3 p-1" aria-busy="true">
        <div className="skeleton h-6 w-1/3" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_280px]">
          <div className="skeleton h-48 w-full" />
          <div className="skeleton h-48 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
      </div>
    );
  }

  // Group items by role + relevance. Strong items render first.
  const characters = ctx.items.filter((i) => i.role === "character");
  const location = ctx.items.filter((i) => i.role === "location");
  const themes = ctx.items.filter((i) => i.role === "theme");
  const lore = ctx.items.filter((i) => i.role === "lore");
  const arcNotes = ctx.items.filter((i) => i.role === "arc_note");
  const worldRules = ctx.items.filter((i) => i.role === "world_rule");

  return (
    <div className="space-y-3">
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-amber-200 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-amber-700 uppercase tracking-wider font-semibold">
            <span>◈</span>
            <span>Scene Context</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 truncate mt-0.5">
            {ctx.event.title}
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {ctx.timeline && (
              <>
                <span>{ctx.timeline.title}</span>
                {ctx.discourse_position !== null && (
                  <span className="ml-1 text-gray-400">
                    · pos {ctx.discourse_position}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <button onClick={onBack} className="btn btn-secondary btn-sm shrink-0">
          ← Back to timeline
        </button>
      </div>

      {/* Three-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-3">
        {/* LEFT — scene-connected elements (relevance-weighted) */}
        <aside className="space-y-3 scrollbar-thin lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
          <ContextSection
            label="Characters"
            relevance="strong"
            items={characters}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
          <ContextSection
            label="Location"
            relevance="strong"
            items={location}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
          <ContextSection
            label="Themes"
            relevance="strong"
            items={themes}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
          <ContextSection
            label="Lore"
            relevance="moderate"
            items={lore}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
        </aside>

        {/* CENTER — drill-down reading surface */}
        <main className="card scrollbar-thin p-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
          {focusedNodeId ? (
            <FocusedNodeView
              nodeId={focusedNodeId}
              onClose={() => setFocusedNodeId(null)}
              onEdit={() => setPopupNodeId(focusedNodeId)}
            />
          ) : (
            <EmptyCenter
              event={ctx.event}
              preceding={ctx.preceding_event}
              following={ctx.following_event}
            />
          )}
        </main>

        {/* RIGHT — arc notes, parallel thread, world rules (collapsed) */}
        <aside className="space-y-3 scrollbar-thin lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
          <ContextSection
            label="Arc notes"
            relevance="strong"
            items={arcNotes}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
          <ParallelContextPanel
            preceding={ctx.preceding_event}
            following={ctx.following_event}
          />
          <WorldRulesPanel
            items={worldRules}
            collapsed={!worldRulesExpanded}
            onToggle={() => setWorldRulesExpanded((x) => !x)}
            hint={ctx.world_rules_collapsed_hint}
            onFocus={setFocusedNodeId}
            onCtrlClick={setPopupNodeId}
          />
        </aside>
      </div>

      {/* NodeInteractionPopup — Ctrl+click on any node card. On save, the
          parent re-queries (live graph assembly contract). */}
      {popupNodeId && (
        <NodeInteractionPopup
          nodeId={popupNodeId}
          onClose={() => setPopupNodeId(null)}
          onSaved={() => {
            setPopupNodeId(null);
            // Live re-query after a popup edit so any new/removed edges
            // surface immediately. NEVER read from a cache here.
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: a relevance-labeled group of node cards
// ---------------------------------------------------------------------------

function ContextSection({
  label,
  relevance,
  items,
  onFocus,
  onCtrlClick,
}: {
  label: string;
  relevance: "strong" | "moderate" | "background";
  items: SceneContextItem[];
  onFocus: (id: string) => void;
  onCtrlClick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </h3>
        <RelevancePip level={relevance} />
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <ContextCard
            key={it.node.id}
            item={it}
            onClick={() => onFocus(it.node.id)}
            onCtrlClick={() => onCtrlClick(it.node.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function RelevancePip({
  level,
}: {
  level: "strong" | "moderate" | "background";
}) {
  const map = {
    strong: { dot: "bg-amber-500", label: "strong" },
    moderate: { dot: "bg-amber-300", label: "moderate" },
    background: { dot: "bg-gray-300", label: "background" },
  } as const;
  const meta = map[level];
  return (
    <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-gray-400">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function ContextCard({
  item,
  onClick,
  onCtrlClick,
}: {
  item: SceneContextItem;
  onClick: () => void;
  onCtrlClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onCtrlClick();
          } else {
            onClick();
          }
        }}
        className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-left hover:border-amber-300 hover:bg-amber-50/40 transition"
        title="Click to drill down · Ctrl+click to edit"
      >
        <p className="text-xs font-medium text-gray-900 truncate">
          {item.node.title}
        </p>
        {item.summary && (
          <p className="text-[11px] text-gray-500 truncate mt-0.5">
            {item.summary}
          </p>
        )}
        {item.category && (
          <p className="text-[10px] text-amber-700 mt-0.5">
            {item.category.replace(/^narrative:lore-/, "").replace(/-/g, " ")}
          </p>
        )}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Center: focused node view (drill-down) + empty state
// ---------------------------------------------------------------------------

function FocusedNodeView({
  nodeId,
  onClose,
  onEdit,
}: {
  nodeId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [node, setNode] = useState<NodeDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    getNode(nodeId)
      .then((n) => {
        if (!cancelled) setNode(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  if (!node)
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="skeleton h-5 w-1/2" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{node.title}</h3>
          <p className="section-label mt-0.5">{node.type}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onEdit} className="btn btn-secondary btn-sm">
            Edit
          </button>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close focused node"
          >
            Close
          </button>
        </div>
      </div>
      {node.summary && (
        <p className="text-xs text-gray-500 italic">{node.summary}</p>
      )}
      <NoteContent
        content={node.content}
        className="prose prose-sm max-w-none text-sm"
      />
      <Link
        href={`/nodes/${node.id}`}
        className="block text-xs text-indigo-600 hover:underline"
      >
        Open full node →
      </Link>
    </div>
  );
}

function EmptyCenter({
  event,
  preceding,
  following,
}: {
  event: NodeRef;
  preceding: NodeRef | null | undefined;
  following: NodeRef | null | undefined;
}) {
  return (
    <div className="space-y-3 text-center text-xs text-gray-500">
      <p className="text-sm text-gray-700 font-medium">{event.title}</p>
      <p className="italic">
        Click any element on the left or right to drill down. Ctrl+click to edit
        inline.
      </p>
      {(preceding || following) && (
        <div className="text-[11px] text-gray-400 pt-3 border-t border-gray-100">
          {preceding && (
            <p>
              Preceding:{" "}
              <span className="text-gray-700">{preceding.title}</span>
            </p>
          )}
          {following && (
            <p>
              Following:{" "}
              <span className="text-gray-700">{following.title}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right: parallel context + world rules
// ---------------------------------------------------------------------------

function ParallelContextPanel({
  preceding,
  following,
}: {
  preceding: NodeRef | null | undefined;
  following: NodeRef | null | undefined;
}) {
  if (!preceding && !following) return null;
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        Parallel context
      </h3>
      <div className="rounded border border-gray-200 bg-white px-2 py-1.5 space-y-1 text-[11px]">
        {preceding && (
          <p>
            <span className="text-gray-400">←</span>{" "}
            <span className="text-gray-700">{preceding.title}</span>
          </p>
        )}
        {following && (
          <p>
            <span className="text-gray-400">→</span>{" "}
            <span className="text-gray-700">{following.title}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function WorldRulesPanel({
  items,
  collapsed,
  onToggle,
  hint,
  onFocus,
  onCtrlClick,
}: {
  items: SceneContextItem[];
  collapsed: boolean;
  onToggle: () => void;
  hint: string | null | undefined;
  onFocus: (id: string) => void;
  onCtrlClick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
      >
        <span>World rules ({items.length})</span>
        <RelevancePip level="background" />
      </button>
      {collapsed && hint && (
        <p className="text-[10px] text-amber-700 italic mb-1">{hint}</p>
      )}
      {!collapsed && (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <ContextCard
              key={it.node.id}
              item={it}
              onClick={() => onFocus(it.node.id)}
              onCtrlClick={() => onCtrlClick(it.node.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
