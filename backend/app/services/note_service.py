"""Development-note capture (Phase C5, ADR-090; roadmap decision D5).

An AI-created development note "lands in the graph" (house principle) as a
real permanent node — but with `canon_status='speculative'`, so it is
visible, searchable, and linkable without ever reading as accepted truth.
Provenance is recorded and the creation is an activity event.
"""

import aiosqlite

from app.core.errors import ProjectNotFound, ValidationFailed
from app.models import EdgeCreate, NodeDetail, PermanentCreate
from app.models.edge import EdgeType
from app.models.provenance import ProvenanceCreate
from app.providers.base import EmbeddingProvider
from app.repositories import edge_repo, node_repo, project_repo, provenance_repo
from app.services import activity_service, embedding_service


async def create_development_note(
    db: aiosqlite.Connection,
    embed: EmbeddingProvider,
    *,
    project_hub_id: str,
    title: str,
    body: str,
    provenance: ProvenanceCreate,
    note_type: str | None = None,
    related_objects: list[tuple[str, EdgeType]] | None = None,
) -> NodeDetail:
    """Create a speculative permanent node linked to its related objects.

    `related_objects` is a list of (existing node id, edge type); edges run
    from the note to the target. The note's speculative status is what keeps
    it out of accepted canon — the links themselves are ordinary edges from
    a clearly-development node ("note concerns object", direction pack
    story-domain relationships).
    """
    if not await project_repo.is_project_hub(db, project_hub_id):
        raise ProjectNotFound(
            "Project hub not found", details={"project_hub_id": project_hub_id}
        )
    related = related_objects or []
    for object_id, _ in related:
        if await node_repo.get_by_id(db, object_id) is None:
            raise ValidationFailed(
                "Related object does not reference an existing node",
                details={"object_id": object_id},
            )

    provenance_record = await provenance_repo.create(db, provenance)
    summary = f"Development note ({note_type})" if note_type else "Development note"
    node = await node_repo.create_permanent(
        db,
        PermanentCreate(
            title=title,
            content=body,
            summary=summary,
            canon_status="speculative",
        ),
    )
    await embedding_service.embed_or_queue(db, node.id, embed)

    for object_id, edge_type in related:
        try:
            await edge_repo.create(
                db,
                EdgeCreate(
                    from_id=node.id,
                    to_id=object_id,
                    type=edge_type,
                    note="development note reference",
                ),
            )
        except Exception:
            continue  # duplicate link — the note itself already exists

    await activity_service.emit(
        db,
        event_type="note.created",
        object_type="node",
        object_id=node.id,
        summary=f"Development note created: {title}",
        project_hub_id=project_hub_id,
        provenance_id=provenance_record.id,
    )
    refreshed = await node_repo.get_by_id(db, node.id)
    assert refreshed is not None
    return refreshed
