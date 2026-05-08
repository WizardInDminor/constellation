from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.node import NodeSummary

SourceType = Literal["datasheet", "manual", "book", "article", "video", "podcast", "other"]


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
    created_at: datetime


class SourceDetail(BaseModel):
    id: str
    title: str
    author: str | None = None
    type: SourceType
    url: str | None = None
    published_at: str | None = None
    created_at: datetime
    literature_notes: list[NodeSummary] = []


class SourceCreate(BaseModel):
    title: str
    author: str | None = None
    type: SourceType
    url: str | None = None
    published_at: str | None = None


class SourceUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    type: SourceType | None = None
    url: str | None = None
    published_at: str | None = None
