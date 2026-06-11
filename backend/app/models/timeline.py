"""Narrative timeline models — Phase 9 Slice 4.

A timeline is a structure node (ADR-065). Events are permanent nodes with
`is_story_event = 1` (ADR-064). Events bind to a timeline via the
`event_timeline_positions` join (ADR-065). Acts are span events in their
own table (ADR-072).
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.node import NodeRef
from app.models.tag import TagRef

ProseStatus = Literal["planned", "draft", "written", "revised"]


# ---------------------------------------------------------------------------
# Story event create / update
# ---------------------------------------------------------------------------


class StoryEventCreate(BaseModel):
    """Create a permanent node flagged as a story event and place it on a
    timeline. ADR-064 (flag-on-permanent) + ADR-065 (per-timeline position).
    """

    title: str = Field(min_length=1)
    content: str = ""
    timeline_node_id: str
    discourse_position: int
    story_time: str | None = None
    prose_status: ProseStatus | None = None
    manuscript_location: str | None = None
    # When provided, the caller (workspace timeline) wants the new event
    # auto-chained to the existing predecessor in this lane via FOLLOWS_FROM.
    auto_follows_from: bool = True


class TimelinePositionUpdate(BaseModel):
    """`PATCH /nodes/{id}/timeline-position` — change an event's
    discourse_position within a specific timeline. ADR-065: positions are
    scoped per timeline, so the timeline_node_id is required.
    """

    timeline_node_id: str
    discourse_position: int


class TimelinePlacementRequest(BaseModel):
    """`POST /nodes/{id}/timeline-placement` — place an existing event onto
    a (possibly different) timeline. Used by the cross-lane drag-and-drop
    surface in Slice 5.

    - When `remove_from_timeline_node_id` is null, this is a CROSSOVER /
      COPY: the event keeps its source placement and gains a placement on
      the target timeline. ADR-065 documents the supported shape.
    - When `remove_from_timeline_node_id` is set (and differs from
      `timeline_node_id`), this is a MOVE: the source-lane placement +
      its COLLECTS edge are removed; the event is placed on the target
      lane. The source-lane FOLLOWS_FROM chain may end up with a gap;
      the workspace does not auto-compact in Slice 5.
    """

    timeline_node_id: str
    discourse_position: int
    remove_from_timeline_node_id: str | None = None


# ---------------------------------------------------------------------------
# Act spans
# ---------------------------------------------------------------------------


class ActSpan(BaseModel):
    id: str
    timeline_node_id: str
    label: str
    start_position: int
    end_position: int
    color: str | None = None
    created_at: datetime


class ActSpanCreate(BaseModel):
    timeline_node_id: str
    label: str = Field(min_length=1)
    start_position: int
    end_position: int
    color: str | None = None


# ---------------------------------------------------------------------------
# Timeline read shape
# ---------------------------------------------------------------------------


class TimelineEvent(BaseModel):
    """One event positioned in one timeline. Slice 5 adds the crossover
    indicator and per-event character/theme references so the canvas can
    render highlights and theme-density dots without a second round trip.
    """

    node: NodeRef
    discourse_position: int
    story_time: str | None = None
    prose_status: ProseStatus | None = None
    manuscript_location: str | None = None
    # Slice 5: > 1 means this event has rows in event_timeline_positions
    # for multiple timeline_node_ids — a crossover scene (ADR-065).
    timeline_count: int = 1
    # Slice 5: IDs of attached character structure nodes (those with the
    # 'narrative:character' tag that COLLECTS this event). Used by the
    # left-panel character filter (highlight on click).
    character_ids: list[str] = []
    # Slice 5: IDs of attached theme structure nodes (those tagged
    # 'narrative:theme', either source or target of any non-COLLECTS edge
    # involving this event). Used for the theme-density dots.
    theme_ids: list[str] = []


class TimelineLane(BaseModel):
    """One timeline structure node with the events and act spans on it.
    Slice 4 renders the lane in single-lane mode; Slice 5 will use the same
    shape per swim lane.
    """

    timeline: NodeRef
    events: list[TimelineEvent]
    act_spans: list[ActSpan]
    # ADR-079: reserved `layer:*` tags on the timeline structure node classify
    # the lane's kind (external / historical / dream / metaphysical / …) so the
    # frontend can colour, label, and filter lanes by type. Empty = unspecified.
    timeline_tags: list[TagRef] = []


class TimelineResponse(BaseModel):
    """GET /projects/{hub_id}/timeline — one entry per timeline structure
    node attached to the project (COLLECTS edges from the hub).
    """

    lanes: list[TimelineLane]


# ---------------------------------------------------------------------------
# Scene Context View (Slice 5)
# ---------------------------------------------------------------------------


class SceneContextItem(BaseModel):
    """One contextual node surfaced into Scene Context View. The
    `relevance` field reflects graph proximity per philosophy doc §6.8:
      - "strong"     — direct edge to a scene element
      - "moderate"   — one hop away
      - "background" — world rules always present
    """

    node: NodeRef
    relevance: Literal["strong", "moderate", "background"]
    role: Literal["character", "location", "lore", "theme", "arc_note", "world_rule"]
    edge_type: str | None = None  # the edge label connecting it to the scene
    edge_note: str | None = None
    # Optional supplemental fields for character cards (Slice 5 carries only
    # what the read view shows; full character sheet is Phase 10).
    summary: str | None = None
    category: str | None = None  # lore category from the reserved tag


class SceneContextResponse(BaseModel):
    """All context surrounding one scene. Always assembled live (philosophy
    doc §6.8 "Live graph assembly"); no caching at any layer.

    The frontend renders `items` grouped by `role` and `relevance`. The
    `world_rules_collapsed_hint` controls the session-aware collapse copy
    on the right panel.
    """

    event: NodeRef
    timeline: NodeRef | None = None
    discourse_position: int | None = None
    preceding_event: NodeRef | None = None
    following_event: NodeRef | None = None
    items: list[SceneContextItem]
    world_rules_collapsed_hint: str | None = None
