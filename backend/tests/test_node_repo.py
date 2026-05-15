from app.models import (
    FleetingCreate,
    LiteratureCreate,
    NodeUpdate,
    PermanentCreate,
    SourceCreate,
    StructureCreate,
    TagCreate,
)
from app.repositories import node_repo, source_repo, tag_repo


async def test_create_fleeting(db):
    node = await node_repo.create_fleeting(
        db, FleetingCreate(title="Quick thought", content="body")
    )
    assert node.type == "fleeting"
    assert node.title == "Quick thought"
    assert node.processed_at is None
    assert node.outgoing_edges == []
    assert node.tags == []


async def test_create_permanent(db):
    node = await node_repo.create_permanent(
        db, PermanentCreate(title="Perm", content="body", summary="short")
    )
    assert node.type == "permanent"
    assert node.summary == "short"


async def test_create_literature_requires_valid_source(db):
    from sqlite3 import IntegrityError
    import pytest

    with pytest.raises(IntegrityError):
        await node_repo.create_literature(
            db,
            LiteratureCreate(title="Note", content="body", source_id="bad-id"),
        )


async def test_create_literature_with_valid_source(db):
    src = await source_repo.create(db, SourceCreate(title="A Book", type="book"))
    node = await node_repo.create_literature(
        db, LiteratureCreate(title="My note", content="body", source_id=src.id)
    )
    assert node.type == "literature"
    assert node.source_id == src.id


async def test_create_structure(db):
    node = await node_repo.create_structure(
        db, StructureCreate(title="MOC: Embedded", content="overview")
    )
    assert node.type == "structure"


async def test_create_with_tags(db):
    tag = await tag_repo.create(db, TagCreate(name="stm32"))
    node = await node_repo.create_permanent(
        db, PermanentCreate(title="T", content="b", tag_ids=[tag.id])
    )
    assert len(node.tags) == 1
    assert node.tags[0].name == "stm32"


async def test_get_by_id_not_found(db):
    assert await node_repo.get_by_id(db, "ghost") is None


async def test_get_by_id_returns_detail(db):
    created = await node_repo.create_fleeting(db, FleetingCreate(title="Hi", content="body"))
    fetched = await node_repo.get_by_id(db, created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.content == "body"


async def test_list_nodes_all(db):
    await node_repo.create_fleeting(db, FleetingCreate(title="F1", content="x"))
    await node_repo.create_permanent(db, PermanentCreate(title="P1", content="x"))
    items, total = await node_repo.list_nodes(db)
    assert total == 2


async def test_list_nodes_type_filter(db):
    await node_repo.create_fleeting(db, FleetingCreate(title="F1", content="x"))
    await node_repo.create_permanent(db, PermanentCreate(title="P1", content="x"))
    items, total = await node_repo.list_nodes(db, type_="fleeting")
    assert total == 1
    assert items[0].type == "fleeting"


# ── ADR-055 schema-level filters (Bucket B — B2) ───────────────────────────────


async def test_list_nodes_no_summary_filter_matches_null_and_empty(db):
    from app.models import NodeUpdate

    with_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="With", content="x", summary="present")
    )
    without_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="Without", content="x")
    )
    empty_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="Empty", content="x", summary="present")
    )
    # Force an empty-string summary via update (NodeUpdate uses model_fields_set)
    await node_repo.update(db, empty_summary.id, NodeUpdate(summary=""))

    items, total = await node_repo.list_nodes(db, no_summary=True)
    ids = {n.id for n in items}
    assert total == 2
    assert without_summary.id in ids
    assert empty_summary.id in ids
    assert with_summary.id not in ids


async def test_list_nodes_no_outgoing_filter(db):
    from app.models import EdgeCreate

    linked = await node_repo.create_permanent(db, PermanentCreate(title="Linked", content="x"))
    target = await node_repo.create_permanent(db, PermanentCreate(title="Target", content="y"))
    isolated = await node_repo.create_permanent(
        db, PermanentCreate(title="Isolated", content="z")
    )
    from app.repositories import edge_repo as er

    await er.create(db, EdgeCreate(from_id=linked.id, to_id=target.id, type="SUPPORTS"))

    items, total = await node_repo.list_nodes(db, no_outgoing=True)
    ids = {n.id for n in items}
    # `linked` has an outgoing edge — excluded. `target` (only incoming) and
    # `isolated` (no edges) survive.
    assert linked.id not in ids
    assert target.id in ids
    assert isolated.id in ids


async def test_list_nodes_no_edges_filter_excludes_either_direction(db):
    from app.models import EdgeCreate

    a = await node_repo.create_permanent(db, PermanentCreate(title="A", content="x"))
    b = await node_repo.create_permanent(db, PermanentCreate(title="B", content="y"))
    isolated = await node_repo.create_permanent(
        db, PermanentCreate(title="Isolated", content="z")
    )
    from app.repositories import edge_repo as er

    await er.create(db, EdgeCreate(from_id=a.id, to_id=b.id, type="SUPPORTS"))

    items, total = await node_repo.list_nodes(db, no_edges=True)
    ids = {n.id for n in items}
    assert a.id not in ids  # has outgoing
    assert b.id not in ids  # has incoming
    assert isolated.id in ids
    assert total == 1


async def test_list_nodes_summary_max_length_excludes_long_and_null(db):
    short = await node_repo.create_permanent(
        db, PermanentCreate(title="Short", content="x", summary="ok")
    )
    long_ = await node_repo.create_permanent(
        db, PermanentCreate(
            title="Long",
            content="x",
            summary="this is a longer summary line than the limit",
        )
    )
    no_sum = await node_repo.create_permanent(db, PermanentCreate(title="None", content="x"))

    items, _ = await node_repo.list_nodes(db, summary_max_length=20)
    ids = {n.id for n in items}
    assert short.id in ids
    assert long_.id not in ids
    # Null summary does NOT match summary_max_length (ADR-055)
    assert no_sum.id not in ids


async def test_list_nodes_filters_and_compose(db):
    """no_summary AND no_edges narrows the result — pure-AND semantic."""
    from app.models import EdgeCreate

    target = await node_repo.create_permanent(db, PermanentCreate(title="T", content="x"))
    linked_no_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="Linked", content="y")
    )  # no summary, but has edge
    isolated_with_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="Iso", content="z", summary="present")
    )  # isolated, but has summary
    isolated_no_summary = await node_repo.create_permanent(
        db, PermanentCreate(title="Doubly", content="q")
    )  # isolated AND no summary
    from app.repositories import edge_repo as er

    await er.create(
        db, EdgeCreate(from_id=linked_no_summary.id, to_id=target.id, type="SUPPORTS")
    )

    items, total = await node_repo.list_nodes(db, no_summary=True, no_edges=True)
    ids = {n.id for n in items}
    assert isolated_no_summary.id in ids
    assert linked_no_summary.id not in ids  # fails no_edges
    assert isolated_with_summary.id not in ids  # fails no_summary
    assert total == 1


async def test_list_nodes_total_count_respects_filters(db):
    """has_next pagination math depends on `total` matching the filter set."""
    for i in range(5):
        await node_repo.create_permanent(
            db, PermanentCreate(title=f"P{i}", content="x", summary=f"s{i}")
        )
    await node_repo.create_permanent(db, PermanentCreate(title="No-sum", content="x"))

    _, unfiltered_total = await node_repo.list_nodes(db)
    _, filtered_total = await node_repo.list_nodes(db, no_summary=True)
    assert unfiltered_total == 6
    assert filtered_total == 1


async def test_list_inbox(db):
    await node_repo.create_fleeting(db, FleetingCreate(title="Inbox1", content="x"))
    await node_repo.create_permanent(db, PermanentCreate(title="NotInInbox", content="x"))
    inbox = await node_repo.list_inbox(db)
    assert len(inbox) == 1
    assert inbox[0].title == "Inbox1"


async def test_update_title_and_content(db):
    node = await node_repo.create_fleeting(db, FleetingCreate(title="Old", content="old"))
    updated = await node_repo.update(db, node.id, NodeUpdate(title="New", content="new"))
    assert updated is not None
    assert updated.title == "New"
    assert updated.content == "new"


async def test_update_clears_summary(db):
    node = await node_repo.create_permanent(
        db, PermanentCreate(title="T", content="b", summary="has summary")
    )
    updated = await node_repo.update(db, node.id, NodeUpdate.model_validate({"summary": None}))
    assert updated is not None
    assert updated.summary is None


async def test_update_attaches_source(db):
    src = await source_repo.create(db, SourceCreate(title="Lyrics: Night Song", type="other"))
    node = await node_repo.create_permanent(db, PermanentCreate(title="P", content="b"))
    assert node.source_id is None
    updated = await node_repo.update(db, node.id, NodeUpdate(source_id=src.id))
    assert updated is not None
    assert updated.source_id == src.id


async def test_update_clears_source(db):
    src = await source_repo.create(db, SourceCreate(title="A Book", type="book"))
    node = await node_repo.create_literature(
        db, LiteratureCreate(title="L", content="b", source_id=src.id)
    )
    assert node.source_id == src.id
    updated = await node_repo.update(db, node.id, NodeUpdate.model_validate({"source_id": None}))
    assert updated is not None
    assert updated.source_id is None


async def test_update_tags_replaces_set(db):
    t1 = await tag_repo.create(db, TagCreate(name="t1"))
    t2 = await tag_repo.create(db, TagCreate(name="t2"))
    node = await node_repo.create_permanent(
        db, PermanentCreate(title="T", content="b", tag_ids=[t1.id])
    )
    updated = await node_repo.update(db, node.id, NodeUpdate(tag_ids=[t2.id]))
    assert updated is not None
    assert len(updated.tags) == 1
    assert updated.tags[0].id == t2.id


async def test_soft_delete(db):
    node = await node_repo.create_fleeting(db, FleetingCreate(title="Bye", content="x"))
    assert await node_repo.soft_delete(db, node.id) is True
    assert await node_repo.get_by_id(db, node.id) is None


async def test_soft_delete_hides_from_list(db):
    node = await node_repo.create_fleeting(db, FleetingCreate(title="Gone", content="x"))
    await node_repo.soft_delete(db, node.id)
    _, total = await node_repo.list_nodes(db)
    assert total == 0


async def test_soft_delete_missing_returns_false(db):
    assert await node_repo.soft_delete(db, "ghost") is False


async def test_mark_processed(db):
    node = await node_repo.create_fleeting(db, FleetingCreate(title="Raw", content="x"))
    assert node.processed_at is None
    processed = await node_repo.mark_processed(db, node.id)
    assert processed is not None
    assert processed.processed_at is not None
    inbox = await node_repo.list_inbox(db)
    assert all(n.id != node.id for n in inbox)
