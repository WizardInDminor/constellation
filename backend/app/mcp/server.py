"""Constellation MCP server — read tools (Phase C4, ADR-089).

Layering (direction pack ADR-003): MCP tool adapter → application service /
context builder → repository. Tools in this package contain no SQL, no
business logic, and no context assembly of their own; every tool returns the
same authoritative shapes the HTTP routes serve (AT-020).

Transport: streamable HTTP, mounted in-process on the FastAPI app at /mcp
(D3): one process, one SQLite writer, one lifecycle. Auth: static per-client
bearer tokens with read/write scopes (D4, app/mcp/auth.py).
"""

import logging
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from app.core.lifespan import get_db, get_embedding_provider
from app.mcp import auth
from app.repositories import project_repo
from app.services import canon_service, context_builder_service, search_service

logger = logging.getLogger(__name__)

SERVER_VERSION = "0.1.0"

mcp_server = MCPServer(
    name="constellation",
    title="Constellation",
    version=SERVER_VERSION,
    instructions=(
        "Constellation is the authoritative system of record for this user's "
        "knowledge graph and creative projects. Retrieval tools return "
        "accepted truth, development material, and open proposals strictly "
        "separated — treat only accepted sections as settled. AI-created "
        "material enters as proposals and never becomes accepted canon "
        "without explicit human review."
    ),
)


def _audit(tool: str, **fields: Any) -> None:
    identity = auth.current_client.get()
    logger.info(
        "mcp tool=%s client=%s %s",
        tool,
        identity.client_name if identity else "?",
        " ".join(f"{k}={v}" for k, v in fields.items()),
    )


@mcp_server.tool()
async def get_server_info() -> dict:
    """Server identity, supported domains, capabilities, and who you are
    authenticated as."""
    identity = auth.require_scope("read")
    _audit("get_server_info")
    return {
        "server_name": "constellation",
        "version": SERVER_VERSION,
        "supported_domains": ["story"],
        "capabilities": {
            "read": [
                "list_projects",
                "search_story",
                "get_story_project_context",
                "get_character_dossier",
                "get_scene_context",
                "get_recent_changes",
                "list_open_threads",
            ],
            "write": [
                "create_story_proposal",
                "update_proposal",
                "link_proposal_to_objects",
                "create_development_note",
            ],
            "decisions": ["record_story_decision"],
        },
        "actor": {
            "client_name": identity.client_name,
            "scopes": sorted(identity.scopes),
        },
    }


@mcp_server.tool()
async def list_projects() -> list[dict]:
    """List the user's projects (hub id, title, mode, note count)."""
    auth.require_scope("read")
    _audit("list_projects")
    projects = await project_repo.list_projects(get_db())
    return [p.model_dump(mode="json") for p in projects]


@mcp_server.tool()
async def search_story(query: str, project_id: str | None = None, limit: int = 20) -> dict:
    """Hybrid (semantic + full-text) search over the knowledge graph.

    Note: results are currently corpus-wide; `project_id` is validated but
    does not yet scope results (recorded limitation, Phase C6)."""
    auth.require_scope("read")
    _audit("search_story", query=query[:60], project_id=project_id)
    db = get_db()
    warnings: list[str] = []
    if project_id is not None:
        if not await project_repo.is_project_hub(db, project_id):
            raise ValueError(f"PROJECT_NOT_FOUND: {project_id!r} is not a project hub")
        warnings.append("search is corpus-wide in v1; project scoping arrives in C6")
    results = await search_service.hybrid_search(
        db, get_embedding_provider(), query, limit=min(limit, 50)
    )
    return {
        "results": [r.model_dump(mode="json") for r in results],
        "warnings": warnings,
    }


@mcp_server.tool()
async def get_story_project_context(project_id: str) -> dict:
    """Project-level context: mode, character/theme/location rosters, active
    decisions, open threads, open proposals, recent changes."""
    auth.require_scope("read")
    _audit("get_story_project_context", project_id=project_id)
    ctx = await context_builder_service.build_story_project_context(get_db(), project_id)
    return ctx.model_dump(mode="json")


@mcp_server.tool()
async def get_character_dossier(project_id: str, character_id: str) -> dict:
    """Everything the project knows about one character — accepted truth,
    development material, and unresolved proposals, strictly separated."""
    auth.require_scope("read")
    _audit("get_character_dossier", project_id=project_id, character_id=character_id)
    dossier = await context_builder_service.build_character_dossier(
        get_db(), project_id, character_id
    )
    return dossier.model_dump(mode="json")


@mcp_server.tool()
async def get_scene_context(project_id: str, event_id: str) -> dict:
    """Live scene context: characters present, location + lore, themes, arc
    notes, world rules, timeline neighborhood — assembled from current graph
    state on every call."""
    auth.require_scope("read")
    _audit("get_scene_context", project_id=project_id, event_id=event_id)
    envelope = await context_builder_service.build_scene_context(
        get_db(), project_id, event_id
    )
    return envelope.model_dump(mode="json")


@mcp_server.tool()
async def get_recent_changes(project_id: str, after: int = 0, limit: int = 50) -> dict:
    """Cursor-paged project event log. Store the returned next_cursor and
    pass it back as `after` to see every subsequent event exactly once."""
    auth.require_scope("read")
    _audit("get_recent_changes", project_id=project_id, after=after)
    ctx = await context_builder_service.build_recent_changes_context(
        get_db(), project_id, after=after, limit=min(limit, 200)
    )
    return ctx.model_dump(mode="json")


@mcp_server.tool()
async def list_open_threads(limit: int = 20) -> dict:
    """Open questions: unresolved tension edges (CONTRADICTS / QUESTIONS)
    and nodes the author marked unresolved. Corpus-wide."""
    auth.require_scope("read")
    _audit("list_open_threads")
    threads = await canon_service.open_threads(get_db(), limit=min(limit, 100))
    return threads.model_dump(mode="json")


class _TransportMount:
    """Stable ASGI target for the /mcp mount.

    The streamable-HTTP session manager can only be run once per instance,
    but the FastAPI app object (and its mounts) is created once per process
    while the lifespan may run repeatedly (tests). So the mount stays fixed
    and the transport app inside it is rebuilt by `start_transport()` on
    every lifespan startup.
    """

    def __init__(self) -> None:
        self.inner = None

    async def __call__(self, scope, receive, send) -> None:
        if self.inner is None:
            await send(
                {
                    "type": "http.response.start",
                    "status": 503,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": b'{"error": {"code": "INTERNAL_ERROR", '
                    b'"message": "MCP transport not started", "retryable": true}}',
                }
            )
            return
        await self.inner(scope, receive, send)


_transport_mount = _TransportMount()


def build_mcp_asgi_app():
    """The mounted /mcp ASGI app: bearer auth wrapping the (lazily started)
    streamable HTTP transport."""
    return auth.BearerAuthMiddleware(_transport_mount)


def start_transport():
    """Build a fresh transport app + session manager for one lifespan run;
    returns the session manager (caller runs its `.run()` context).

    stateless_http + json_response keep the transport simple for
    single-user local use; DNS-rebinding host validation is disabled because
    the deployment story is localhost/Tailscale behind our own token auth.
    """
    _transport_mount.inner = mcp_server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        ),
    )
    return mcp_server.session_manager


# Controlled write tools (Phase C5, ADR-090) register themselves against
# `mcp_server`; imported last so the instance exists.
from app.mcp import write as _write_tools  # noqa: E402, F401
