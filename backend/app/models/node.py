from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

from app.models.tag import TagRef

if TYPE_CHECKING:
    from app.models.edge import EdgeSummary

NodeType = Literal["fleeting", "literature", "permanent", "structure"]


class NodeRef(BaseModel):
    id: str
    title: str
    type: NodeType


class NodeSummary(BaseModel):
    id: str
    type: NodeType
    title: str
    summary: str | None = None
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = None
    # Slice 4 (ADR-064): surfaced for the Notes "hide story events" filter
    # and for the workspace's narrative-mode lists.
    is_story_event: bool = False
    tags: list[TagRef] = []


class NodeDetail(BaseModel):
    id: str
    type: NodeType
    title: str
    content: str
    summary: str | None = None
    source_id: str | None = None
    embedding_model: str | None = None
    processed_at: datetime | None = None
    # Slice 4 (ADR-064, ADR-071): event-specific fields. Nullable for non-event
    # nodes; populated only when is_story_event = True.
    is_story_event: bool = False
    story_time: str | None = None
    prose_status: str | None = None
    manuscript_location: str | None = None
    created_at: datetime
    updated_at: datetime
    outgoing_edges: list[EdgeSummary] = []
    incoming_edges: list[EdgeSummary] = []
    tags: list[TagRef] = []


class FleetingCreate(BaseModel):
    title: str
    content: str
    tag_ids: list[str] = []


class PermanentCreate(BaseModel):
    title: str
    content: str
    summary: str | None = None
    tag_ids: list[str] = []


class LiteratureCreate(BaseModel):
    title: str
    content: str
    source_id: str
    summary: str | None = None
    tag_ids: list[str] = []


class StructureCreate(BaseModel):
    title: str
    content: str
    summary: str | None = None
    tag_ids: list[str] = []


class NodeUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    summary: str | None = None
    source_id: str | None = None
    tag_ids: list[str] | None = None
