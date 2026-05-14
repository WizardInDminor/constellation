import asyncio
import logging
import os
from urllib.parse import unquote, urlparse, urlunparse

from fastapi import APIRouter, HTTPException

from app.core.deps import DB
from app.models import SourceCreate, SourceDetail, SourceSummary, SourceUpdate
from app.repositories import source_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["sources"])


def _normalize_file_url(url: str) -> str:
    """Normalize a source URL for `xdg-open`.

    - `file://` URLs: expand `~` and `$HOME`, decode percent-escapes, re-form.
    - Bare filesystem paths (no scheme, starting with `/`, `~`, or `$`): expand
      and wrap as `file:///abs/path`. xdg-open does not perform shell expansion
      itself, so `~/foo.md` would otherwise be passed verbatim and fail silently.
    - All other URLs pass through unchanged.

    See ADR-047.
    """
    parsed = urlparse(url)
    if not parsed.scheme and (url.startswith(("/", "~", "$"))):
        expanded = os.path.expanduser(os.path.expandvars(url))
        return urlunparse(("file", "", expanded, "", "", ""))
    if parsed.scheme != "file":
        return url
    raw_path = unquote(parsed.path)
    # `file://~/foo` and `file://$HOME/foo` put the prefix in netloc.
    # `file:///~/foo` puts /~/foo in path. Normalise both to a form
    # `expanduser` / `expandvars` can handle.
    netloc = unquote(parsed.netloc)
    if netloc and (netloc.startswith("~") or netloc.startswith("$")):
        raw_path = netloc + parsed.path
    elif raw_path.startswith("/~"):
        raw_path = raw_path[1:]
    expanded = os.path.expanduser(os.path.expandvars(raw_path))
    return urlunparse(("file", "", expanded, "", "", ""))


async def _open_url(url: str) -> str | None:
    """Launch xdg-open for a URL or file path.

    Fire-and-forget: does not wait for the opened application to close.
    `start_new_session=True` detaches the subprocess so a `uvicorn --reload`
    restart cannot kill the GUI app that xdg-open spawned. Returns any stderr
    text or a synthesized exit-code message when xdg-open fails, so the
    caller can surface it as a warning (see ADR-024 amendment).
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "xdg-open",
            url,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("xdg-open did not exit within 5 s for %r", url)
            return None
        msg = stderr.decode().strip() if stderr else ""
        rc = proc.returncode
        if rc:
            if msg:
                logger.warning("xdg-open exit %d for %r: %s", rc, url, msg)
                return msg
            logger.warning("xdg-open exit %d for %r (no stderr)", rc, url)
            return f"xdg-open exited with code {rc}"
        if msg:
            logger.warning("xdg-open stderr for %r: %s", url, msg)
            return msg
        return None
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
    target = _normalize_file_url(source.url)
    # For local files, verify existence before spawning xdg-open. xdg-open
    # exits silently for missing files, so without this check the user sees
    # no error and no app opens.
    parsed = urlparse(target)
    if parsed.scheme == "file" and not os.path.exists(parsed.path):
        raise HTTPException(404, f"File not found: {parsed.path}")
    warning = await _open_url(target)
    payload: dict = {"opened": target}
    if warning:
        payload["warning"] = warning
    return payload
