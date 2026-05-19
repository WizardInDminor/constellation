from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.node import NodeSummary

SourceType = Literal["datasheet", "manual", "book", "article", "video", "podcast", "other"]

# ADR-070: tracks the provenance of a source within the learning-mode flow.
# `user_supplied` is the default for backward compatibility and for sources
# added outside the learning workflow.
SourceStatus = Literal["suggested", "confirmed", "user_supplied"]


class SourceRef(BaseModel):
    id: str
    title: str


class SourceSummary(BaseModel):
    id: str
    title: str
    author: str | None = None
    type: SourceType
    url: str | None = None
    published_at: str | None = None
    status: SourceStatus = "user_supplied"
    created_at: datetime


class SourceDetail(BaseModel):
    id: str
    title: str
    author: str | None = None
    type: SourceType
    url: str | None = None
    published_at: str | None = None
    status: SourceStatus = "user_supplied"
    created_at: datetime
    literature_notes: list[NodeSummary] = []


class SourceCreate(BaseModel):
    title: str
    author: str | None = None
    type: SourceType
    url: str | None = None
    published_at: str | None = None
    status: SourceStatus = "user_supplied"


class SourceUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    type: SourceType | None = None
    url: str | None = None
    published_at: str | None = None
    status: SourceStatus | None = None
