from datetime import datetime

from pydantic import BaseModel


class ConfigEntry(BaseModel):
    key: str
    value: str
    updated_at: datetime
