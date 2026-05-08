import pytest

from app.models import FleetingCreate, LiteratureCreate, SourceCreate, SourceUpdate
from app.repositories import node_repo, source_repo


async def test_create_and_get(db):
    source = await source_repo.create(
        db, SourceCreate(title="STM32 Reference Manual", type="manual", author="ST")
    )
    assert source.id
    assert source.title == "STM32 Reference Manual"
    assert source.literature_notes == []

    fetched = await source_repo.get_by_id(db, source.id)
    assert fetched is not None
    assert fetched.title == source.title


async def test_get_missing_returns_none(db):
    assert await source_repo.get_by_id(db, "ghost") is None


async def test_list(db):
    await source_repo.create(db, SourceCreate(title="Book A", type="book"))
    await source_repo.create(db, SourceCreate(title="Article B", type="article"))
    sources = await source_repo.list_sources(db)
    titles = [s.title for s in sources]
    assert "Book A" in titles
    assert "Article B" in titles


async def test_update(db):
    src = await source_repo.create(db, SourceCreate(title="Draft", type="other"))
    updated = await source_repo.update(db, src.id, SourceUpdate(title="Final", url="https://x.com"))
    assert updated is not None
    assert updated.title == "Final"
    assert updated.url == "https://x.com"


async def test_delete(db):
    src = await source_repo.create(db, SourceCreate(title="Ephemeral", type="other"))
    ok, reason = await source_repo.delete(db, src.id)
    assert ok is True
    assert reason == ""
    assert await source_repo.get_by_id(db, src.id) is None


async def test_delete_with_linked_notes_blocked(db):
    src = await source_repo.create(db, SourceCreate(title="Referenced", type="book"))
    await node_repo.create_literature(
        db, LiteratureCreate(title="My note", content="body", source_id=src.id)
    )
    ok, reason = await source_repo.delete(db, src.id)
    assert ok is False
    assert "linked" in reason


async def test_delete_missing_returns_false(db):
    ok, _ = await source_repo.delete(db, "ghost")
    assert ok is False
