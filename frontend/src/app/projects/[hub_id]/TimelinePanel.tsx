"use client";

/**
 * Narrative timeline canvas — Phase 9 Slice 4 (ADR-066).
 *
 * Custom SVG. Single lane in Slice 4; the component is structured so
 * Slice 5 can add swim lanes without architectural changes. Pointer-
 * event drag-to-reorder (no @dnd-kit dependency in Slice 4).
 *
 * Live query (ADR-066 / philosophy doc): re-fetches on mount and after
 * every mutation. No cached timeline state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createActSpan,
  createStoryEvent,
  getTimeline,
  updateTimelinePosition,
  updateNode,
} from "@/lib/api";
import type {
  ActSpan,
  ActSpanCreate,
  ProjectScope,
  ProseStatus,
  TimelineEvent,
  TimelineLane,
  TimelineResponse,
} from "@/lib/api";

interface Props {
  scope: ProjectScope;
}

// SVG geometry constants. The canvas is logical — `discourse_position` units
// map directly to SVG x-coordinates via the scale below.
const LANE_HEIGHT = 140;
const LANE_PAD_Y = 16;
const EVENT_CARD_WIDTH = 160;
const EVENT_CARD_HEIGHT = 70;
const POSITION_SCALE = 0.4; // px per discourse_position unit
const X_PADDING = 60;
const ACT_BAND_HEIGHT = 22;
const ACT_BAND_Y = 4;

// Default discourse_position step when appending a new event to the lane.
const POSITION_STEP = 100;

const PROSE_STATUS_COLORS: Record<ProseStatus, { dot: string; label: string }> = {
  planned: { dot: "bg-gray-300", label: "Planned" },
  draft: { dot: "bg-amber-400", label: "Draft" },
  written: { dot: "bg-emerald-500", label: "Written" },
  revised: { dot: "bg-blue-500", label: "Revised" },
};

export function TimelinePanel({ scope }: Props) {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState<{
    laneId: string;
    discoursePosition: number;
  } | null>(null);
  const [actDialog, setActDialog] = useState<string | null>(null); // laneId
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTimeline(await getTimeline(scope.hub_node_id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    }
  }, [scope.hub_node_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        {error}
      </div>
    );
  }
  if (timeline === null) {
    return <p className="text-xs text-gray-400">Loading timeline…</p>;
  }
  if (timeline.lanes.length === 0) {
    // Shouldn't happen — backend lazy-creates a default lane. Defensive.
    return (
      <p className="text-xs text-gray-400">
        No timelines yet. The backend should have created one — try
        refreshing.
      </p>
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Narrative timeline
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Click empty canvas to add an event. Drag a card to reorder.
            Click a card for details.
          </p>
        </div>
        <button
          onClick={() => setActDialog(timeline.lanes[0].timeline.id)}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          + Act span
        </button>
      </div>

      {/* Slice 4: single lane. Lanes array stays — Slice 5 renders > 1. */}
      {timeline.lanes.map((lane) => (
        <TimelineLaneCanvas
          key={lane.timeline.id}
          lane={lane}
          onSelectEvent={setSelectedEventId}
          onRequestCreate={(pos) =>
            setCreateDialog({
              laneId: lane.timeline.id,
              discoursePosition: pos,
            })
          }
          onReorder={async (eventId, newPosition) => {
            try {
              await updateTimelinePosition(eventId, {
                timeline_node_id: lane.timeline.id,
                discourse_position: newPosition,
              });
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Reorder failed");
            }
          }}
        />
      ))}

      {selectedEvent && selectedLane && (
        <EventSidePanel
          event={selectedEvent}
          lane={selectedLane}
          onClose={() => setSelectedEventId(null)}
          onUpdated={refresh}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lane's SVG canvas
// ---------------------------------------------------------------------------

interface LaneProps {
  lane: TimelineLane;
  onSelectEvent: (id: string) => void;
  onRequestCreate: (discoursePosition: number) => void;
  onReorder: (eventId: string, newPosition: number) => Promise<void>;
}

function TimelineLaneCanvas({
  lane,
  onSelectEvent,
  onRequestCreate,
  onReorder,
}: LaneProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    eventId: string;
    currentPosition: number;
  } | null>(null);

  // Range of positions in this lane — used to set SVG viewBox width.
  const { minPos, maxPos } = useMemo(() => {
    const positions = [
      ...lane.events.map((e) => e.discourse_position),
      ...lane.act_spans.flatMap((s) => [s.start_position, s.end_position]),
    ];
    if (positions.length === 0) return { minPos: 0, maxPos: 1000 };
    return {
      minPos: Math.min(0, ...positions),
      maxPos: Math.max(1000, ...positions),
    };
  }, [lane.events, lane.act_spans]);

  const canvasWidth =
    X_PADDING * 2 + Math.max(800, (maxPos - minPos) * POSITION_SCALE);

  function positionToX(pos: number): number {
    return X_PADDING + (pos - minPos) * POSITION_SCALE;
  }

  function xToPosition(x: number): number {
    return Math.round(minPos + (x - X_PADDING) / POSITION_SCALE);
  }

  function handleCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (drag) return; // Don't create while dragging
    // Only respond to clicks on background <rect> elements, not event cards.
    const target = e.target as SVGElement;
    if (target.tagName !== "rect" || !target.hasAttribute("data-background")) {
      return;
    }
    const rect = svgRef.current!.getBoundingClientRect();
    const x =
      ((e.clientX - rect.left) / rect.width) * canvasWidth;
    const pos = xToPosition(x);
    if (pos < minPos) return;
    onRequestCreate(pos);
  }

  // Drag handling — pointer events on event cards.
  function startDrag(eventId: string, currentPos: number) {
    setDrag({ eventId, currentPosition: currentPos });
  }

  useEffect(() => {
    if (!drag || !svgRef.current) return;
    const svg = svgRef.current;

    function onPointerMove(ev: PointerEvent) {
      const rect = svg.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * canvasWidth;
      const newPos = Math.max(minPos, xToPosition(x));
      setDrag((d) => (d ? { ...d, currentPosition: newPos } : null));
    }

    async function onPointerUp() {
      if (!drag) return;
      const finalPos = drag.currentPosition;
      setDrag(null);
      await onReorder(drag.eventId, finalPos);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, canvasWidth, minPos]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto bg-gray-50">
      <div className="px-3 py-2 border-b border-gray-200 bg-white text-xs text-gray-500 flex items-center gap-2">
        <span className="font-medium text-gray-700 truncate">
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
              {lane.act_spans.length} act{lane.act_spans.length === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasWidth} ${LANE_HEIGHT}`}
        width={canvasWidth}
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
          width={canvasWidth}
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
          x2={canvasWidth}
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
        {lane.events.map((event) => (
          <EventCard
            key={event.node.id}
            event={event}
            x={
              drag?.eventId === event.node.id
                ? positionToX(drag.currentPosition)
                : positionToX(event.discourse_position)
            }
            y={LANE_HEIGHT / 2 - EVENT_CARD_HEIGHT / 2 + 8}
            onPointerDown={() =>
              startDrag(event.node.id, event.discourse_position)
            }
            onClick={() => onSelectEvent(event.node.id)}
            ghost={drag?.eventId === event.node.id}
          />
        ))}
      </svg>
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
  ghost,
}: {
  event: TimelineEvent;
  x: number;
  y: number;
  onPointerDown: () => void;
  onClick: () => void;
  ghost: boolean;
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
  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: "grab", opacity: ghost ? 0.5 : 1 }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPointerDown();
      }}
      onClick={(e) => {
        e.stopPropagation();
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
        stroke="#a1a1aa"
        strokeWidth={1.5}
      />
      {/* prose_status dot in top-right */}
      {event.prose_status && (
        <circle
          cx={EVENT_CARD_WIDTH - 10}
          cy={10}
          r={5}
          fill={statusColor[event.prose_status as ProseStatus]}
        />
      )}
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
        y={EVENT_CARD_HEIGHT - 8}
        fontSize={9}
        fill="#a1a1aa"
        style={{ pointerEvents: "none" }}
      >
        pos {event.discourse_position}
        {status && ` · ${status.label}`}
      </text>
    </g>
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
}: {
  event: TimelineEvent;
  lane: TimelineLane;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [proseStatus, setProseStatus] = useState<ProseStatus | "">(
    event.prose_status ?? "",
  );
  const [manuscriptLoc, setManuscriptLoc] = useState(
    event.manuscript_location ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The current PATCH /nodes/{id} accepts title/content/summary/tag_ids but
  // not the event-specific columns. For Slice 4 we update prose_status and
  // manuscript_location via a workaround: PATCH on title is the existing
  // endpoint. The event-field updates use the same node endpoint with
  // body fields the backend ignores today — leaving the update path here
  // as a follow-up (the prose_status badge already renders from the
  // existing GET). For now, the side panel shows the data read-only and
  // the badge state on the card.
  // TODO Slice 5: extend NodeUpdate with event-specific fields.

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Update plain fields the existing PATCH /nodes/{id} supports.
      await updateNode(event.node.id, { title: event.node.title });
      // Note: prose_status + manuscript_location PATCH support is a Slice 5
      // follow-up. The form below is currently a read-only display with a
      // local-state preview so the user sees the intended UX.
      onUpdated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed right-4 top-20 z-30 w-80 rounded-lg border border-gray-200 bg-white shadow-lg p-4 max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold truncate">{event.node.title}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
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
          <dd>{event.story_time || <em className="text-gray-300">unset</em>}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Discourse position</dt>
          <dd className="font-mono">{event.discourse_position}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Prose status</dt>
          <dd>
            <select
              value={proseStatus}
              onChange={(e) => setProseStatus(e.target.value as ProseStatus | "")}
              className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs"
            >
              <option value="">— unset —</option>
              {Object.entries(PROSE_STATUS_COLORS).map(([v, meta]) => (
                <option key={v} value={v}>
                  {meta.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-amber-600 mt-1">
              Status changes save to the node in a Slice 5 follow-up.
            </p>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Manuscript location</dt>
          <dd>
            <input
              type="text"
              value={manuscriptLoc}
              onChange={(e) => setManuscriptLoc(e.target.value)}
              placeholder="e.g. manuscript.md L427"
              className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs font-mono"
            />
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Characters</dt>
          <dd className="text-gray-300 italic">Slice 5</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Themes</dt>
          <dd className="text-gray-300 italic">Slice 5</dd>
        </div>
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
          disabled
          title="Scene Context View ships in Slice 5"
          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400 cursor-not-allowed"
        >
          Open in Scene Context
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">New scene</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Harbor arrival"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Story time (free-text)
            </label>
            <input
              value={storyTime}
              onChange={(e) => setStoryTime(e.target.value)}
              placeholder="e.g. Act 2 Scene 3, Day 14, 1943-06-06"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Prose status
            </label>
            <select
              value={proseStatus}
              onChange={(e) =>
                setProseStatus(e.target.value as ProseStatus | "")
              }
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">— unset —</option>
              <option value="planned">Planned</option>
              <option value="draft">Draft</option>
              <option value="written">Written</option>
              <option value="revised">Revised</option>
            </select>
          </div>
          <p className="text-[11px] text-gray-400">
            Discourse position: {discoursePosition} (set by click; drag the
            card to change).
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">New act span</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Label
            </label>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Act 1"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start position
              </label>
              <input
                type="number"
                value={startPos}
                onChange={(e) => setStartPos(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End position
              </label>
              <input
                type="number"
                value={endPos}
                onChange={(e) => setEndPos(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Color (optional hex)
            </label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#a97830"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
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
              disabled={saving || !label.trim()}
              className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
