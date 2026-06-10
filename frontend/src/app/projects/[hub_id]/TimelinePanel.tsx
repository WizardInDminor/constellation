"use client";

/**
 * Narrative timeline canvas — Phase 9 Slices 4 & 5 (ADR-066).
 *
 * Slice 4: custom SVG, single lane, click-to-create, drag-to-reorder,
 * FOLLOWS_FROM auto-edges. Slice 5: parallel swim lanes, lane toggle,
 * "Add timeline", crossover indicator, character highlight filter,
 * theme-density dots, NodeInteractionPopup on cards, "Open in Scene
 * Context" enabled, prose_status / manuscript_location PATCH support.
 *
 * Live query (ADR-066 / philosophy doc §6.8): re-fetches on mount and
 * after every mutation. No cached timeline state at any layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createActSpan,
  createStoryEvent,
  createTimeline,
  getTimeline,
  placeOnTimeline,
  updateTimelinePosition,
  updateNode,
} from "@/lib/api";
import type {
  ActSpan,
  ActSpanCreate,
  NodeDetail,
  ProjectScope,
  ProseStatus,
  TimelineEvent,
  TimelineLane,
  TimelineResponse,
} from "@/lib/api";
import {
  NodeInteractionPopup,
  useNodeInteraction,
} from "@/components/NodeInteractionPopup";
import { SceneContextView } from "./SceneContextView";
import {
  type PositionRange,
  X_PADDING,
  canvasWidth,
  clampZoomIndex,
  sharedPositionRange,
  zoomScale,
  ZOOM_LEVELS,
  DEFAULT_ZOOM_INDEX,
} from "./timelineLayout";
import {
  type TimelineFilter,
  eventDimmed,
  hasActiveEventFilter,
  visibleLanes as filterVisibleLanes,
} from "./filterTimeline";

interface Props {
  scope: ProjectScope;
}

// SVG geometry constants. The canvas is logical — `discourse_position` units
// map to SVG x-coordinates via the active zoom scale (see ./timelineLayout).
// X_PADDING and the scale live in timelineLayout so all lanes share one axis.
const LANE_HEIGHT = 140;
const EVENT_CARD_WIDTH = 160;
const EVENT_CARD_HEIGHT = 70;
const ACT_BAND_HEIGHT = 22;
const ACT_BAND_Y = 4;

// Default discourse_position step when appending a new event to the lane.
const POSITION_STEP = 100;

const PROSE_STATUS_COLORS: Record<ProseStatus, { dot: string; label: string }> =
  {
    planned: { dot: "bg-gray-300", label: "Planned" },
    draft: { dot: "bg-amber-400", label: "Draft" },
    written: { dot: "bg-emerald-500", label: "Written" },
    revised: { dot: "bg-blue-500", label: "Revised" },
  };

// Slice 5: registered lane info — each lane reports its SVG ref + a
// position converter to the parent so cross-lane drag can hit-test the
// cursor against any lane's bounding rect and translate clientX to that
// lane's discourse_position axis.
interface LaneRegistration {
  svg: SVGSVGElement;
  xToPosition: (clientX: number) => number;
}

// Slice 5: cross-lane drag state lives on the parent (TimelinePanel)
// because only the parent sees all lanes. Each lane just contributes
// its registration via the ref store; the parent owns pointermove /
// pointerup and dispatches to the right backend endpoint.
interface DragState {
  eventId: string;
  sourceLaneId: string;
  sourcePosition: number;
  // Current cursor target — updated by the parent's window pointermove.
  targetLaneId: string;
  targetPosition: number;
  // Held-modifier reflects user intent at drop time. Recomputed on every
  // pointermove so the visual indicator stays in sync.
  altHeld: boolean;
}

export function TimelinePanel({ scope }: Props) {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState<{
    laneId: string;
    discoursePosition: number;
  } | null>(null);
  const [actDialog, setActDialog] = useState<string | null>(null); // laneId
  const [newTimelineOpen, setNewTimelineOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slice 5: per-lane visibility (lane toggle panel)
  const [hiddenLanes, setHiddenLanes] = useState<Set<string>>(new Set());
  // Slice 5: character highlight filter. When set, events with this
  // character in their `character_ids` render at full opacity; others
  // dim. NOT a hide — philosophy doc §6.8 / build plan: highlight.
  const [highlightedCharacterId, setHighlightedCharacterId] = useState<
    string | null
  >(null);
  // Slice 5: Scene Context View entry. Opened from the side panel's
  // "Open in Scene Context" button. Replaces the timeline view temporarily.
  const [sceneContextEventId, setSceneContextEventId] = useState<string | null>(
    null,
  );
  // Canon audit pass: full-screen mode, zoom level, and the broadened filter
  // set (prose-status chips + free-text search) layered on top of the
  // existing lane-toggle + character-highlight filters.
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [proseStatuses, setProseStatuses] = useState<Set<ProseStatus>>(
    new Set(),
  );
  const [query, setQuery] = useState("");

  // Slice 5: cross-lane drag. Lifted from TimelineLaneCanvas (where it
  // lived for Slice 4's intra-lane-only drag) — the parent sees all
  // lanes, so it is the only level that can hit-test across them.
  const [drag, setDrag] = useState<DragState | null>(null);
  // Stable registry of lane SVGs. Each lane calls `registerLane` on
  // mount and `unregisterLane` on unmount; the parent's pointermove
  // walks this map to find which lane the cursor is over.
  const laneRegistry = useRef<Map<string, LaneRegistration>>(new Map());

  const registerLane = useCallback((laneId: string, reg: LaneRegistration) => {
    laneRegistry.current.set(laneId, reg);
  }, []);
  const unregisterLane = useCallback((laneId: string) => {
    laneRegistry.current.delete(laneId);
  }, []);

  const startDrag = useCallback(
    (eventId: string, sourceLaneId: string, sourcePosition: number) => {
      setDrag({
        eventId,
        sourceLaneId,
        sourcePosition,
        targetLaneId: sourceLaneId,
        targetPosition: sourcePosition,
        altHeld: false,
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      setTimeline(await getTimeline(scope.hub_node_id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    }
  }, [scope.hub_node_id]);

  // Slice 5: window-level pointermove/pointerup once a drag is active.
  // Hit-tests the cursor against every registered lane's rect; whichever
  // lane contains the cursor becomes the target lane and the target
  // position is computed in that lane's coordinate space. On pointerup,
  // dispatches to the right backend endpoint.
  useEffect(() => {
    if (!drag) return;

    function onPointerMove(ev: PointerEvent) {
      // Walk registered lanes; first one whose rect contains the cursor wins.
      let hitLaneId: string | null = null;
      let hitPosition: number | null = null;
      for (const [laneId, reg] of laneRegistry.current.entries()) {
        const rect = reg.svg.getBoundingClientRect();
        if (
          ev.clientX >= rect.left &&
          ev.clientX <= rect.right &&
          ev.clientY >= rect.top &&
          ev.clientY <= rect.bottom
        ) {
          hitLaneId = laneId;
          hitPosition = reg.xToPosition(ev.clientX);
          break;
        }
      }
      setDrag((d) => {
        if (!d) return null;
        // Outside all lanes — keep last known target, just update altHeld.
        if (hitLaneId === null || hitPosition === null) {
          return { ...d, altHeld: ev.altKey };
        }
        return {
          ...d,
          targetLaneId: hitLaneId,
          targetPosition: Math.max(0, hitPosition),
          altHeld: ev.altKey,
        };
      });
    }

    async function onPointerUp(ev: PointerEvent) {
      const final = drag;
      setDrag(null);
      if (!final) return;
      const altCopy = ev.altKey;
      try {
        if (final.targetLaneId === final.sourceLaneId) {
          // Same lane → existing reorder path (PATCH timeline-position).
          await updateTimelinePosition(final.eventId, {
            timeline_node_id: final.sourceLaneId,
            discourse_position: final.targetPosition,
          });
        } else {
          // Cross-lane: Alt held = crossover (keep source), default = move.
          await placeOnTimeline(final.eventId, {
            timeline_node_id: final.targetLaneId,
            discourse_position: final.targetPosition,
            remove_from_timeline_node_id: altCopy ? null : final.sourceLaneId,
          });
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Drag drop failed");
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Esc exits full-screen mode.
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (error) {
    return <div className="alert-error">{error}</div>;
  }
  if (timeline === null) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton h-6 w-1/3" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }
  if (timeline.lanes.length === 0) {
    // Shouldn't happen — backend lazy-creates a default lane. Defensive.
    return (
      <div className="empty-state">
        <p className="text-sm font-medium text-gray-700">No timelines yet</p>
        <p className="text-xs text-gray-500">
          The backend should have created one automatically — try refreshing the
          page.
        </p>
      </div>
    );
  }

  const selectedEvent = timeline.lanes
    .flatMap((l) => l.events)
    .find((e) => e.node.id === selectedEventId);
  const selectedLane = selectedEvent
    ? timeline.lanes.find((l) =>
        l.events.some((e) => e.node.id === selectedEventId),
      )
    : null;

  // Scene Context View takes over the entire surface when entered.
  if (sceneContextEventId !== null) {
    return (
      <SceneContextView
        hubId={scope.hub_node_id}
        eventId={sceneContextEventId}
        onBack={() => setSceneContextEventId(null)}
      />
    );
  }

  // One TimelineFilter object feeds the pure helpers (./filterTimeline).
  const filter: TimelineFilter = {
    hiddenLaneIds: hiddenLanes,
    highlightedCharacterId,
    proseStatuses,
    query,
  };
  const shownLanes = filterVisibleLanes(timeline.lanes, filter);
  // Shared axis: every visible lane uses the SAME position range + zoom scale
  // so parallel timelines line up and scroll together (Canon audit fix).
  const range = sharedPositionRange(shownLanes);
  const scale = zoomScale(zoomIndex);

  const toggleProseStatus = (s: ProseStatus) =>
    setProseStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const body = (
    <div className={fullscreen ? "space-y-3 p-4" : "space-y-3"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-label">Narrative timeline</h2>
          <p className="text-xs text-gray-500 mt-1">
            Click empty canvas to add an event. Drag a card to reorder. Click a
            card for details. Ctrl+click for quick-edit.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Zoom controls — shared scale across all lanes. */}
          <div className="flex items-center rounded-md border border-gray-200">
            <button
              onClick={() => setZoomIndex((i) => clampZoomIndex(i - 1))}
              disabled={zoomIndex === 0}
              className="btn btn-ghost btn-sm rounded-r-none disabled:opacity-30"
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
              className="px-2 text-[11px] font-mono text-gray-500 tabular-nums hover:text-gray-700"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setZoomIndex((i) => clampZoomIndex(i + 1))}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              className="btn btn-ghost btn-sm rounded-l-none disabled:opacity-30"
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="btn btn-secondary btn-sm"
            title={
              fullscreen ? "Exit full screen (Esc)" : "Full-screen timeline"
            }
            aria-pressed={fullscreen}
          >
            {fullscreen ? "Exit full screen" : "⤢ Full screen"}
          </button>
          <button
            onClick={() => setNewTimelineOpen(true)}
            className="btn btn-secondary btn-sm"
            title="Create a parallel timeline (a layer: external plot, dreams, history…)"
          >
            + Timeline
          </button>
          <button
            onClick={() => setActDialog(timeline.lanes[0].timeline.id)}
            className="btn btn-secondary btn-sm"
          >
            + Act span
          </button>
        </div>
      </div>

      {/* Lane toggle + character highlight (Slice 5) */}
      {(timeline.lanes.length > 1 || highlightedCharacterId) && (
        <LaneToggle
          lanes={timeline.lanes}
          hidden={hiddenLanes}
          onToggle={(id) =>
            setHiddenLanes((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          highlightedCharacterId={highlightedCharacterId}
          onClearHighlight={() => setHighlightedCharacterId(null)}
        />
      )}

      {/* Canon audit: prose-status + free-text filters (dim, don't hide). */}
      <TimelineFilterBar
        query={query}
        onQuery={setQuery}
        proseStatuses={proseStatuses}
        onToggleProseStatus={toggleProseStatus}
        active={hasActiveEventFilter(filter)}
        onClear={() => {
          setQuery("");
          setProseStatuses(new Set());
          setHighlightedCharacterId(null);
        }}
      />

      {/* Single horizontal scroll container so all lanes scroll together and
          stay aligned on the shared axis. */}
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
        {shownLanes.map((lane) => (
          <TimelineLaneCanvas
            key={lane.timeline.id}
            lane={lane}
            range={range}
            scale={scale}
            filter={filter}
            onSelectEvent={setSelectedEventId}
            onRequestCreate={(pos) =>
              setCreateDialog({
                laneId: lane.timeline.id,
                discoursePosition: pos,
              })
            }
            onEventEdited={refresh}
            drag={drag}
            onStartDrag={startDrag}
            onRegisterLane={registerLane}
            onUnregisterLane={unregisterLane}
          />
        ))}
      </div>

      {selectedEvent && selectedLane && (
        <EventSidePanel
          event={selectedEvent}
          lane={selectedLane}
          onClose={() => setSelectedEventId(null)}
          onUpdated={refresh}
          onHighlightCharacter={(id) => {
            setHighlightedCharacterId(id);
            setSelectedEventId(null);
          }}
          onOpenSceneContext={() => {
            setSceneContextEventId(selectedEvent.node.id);
            setSelectedEventId(null);
          }}
        />
      )}

      {createDialog && (
        <CreateEventDialog
          laneId={createDialog.laneId}
          discoursePosition={createDialog.discoursePosition}
          onClose={() => setCreateDialog(null)}
          onCreated={async () => {
            setCreateDialog(null);
            await refresh();
          }}
        />
      )}

      {actDialog && (
        <CreateActSpanDialog
          hubId={scope.hub_node_id}
          laneId={actDialog}
          onClose={() => setActDialog(null)}
          onCreated={async () => {
            setActDialog(null);
            await refresh();
          }}
        />
      )}

      {newTimelineOpen && (
        <NewTimelineDialog
          hubId={scope.hub_node_id}
          onClose={() => setNewTimelineOpen(false)}
          onCreated={async () => {
            setNewTimelineOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );

  // Full-screen mode lifts the timeline out of the cramped center column into
  // a viewport-filling overlay — essential once a story world has hundreds of
  // events across several parallel layers (Canon audit, ADR-076).
  if (fullscreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Timeline (full screen)"
        className="scrollbar-thin fixed inset-0 z-40 overflow-y-auto bg-white"
      >
        {body}
      </div>
    );
  }
  return body;
}

// ---------------------------------------------------------------------------
// Timeline filter bar — prose-status chips + free-text search (Canon audit)
// ---------------------------------------------------------------------------

function TimelineFilterBar({
  query,
  onQuery,
  proseStatuses,
  onToggleProseStatus,
  active,
  onClear,
}: {
  query: string;
  onQuery: (q: string) => void;
  proseStatuses: Set<ProseStatus>;
  onToggleProseStatus: (s: ProseStatus) => void;
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find scenes by title or story-time…"
        aria-label="Filter timeline events"
        className="input py-1 text-xs w-56"
      />
      <span className="section-label">Status</span>
      {(Object.keys(PROSE_STATUS_COLORS) as ProseStatus[]).map((s) => {
        const on = proseStatuses.has(s);
        return (
          <button
            key={s}
            onClick={() => onToggleProseStatus(s)}
            aria-pressed={on}
            className={`badge border transition-colors ${
              on
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-200 text-gray-400"
            }`}
          >
            <span
              className={`mr-1 inline-block h-2 w-2 rounded-full ${PROSE_STATUS_COLORS[s].dot}`}
            />
            {PROSE_STATUS_COLORS[s].label}
          </button>
        );
      })}
      {active && (
        <button onClick={onClear} className="btn btn-ghost btn-sm ml-auto">
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lane toggle + highlight chip (Slice 5)
// ---------------------------------------------------------------------------

function LaneToggle({
  lanes,
  hidden,
  onToggle,
  highlightedCharacterId,
  onClearHighlight,
}: {
  lanes: TimelineLane[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  highlightedCharacterId: string | null;
  onClearHighlight: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {lanes.length > 1 && (
        <>
          <span className="section-label">Lanes</span>
          {lanes.map((l) => {
            const isHidden = hidden.has(l.timeline.id);
            return (
              <button
                key={l.timeline.id}
                onClick={() => onToggle(l.timeline.id)}
                aria-pressed={!isHidden}
                className={`badge border transition-colors ${
                  isHidden
                    ? "border-gray-200 text-gray-400 line-through"
                    : "border-indigo-300 bg-indigo-50 text-indigo-700"
                }`}
                title={isHidden ? "Show this lane" : "Hide this lane"}
              >
                {l.timeline.title}
              </button>
            );
          })}
        </>
      )}
      {highlightedCharacterId && (
        <div className="ml-auto flex items-center gap-2">
          <span className="badge bg-amber-100 text-amber-800">
            Character highlight active
          </span>
          <button onClick={onClearHighlight} className="btn btn-ghost btn-sm">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lane's SVG canvas
// ---------------------------------------------------------------------------

interface LaneProps {
  lane: TimelineLane;
  // Canon audit: shared axis — range + zoom scale come from the parent so
  // every lane uses identical x-coordinates and width (lanes align + scroll
  // together). `filter` drives per-event dimming.
  range: PositionRange;
  scale: number;
  filter: TimelineFilter;
  onSelectEvent: (id: string) => void;
  onRequestCreate: (discoursePosition: number) => void;
  onEventEdited?: () => void;
  // Slice 5 — drag orchestration is now owned by the parent.
  drag: DragState | null;
  onStartDrag: (
    eventId: string,
    sourceLaneId: string,
    sourcePosition: number,
  ) => void;
  onRegisterLane: (laneId: string, reg: LaneRegistration) => void;
  onUnregisterLane: (laneId: string) => void;
}

function TimelineLaneCanvas({
  lane,
  range,
  scale,
  filter,
  onSelectEvent,
  onRequestCreate,
  onEventEdited,
  drag,
  onStartDrag,
  onRegisterLane,
  onUnregisterLane,
}: LaneProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Slice 5: Ctrl+click an event card opens the NodeInteractionPopup
  // (philosophy doc §6.9). Track the popped event at the lane level so
  // the popup renders outside the SVG, where position: fixed actually
  // anchors to the viewport.
  const [popupEventId, setPopupEventId] = useState<string | null>(null);

  // Is this the source lane of the active drag?
  const isDragSource = drag?.sourceLaneId === lane.timeline.id;
  // Is this the lane the cursor is currently over?
  const isDragTarget = drag?.targetLaneId === lane.timeline.id;
  // Cross-lane target = a target lane that isn't the source.
  const isCrossLaneTarget = isDragTarget && !isDragSource;

  const minPos = range.minPos;
  const cw = canvasWidth(range, scale);

  function positionToX(pos: number): number {
    return X_PADDING + (pos - minPos) * scale;
  }

  function xToPosition(x: number): number {
    return Math.round(minPos + (x - X_PADDING) / scale);
  }

  // Slice 5: register this lane with the parent so the orchestrator can
  // hit-test the cursor against it during cross-lane drags. The lane
  // supplies its SVG element + a `clientX → discourse_position` converter
  // so the parent doesn't need to know about the canvas width or minPos.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const reg: LaneRegistration = {
      svg: el,
      xToPosition: (clientX: number) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return minPos;
        const xInViewBox = ((clientX - rect.left) / rect.width) * cw;
        return Math.round(minPos + (xInViewBox - X_PADDING) / scale);
      },
    };
    const laneId = lane.timeline.id;
    onRegisterLane(laneId, reg);
    return () => onUnregisterLane(laneId);
  }, [lane.timeline.id, cw, minPos, scale, onRegisterLane, onUnregisterLane]);

  function handleCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (drag) return; // Don't create while dragging
    // Only respond to clicks on background <rect> elements, not event cards.
    const target = e.target as SVGElement;
    if (target.tagName !== "rect" || !target.hasAttribute("data-background")) {
      return;
    }
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cw;
    const pos = xToPosition(x);
    if (pos < minPos) return;
    onRequestCreate(pos);
  }

  // Slice 5: starting a drag delegates to the parent so the orchestrator
  // has the (event, source-lane, source-position) tuple from the outset.
  function startDrag(eventId: string, currentPos: number) {
    onStartDrag(eventId, lane.timeline.id, currentPos);
  }

  // Slice 5: highlight the target lane while a cross-lane drag is in flight.
  const containerBorder = isCrossLaneTarget
    ? drag?.altHeld
      ? "border-amber-400 ring-2 ring-amber-200"
      : "border-blue-400 ring-2 ring-blue-200"
    : "border-gray-200";

  return (
    <div
      className={`border-b border-l-2 bg-gray-50 transition-shadow ${containerBorder}`}
      style={{ width: cw }}
    >
      {/* Sticky-left header keeps the lane label visible while the shared
          horizontal scroll moves the canvas. */}
      <div className="sticky left-0 z-10 inline-flex max-w-full items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white text-xs text-gray-500">
        <span className="font-medium text-gray-700 truncate min-w-0">
          {lane.timeline.title}
        </span>
        <span className="text-gray-300">·</span>
        <span>
          {lane.events.length} event{lane.events.length === 1 ? "" : "s"}
        </span>
        {lane.act_spans.length > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <span>
              {lane.act_spans.length} act
              {lane.act_spans.length === 1 ? "" : "s"}
            </span>
          </>
        )}
        {isCrossLaneTarget && (
          <span
            className={`ml-auto text-[10px] uppercase tracking-wider font-semibold ${
              drag?.altHeld ? "text-amber-700" : "text-blue-700"
            }`}
          >
            {drag?.altHeld ? "Drop = copy to both" : "Drop = move here"}
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${cw} ${LANE_HEIGHT}`}
        width={cw}
        height={LANE_HEIGHT}
        onClick={handleCanvasClick}
        className="block bg-white"
        style={{ cursor: drag ? "grabbing" : "default" }}
      >
        {/* Background hit-target. Click-on-empty-space → create event. */}
        <rect
          data-background="true"
          x={0}
          y={0}
          width={cw}
          height={LANE_HEIGHT}
          fill="#fafaf9"
        />

        {/* Act span background regions (ADR-072) */}
        {lane.act_spans.map((span) => {
          const x = positionToX(span.start_position);
          const w = positionToX(span.end_position) - x;
          return (
            <g key={span.id}>
              <rect
                x={x}
                y={ACT_BAND_Y}
                width={w}
                height={ACT_BAND_HEIGHT}
                fill={span.color ?? "#e8d4a0"}
                fillOpacity={0.35}
                stroke={span.color ?? "#a97830"}
                strokeOpacity={0.5}
                rx={3}
              />
              <text
                x={x + 6}
                y={ACT_BAND_Y + ACT_BAND_HEIGHT / 2 + 4}
                fontSize={11}
                fill="#52443a"
                fontWeight={500}
              >
                {span.label}
              </text>
            </g>
          );
        })}

        {/* Centerline */}
        <line
          x1={0}
          y1={LANE_HEIGHT / 2 + 8}
          x2={cw}
          y2={LANE_HEIGHT / 2 + 8}
          stroke="#d4d4d8"
          strokeWidth={1}
        />

        {/* FOLLOWS_FROM connectors between adjacent events in discourse order */}
        {lane.events.map((event, idx) => {
          if (idx === 0) return null;
          const prev = lane.events[idx - 1];
          const x1 = positionToX(prev.discourse_position) + EVENT_CARD_WIDTH;
          const x2 = positionToX(event.discourse_position);
          const y = LANE_HEIGHT / 2 + 8;
          return (
            <line
              key={`conn-${prev.node.id}-${event.node.id}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="#a1a1aa"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Event cards */}
        {lane.events.map((event) => {
          // Dimming now covers lane-highlight + prose-status + text search
          // (Canon audit) via the shared pure helper.
          const dimmed = eventDimmed(event, filter);
          // Ghost rendering: the dragged event card follows the cursor
          // in whichever lane the cursor is over. In the source lane,
          // the original card dims and disappears (ghost=true) so the
          // drag visually "lifts" it.
          const isDragged = drag?.eventId === event.node.id;
          const dragInThisLane = isDragged && isDragTarget;
          return (
            <EventCard
              key={event.node.id}
              event={event}
              x={
                dragInThisLane
                  ? positionToX(drag.targetPosition)
                  : positionToX(event.discourse_position)
              }
              y={LANE_HEIGHT / 2 - EVENT_CARD_HEIGHT / 2 + 8}
              onPointerDown={() =>
                startDrag(event.node.id, event.discourse_position)
              }
              onClick={() => onSelectEvent(event.node.id)}
              onCtrlClick={() => setPopupEventId(event.node.id)}
              ghost={isDragged}
              dimmed={dimmed}
            />
          );
        })}

        {/* Slice 5: ghost card rendered IN THIS LANE when the cursor is
            over this lane but the dragged event lives in another lane.
            This makes cross-lane drag legible — the user sees the card
            preview hovering over the target lane. */}
        {drag &&
          isCrossLaneTarget &&
          (() => {
            const sourceEvent = drag.eventId;
            // Build a minimal ghost event for the card renderer.
            const ghostEvent = {
              node: {
                id: sourceEvent,
                title: "(dragging…)",
                type: "permanent" as const,
              },
              discourse_position: drag.targetPosition,
              story_time: null,
              prose_status: null,
              manuscript_location: null,
              timeline_count: 1,
              character_ids: [],
              theme_ids: [],
            };
            return (
              <g style={{ pointerEvents: "none", opacity: 0.7 }}>
                <EventCard
                  event={ghostEvent}
                  x={positionToX(drag.targetPosition)}
                  y={LANE_HEIGHT / 2 - EVENT_CARD_HEIGHT / 2 + 8}
                  onPointerDown={() => {}}
                  onClick={() => {}}
                  onCtrlClick={() => {}}
                  ghost={false}
                  dimmed={false}
                />
                <text
                  x={positionToX(drag.targetPosition)}
                  y={LANE_HEIGHT - 4}
                  fontSize={10}
                  fontWeight={600}
                  fill={drag.altHeld ? "#a97830" : "#3b82f6"}
                >
                  {drag.altHeld ? "Copy to both (crossover)" : "Move here"}
                </text>
              </g>
            );
          })()}
      </svg>
      {popupEventId && (
        <NodeInteractionPopup
          nodeId={popupEventId}
          onClose={() => setPopupEventId(null)}
          onSaved={() => {
            setPopupEventId(null);
            onEventEdited?.();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event card (SVG group)
// ---------------------------------------------------------------------------

function EventCard({
  event,
  x,
  y,
  onPointerDown,
  onClick,
  onCtrlClick,
  ghost,
  dimmed,
}: {
  event: TimelineEvent;
  x: number;
  y: number;
  onPointerDown: () => void;
  onClick: () => void;
  onCtrlClick: () => void;
  ghost: boolean;
  dimmed?: boolean;
}) {
  const status = event.prose_status
    ? PROSE_STATUS_COLORS[event.prose_status as ProseStatus]
    : null;
  const statusColor: Record<ProseStatus, string> = {
    planned: "#d4d4d8",
    draft: "#fbbf24",
    written: "#10b981",
    revised: "#3b82f6",
  };
  const themeColors = ["#e8a94a", "#6ba3d6", "#d47a7a", "#9b7fd4", "#5db888"];
  const isCrossover = (event.timeline_count ?? 1) > 1;

  let opacity = 1;
  if (ghost) opacity = 0.5;
  else if (dimmed) opacity = 0.3;

  return (
    <>
      <g
        transform={`translate(${x}, ${y})`}
        style={{ cursor: "grab", opacity }}
        onPointerDown={(e) => {
          // Don't start drag on a Ctrl+click (that opens the popup).
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          e.stopPropagation();
          onPointerDown();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            onCtrlClick();
            return;
          }
          onClick();
        }}
      >
        <rect
          x={0}
          y={0}
          width={EVENT_CARD_WIDTH}
          height={EVENT_CARD_HEIGHT}
          rx={6}
          fill="white"
          stroke={isCrossover ? "#a97830" : "#a1a1aa"}
          strokeWidth={isCrossover ? 2.5 : 1.5}
          strokeDasharray={isCrossover ? "6 3" : undefined}
        />
        {isCrossover && (
          <text
            x={6}
            y={EVENT_CARD_HEIGHT + 12}
            fontSize={9}
            fill="#a97830"
            fontWeight={600}
            style={{ pointerEvents: "none" }}
          >
            crossover · {event.timeline_count} lanes
          </text>
        )}
        {/* prose_status dot in top-right */}
        {event.prose_status && (
          <circle
            cx={EVENT_CARD_WIDTH - 10}
            cy={10}
            r={5}
            fill={statusColor[event.prose_status as ProseStatus]}
          />
        )}
        {/* Theme density dots in top-left strip */}
        {event.theme_ids?.slice(0, 6).map((tid, i) => (
          <circle
            key={tid}
            cx={12 + i * 8}
            cy={EVENT_CARD_HEIGHT - 12}
            r={3}
            fill={themeColors[i % themeColors.length]}
            style={{ pointerEvents: "none" }}
          />
        ))}
        <text
          x={10}
          y={20}
          fontSize={12}
          fontWeight={600}
          fill="#27272a"
          style={{ pointerEvents: "none" }}
        >
          {truncate(event.node.title, 24)}
        </text>
        {event.story_time && (
          <text
            x={10}
            y={38}
            fontSize={10}
            fill="#71717a"
            style={{ pointerEvents: "none" }}
          >
            {truncate(event.story_time, 26)}
          </text>
        )}
        <text
          x={10}
          y={EVENT_CARD_HEIGHT - 22}
          fontSize={9}
          fill="#a1a1aa"
          style={{ pointerEvents: "none" }}
        >
          pos {event.discourse_position}
          {status && ` · ${status.label}`}
          {event.character_ids?.length
            ? ` · ${event.character_ids.length} char`
            : ""}
        </text>
      </g>
    </>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ---------------------------------------------------------------------------
// Event side panel
// ---------------------------------------------------------------------------

function EventSidePanel({
  event,
  lane,
  onClose,
  onUpdated,
  onHighlightCharacter,
  onOpenSceneContext,
}: {
  event: TimelineEvent;
  lane: TimelineLane;
  onClose: () => void;
  onUpdated: () => void;
  onHighlightCharacter: (id: string) => void;
  onOpenSceneContext: () => void;
}) {
  const [proseStatus, setProseStatus] = useState<ProseStatus | "">(
    event.prose_status ?? "",
  );
  const [manuscriptLoc, setManuscriptLoc] = useState(
    event.manuscript_location ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<NodeDetail[]>([]);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);

  // Pull full character details so we can show name/title in the list.
  useEffect(() => {
    let cancelled = false;
    if (!event.character_ids?.length) {
      setCharacters([]);
      return;
    }
    Promise.all(
      event.character_ids.map((cid) =>
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/nodes/${cid}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setCharacters(
        results.filter((x: NodeDetail | null): x is NodeDetail => x !== null),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [event.character_ids]);

  // Save event-specific fields immediately on blur/change (debounce-free —
  // small payload, low latency). NodeUpdate now supports the columns.
  async function saveField(payload: {
    prose_status?: string | null;
    manuscript_location?: string | null;
  }) {
    setSaving(true);
    setError(null);
    try {
      await updateNode(event.node.id, payload);
      setSavedAt(new Date());
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Event details: ${event.node.title}`}
      className="card scrollbar-thin fixed right-4 top-20 z-30 w-80 max-h-[70vh] overflow-y-auto p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {event.node.title}
        </h3>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
          aria-label="Close event details"
        >
          ×
        </button>
      </div>

      <dl className="space-y-2 text-xs text-gray-600">
        <div>
          <dt className="font-medium text-gray-500">Timeline</dt>
          <dd>{lane.timeline.title}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Story time</dt>
          <dd>
            {event.story_time || <em className="text-gray-300">unset</em>}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Discourse position</dt>
          <dd className="font-mono">{event.discourse_position}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Prose status</dt>
          <dd>
            <select
              aria-label="Prose status"
              value={proseStatus}
              onChange={(e) => {
                const v = e.target.value as ProseStatus | "";
                setProseStatus(v);
                saveField({ prose_status: v || null });
              }}
              className="input mt-1 py-1 text-xs"
            >
              <option value="">— unset —</option>
              {Object.entries(PROSE_STATUS_COLORS).map(([v, meta]) => (
                <option key={v} value={v}>
                  {meta.label}
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Manuscript location</dt>
          <dd>
            <input
              type="text"
              aria-label="Manuscript location"
              value={manuscriptLoc}
              onChange={(e) => setManuscriptLoc(e.target.value)}
              onBlur={() =>
                saveField({ manuscript_location: manuscriptLoc || null })
              }
              placeholder="e.g. manuscript.md L427"
              className="input mt-1 py-1 text-xs font-mono"
            />
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">
            Characters in scene
            <span className="ml-1 text-gray-300 font-normal">
              ({characters.length})
            </span>
          </dt>
          <dd>
            {characters.length === 0 ? (
              <em className="text-gray-300">No characters attached.</em>
            ) : (
              <ul className="space-y-0.5">
                {characters.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <button
                      onClick={() => onHighlightCharacter(c.id)}
                      className="truncate text-indigo-600 hover:underline text-left flex-1"
                      title="Click to highlight this character's events"
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setShowCharacterPicker((x) => !x)}
              className="btn btn-ghost btn-sm mt-1 text-indigo-600 hover:text-indigo-700"
            >
              {showCharacterPicker ? "Cancel" : "+ attach character"}
            </button>
            {showCharacterPicker && (
              <AttachCharacterPicker
                eventId={event.node.id}
                onAttached={() => {
                  setShowCharacterPicker(false);
                  onUpdated();
                }}
              />
            )}
          </dd>
        </div>
        {event.theme_ids?.length ? (
          <div>
            <dt className="font-medium text-gray-500">
              Themes ({event.theme_ids.length})
            </dt>
            <dd className="text-gray-400 italic">
              Theme attachment editor lands in Phase 10. Dots on the card show
              count.
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex justify-between items-center">
        <Link
          href={`/nodes/${event.node.id}`}
          className="text-xs text-indigo-600 hover:underline"
        >
          Open full node →
        </Link>
        <button
          type="button"
          onClick={onOpenSceneContext}
          className="btn btn-sm bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700"
          title="Live graph assembly — every open is a fresh query"
        >
          Scene Context →
        </button>
      </div>

      {saving && <p className="mt-2 text-[10px] text-gray-400">Saving…</p>}
      {savedAt && !saving && (
        <p className="mt-2 text-[10px] text-emerald-600">
          Saved {savedAt.toLocaleTimeString()}
        </p>
      )}
      {error && <p className="alert-error mt-2">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttachCharacterPicker — search + COLLECTS edge create (Slice 5)
// ---------------------------------------------------------------------------

function AttachCharacterPicker({
  eventId,
  onAttached,
}: {
  eventId: string;
  onAttached: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [creating, setCreating] = useState(false);

  // Search character-tagged structure nodes via the existing FTS search +
  // client-side filter for the narrative:character tag. For Slice 5 we
  // accept the round-trip cost — the corpus of characters is small.
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { searchNodes, getNode } = await import("@/lib/api");
      const refs = await searchNodes(search.trim(), 12);
      if (cancelled) return;
      // Filter to structure nodes; then verify they carry the character tag.
      const candidates = refs.filter((r) => r.type === "structure");
      const verified = await Promise.all(
        candidates.map(async (r) => {
          const d = await getNode(r.id).catch(() => null);
          if (!d) return null;
          if (d.tags.some((t) => t.name === "narrative:character")) {
            return { id: r.id, title: r.title } as {
              id: string;
              title: string;
            };
          }
          return null;
        }),
      );
      if (!cancelled) {
        setResults(
          verified.filter(
            (x): x is { id: string; title: string } => x !== null,
          ),
        );
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  async function attach(characterId: string) {
    setCreating(true);
    try {
      const { createEdge } = await import("@/lib/api");
      await createEdge({
        from_id: characterId,
        to_id: eventId,
        type: "COLLECTS",
      });
      onAttached();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-1 space-y-1">
      <input
        type="text"
        autoFocus
        aria-label="Search characters"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search characters…"
        className="input py-1 text-xs"
      />
      {results.length > 0 && (
        <div className="scrollbar-thin rounded-md border border-gray-200 bg-gray-50 max-h-32 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              disabled={creating}
              onClick={() => attach(r.id)}
              className="block w-full px-2 py-1 text-left text-xs hover:bg-white truncate"
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
      {search.trim() && results.length === 0 && (
        <p className="text-[10px] text-gray-400">
          No matching characters. Create one from the Characters tab.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewTimelineDialog — create a parallel lane (Slice 5)
// ---------------------------------------------------------------------------

function NewTimelineDialog({
  hubId,
  onClose,
  onCreated,
}: {
  hubId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createTimeline(hubId, {
        title: title.trim(),
        content: content.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New parallel timeline"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            New parallel timeline
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-timeline-title" className="label">
              Title
            </label>
            <input
              id="new-timeline-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vincent's thread"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="new-timeline-desc" className="label">
              Description (optional)
            </label>
            <textarea
              id="new-timeline-desc"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder="What this thread covers"
              className="textarea"
            />
          </div>
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="btn btn-primary"
            >
              {saving ? "Creating…" : "Create timeline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-event dialog
// ---------------------------------------------------------------------------

function CreateEventDialog({
  laneId,
  discoursePosition,
  onClose,
  onCreated,
}: {
  laneId: string;
  discoursePosition: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [storyTime, setStoryTime] = useState("");
  const [proseStatus, setProseStatus] = useState<ProseStatus | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createStoryEvent({
        title: title.trim(),
        content: "",
        timeline_node_id: laneId,
        discourse_position: discoursePosition,
        story_time: storyTime.trim() || null,
        prose_status: (proseStatus || null) as ProseStatus | null,
        manuscript_location: null,
        auto_follows_from: true,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New scene"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">New scene</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-scene-title" className="label">
              Title
            </label>
            <input
              id="new-scene-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Harbor arrival"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="new-scene-story-time" className="label">
              Story time (free-text)
            </label>
            <input
              id="new-scene-story-time"
              value={storyTime}
              onChange={(e) => setStoryTime(e.target.value)}
              placeholder="e.g. Act 2 Scene 3, Day 14, 1943-06-06"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="new-scene-prose-status" className="label">
              Prose status
            </label>
            <select
              id="new-scene-prose-status"
              value={proseStatus}
              onChange={(e) =>
                setProseStatus(e.target.value as ProseStatus | "")
              }
              className="input"
            >
              <option value="">— unset —</option>
              <option value="planned">Planned</option>
              <option value="draft">Draft</option>
              <option value="written">Written</option>
              <option value="revised">Revised</option>
            </select>
          </div>
          <p className="field-hint">
            Discourse position: {discoursePosition} (set by click; drag the card
            to change).
          </p>
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="btn btn-primary"
            >
              {saving ? "Creating…" : "Create scene"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-act-span dialog
// ---------------------------------------------------------------------------

function CreateActSpanDialog({
  hubId,
  laneId,
  onClose,
  onCreated,
}: {
  hubId: string;
  laneId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [startPos, setStartPos] = useState("0");
  const [endPos, setEndPos] = useState("500");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body: ActSpanCreate = {
        timeline_node_id: laneId,
        label: label.trim(),
        start_position: parseInt(startPos, 10),
        end_position: parseInt(endPos, 10),
        color: color.trim() || null,
      };
      if (body.start_position > body.end_position) {
        throw new Error("start_position must be ≤ end_position");
      }
      await createActSpan(hubId, body);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New act span"
        className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            New act span
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-1 text-lg leading-none"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="act-span-label" className="label">
              Label
            </label>
            <input
              id="act-span-label"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Act 1"
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="act-span-start" className="label">
                Start position
              </label>
              <input
                id="act-span-start"
                type="number"
                value={startPos}
                onChange={(e) => setStartPos(e.target.value)}
                className="input font-mono"
              />
            </div>
            <div>
              <label htmlFor="act-span-end" className="label">
                End position
              </label>
              <input
                id="act-span-end"
                type="number"
                value={endPos}
                onChange={(e) => setEndPos(e.target.value)}
                className="input font-mono"
              />
            </div>
          </div>
          <div>
            <label htmlFor="act-span-color" className="label">
              Color (optional hex)
            </label>
            <input
              id="act-span-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#a97830"
              className="input font-mono"
            />
          </div>
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !label.trim()}
              className="btn btn-primary"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
