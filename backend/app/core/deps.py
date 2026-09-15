from typing import Annotated

import aiosqlite
from fastapi import Depends

from app.core import lifespan
from app.providers.base import EmbeddingProvider, GenerationProvider


async def get_database() -> aiosqlite.Connection:
    return lifespan.get_db()


# Provider dependencies read the single module-level authority (ADR-091) —
# NOT app.state — so routes, the embedding worker, and the MCP tools always
# agree on the active provider, including after a PATCH /config hot-swap.
def get_embedding_provider() -> EmbeddingProvider:
    return lifespan.get_embedding_provider()


def get_generation_provider() -> GenerationProvider:
    return lifespan.get_generation_provider()


DB = Annotated[aiosqlite.Connection, Depends(get_database)]
EmbedProvider = Annotated[EmbeddingProvider, Depends(get_embedding_provider)]
GenProvider = Annotated[GenerationProvider, Depends(get_generation_provider)]
