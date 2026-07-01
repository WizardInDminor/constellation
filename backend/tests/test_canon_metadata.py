"""Canon readiness Phase 1 (ADR-073): node uncertainty metadata.

Covers create, update (set + clear), CHECK-constraint validation, list filters,
and backward-compatibility for nodes created without the fields.
"""

from sqlite3 import IntegrityError

import pytest

from app.models import (
    NodeUpdate,
    PermanentCreate,
    StructureCreate,
)
from app.repositories import node_repo

# ── create ───────────────────────────────────────────────────────────────────


async def test_create_permanent_with_canon_fields(db):
    node = await node_repo.create_permanent(
        db,
        PermanentCreate(
            title="The Stained Glass Cathedral",
            content="An image that arrives before its meaning.",
            canon_status="image_only",
            charge="goosebump",
            do_not_name_yet=True,
            node_status="emerging",
            confidence=20,
        ),
    )
    assert node.canon_status == "image_only"
    assert node.charge == "goosebump"
    assert node.do_not_name_yet is True
    assert node.node_status == "emerging"
    assert node.confidence == 20


async def test_create_defaults_are_backward_compatible(db):
    node = await node_repo.create_permanent(db, PermanentCreate(title="Plain note", content="body"))
    assert node.canon_status is None
    assert node.node_status is None
    assert node.charge is None
    assert node.do_not_name_yet is False
    assert node.confidence is None


async def test_create_structure_with_canon_fields(db):
    node = await node_repo.create_structure(
        db,
        StructureCreate(
            title="Give the Shape a Name",
            content="A primary symbolic node.",
            canon_status="provisional",
            node_status="emerging",
        ),
    )
    assert node.canon_status == "provisional"
    assert node.node_status == "emerging"


# ── validation ───────────────────────────────────────────────────────────────


def test_invalid_canon_status_rejected_at_model():
    with pytest.raises(ValueError):
        PermanentCreate(title="t", content="c", canon_status="bogus")


def test_confidence_out_of_range_rejected_at_model():
    with pytest.raises(ValueError):
        PermanentCreate(title="t", content="c", confidence=150)


# ── update: set and clear ────────────────────────────────────────────────────


async def test_update_sets_and_clears_canon_fields(db):
    node = await node_repo.create_permanent(
        db, PermanentCreate(title="Emerging truth", content="body")
    )

    # Set.
    updated = await node_repo.update(
        db,
        node.id,
        NodeUpdate(canon_status="speculative", charge="high", do_not_name_yet=True),
    )
    assert updated.canon_status == "speculative"
    assert updated.charge == "high"
    assert updated.do_not_name_yet is True

    # Omitting a field leaves it unchanged; only clear what is explicitly sent.
    partial = await node_repo.update(db, node.id, NodeUpdate(charge=None))
    assert partial.charge is None  # explicitly cleared
    assert partial.canon_status == "speculative"  # untouched
    assert partial.do_not_name_yet is True  # untouched


async def test_update_do_not_name_yet_false(db):
    node = await node_repo.create_permanent(
        db,
        PermanentCreate(title="t", content="c", do_not_name_yet=True),
    )
    updated = await node_repo.update(db, node.id, NodeUpdate(do_not_name_yet=False))
    assert updated.do_not_name_yet is False


# ── list filters ─────────────────────────────────────────────────────────────


async def test_list_filters_by_canon_and_charge(db):
    await node_repo.create_permanent(
        db,
        PermanentCreate(
            title="Cathedral", content="c", charge="goosebump", canon_status="image_only"
        ),
    )
    await node_repo.create_permanent(
        db,
        PermanentCreate(title="Clearing", content="c", charge="high", canon_status="provisional"),
    )
    await node_repo.create_permanent(db, PermanentCreate(title="Mundane", content="c"))

    high_charge, total = await node_repo.list_nodes(db, charge_in=["high", "goosebump"])
    assert total == 2
    titles = {n.title for n in high_charge}
    assert titles == {"Cathedral", "Clearing"}

    image_only, total = await node_repo.list_nodes(db, canon_status="image_only")
    assert total == 1
    assert image_only[0].title == "Cathedral"


async def test_list_filters_do_not_name_yet(db):
    await node_repo.create_permanent(
        db, PermanentCreate(title="Mystery", content="c", do_not_name_yet=True)
    )
    await node_repo.create_permanent(db, PermanentCreate(title="Plain", content="c"))

    protected, total = await node_repo.list_nodes(db, do_not_name_yet=True)
    assert total == 1
    assert protected[0].title == "Mystery"


async def test_list_summary_carries_canon_fields(db):
    await node_repo.create_permanent(
        db,
        PermanentCreate(title="Charged", content="c", charge="goosebump", node_status="emerging"),
    )
    items, _ = await node_repo.list_nodes(db, charge_in=["goosebump"])
    assert items[0].charge == "goosebump"
    assert items[0].node_status == "emerging"


# ── CHECK constraint enforced at the DB layer ────────────────────────────────


async def test_db_rejects_bad_enum_via_raw_insert(db):
    # The model layer guards this, but the migration's CHECK is the backstop.
    import uuid
    from datetime import UTC, datetime

    with pytest.raises(IntegrityError):
        await db.execute(
            "INSERT INTO nodes(id, type, title, content, canon_status, created_at, updated_at)"
            " VALUES (?, 'permanent', 't', 'c', 'not-a-status', ?, ?)",
            (str(uuid.uuid4()), datetime.now(UTC).isoformat(), datetime.now(UTC).isoformat()),
        )
