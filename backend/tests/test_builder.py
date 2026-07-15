"""Builder Pipeline Slice B0 — intake, interpretation, docs, canon promotion."""

import json

import pytest
from starlette.testclient import TestClient

VALID_BRIEF_RESPONSE = json.dumps(
    {
        "title": "The Lighthouse That Sang",
        "logline": "A retired lighthouse keeper discovers his lighthouse hums melodies "
        "that calm the sea.",
        "premise": (
            "On a remote northern coast, keeper Aldous notices the lighthouse lens "
            "resonating at dusk. The hum stills storms. When the harbor authority "
            "schedules the lighthouse for demolition, Aldous must prove the song is real."
        ),
        "format": "3-minute animated short",
        "tone": "wistful, warm",
        "themes": ["obsolescence", "listening"],
        "characters": [
            {
                "name": "Aldous",
                "role": "protagonist",
                "description": "Retired keeper, hard of hearing",
            },
            {"name": "Harbor Inspector Voss", "role": "antagonist", "description": None},
        ],
        "locations": [{"name": "The lighthouse", "description": "Basalt tower, cracked lens"}],
        "style_notes": "Hand-painted textures, long dusk palette",
        "open_questions": ["Does the sea answer back?"],
    }
)


class _FakeEmbed:
    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        return [0.0] * 1024

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1024 for _ in texts]


def _make_client(tmp_path, monkeypatch, gen_response: str) -> TestClient:
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    class _FakeGen:
        model_id = "fake-gen"

        async def complete(self, messages, system, max_tokens=1024, **kwargs) -> str:
            return gen_response

    async def _fake_load(db, settings):
        return _FakeEmbed(), _FakeGen()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load)

    from app.main import app as fastapi_app

    return TestClient(fastapi_app)


@pytest.fixture
def builder_client(tmp_path, monkeypatch):
    with _make_client(tmp_path, monkeypatch, VALID_BRIEF_RESPONSE) as c:
        yield c


@pytest.fixture
def bad_json_builder_client(tmp_path, monkeypatch):
    with _make_client(tmp_path, monkeypatch, "I cannot produce JSON today.") as c:
        yield c


def _create_project(client: TestClient) -> str:
    resp = client.post("/api/v1/projects", json={"title": "Shorts Studio"})
    assert resp.status_code == 201, resp.text
    return resp.json()["hub"]["id"]


def _create_production(client: TestClient, hub_id: str) -> dict:
    resp = client.post(
        "/api/v1/builder/productions",
        json={"project_id": hub_id, "idea": "A lighthouse that sings to calm the sea"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Intake
# ---------------------------------------------------------------------------


def test_intake_creates_production_with_completed_intake_stage(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)

    assert prod["project_id"] == hub_id
    assert prod["idea"] == "A lighthouse that sings to calm the sea"
    assert prod["title"].startswith("A lighthouse that sings")
    assert prod["status"] == "active"
    assert prod["current_stage"] == "intake"
    assert len(prod["stage_runs"]) == 1
    assert prod["stage_runs"][0]["stage"] == "intake"
    assert prod["stage_runs"][0]["status"] == "complete"


def test_intake_rejects_unknown_project(builder_client):
    resp = builder_client.post(
        "/api/v1/builder/productions",
        json={"project_id": "nope", "idea": "an idea"},
    )
    assert resp.status_code == 404


def test_list_productions_filters_by_project(builder_client):
    hub_a = _create_project(builder_client)
    resp = builder_client.post("/api/v1/projects", json={"title": "Other Studio"})
    hub_b = resp.json()["hub"]["id"]
    _create_production(builder_client, hub_a)

    in_a = builder_client.get(f"/api/v1/builder/productions?project_id={hub_a}").json()
    in_b = builder_client.get(f"/api/v1/builder/productions?project_id={hub_b}").json()
    assert len(in_a) == 1
    assert in_b == []


# ---------------------------------------------------------------------------
# Interpretation
# ---------------------------------------------------------------------------


def test_interpretation_produces_versioned_brief_doc(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)

    resp = builder_client.post(
        f"/api/v1/builder/productions/{prod['id']}/stages/interpretation/run"
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()

    assert updated["current_stage"] == "director_planning"
    runs = [r for r in updated["stage_runs"] if r["stage"] == "interpretation"]
    assert len(runs) == 1
    assert runs[0]["status"] == "complete"
    assert runs[0]["worker"] == "llm_interpreter"
    assert runs[0]["model_id"] == "fake-gen"

    assert len(updated["docs"]) == 1
    doc_summary = updated["docs"][0]
    assert doc_summary["kind"] == "brief"
    assert doc_summary["version"] == 1

    doc = builder_client.get(f"/api/v1/builder/docs/{doc_summary['id']}").json()
    structured = json.loads(doc["structured_json"])
    assert structured["title"] == "The Lighthouse That Sang"
    assert [c["name"] for c in structured["characters"]] == ["Aldous", "Harbor Inspector Voss"]
    assert "# The Lighthouse That Sang" in doc["content"]
    assert "Aldous" in doc["content"]


def test_interpretation_rerun_appends_attempt_and_version(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)

    for _ in range(2):
        resp = builder_client.post(
            f"/api/v1/builder/productions/{prod['id']}/stages/interpretation/run"
        )
        assert resp.status_code == 200

    updated = builder_client.get(f"/api/v1/builder/productions/{prod['id']}").json()
    runs = [r for r in updated["stage_runs"] if r["stage"] == "interpretation"]
    assert [r["attempt"] for r in runs] == [1, 2]
    versions = sorted(d["version"] for d in updated["docs"])
    assert versions == [1, 2]
    # Re-running an earlier stage never moves the pipeline pointer backward.
    assert updated["current_stage"] == "director_planning"


def test_interpretation_failure_recorded_and_returns_502(bad_json_builder_client):
    hub_id = _create_project(bad_json_builder_client)
    prod = _create_production(bad_json_builder_client, hub_id)

    resp = bad_json_builder_client.post(
        f"/api/v1/builder/productions/{prod['id']}/stages/interpretation/run"
    )
    assert resp.status_code == 502

    updated = bad_json_builder_client.get(f"/api/v1/builder/productions/{prod['id']}").json()
    runs = [r for r in updated["stage_runs"] if r["stage"] == "interpretation"]
    assert runs[0]["status"] == "failed"
    assert runs[0]["error"]
    assert updated["docs"] == []
    assert updated["current_stage"] == "intake"


def test_unimplemented_stage_returns_501(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)

    resp = builder_client.post(
        f"/api/v1/builder/productions/{prod['id']}/stages/script_generation/run"
    )
    assert resp.status_code == 501


def test_run_stage_unknown_production_returns_404(builder_client):
    resp = builder_client.post("/api/v1/builder/productions/nope/stages/interpretation/run")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Doc refinement + canon promotion
# ---------------------------------------------------------------------------


def _interpret(client: TestClient, production_id: str) -> dict:
    resp = client.post(f"/api/v1/builder/productions/{production_id}/stages/interpretation/run")
    assert resp.status_code == 200
    doc_id = resp.json()["docs"][0]["id"]
    return client.get(f"/api/v1/builder/docs/{doc_id}").json()


def test_patch_doc_updates_content(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)
    doc = _interpret(builder_client, prod["id"])

    resp = builder_client.patch(
        f"/api/v1/builder/docs/{doc['id']}", json={"content": "# Edited brief\n"}
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "# Edited brief\n"
    assert resp.json()["version"] == doc["version"]  # editing is not a re-run


def test_promote_doc_creates_provisional_canon_node_with_edge(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)
    doc = _interpret(builder_client, prod["id"])

    resp = builder_client.post(f"/api/v1/builder/docs/{doc['id']}/promote")
    assert resp.status_code == 201, resp.text
    promoted = resp.json()

    node = builder_client.get(f"/api/v1/nodes/{promoted['canon_node_id']}").json()
    assert node["type"] == "permanent"
    assert node["canon_status"] == "provisional"
    assert "Creative brief" in node["title"]
    incoming_types = [e["type"] for e in node["incoming_edges"]]
    assert "COLLECTS" in incoming_types

    refreshed = builder_client.get(f"/api/v1/builder/docs/{doc['id']}").json()
    assert refreshed["canon_node_id"] == promoted["canon_node_id"]


def test_promote_doc_twice_returns_409(builder_client):
    hub_id = _create_project(builder_client)
    prod = _create_production(builder_client, hub_id)
    doc = _interpret(builder_client, prod["id"])

    assert builder_client.post(f"/api/v1/builder/docs/{doc['id']}/promote").status_code == 201
    assert builder_client.post(f"/api/v1/builder/docs/{doc['id']}/promote").status_code == 409
