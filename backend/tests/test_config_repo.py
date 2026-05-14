from app.repositories import config_repo


async def test_get_all_returns_seeded_values(db):
    entries = await config_repo.get_all(db)
    keys = {e.key for e in entries}
    assert {
        "embedding_provider",
        "embedding_model",
        "generation_provider",
        "generation_model",
    } == keys


async def test_get_existing_key(db):
    entry = await config_repo.get(db, "embedding_provider")
    assert entry is not None
    assert entry.value == "voyage"


async def test_get_missing_key_returns_none(db):
    entry = await config_repo.get(db, "nonexistent")
    assert entry is None
