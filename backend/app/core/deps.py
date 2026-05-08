from typing import Annotated

import aiosqlite
from fastapi import Depends, Request

from app.core.lifespan import get_db
from app.providers.base import EmbeddingProvider, GenerationProvider


async def get_database() -> aiosqlite.Connection:
    return get_db()


def get_embedding_provider(request: Request) -> EmbeddingProvider:
    return request.app.state.embedding_provider


def get_generation_provider(request: Request) -> GenerationProvider:
    return request.app.state.generation_provider


DB = Annotated[aiosqlite.Connection, Depends(get_database)]
EmbedProvider = Annotated[EmbeddingProvider, Depends(get_embedding_provider)]
GenProvider = Annotated[GenerationProvider, Depends(get_generation_provider)]
