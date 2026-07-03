"""Canon readiness (ADR-076) — routes for the uncertainty saved-views and the
deterministic AI narration endpoint.

- GET  /canon/views/{view}   → deterministic node list (no AI). Backs the
                                frontend saved-views.
- GET  /canon/open-threads   → unresolved tensions + unresolved nodes.
- POST /canon/ask            → deterministic node set + AI narration with
                                citations.
"""

from fastapi import APIRouter

from app.core.deps import DB, GenProvider
from app.models import (
    CanonAskRequest,
    CanonAskResponse,
    CanonView,
    CanonViewResponse,
    OpenThreadsResponse,
)
from app.services import canon_service

router = APIRouter(prefix="/canon", tags=["canon"])


@router.get("/open-threads")
async def get_open_threads(db: DB) -> OpenThreadsResponse:
    """Everything still open: unresolved CONTRADICTS/QUESTIONS edges plus nodes
    the author marked node_status=unresolved."""
    return await canon_service.open_threads(db)


@router.get("/views/{view}")
async def get_canon_view(view: CanonView, db: DB) -> CanonViewResponse:
    """Deterministic node list for a named Canon view. No AI — pure SQL filter."""
    nodes = await canon_service.view_nodes(db, view)
    return CanonViewResponse(view=view, nodes=nodes)


@router.post("/ask")
async def canon_ask(data: CanonAskRequest, db: DB, gen: GenProvider) -> CanonAskResponse:
    """Narrate a named view. The node set is chosen deterministically from
    structured uncertainty fields; the model summarizes and cites it."""
    return await canon_service.ask(db, gen, data.view)
