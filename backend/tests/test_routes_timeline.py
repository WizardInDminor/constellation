"""Tests for the Phase 9 Slice 4 narrative timeline endpoints.

Covers:
- POST /nodes/story-event (event creation + auto-COLLECTS + auto-FOLLOWS_FROM)
- PATCH /nodes/{id}/timeline-position (reorder + FOLLOWS_FROM rewire)
- GET /projects/{hub_id}/timeline (lazy default-timeline + lane shape)
- POST /projects/{hub_id}/act-spans (act span CRUD)
- Notes /nodes hide_story_events filter (ADR-064)
- EXPLAINS edge type accepted by /edges
"""


def _create_structure(client, title: str = "MOC") -> str:
    r = client.post(
        "/api/v1/nodes/structure",
        json={"title": title, "content": "overview"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_project(client, title: str = "P", mode: str = "narrative") -> str:
    r = client.post(
        "/api/v1/projects",
        json={"title": title, "content": "", "mode": mode},
    )
    assert r.status_code == 201, r.text
    return r.json()["hub"]["id"]


# ---------------------------------------------------------------------------
# GET /projects/{hub_id}/timeline — lazy default creation
# ---------------------------------------------------------------------------


def test_get_timeline_lazy_creates_default(client):
    hub = _create_project(client, "Fire Stoker")
    r = client.get(f"/api/v1/projects/{hub}/timeline")
    assert r.status_code == 200
    lanes = r.json()["lanes"]
    assert len(lanes) == 1
    assert "Fire Stoker" in lanes[0]["timeline"]["title"]
    assert lanes[0]["events"] == []
    assert lanes[0]["act_spans"] == []


def test_get_timeline_idempotent_default(client):
    hub = _create_project(client, "X")
    r1 = client.get(f"/api/v1/projects/{hub}/timeline")
    r2 = client.get(f"/api/v1/projects/{hub}/timeline")
    assert r1.json()["lanes"][0]["timeline"]["id"] == r2.json()["lanes"][0]["timeline"]["id"]
    assert len(r2.json()["lanes"]) == 1


def test_get_timeline_unknown_project(client):
    assert client.get("/api/v1/projects/ghost/timeline").status_code == 404


# ---------------------------------------------------------------------------
# POST /nodes/story-event — placement + COLLECTS + FOLLOWS_FROM auto
# ---------------------------------------------------------------------------


def test_create_story_event_basic(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]

    r = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "Harbor arrival",
            "content": "Michael arrives in fog.",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
            "story_time": "Act 1 Scene 1",
            "prose_status": "draft",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["is_story_event"] is True
    assert body["story_time"] == "Act 1 Scene 1"
    assert body["prose_status"] == "draft"
    # Should have an incoming COLLECTS from the timeline
    incoming_types = {e["type"] for e in body["incoming_edges"]}
    assert "COLLECTS" in incoming_types


def test_create_story_event_rejects_non_structure_timeline(client):
    perm = client.post("/api/v1/nodes/permanent", json={"title": "p", "content": "x"}).json()["id"]
    r = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "x",
            "timeline_node_id": perm,
            "discourse_position": 100,
        },
    )
    assert r.status_code == 422


def test_create_story_event_rejects_bad_prose_status(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    r = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "x",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
            "prose_status": "bogus",
        },
    )
    assert r.status_code == 422


def test_create_story_event_auto_follows_from(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]

    first = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "First",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    ).json()
    second = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "Second",
            "timeline_node_id": timeline_id,
            "discourse_position": 200,
        },
    ).json()

    # Second event should have a FOLLOWS_FROM out to First
    second_detail = client.get(f"/api/v1/nodes/{second['id']}").json()
    follows = [e for e in second_detail["outgoing_edges"] if e["type"] == "FOLLOWS_FROM"]
    assert len(follows) == 1
    assert follows[0]["neighbor"]["id"] == first["id"]


def test_create_story_event_no_follows_from_when_disabled(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "First",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    )
    second = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "Second",
            "timeline_node_id": timeline_id,
            "discourse_position": 200,
            "auto_follows_from": False,
        },
    ).json()
    follows = [e for e in second["outgoing_edges"] if e["type"] == "FOLLOWS_FROM"]
    assert follows == []


def test_timeline_returns_events_in_discourse_order(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    # Place out of order to test ORDER BY
    for title, pos in [("C", 300), ("A", 100), ("B", 200)]:
        client.post(
            "/api/v1/nodes/story-event",
            json={
                "title": title,
                "timeline_node_id": timeline_id,
                "discourse_position": pos,
            },
        )
    lane = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]
    titles = [ev["node"]["title"] for ev in lane["events"]]
    assert titles == ["A", "B", "C"]


# ---------------------------------------------------------------------------
# PATCH /nodes/{id}/timeline-position — reorder + FOLLOWS_FROM rewire
# ---------------------------------------------------------------------------


def test_timeline_position_reorder_rewires_follows_from(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    a = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "A",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    ).json()
    b = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "B",
            "timeline_node_id": timeline_id,
            "discourse_position": 200,
        },
    ).json()
    client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "C",
            "timeline_node_id": timeline_id,
            "discourse_position": 300,
        },
    )

    # Move A to between B and C (position 250)
    r = client.patch(
        f"/api/v1/nodes/{a['id']}/timeline-position",
        json={"timeline_node_id": timeline_id, "discourse_position": 250},
    )
    assert r.status_code == 200

    # Verify order is now B, A, C
    lane = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]
    assert [ev["node"]["title"] for ev in lane["events"]] == ["B", "A", "C"]

    # A's FOLLOWS_FROM should now point to B (its new predecessor)
    a_detail = client.get(f"/api/v1/nodes/{a['id']}").json()
    follows = [e for e in a_detail["outgoing_edges"] if e["type"] == "FOLLOWS_FROM"]
    # A's original FOLLOWS_FROM was empty (it was first). After move it should
    # have one — pointing to B.
    assert len(follows) == 1
    assert follows[0]["neighbor"]["id"] == b["id"]


def test_timeline_position_404_when_event_not_on_timeline(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    # A permanent node that isn't a story event
    perm = client.post("/api/v1/nodes/permanent", json={"title": "P", "content": "x"}).json()
    r = client.patch(
        f"/api/v1/nodes/{perm['id']}/timeline-position",
        json={"timeline_node_id": timeline_id, "discourse_position": 100},
    )
    assert r.status_code == 422  # is_story_event = 0 → rejected


def test_timeline_position_404_when_event_unplaced(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    other_timeline = _create_structure(client, "Other")
    event = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "x",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    ).json()
    # Try to move it on a timeline it isn't on
    r = client.patch(
        f"/api/v1/nodes/{event['id']}/timeline-position",
        json={"timeline_node_id": other_timeline, "discourse_position": 200},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /projects/{hub_id}/act-spans
# ---------------------------------------------------------------------------


def test_act_span_create(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    r = client.post(
        f"/api/v1/projects/{hub}/act-spans",
        json={
            "timeline_node_id": timeline_id,
            "label": "Act 1",
            "start_position": 0,
            "end_position": 500,
            "color": "#a97830",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["label"] == "Act 1"
    assert body["start_position"] == 0
    assert body["end_position"] == 500
    assert body["color"] == "#a97830"

    # Should appear in timeline response
    lane = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]
    assert len(lane["act_spans"]) == 1
    assert lane["act_spans"][0]["label"] == "Act 1"


def test_act_span_rejects_inverted_range(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    r = client.post(
        f"/api/v1/projects/{hub}/act-spans",
        json={
            "timeline_node_id": timeline_id,
            "label": "Bad",
            "start_position": 500,
            "end_position": 100,
        },
    )
    assert r.status_code == 422


def test_act_span_requires_label(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    r = client.post(
        f"/api/v1/projects/{hub}/act-spans",
        json={
            "timeline_node_id": timeline_id,
            "label": "",
            "start_position": 0,
            "end_position": 100,
        },
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Notes hide_story_events filter (ADR-064)
# ---------------------------------------------------------------------------


def test_hide_story_events_filter(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    # One story event and one regular permanent
    client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "Scene 1",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    )
    client.post("/api/v1/nodes/permanent", json={"title": "Regular", "content": "x"})

    # Default: both visible
    r = client.get("/api/v1/nodes?type=permanent")
    titles = {i["title"] for i in r.json()["items"]}
    assert "Scene 1" in titles
    assert "Regular" in titles

    # hide_story_events=true: only Regular
    r = client.get("/api/v1/nodes?type=permanent&hide_story_events=true")
    titles = {i["title"] for i in r.json()["items"]}
    assert "Scene 1" not in titles
    assert "Regular" in titles


def test_node_summary_exposes_is_story_event(client):
    hub = _create_project(client)
    timeline_id = client.get(f"/api/v1/projects/{hub}/timeline").json()["lanes"][0]["timeline"][
        "id"
    ]
    client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": "Event",
            "timeline_node_id": timeline_id,
            "discourse_position": 100,
        },
    )
    r = client.get("/api/v1/nodes?type=permanent")
    items = r.json()["items"]
    event = next(i for i in items if i["title"] == "Event")
    assert event["is_story_event"] is True


# ---------------------------------------------------------------------------
# EXPLAINS edge type (ADR-052 Slice 4 addendum)
# ---------------------------------------------------------------------------


def test_explains_edge_type_accepted(client):
    a = client.post("/api/v1/nodes/permanent", json={"title": "Lore", "content": "x"}).json()["id"]
    b = client.post("/api/v1/nodes/permanent", json={"title": "Char", "content": "x"}).json()["id"]
    r = client.post(
        "/api/v1/edges",
        json={"from_id": a, "to_id": b, "type": "EXPLAINS"},
    )
    assert r.status_code == 201
    assert r.json()["type"] == "EXPLAINS"


# ---------------------------------------------------------------------------
# Slice 5: POST /nodes/{id}/timeline-placement — cross-lane drag-and-drop
# ---------------------------------------------------------------------------


def _two_lanes(client):
    """Helper: a project with two lanes, returns (hub, t1, t2)."""
    hub = _create_project(client, "Cross", mode="narrative")
    t1 = client.get(
        f"/api/v1/projects/{hub}/timeline"
    ).json()["lanes"][0]["timeline"]["id"]
    t2 = client.post(
        f"/api/v1/projects/{hub}/timelines",
        json={"title": "Lane B"},
    ).json()["id"]
    return hub, t1, t2


def _make_event(client, timeline_id, title, position):
    r = client.post(
        "/api/v1/nodes/story-event",
        json={
            "title": title,
            "timeline_node_id": timeline_id,
            "discourse_position": position,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_placement_crossover_keeps_source(client):
    """Crossover (no remove): event lands on target AND stays on source."""
    hub, t1, t2 = _two_lanes(client)
    eid = _make_event(client, t1, "X", 100)

    r = client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={"timeline_node_id": t2, "discourse_position": 500},
    )
    assert r.status_code == 200

    timeline = client.get(f"/api/v1/projects/{hub}/timeline").json()
    by_lane = {ln["timeline"]["id"]: ln for ln in timeline["lanes"]}
    assert any(e["node"]["id"] == eid for e in by_lane[t1]["events"])
    assert any(e["node"]["id"] == eid for e in by_lane[t2]["events"])
    # timeline_count reflects the crossover
    target_event = next(
        e for e in by_lane[t2]["events"] if e["node"]["id"] == eid
    )
    assert target_event["timeline_count"] == 2
    assert target_event["discourse_position"] == 500


def test_placement_crossover_idempotent(client):
    """Calling placement on the same target twice doesn't duplicate."""
    hub, t1, t2 = _two_lanes(client)
    eid = _make_event(client, t1, "X", 100)
    client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={"timeline_node_id": t2, "discourse_position": 500},
    )
    # Second call updates the position
    client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={"timeline_node_id": t2, "discourse_position": 600},
    )
    timeline = client.get(f"/api/v1/projects/{hub}/timeline").json()
    by_lane = {ln["timeline"]["id"]: ln for ln in timeline["lanes"]}
    on_t2 = [e for e in by_lane[t2]["events"] if e["node"]["id"] == eid]
    assert len(on_t2) == 1
    assert on_t2[0]["discourse_position"] == 600


def test_placement_move_removes_from_source(client):
    """MOVE (remove_from set): event disappears from source, appears on target."""
    hub, t1, t2 = _two_lanes(client)
    eid = _make_event(client, t1, "X", 100)

    r = client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={
            "timeline_node_id": t2,
            "discourse_position": 500,
            "remove_from_timeline_node_id": t1,
        },
    )
    assert r.status_code == 200

    timeline = client.get(f"/api/v1/projects/{hub}/timeline").json()
    by_lane = {ln["timeline"]["id"]: ln for ln in timeline["lanes"]}
    assert not any(e["node"]["id"] == eid for e in by_lane[t1]["events"])
    assert any(e["node"]["id"] == eid for e in by_lane[t2]["events"])

    # The source-lane COLLECTS edge should be gone
    detail = client.get(f"/api/v1/nodes/{eid}").json()
    source_collects = [
        e
        for e in detail["incoming_edges"]
        if e["type"] == "COLLECTS" and e["neighbor"]["id"] == t1
    ]
    assert source_collects == []
    # Target-lane COLLECTS edge present
    target_collects = [
        e
        for e in detail["incoming_edges"]
        if e["type"] == "COLLECTS" and e["neighbor"]["id"] == t2
    ]
    assert len(target_collects) == 1


def test_placement_move_rewires_follows_from(client):
    """MOVE: outgoing FOLLOWS_FROM is rewired to the new lane's predecessor."""
    hub, t1, t2 = _two_lanes(client)
    # t2 has a predecessor (A) before the move target position
    _make_event(client, t2, "A", 100)
    eid = _make_event(client, t1, "X", 200)

    client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={
            "timeline_node_id": t2,
            "discourse_position": 200,
            "remove_from_timeline_node_id": t1,
        },
    )
    detail = client.get(f"/api/v1/nodes/{eid}").json()
    follows = [e for e in detail["outgoing_edges"] if e["type"] == "FOLLOWS_FROM"]
    # The moved event's FOLLOWS_FROM now points at A (the t2 predecessor)
    assert len(follows) == 1
    assert follows[0]["neighbor"]["title"] == "A"


def test_placement_404_when_event_not_on_source(client):
    """MOVE: source lane must actually contain the event."""
    hub, t1, t2 = _two_lanes(client)
    # Event only on t1, never on t2
    eid = _make_event(client, t1, "X", 100)
    r = client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={
            "timeline_node_id": t1,
            "discourse_position": 999,
            "remove_from_timeline_node_id": t2,  # event was never on t2
        },
    )
    assert r.status_code == 404


def test_placement_422_when_target_not_structure(client):
    hub, t1, _ = _two_lanes(client)
    eid = _make_event(client, t1, "X", 100)
    perm = client.post(
        "/api/v1/nodes/permanent", json={"title": "P", "content": "y"}
    ).json()["id"]
    r = client.post(
        f"/api/v1/nodes/{eid}/timeline-placement",
        json={"timeline_node_id": perm, "discourse_position": 100},
    )
    assert r.status_code == 422


def test_placement_422_on_non_story_event(client):
    hub, t1, t2 = _two_lanes(client)
    perm = client.post(
        "/api/v1/nodes/permanent", json={"title": "P", "content": "x"}
    ).json()["id"]
    r = client.post(
        f"/api/v1/nodes/{perm}/timeline-placement",
        json={"timeline_node_id": t2, "discourse_position": 100},
    )
    assert r.status_code == 422
