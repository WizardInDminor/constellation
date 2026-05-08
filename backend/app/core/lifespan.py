import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite
from fastapi import FastAPI

from app.core.config import get_settings
from app.core.database import open_database

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db
    settings = get_settings()
    _db = await open_database(settings.db_path)
    await _run_migrations(_db)
    logger.info("Database ready: %s", settings.db_path)
    yield
    await _db.close()
    _db = None
