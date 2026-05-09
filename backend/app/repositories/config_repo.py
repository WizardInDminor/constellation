from datetime import datetime, timezone

import aiosqlite

from app.models import ConfigEntry


async def get_all(db: aiosqlite.Connection) -> list[ConfigEntry]:
    cursor = await db.execute("SELECT key, value, updated_at FROM config ORDER BY key")
    rows = await cursor.fetchall()
    return [ConfigEntry(key=r["key"], value=r["value"], updated_at=r["updated_at"]) for r in rows]


async def get(db: aiosqlite.Connection, key: str) -> ConfigEntry | None:
    cursor = await db.execute(
        "SELECT key, value, updated_at FROM config WHERE key = ?", (key,)
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ConfigEntry(key=row["key"], value=row["value"], updated_at=row["updated_at"])


async def set(db: aiosqlite.Connection, key: str, value: str) -> ConfigEntry:
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO config(key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""",
        (key, value, now),
    )
    await db.commit()
    entry = await get(db, key)
    assert entry is not None
    return entry
