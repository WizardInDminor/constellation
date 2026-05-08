from typing import Annotated

import aiosqlite
from fastapi import Depends

from app.core.lifespan import get_db


async def get_database() -> aiosqlite.Connection:
    return get_db()


DB = Annotated[aiosqlite.Connection, Depends(get_database)]
