"""Canon readiness (ADR-076) — deterministic uncertainty views + AI narration.

The node set for every view is chosen by structured SQL filters, never by asking
the model to infer epistemic status from prose. The `ask` path then narrates that
fixed set with `[Note N]` citations, so provenance stays exact.
"""

import aiosqlite

from app.models.canon import (
    CanonAskResponse,
    CanonView,
    OpenThreadsResponse,
)
from app.models.node import NodeSummary
from app.providers.base import GenerationProvider
from app.repositories import edge_repo, node_repo
from app.services import rag_service

# Natural-language framing per view — used as the narration question and shown
# in the UI. Deterministic filtering happens before this ever reaches the model.
_VIEW_QUESTIONS: dict[CanonView, str] = {
    "images_carrying_charge": "What high-charge images are these, and which still have no scene?",
    "emerging_truths": "What is currently emerging or provisional — central but not yet canon?",
    "do_not_name_yet": "What should I not define yet — the load-bearing mysteries to keep open?",
    "speculative": "What is still speculative — possibilities being explored, not committed?",
    "open_threads": "What questions and tensions are still unresolved?",
}

_CANON_INSTRUCTION = (
    "These notes were selected deterministically because they share a Canon "
    "status (see each note's `Status:` line). Summarize what is here and cite "
    "each note as [Note N]. Do not introduce nodes that are not listed. Preserve "
    "the openness of anything marked do_not_name_yet — describe around it, do not "
    "resolve it."
)

# Cap on how many nodes are narrated in one ask so the context stays bounded.
_MAX_NARRATED = 25


def _merge_dedup(*lists: list[NodeSummary]) -> list[NodeSummary]:
    seen: set[str] = set()
    out: list[NodeSummary] = []
    for lst in lists:
        for n in lst:
            if n.id not in seen:
                seen.add(n.id)
                out.append(n)
    return out


async def view_nodes(
    db: aiosqlite.Connection,
    view: CanonView,
    *,
    limit: int = 100,
    only_without_scene: bool = False,
) -> list[NodeSummary]:
    """Deterministic node list for a named view.

    `only_without_scene` applies to `images_carrying_charge`: when True, only
    charged images with no edge to a story event are returned (the "no scene
    yet" filter).
    """
    if view == "images_carrying_charge":
        items, _ = await node_repo.list_nodes(
            db, charge_in=["high", "goosebump"], no_scene=only_without_scene, page_size=limit
        )
        return items
    if view == "do_not_name_yet":
        items, _ = await node_repo.list_nodes(db, do_not_name_yet=True, page_size=limit)
        return items
    if view == "speculative":
        items, _ = await node_repo.list_nodes(db, canon_status="speculative", page_size=limit)
        return items
    if view == "emerging_truths":
        emerging, _ = await node_repo.list_nodes(db, node_status="emerging", page_size=limit)
        provisional, _ = await node_repo.list_nodes(db, canon_status="provisional", page_size=limit)
        return _merge_dedup(emerging, provisional)
    if view == "open_threads":
        items, _ = await node_repo.list_nodes(db, node_status="unresolved", page_size=limit)
        return items
    return []


async def open_threads(db: aiosqlite.Connection, *, limit: int = 100) -> OpenThreadsResponse:
    """The Open Threads view: unresolved tension edges + node_status=unresolved nodes."""
    tensions = await edge_repo.list_open_tensions(db, limit=limit)
    unresolved_nodes, _ = await node_repo.list_nodes(db, node_status="unresolved", page_size=limit)
    return OpenThreadsResponse(tensions=tensions, unresolved_nodes=unresolved_nodes)


async def ask(
    db: aiosqlite.Connection,
    gen_provider: GenerationProvider,
    view: CanonView,
) -> CanonAskResponse:
    """Narrate a named view. The node set is deterministic; the model summarizes
    and cites it, respecting each node's uncertainty status."""
    nodes = await view_nodes(db, view, only_without_scene=(view == "images_carrying_charge"))
    question = _VIEW_QUESTIONS[view]

    # Fetch full detail (content) for the narrated subset so citations are grounded.
    details = []
    for n in nodes[:_MAX_NARRATED]:
        d = await node_repo.get_by_id(db, n.id)
        if d is not None:
            details.append(d)

    if not details:
        return CanonAskResponse(
            view=view,
            question=question,
            answer="No nodes currently match this view.",
            provenance=[],
            nodes=nodes,
        )

    context_text, provenance = rag_service._build_context(details, [], [])
    user_content = f"Question: {question}\n\nNotes:\n\n{context_text}"
    system_prompt = rag_service._system_prompt_for("default") + "\n\n" + _CANON_INSTRUCTION
    answer = await gen_provider.complete(
        [{"role": "user", "content": user_content}], system_prompt, max_tokens=2048
    )

    return CanonAskResponse(
        view=view,
        question=question,
        answer=answer,
        provenance=provenance,
        nodes=nodes,
    )
