"""Tests for the project workspace routes — Phase 9 Slice 0.

Covers project promotion (existing structure note + new structure note flows),
list, detail, scope read/patch, draft upsert/delete, and session lifecycle.
"""


def _create_structure(client, title: str = "MOC") -> str:
    r = client.post("/api/v1/nodes/structure", json={"title": title, "content": "overview"})
    assert r.status_code == 201
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Create / promote
# ---------------------------------------------------------------------------


def test_list_projects_empty(client):
    r = client.get("/api/v1/projects")
    assert r.status_code == 200
    assert r.json() == []


def test_create_project_promotes_existing_structure(client):
    node_id = _create_structure(client)
    r = client.post("/api/v1/projects", json={"hub_node_id": node_id, "mode": "research"})
    assert r.status_code == 201
    body = r.json()
    assert body["hub"]["id"] == node_id
    assert body["scope"]["hub_node_id"] == node_id
    assert body["scope"]["mode"] == "research"
    assert body["scope"]["pinned_node_ids"] == []
    assert body["scope"]["tag_ids"] == []
    assert body["active_session"] is None


def test_create_project_with_title_creates_structure(client):
    r = client.post(
        "/api/v1/projects",
        json={"title": "Fire Stoker", "content": "novel", "mode": "narrative"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["hub"]["title"] == "Fire Stoker"
    assert body["hub"]["type"] == "structure"
    assert body["scope"]["mode"] == "narrative"


def test_create_project_rejects_both_title_and_hub_id(client):
    node_id = _create_structure(client)
    r = client.post(
        "/api/v1/projects",
        json={"hub_node_id": node_id, "title": "X"},
    )
    assert r.status_code == 422


def test_create_project_rejects_neither_title_nor_hub_id(client):
    r = client.post("/api/v1/projects", json={"mode": "research"})
    assert r.status_code == 422


def test_create_project_rejects_non_structure(client):
    r = client.post("/api/v1/nodes/permanent", json={"title": "P", "content": "x"})
    node_id = r.json()["id"]
    r = client.post("/api/v1/projects", json={"hub_node_id": node_id})
    assert r.status_code == 422


def test_create_project_rejects_missing_node(client):
    r = client.post("/api/v1/projects", json={"hub_node_id": "ghost"})
    assert r.status_code == 404


def test_create_project_rejects_already_a_project(client):
    node_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": node_id})
    r = client.post("/api/v1/projects", json={"hub_node_id": node_id})
    assert r.status_code == 409


def test_create_project_default_mode_is_research(client):
    node_id = _create_structure(client)
    r = client.post("/api/v1/projects", json={"hub_node_id": node_id})
    assert r.status_code == 201
    assert r.json()["scope"]["mode"] == "research"


def test_create_project_invalid_mode_rejected(client):
    node_id = _create_structure(client)
    r = client.post("/api/v1/projects", json={"hub_node_id": node_id, "mode": "bogus"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# List + detail
# ---------------------------------------------------------------------------


def test_list_projects_shows_promoted_hubs(client):
    a = _create_structure(client, "A")
    b = _create_structure(client, "B")
    client.post("/api/v1/projects", json={"hub_node_id": a, "mode": "research"})
    client.post("/api/v1/projects", json={"hub_node_id": b, "mode": "narrative"})

    r = client.get("/api/v1/projects")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    titles = {item["hub"]["title"] for item in items}
    assert titles == {"A", "B"}
    for item in items:
        assert item["note_count"] == 0
        assert item["has_active_session"] is False


def test_list_projects_excludes_soft_deleted_hubs(client):
    hub_id = _create_structure(client, "Doomed")
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    client.delete(f"/api/v1/nodes/{hub_id}")
    r = client.get("/api/v1/projects")
    assert r.json() == []


def test_get_project_detail(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.get(f"/api/v1/projects/{hub_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["hub"]["id"] == hub_id
    assert body["scope"]["hub_node_id"] == hub_id


def test_get_project_unknown_returns_404(client):
    assert client.get("/api/v1/projects/ghost").status_code == 404


def test_get_project_on_non_project_node_returns_404(client):
    hub_id = _create_structure(client)
    # not promoted
    assert client.get(f"/api/v1/projects/{hub_id}").status_code == 404


# ---------------------------------------------------------------------------
# Scope
# ---------------------------------------------------------------------------


def test_get_scope(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.get(f"/api/v1/projects/{hub_id}/scope")
    assert r.status_code == 200
    assert r.json()["pinned_node_ids"] == []


def test_patch_scope_updates_pinned_nodes_and_tags(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    note_id = client.post("/api/v1/nodes/permanent", json={"title": "P", "content": "x"}).json()[
        "id"
    ]

    r = client.patch(
        f"/api/v1/projects/{hub_id}/scope",
        json={
            "pinned_node_ids": [note_id],
            "tag_ids": ["tag-1"],
            "briefing_prompt": "Resume me",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pinned_node_ids"] == [note_id]
    assert body["tag_ids"] == ["tag-1"]
    assert body["briefing_prompt"] == "Resume me"


def test_patch_scope_partial_update_leaves_other_fields(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id, "mode": "narrative"})
    client.patch(
        f"/api/v1/projects/{hub_id}/scope",
        json={"briefing_prompt": "First"},
    )
    r = client.patch(
        f"/api/v1/projects/{hub_id}/scope",
        json={"pinned_node_ids": ["n1"]},
    )
    body = r.json()
    assert body["briefing_prompt"] == "First"
    assert body["pinned_node_ids"] == ["n1"]
    assert body["mode"] == "narrative"


def test_patch_scope_clears_briefing_prompt_with_null(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    client.patch(f"/api/v1/projects/{hub_id}/scope", json={"briefing_prompt": "Old"})
    r = client.patch(f"/api/v1/projects/{hub_id}/scope", json={"briefing_prompt": None})
    assert r.json()["briefing_prompt"] is None


def test_patch_scope_mode_change(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.patch(f"/api/v1/projects/{hub_id}/scope", json={"mode": "learning"})
    assert r.json()["mode"] == "learning"


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------


def test_get_draft_returns_empty_when_absent(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.get(f"/api/v1/projects/{hub_id}/draft")
    assert r.status_code == 200
    assert r.json()["content"] == ""


def test_put_draft_upserts(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.put(f"/api/v1/projects/{hub_id}/draft", json={"content": "Hello world"})
    assert r.status_code == 200
    assert r.json()["content"] == "Hello world"

    r = client.put(f"/api/v1/projects/{hub_id}/draft", json={"content": "Updated"})
    assert r.json()["content"] == "Updated"
    # Same fetch returns updated
    assert client.get(f"/api/v1/projects/{hub_id}/draft").json()["content"] == "Updated"


def test_delete_draft(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    client.put(f"/api/v1/projects/{hub_id}/draft", json={"content": "x"})
    r = client.delete(f"/api/v1/projects/{hub_id}/draft")
    assert r.status_code == 204
    assert client.get(f"/api/v1/projects/{hub_id}/draft").json()["content"] == ""


def test_draft_requires_project(client):
    # Not a real project
    r = client.put("/api/v1/projects/ghost/draft", json={"content": "x"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Work sessions
# ---------------------------------------------------------------------------


def test_start_session(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "Try out the new API"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "active"
    assert body["intent"] == "Try out the new API"
    assert body["closed_at"] is None


def test_active_session_appears_in_detail(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    sess = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "x"},
    ).json()
    detail = client.get(f"/api/v1/projects/{hub_id}").json()
    assert detail["active_session"]["id"] == sess["id"]


def test_active_session_shown_in_list(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "x"},
    )
    items = client.get("/api/v1/projects").json()
    assert items[0]["has_active_session"] is True


def test_only_one_active_session_per_project(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r1 = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "first"},
    )
    assert r1.status_code == 201
    r2 = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "second"},
    )
    assert r2.status_code == 409


def test_session_intent_required(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    r = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": ""},
    )
    assert r.status_code == 422


def test_patch_session_progress_notes(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    sess = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "x"},
    ).json()
    r = client.patch(
        f"/api/v1/projects/{hub_id}/sessions/{sess['id']}",
        json={"progress_notes": "Got the endpoint working"},
    )
    assert r.status_code == 200
    assert r.json()["progress_notes"] == "Got the endpoint working"
    assert r.json()["status"] == "active"


def test_patch_session_close(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    sess = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "x"},
    ).json()
    r = client.patch(
        f"/api/v1/projects/{hub_id}/sessions/{sess['id']}",
        json={
            "close": True,
            "closing_notes": "Done",
            "next_session_intent": "Pick up tomorrow",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body["closing_notes"] == "Done"
    assert body["next_session_intent"] == "Pick up tomorrow"
    assert body["closed_at"] is not None
    assert body["duration_seconds"] is not None
    assert body["duration_seconds"] >= 0


def test_patch_session_close_with_explicit_status(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    sess = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "x"},
    ).json()
    r = client.patch(
        f"/api/v1/projects/{hub_id}/sessions/{sess['id']}",
        json={"close": True, "status": "blocked"},
    )
    assert r.json()["status"] == "blocked"
    assert r.json()["closed_at"] is not None


def test_can_start_new_session_after_close(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    s1 = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "first"},
    ).json()
    client.patch(
        f"/api/v1/projects/{hub_id}/sessions/{s1['id']}",
        json={"close": True},
    )
    r = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "narrative", "intent": "second"},
    )
    assert r.status_code == 201
    assert r.json()["mode"] == "narrative"


def test_list_sessions_in_descending_order(client):
    hub_id = _create_structure(client)
    client.post("/api/v1/projects", json={"hub_node_id": hub_id})
    s1 = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "research", "intent": "first"},
    ).json()
    client.patch(
        f"/api/v1/projects/{hub_id}/sessions/{s1['id']}",
        json={"close": True},
    )
    s2 = client.post(
        f"/api/v1/projects/{hub_id}/sessions",
        json={"mode": "narrative", "intent": "second"},
    ).json()
    r = client.get(f"/api/v1/projects/{hub_id}/sessions")
    items = r.json()
    assert len(items) == 2
    assert items[0]["id"] == s2["id"]
    assert items[1]["id"] == s1["id"]


def test_patch_session_wrong_project_404(client):
    a = _create_structure(client, "A")
    b = _create_structure(client, "B")
    client.post("/api/v1/projects", json={"hub_node_id": a})
    client.post("/api/v1/projects", json={"hub_node_id": b})
    sess = client.post(
        f"/api/v1/projects/{a}/sessions",
        json={"mode": "research", "intent": "x"},
    ).json()
    r = client.patch(
        f"/api/v1/projects/{b}/sessions/{sess['id']}",
        json={"progress_notes": "x"},
    )
    assert r.status_code == 404
