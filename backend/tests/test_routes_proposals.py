"""Phase C1 — proposal/decision/recent-changes routes, end to end.

API-layer coverage of the direction pack acceptance tests: AT-001 (create),
AT-003 (review + accept), AT-004 (reject), AT-024 (cross-client cursor),
plus the structured error envelope and request validation.
"""

AI_PROVENANCE = {
    "actor_type": "ai_client",
    "client_type": "mcp",
    "client_name": "ChatGPT",
    "source_conversation_id": "conv-42",
}


def _make_hub(client) -> str:
    r = client.post(
        "/api/v1/projects", json={"title": "Fire Stoker", "mode": "narrative"}
    )
    assert r.status_code == 201
    return r.json()["hub"]["id"]


def _make_proposal(client, hub_id: str, **overrides) -> dict:
    body = {
        "project_hub_id": hub_id,
        "proposal_type": "scene",
        "title": "Michael confronts Vincent",
        "summary": "A proposed scene exploring sincerity.",
        "payload": {"content": "Scene draft text.", "story_time": "Year 3"},
        "provenance": AI_PROVENANCE,
        **overrides,
    }
    r = client.post("/api/v1/proposals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_proposal_records_status_provenance_event(client):
    """AT-001."""
    hub = _make_hub(client)
    proposal = _make_proposal(client, hub)
    assert proposal["status"] == "proposed"
    assert proposal["source_provenance"]["client_name"] == "ChatGPT"
    assert len(proposal["revisions"]) == 1

    changes = client.get(f"/api/v1/activity/changes?project_hub_id={hub}").json()
    assert any(
        e["event_type"] == "proposal.created" and e["object_id"] == proposal["id"]
        for e in changes["events"]
    )


def test_create_proposal_unknown_hub_is_structured_404(client):
    r = client.post(
        "/api/v1/proposals",
        json={
            "project_hub_id": "ghost",
            "proposal_type": "general",
            "title": "x",
            "provenance": AI_PROVENANCE,
        },
    )
    assert r.status_code == 404
    body = r.json()
    assert body["error"]["code"] == "PROJECT_NOT_FOUND"
    assert body["error"]["retryable"] is False


def test_inbox_listing_filters(client):
    hub = _make_hub(client)
    _make_proposal(client, hub)
    _make_proposal(client, hub, proposal_type="development_note", title="Note idea")

    all_open = client.get(
        f"/api/v1/proposals?project_hub_id={hub}&status=proposed"
    ).json()
    assert len(all_open) == 2
    assert all(p["source_client_name"] == "ChatGPT" for p in all_open)

    scenes = client.get(
        f"/api/v1/proposals?project_hub_id={hub}&proposal_type=scene"
    ).json()
    assert [p["proposal_type"] for p in scenes] == ["scene"]


def test_edit_then_accept_uses_edited_version(client):
    """AT-032 + AT-003: user edits, accepts; both revisions queryable and the
    accepted node reflects the edit."""
    hub = _make_hub(client)
    proposal = _make_proposal(client, hub)
    pid = proposal["id"]

    r = client.patch(
        f"/api/v1/proposals/{pid}",
        json={
            "title": "Michael confronts Vincent (edited)",
            "payload": {"content": "Edited draft.", "story_time": "Year 3"},
            "change_summary": "sharpened objective",
        },
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Michael confronts Vincent (edited)"

    r = client.post(
        f"/api/v1/proposals/{pid}/transition",
        json={"to_status": "accepted", "resolution_note": "good to go"},
    )
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["proposal"]["status"] == "accepted"
    node_id = result["created_node_id"]
    assert node_id is not None

    node = client.get(f"/api/v1/nodes/{node_id}").json()
    assert node["title"] == "Michael confronts Vincent (edited)"
    assert node["content"] == "Edited draft."
    assert node["canon_status"] == "provisional"
    assert node["is_story_event"] is True

    revisions = client.get(f"/api/v1/proposals/{pid}/revisions").json()
    assert [rev["revision_number"] for rev in revisions] == [1, 2]
    assert revisions[0]["title"] == "Michael confronts Vincent"


def test_reject_keeps_proposal_queryable_and_no_node(client):
    """AT-004."""
    hub = _make_hub(client)
    pid = _make_proposal(client, hub)["id"]
    r = client.post(
        f"/api/v1/proposals/{pid}/transition",
        json={"to_status": "rejected", "resolution_note": "not this direction"},
    )
    assert r.status_code == 200
    assert r.json()["created_node_id"] is None

    detail = client.get(f"/api/v1/proposals/{pid}").json()
    assert detail["status"] == "rejected"
    assert detail["resolution_note"] == "not this direction"
    assert detail["accepted_node_id"] is None


def test_invalid_transition_is_structured_409(client):
    hub = _make_hub(client)
    pid = _make_proposal(client, hub)["id"]
    client.post(f"/api/v1/proposals/{pid}/transition", json={"to_status": "rejected"})
    r = client.post(f"/api/v1/proposals/{pid}/transition", json={"to_status": "accepted"})
    assert r.status_code == 409
    body = r.json()
    assert body["error"]["code"] == "INVALID_STATUS_TRANSITION"
    assert body["error"]["details"] == {"from_status": "rejected", "to_status": "accepted"}


def test_recent_changes_cross_client_cursor(client):
    """AT-024: Client B, holding a cursor from before Client A's write, sees
    the proposal-created event with actor provenance."""
    hub = _make_hub(client)
    before = client.get(f"/api/v1/activity/changes?project_hub_id={hub}").json()
    cursor = before["next_cursor"] or 0

    pid = _make_proposal(client, hub)["id"]

    after = client.get(
        f"/api/v1/activity/changes?project_hub_id={hub}&after={cursor}"
    ).json()
    created = [e for e in after["events"] if e["object_id"] == pid]
    assert created and created[0]["event_type"] == "proposal.created"
    assert created[0]["provenance"]["client_name"] == "ChatGPT"


def test_decisions_roundtrip_and_supersession(client):
    """AT-005 at the API layer."""
    hub = _make_hub(client)
    r = client.post(
        "/api/v1/decisions",
        json={
            "project_hub_id": hub,
            "statement": "Vincent is sincere",
            "provenance": {"actor_type": "human"},
        },
    )
    assert r.status_code == 201
    first_id = r.json()["id"]

    r = client.post(
        "/api/v1/decisions",
        json={
            "project_hub_id": hub,
            "statement": "Vincent is sincere but self-deceived",
            "supersedes_decision_id": first_id,
            "provenance": {"actor_type": "human"},
        },
    )
    assert r.status_code == 201
    second_id = r.json()["id"]

    old = client.get(f"/api/v1/decisions/{first_id}").json()
    assert old["status"] == "superseded"
    assert old["superseded_by_decision_id"] == second_id

    current = client.get(
        f"/api/v1/decisions?project_hub_id={hub}&status=accepted"
    ).json()
    assert [d["id"] for d in current] == [second_id]


def test_node_and_edge_writes_emit_events(client):
    """Existing write paths now feed the event log (ADR-085)."""
    r = client.post("/api/v1/nodes/fleeting", json={"title": "quick", "content": "note"})
    node_id = r.json()["id"]
    changes = client.get("/api/v1/activity/changes").json()
    assert any(
        e["event_type"] == "node.created" and e["object_id"] == node_id
        for e in changes["events"]
    )
