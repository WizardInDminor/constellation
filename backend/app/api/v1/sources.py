import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import SourceCreate, SourceDetail, SourceSummary, SourceUpdate
from app.repositories import source_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["sources"])


async def _open_url(url: str) -> None:
    """Launch xdg-open for a URL or file path.

    Fire-and-forget: does not wait for the opened application to close.
    Captures stderr and logs it at WARNING so failures are visible in server logs.
    The HTTP response is 200 regardless of what happens after launch.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "xdg-open",
            url,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        # Give xdg-open a moment to exit (it exits almost immediately after
        # spawning the target app), then capture any stderr output.
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
            if stderr:
                logger.warning("xdg-open stderr for %r: %s", url, stderr.decode().strip())
        except asyncio.TimeoutError:
            logger.warning("xdg-open did not exit within 5 s for %r", url)
    except FileNotFoundError as exc:
        raise HTTPException(500, "xdg-open not found on this system") from exc


@router.get("")
async def list_sources(db: DB) -> list[SourceSummary]:
    return await source_repo.list_sources(db)


@router.post("", status_code=201)
async def create_source(data: SourceCreate, db: DB) -> SourceDetail:
    return await source_repo.create(db, data)


@router.get("/{source_id}")
async def get_source(source_id: str, db: DB) -> SourceDetail:
    source = await source_repo.get_by_id(db, source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@router.patch("/{source_id}")
async def update_source(source_id: str, data: SourceUpdate, db: DB) -> SourceDetail:
    source = await source_repo.update(db, source_id, data)
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@router.delete("/{source_id}", status_code=204)
async def delete_source(source_id: str, db: DB) -> None:
    ok, reason = await source_repo.delete(db, source_id)
    if not ok:
        if reason:
            raise HTTPException(409, reason)
        raise HTTPException(404, "Source not found")


@router.get("/{source_id}/open")
async def open_source(source_id: str, db: DB) -> dict:
    source = await source_repo.get_by_id(db, source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    if not source.url:
        raise HTTPException(400, "Source has no URL configured")
    await _open_url(source.url)
    return {"opened": source.url}
