import pytest
from starlette.testclient import TestClient

# ---------------------------------------------------------------------------
# Fake providers — no network calls, deterministic 1024-dim output
# ---------------------------------------------------------------------------


class FakeEmbeddingProvider:
    model_id = "fake-embed"
    dimensions = 1024

    async def embed(self, text: str) -> list[float]:
        return [0.0] * 1024

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1024 for _ in texts]


class FakeGenerationProvider:
    model_id = "fake-gen"

    def __init__(self, response: str = "fake response"):
        self._response = response

    async def complete(
        self, messages, system, max_tokens=1024, *, enable_web_search: bool = False
    ) -> str:
        return self._response


@pytest.fixture
def fake_embed_provider():
    return FakeEmbeddingProvider()


@pytest.fixture
def fake_gen_provider():
    return FakeGenerationProvider()


# ---------------------------------------------------------------------------
# HTTP client fixture — full lifespan, fake providers injected
# ---------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.lifespan as lsp

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    async def _fake_load_providers(db, settings):
        return FakeEmbeddingProvider(), FakeGenerationProvider()

    monkeypatch.setattr(lsp, "_load_providers", _fake_load_providers)

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    cfg.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Async DB fixture — for repository-level tests, migrations applied, vec loaded
# ---------------------------------------------------------------------------


@pytest.fixture
async def db(tmp_path, monkeypatch):
    import app.core.config as cfg

    cfg.get_settings.cache_clear()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    cfg.get_settings.cache_clear()

    from app.core.config import get_settings
    from app.core.database import open_database
    from app.core.lifespan import _run_migrations

    conn = await open_database(get_settings().db_path)
    await _run_migrations(conn)
    yield conn
    await conn.close()
    cfg.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Shared story fixture (Phase C2) — the direction pack's development fixture:
# two characters, one location, two scenes, one theme, one open thread, one
# accepted decision, one proposed scene. Reusable by service, API-adjacent,
# and (later) MCP tests. Returns a dict of ids.
# ---------------------------------------------------------------------------


@pytest.fixture
async def story_project(db):
    from app.models import (
        DecisionCreate,
        EdgeCreate,
        PermanentCreate,
        ProposalCreate,
        ProvenanceCreate,
        StructureCreate,
    )
    from app.models.narrative import (
        NARRATIVE_TAG_CHARACTER,
        NARRATIVE_TAG_LOCATION,
        NARRATIVE_TAG_THEME,
    )
    from app.repositories import (
        decision_repo,
        edge_repo,
        node_repo,
        project_repo,
        provenance_repo,
        tag_repo,
        timeline_repo,
    )
    from app.services import proposal_service

    async def tagged_permanent(title: str, content: str, tag_name: str) -> str:
        node = await node_repo.create_permanent(
            db, PermanentCreate(title=title, content=content)
        )
        tag = await tag_repo.get_or_create_by_name(db, tag_name)
        await tag_repo.attach_to_node(db, node.id, tag.id)
        return node.id

    hub = await node_repo.create_structure(
        db, StructureCreate(title="Fire Stoker", content="Project hub")
    )
    await project_repo.create_scope(db, hub_node_id=hub.id, mode="narrative")

    timeline = await node_repo.create_structure(
        db, StructureCreate(title="Main timeline", content="")
    )

    michael = await tagged_permanent(
        "Michael", "Protagonist; wants the truth.", NARRATIVE_TAG_CHARACTER
    )
    vincent = await tagged_permanent(
        "Vincent", "Sincere believer in controlled narrative.", NARRATIVE_TAG_CHARACTER
    )
    chapel = await tagged_permanent(
        "The Chapel", "Where confessions happen.", NARRATIVE_TAG_LOCATION
    )
    truth_theme = await tagged_permanent(
        "Truth vs stability", "The central tension.", NARRATIVE_TAG_THEME
    )

    scene1 = await node_repo.create_story_event(
        db, title="First meeting", content="Michael meets Vincent.", story_time="Year 1"
    )
    scene2 = await node_repo.create_story_event(
        db, title="The confession", content="Vincent explains himself.", story_time="Year 3"
    )
    for position, event_id in enumerate([scene1.id, scene2.id], start=1):
        await timeline_repo.place_event(
            db,
            event_node_id=event_id,
            timeline_node_id=timeline.id,
            discourse_position=position,
        )

    async def edge(from_id: str, to_id: str, type_: str, note: str | None = None) -> str:
        created = await edge_repo.create(
            db, EdgeCreate(from_id=from_id, to_id=to_id, type=type_, note=note)
        )
        return created.id

    await edge(michael, scene1.id, "COLLECTS", "appears in")
    await edge(michael, scene2.id, "COLLECTS", "appears in")
    await edge(vincent, scene2.id, "COLLECTS", "appears in")
    await edge(scene2.id, chapel, "SCOPED_TO", "takes place at")
    await edge(scene2.id, truth_theme, "ELABORATES", "expresses the theme")
    open_thread = await edge(
        michael, vincent, "CONTRADICTS", "Their accounts of Year 1 conflict."
    )

    human = ProvenanceCreate(actor_type="human")
    decision = await decision_repo.create(
        db,
        DecisionCreate(
            project_hub_id=hub.id,
            statement="Vincent is sincere, not cynical.",
            provenance=human,
        ),
        (await provenance_repo.create(db, human)).id,
    )

    proposed_scene = await proposal_service.create(
        db,
        ProposalCreate(
            project_hub_id=hub.id,
            proposal_type="scene",
            title="Michael confronts Vincent's sincerity",
            summary="Proposed third scene.",
            payload={"content": "Draft.", "story_time": "Year 4"},
            related_objects=[
                {"object_id": michael, "relationship_type": "COLLECTS", "direction": "incoming"},
                {"object_id": vincent, "relationship_type": "COLLECTS", "direction": "incoming"},
            ],
            provenance=ProvenanceCreate(
                actor_type="ai_client", client_type="mcp", client_name="ChatGPT"
            ),
        ),
    )

    return {
        "hub": hub.id,
        "timeline": timeline.id,
        "michael": michael,
        "vincent": vincent,
        "chapel": chapel,
        "theme": truth_theme,
        "scene1": scene1.id,
        "scene2": scene2.id,
        "open_thread_edge": open_thread,
        "decision": decision.id,
        "proposed_scene": proposed_scene.id,
    }
