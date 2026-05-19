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
    """One event positioned in one timeline. Slice 4 carries enough for the
    canvas to render a card; Slice 5 will extend with character / theme
    attachments via additional fields or a separate lookup pass.
    """

    node: NodeRef
    discourse_position: int
    story_time: str | None = None
    prose_status: ProseStatus | None = None
    manuscript_location: str | None = None


class TimelineLane(BaseModel):
    """One timeline structure node with the events and act spans on it.
    Slice 4 renders the lane in single-lane mode; Slice 5 will use the same
    shape per swim lane.
    """

    timeline: NodeRef
    events: list[TimelineEvent]
    act_spans: list[ActSpan]


class TimelineResponse(BaseModel):
    """GET /projects/{hub_id}/timeline — one entry per timeline structure
    node attached to the project (COLLECTS edges from the hub).
    """

    lanes: list[TimelineLane]
