"""Phase C5 — controlled MCP write tools (AT-021/022/023, AT-002) and the
Track C milestone loop: proposal created over MCP → reviewed over HTTP →
resolution visible to a second MCP client via recent changes."""

import pytest

import app.core.lifespan as lsp
from app.mcp import auth
from app.mcp.auth import ClientIdentity, ScopeDenied
from app.repositories import edge_repo, node_repo, proposal_repo
from tests.conftest import FakeEmbeddingProvider

WRITER = ClientIdentity(client_name="WriterClient", scopes=frozenset({"read", "write"}))
READER = ClientIdentity(client_name="ReaderClient", scopes=frozenset({"read"}))
DECIDER = ClientIdentity(
    client_name="DeciderClient", scopes=frozenset({"read", "write", "decisions"})
)


@pytest.fixture
async def mcp_write_env(db, monkeypatch):
    monkeypatch.setattr(lsp, "_db", db)
    monkeypatch.setattr(lsp, "_embedding_provider", FakeEmbeddingProvider())
    token = auth.current_client.set(WRITER)
    yield db
    auth.current_client.reset(token)


async def test_create_story_proposal_records_provenance_and_event(
    mcp_write_env, story_project
):
    """AT-001/AT-022 over MCP: proposal lands as 'proposed' with client
    provenance bound from the token identity."""
    from app.mcp import write

    result = await write.create_story_proposal(
        story_project["hub"],
        "development_note",
        "An idea from the conversation",
        summary="Summary",
        conversation_id="conv-99",
    )
    assert result["status"] == "proposed"
    assert result["source_provenance"]["client_name"] == "WriterClient"
    assert result["source_provenance"]["source_conversation_id"] == "conv-99"

    from app.services import activity_service

    changes = await activity_service.recent_changes(
        mcp_write_env, project_hub_id=story_project["hub"]
    )
    assert any(
        e.event_type == "proposal.created" and e.object_id == result["id"]
        for e in changes.events
    )


async def test_write_denied_for_read_only_client_and_nothing_created(
    mcp_write_env, story_project
):
    """AT-021: denial leaves no proposal and no activity event."""
    from app.mcp import write
    from app.repositories import activity_repo

    before_props = await proposal_repo.list_proposals(mcp_write_env)
    before_events = await activity_repo.list_recent(mcp_write_env, limit=200)

    token = auth.current_client.set(READER)
    try:
        with pytest.raises(ScopeDenied):
            await write.create_story_proposal(
                story_project["hub"], "general", "Should not exist"
            )
    finally:
        auth.current_client.reset(token)

    assert len(await proposal_repo.list_proposals(mcp_write_env)) == len(before_props)
    assert len(await activity_repo.list_recent(mcp_write_env, limit=200)) == len(
        before_events
    )


async def test_no_mcp_tool_can_accept(mcp_write_env):
    """AT-023: acceptance is not in the MCP tool surface at all."""
    from app.mcp.server import mcp_server

    tools = {t.name for t in await mcp_server.list_tools()}
    assert "transition_proposal" not in tools
    assert not any("accept" in name for name in tools)


async def test_update_proposal_appends_revision_not_status(mcp_write_env, story_project):
    from app.mcp import write

    updated = await write.update_proposal(
        story_project["proposed_scene"],
        title="Sharpened title",
        change_summary="via MCP",
    )
    assert updated["title"] == "Sharpened title"
    assert updated["status"] == "proposed"  # edits never move status
    assert [r["revision_number"] for r in updated["revisions"]] == [1, 2]


async def test_link_proposal_adds_payload_links_but_no_edges(
    mcp_write_env, story_project
):
    """AT-002: proposed links never appear as real edges."""
    from app.mcp import write

    edges_before = await edge_repo.count(mcp_write_env)
    updated = await write.link_proposal_to_objects(
        story_project["proposed_scene"],
        [{"object_id": story_project["theme"], "relationship_type": "ELABORATES"}],
    )
    related_ids = {r["object_id"] for r in updated["related_objects"]}
    assert story_project["theme"] in related_ids
    assert await edge_repo.count(mcp_write_env) == edges_before


async def test_create_development_note_lands_speculative(mcp_write_env, story_project):
    """D5/ADR-090: dev notes are real nodes, clearly speculative, linked."""
    from app.mcp import write

    result = await write.create_development_note(
        story_project["hub"],
        "Vincent's cadence",
        "He speaks in liturgical rhythm when cornered.",
        note_type="voice",
        related_objects=[{"object_id": story_project["vincent"]}],
    )
    node = await node_repo.get_by_id(mcp_write_env, result["id"])
    assert node is not None
    assert node.canon_status == "speculative"
    neighbors = await edge_repo.get_neighbors(mcp_write_env, node.id)
    assert any(
        n.node.id == story_project["vincent"] and n.edge_type == "ELABORATES"
        for n in neighbors
    )


async def test_record_story_decision_needs_decisions_scope(
    mcp_write_env, story_project
):
    from app.mcp import write

    with pytest.raises(ScopeDenied):  # writer lacks 'decisions'
        await write.record_story_decision(story_project["hub"], "A decision")

    token = auth.current_client.set(DECIDER)
    try:
        decision = await write.record_story_decision(
            story_project["hub"],
            "The chapel burns in act three",
            rationale="Approved by the user in conversation",
        )
        assert decision["status"] == "accepted"
        assert decision["provenance"]["client_name"] == "DeciderClient"
    finally:
        auth.current_client.reset(token)


# ---------------------------------------------------------------------------
# The Track C milestone, end to end over the real transports
# ---------------------------------------------------------------------------


def _rpc(client, token: str, method: str, params: dict | None = None, id_: int = 1):
    body: dict = {"jsonrpc": "2.0", "id": id_, "method": method}
    if params is not None:
        body["params"] = params
    return client.post(
        "/mcp/",
        json=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {token}",
        },
    )


def _call_tool(client, token: str, name: str, arguments: dict) -> dict:
    r = _rpc(
        client,
        token,
        "tools/call",
        {"name": name, "arguments": arguments},
        id_=7,
    )
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    assert not result.get("isError"), result
    import json as _json

    return _json.loads(result["content"][0]["text"])


def test_milestone_full_collaboration_loop(client, monkeypatch):
    """Direction pack definition of done: from an MCP conversation, create a
    proposed scene connected to existing story objects, review it in
    Constellation, and retrieve the accepted result from another client."""
    import app.core.config as cfg

    monkeypatch.setenv(
        "MCP_TOKENS",
        "tok-a|Client A|read+write,tok-b|Client B|read",
    )
    cfg.get_settings.cache_clear()
    try:
        # Existing story state, via the normal app.
        hub = client.post(
            "/api/v1/projects", json={"title": "Fire Stoker", "mode": "narrative"}
        ).json()["hub"]["id"]
        michael = client.post(
            "/api/v1/nodes/permanent",
            json={"title": "Michael", "content": "Protagonist."},
        ).json()["id"]

        # Client B snapshots a cursor BEFORE Client A writes.
        before = _call_tool(
            client, "tok-b", "get_recent_changes", {"project_id": hub}
        )
        cursor = before["next_cursor"] or 0

        # 1) Client A proposes a scene over MCP, linked to Michael.
        proposal = _call_tool(
            client,
            "tok-a",
            "create_story_proposal",
            {
                "project_id": hub,
                "proposal_type": "scene",
                "title": "Michael confronts Vincent",
                "summary": "Proposed scene",
                "payload": {"content": "Draft.", "story_time": "Year 3"},
                "related_objects": [
                    {
                        "object_id": michael,
                        "relationship_type": "COLLECTS",
                        "direction": "incoming",
                    }
                ],
                "conversation_id": "conv-loop",
            },
        )
        assert proposal["status"] == "proposed"

        # 2) It appears in the review inbox with provenance.
        inbox = client.get(
            f"/api/v1/proposals?project_hub_id={hub}&status=proposed"
        ).json()
        assert [p["id"] for p in inbox] == [proposal["id"]]
        assert inbox[0]["source_client_name"] == "Client A"

        # 3) The user edits, then accepts, in the app.
        client.patch(
            f"/api/v1/proposals/{proposal['id']}",
            json={"title": "Michael confronts Vincent (edited)"},
        )
        accept = client.post(
            f"/api/v1/proposals/{proposal['id']}/transition",
            json={"to_status": "accepted", "resolution_note": "yes"},
        ).json()
        node_id = accept["created_node_id"]
        assert node_id is not None

        # 4) Client B retrieves the resolution through recent changes and
        #    sees the accepted state through the dossier.
        after = _call_tool(
            client,
            "tok-b",
            "get_recent_changes",
            {"project_id": hub, "after": cursor},
        )
        events = {e["event_type"] for e in after["events"]}
        assert "proposal.created" in events
        assert "proposal.accepted" in events

        dossier = _call_tool(
            client,
            "tok-b",
            "get_character_dossier",
            {"project_id": hub, "character_id": michael},
        )
        assert node_id in {
            a["event"]["id"] for a in dossier["accepted"]["scene_appearances"]
        }
        # AT-021 transport-level: Client B (read-only) cannot write.
        r = _rpc(
            client,
            "tok-b",
            "tools/call",
            {
                "name": "create_story_proposal",
                "arguments": {
                    "project_id": hub,
                    "proposal_type": "general",
                    "title": "nope",
                },
            },
        )
        assert r.status_code == 200
        assert r.json()["result"]["isError"] is True
    finally:
        cfg.get_settings.cache_clear()
