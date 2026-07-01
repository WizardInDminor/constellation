"""Canon readiness (ADR-073) — models for the uncertainty saved-views and the
deterministic AI narration endpoint.

These sit on top of the node uncertainty metadata: the views are backed by
deterministic SQL filters (never LLM inference), and the ask endpoint narrates
that fixed node set with citations.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.edge import EdgeType
from app.models.node import NodeRef, NodeSummary
from app.models.rag import NodeUsed

# The named Canon views. Each maps to a deterministic node/edge filter — see
# canon_service. Kept as a closed vocabulary so the frontend and the AI
# endpoint share exactly one source of truth.
CanonView = Literal[
    "images_carrying_charge",  # charge in high/goosebump (optionally no scene)
    "emerging_truths",  # node_status=emerging OR canon_status=provisional
    "do_not_name_yet",  # do_not_name_yet flag set
    "speculative",  # canon_status=speculative
    "open_threads",  # unresolved tensions + node_status=unresolved
]


class OpenThreadEdge(BaseModel):
    """An unresolved tension edge with both endpoints, for the Open Threads view."""

    id: str
    type: EdgeType
    note: str | None = None
    from_node: NodeRef
    to_node: NodeRef
    created_at: datetime


class OpenThreadsResponse(BaseModel):
    """Everything still open: unresolved tension edges plus nodes the author has
    marked node_status=unresolved."""

    tensions: list[OpenThreadEdge]
    unresolved_nodes: list[NodeSummary]


class CanonViewResponse(BaseModel):
    """Deterministic node list for a named view (no AI)."""

    view: CanonView
    nodes: list[NodeSummary]


class CanonAskRequest(BaseModel):
    """Ask the AI to narrate a named view. The node set is chosen deterministically
    from structured fields; the model only summarizes and cites it."""

    view: CanonView


class CanonAskResponse(BaseModel):
    view: CanonView
    question: str
    answer: str
    provenance: list[NodeUsed]
    nodes: list[NodeSummary]
