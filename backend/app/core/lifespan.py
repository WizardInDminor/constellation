import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import aiosqlite
from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.core.database import open_database
from app.providers.base import EmbeddingProvider, GenerationProvider

logger = logging.getLogger(__name__)

_db: aiosqlite.Connection | None = None


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "Database not initialized"
    return _db


async def _run_migrations(db: aiosqlite.Connection) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
    """)
    await db.commit()

    migrations_dir = Path(__file__).parent.parent.parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    for sql_file in sql_files:
        cursor = await db.execute(
            "SELECT 1 FROM schema_migrations WHERE filename = ?",
            (sql_file.name,),
        )
        if await cursor.fetchone() is not None:
            continue

        logger.info("Applying migration: %s", sql_file.name)
        await db.executescript(sql_file.read_text())
        await db.execute(
            "INSERT INTO schema_migrations(filename, applied_at) VALUES (?, datetime('now'))",
            (sql_file.name,),
        )
        await db.commit()
        logger.info("Applied migration: %s", sql_file.name)


async def _load_providers(
    db: aiosqlite.Connection,
    settings: Settings,
) -> tuple[EmbeddingProvider, GenerationProvider]:
    """Instantiate the active embedding and generation providers from the config table.

    Fails loud at startup if a cloud provider is configured but its API key is absent.
    """
    from app.providers.anthropic_gen import AnthropicGenerationProvider
    from app.providers.voyage import VoyageEmbeddingProvider
    from app.repositories import config_repo

    embed_name = (await config_repo.get(db, "embedding_provider")).value
    embed_model = (await config_repo.get(db, "embedding_model")).value
    gen_name = (await config_repo.get(db, "generation_provider")).value
    gen_model = (await config_repo.get(db, "generation_model")).value

    if embed_name == "voyage":
        if not settings.voyage_api_key:
            raise RuntimeError(
                "embedding_provider is 'voyage' but VOYAGE_API_KEY is not set in .env"
            )
        embed_provider: EmbeddingProvider = VoyageEmbeddingProvider(
            api_key=settings.voyage_api_key, model=embed_model
        )
    else:
        raise RuntimeError(f"Unknown embedding_provider: {embed_name!r}")

    if gen_name == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "generation_provider is 'anthropic' but ANTHROPIC_API_KEY is not set in .env"
            )
        gen_provider: GenerationProvider = AnthropicGenerationProvider(
            api_key=settings.anthropic_api_key, model=gen_model
        )
    else:
        raise RuntimeError(f"Unknown generation_provider: {gen_name!r}")

    return embed_provider, gen_provider


async def _embedding_worker(app: FastAPI) -> None:
    from app.services import embedding_service

    settings = get_settings()
    interval = settings.embedding_worker_interval_seconds

    while True:
        await asyncio.sleep(interval)
        try:
            now = datetime.now(UTC)
            cooldown_until = app.state.cooldown_until
            if cooldown_until is not None and cooldown_until > now:
                continue

            result = await embedding_service.drain_jobs(get_db(), app.state.embedding_provider)
            if result.cooldown_seconds:
                app.state.cooldown_until = datetime.now(UTC) + timedelta(
                    seconds=result.cooldown_seconds
                )
        except Exception as exc:
            logger.error("Embedding worker error: %s", exc)
        finally:
            app.state.last_drain_at = datetime.now(UTC)
            app.state.drain_count += 1


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db
    settings = get_settings()
    _db = await open_database(settings.db_path)
    await _run_migrations(_db)
    logger.info("Database ready: %s", settings.db_path)

    embed_provider, gen_provider = await _load_providers(_db, settings)
    app.state.embedding_provider = embed_provider
    app.state.generation_provider = gen_provider
    logger.info(
        "Providers loaded: embed=%s gen=%s",
        embed_provider.model_id,
        gen_provider.model_id,
    )

    app.state.last_drain_at = None
    app.state.drain_count = 0
    app.state.cooldown_until = None

    worker = asyncio.create_task(_embedding_worker(app))

    yield

    worker.cancel()
    try:
        await worker
    except asyncio.CancelledError:
        pass

    await _db.close()
    _db = None
