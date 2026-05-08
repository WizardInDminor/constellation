import pytest

from app.models import TagCreate, TagUpdate
from app.repositories import tag_repo


async def test_create_and_get(db):
    tag = await tag_repo.create(db, TagCreate(name="electronics", color="#ff0000"))
    assert tag.name == "electronics"
    assert tag.color == "#ff0000"

    fetched = await tag_repo.get_by_id(db, tag.id)
    assert fetched is not None
    assert fetched.name == "electronics"


async def test_get_missing_returns_none(db):
    assert await tag_repo.get_by_id(db, "does-not-exist") is None


async def test_list_tags(db):
    await tag_repo.create(db, TagCreate(name="zettel"))
    await tag_repo.create(db, TagCreate(name="embedded"))
    tags = await tag_repo.list_tags(db)
    names = [t.name for t in tags]
    assert "zettel" in names
    assert "embedded" in names


async def test_update_name(db):
    tag = await tag_repo.create(db, TagCreate(name="old-name"))
    updated = await tag_repo.update(db, tag.id, TagUpdate(name="new-name"))
    assert updated is not None
    assert updated.name == "new-name"


async def test_update_color_to_none(db):
    tag = await tag_repo.create(db, TagCreate(name="coloured", color="#abc"))
    updated = await tag_repo.update(db, tag.id, TagUpdate.model_validate({"color": None}))
    assert updated is not None
    assert updated.color is None


async def test_delete(db):
    tag = await tag_repo.create(db, TagCreate(name="to-delete"))
    assert await tag_repo.delete(db, tag.id) is True
    assert await tag_repo.get_by_id(db, tag.id) is None


async def test_delete_missing_returns_false(db):
    assert await tag_repo.delete(db, "ghost") is False


async def test_unique_name_constraint(db):
    from sqlite3 import IntegrityError

    await tag_repo.create(db, TagCreate(name="unique"))
    with pytest.raises(IntegrityError):
        await tag_repo.create(db, TagCreate(name="unique"))
