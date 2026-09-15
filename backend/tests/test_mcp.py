"""Phase C4 — MCP read surface: auth, scopes, tool delegation, layering.

Tool functions are tested directly (they are plain async functions; the
@tool decorator returns the original callable) with the module-level db /
provider getters pointed at the test fixtures. Transport-level behavior
(auth middleware, endpoint enablement) is tested over HTTP via the client
fixture.
"""

from pathlib import Path

import pytest

import app.core.lifespan as lsp
from app.mcp import auth
from app.mcp.auth import ClientIdentity, ScopeDenied, parse_token_map
from tests.conftest import FakeEmbeddingProvider

READ_IDENTITY = ClientIdentity(client_name="TestReader", scopes=frozenset({"read"}))
NO_SCOPE_IDENTITY = ClientIdentity(client_name="NoScopes", scopes=frozenset())


@pytest.fixture
async def mcp_env(db, monkeypatch):
    """Point the MCP tools' module-level accessors at the test db/provider
    and authenticate as a read-scoped client."""
    monkeypatch.setattr(lsp, "_db", db)
    monkeypatch.setattr(lsp, "_embedding_provider", FakeEmbeddingProvider())
    token = auth.current_client.set(READ_IDENTITY)
    yield db
    auth.current_client.reset(token)


# ---------------------------------------------------------------------------
# Token parsing + scope checks
# ---------------------------------------------------------------------------


def test_parse_token_map():
    tokens = parse_token_map("abc|ChatGPT|read, def|Claude Code|read+write")
    assert tokens["abc"].client_name == "ChatGPT"
    assert tokens["abc"].scopes == {"read"}
    assert tokens["def"].scopes == {"read", "write"}
    assert parse_token_map("") == {}


def test_parse_token_map_rejects_malformed():
    with pytest.raises(ValueError):
        parse_token_map("just-a-token")
    with pytest.raises(ValueError):
        parse_token_map("|noname|read")


def test_require_scope_denies_without_scope():
    token = auth.current_client.set(NO_SCOPE_IDENTITY)
    try:
        with pytest.raises(ScopeDenied):
            auth.require_scope("read")
    finally:
        auth.current_client.reset(token)


def test_require_scope_denies_unauthenticated():
    assert auth.current_client.get() is None
    with pytest.raises(ScopeDenied):
        auth.require_scope("read")


# ---------------------------------------------------------------------------
# Tools delegate to services (AT-020 parity)
# ---------------------------------------------------------------------------


async def test_get_server_info_reports_actor(mcp_env):
    from app.mcp import server

    info = await server.get_server_info()
    assert info["server_name"] == "constellation"
    assert info["actor"]["client_name"] == "TestReader"
    assert "search_story" in info["capabilities"]["read"]
    assert info["capabilities"]["write"] == []


async def test_list_projects_tool(mcp_env, story_project):
    from app.mcp import server

    projects = await server.list_projects()
    assert [p["hub"]["id"] for p in projects] == [story_project["hub"]]


async def test_scene_context_parity_with_service(mcp_env, story_project):
    """AT-020: the MCP tool returns the same authoritative state as the
    internal application service."""
    from app.mcp import server
    from app.services import context_builder_service

    via_tool = await server.get_scene_context(
        story_project["hub"], story_project["scene2"]
    )
    via_service = await context_builder_service.build_scene_context(
        mcp_env, story_project["hub"], story_project["scene2"]
    )
    service_dump = via_service.model_dump(mode="json")
    assert via_tool["scene"]["event"] == service_dump["scene"]["event"]
    assert via_tool["scene"]["items"] == service_dump["scene"]["items"]
    assert via_tool["context_version"] == service_dump["context_version"]


async def test_character_dossier_tool_separates_sections(mcp_env, story_project):
    from app.mcp import server

    dossier = await server.get_character_dossier(
        story_project["hub"], story_project["michael"]
    )
    assert dossier["context_type"] == "character_dossier"
    assert {a["event"]["id"] for a in dossier["accepted"]["scene_appearances"]} == {
        story_project["scene1"],
        story_project["scene2"],
    }
    assert story_project["proposed_scene"] in {
        p["id"] for p in dossier["proposed"]["proposals"]
    }


async def test_recent_changes_tool_cursor(mcp_env, story_project):
    from app.mcp import server

    first = await server.get_recent_changes(story_project["hub"])
    assert first["events"]
    again = await server.get_recent_changes(
        story_project["hub"], after=first["next_cursor"]
    )
    assert again["events"] == []


async def test_search_story_validates_project(mcp_env, story_project):
    from app.mcp import server

    result = await server.search_story("Vincent", project_id=story_project["hub"])
    assert "results" in result and result["warnings"]
    with pytest.raises(ValueError):
        await server.search_story("Vincent", project_id="ghost")


async def test_tools_deny_without_read_scope(mcp_env):
    from app.mcp import server

    token = auth.current_client.set(NO_SCOPE_IDENTITY)
    try:
        with pytest.raises(ScopeDenied):
            await server.list_projects()
    finally:
        auth.current_client.reset(token)


# ---------------------------------------------------------------------------
# Layering: no SQL in the adapter (direction pack ADR-003)
# ---------------------------------------------------------------------------


def test_mcp_package_contains_no_sql():
    mcp_dir = Path(__file__).parent.parent / "app" / "mcp"
    for path in mcp_dir.glob("*.py"):
        source = path.read_text()
        assert "db.execute" not in source, f"{path.name} queries the DB directly"
        assert "SELECT " not in source, f"{path.name} contains raw SQL"
        assert "import aiosqlite" not in source, f"{path.name} imports aiosqlite"


# ---------------------------------------------------------------------------
# Transport-level auth (over HTTP)
# ---------------------------------------------------------------------------


def _mcp_headers(token: str | None = None) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


TOOLS_LIST_RPC = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}


def test_mcp_endpoint_disabled_without_tokens(client):
    r = client.post("/mcp/", json=TOOLS_LIST_RPC, headers=_mcp_headers())
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "PERMISSION_DENIED"


def test_mcp_endpoint_rejects_bad_token(client, monkeypatch):
    import app.core.config as cfg

    monkeypatch.setenv("MCP_TOKENS", "goodtoken|Tester|read")
    cfg.get_settings.cache_clear()
    try:
        r = client.post("/mcp/", json=TOOLS_LIST_RPC, headers=_mcp_headers("wrong"))
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    finally:
        cfg.get_settings.cache_clear()


def test_mcp_endpoint_accepts_valid_token(client, monkeypatch):
    """A valid token reaches the MCP transport (the JSON-RPC layer answers,
    the auth layer no longer blocks)."""
    import app.core.config as cfg

    monkeypatch.setenv("MCP_TOKENS", "goodtoken|Tester|read")
    cfg.get_settings.cache_clear()
    try:
        r = client.post(
            "/mcp/", json=TOOLS_LIST_RPC, headers=_mcp_headers("goodtoken")
        )
        assert r.status_code != 401
        assert r.status_code != 403
    finally:
        cfg.get_settings.cache_clear()


def test_mcp_rate_limit(client, monkeypatch):
    import app.core.config as cfg

    monkeypatch.setenv("MCP_TOKENS", "limited|Tester|read")
    monkeypatch.setenv("MCP_RATE_LIMIT_PER_MINUTE", "3")
    cfg.get_settings.cache_clear()
    try:
        statuses = [
            client.post(
                "/mcp/", json=TOOLS_LIST_RPC, headers=_mcp_headers("limited")
            ).status_code
            for _ in range(5)
        ]
        assert 429 in statuses
    finally:
        cfg.get_settings.cache_clear()
