from datetime import datetime

from pydantic import BaseModel


class CorpusStats(BaseModel):
    nodes_by_type: dict[str, int]
    edges: int
    sources: int
    tags: int
    inbox: int
    last_processed_at: datetime | None = None
