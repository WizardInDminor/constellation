from datetime import datetime

from pydantic import BaseModel


class ConfigEntry(BaseModel):
    key: str
    value: str
    updated_at: datetime


class ConfigUpdate(BaseModel):
    embedding_provider: str | None = None
    embedding_model: str | None = None
    generation_provider: str | None = None
    generation_model: str | None = None
