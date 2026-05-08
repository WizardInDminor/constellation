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
