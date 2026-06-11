"""Entity Arc — generic evolution-over-time view (Phase C, ADR-081).

An "entity" is any node (a symbol, character, theme, world rule, open question,
research concept, learning topic — anything). Its *arc* is the ordered sequence
of its appearances/connections through time, with the per-appearance edge note
read as the interpretation/meaning at that point. Pure derivation — no schema
change; the ordering comes from existing timeline discourse positions and node
created_at timestamps.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.edge import EdgeType
from app.models.node import NodeRef


class ArcAppearance(BaseModel):
    """One appearance of the entity: a connected node + the relationship +
    the interpretation (edge note) at that point in the entity's development."""

    node: NodeRef
    edge_id: str
    edge_type: EdgeType
    direction: Literal["outgoing", "incoming"]
    # The edge note — surfaced as the interpretation/evolution entry.
    meaning: str | None = None
    # Ordering metadata, all derived from existing data.
    story_time: str | None = None
    discourse_position: int | None = None
    prose_status: str | None = None
    created_at: datetime
    # True when this appearance is a not-yet-written story event (a future
    # payoff point) — derived from prose_status == 'planned'.
    is_pending: bool = False


class EntityArc(BaseModel):
    """The full evolution of one entity, appearances ordered chronologically.

    `ordering_basis` records which clock was used: 'timeline' (discourse
    position) when every appearance is a story event, 'chronological'
    (created_at) when none are, or 'mixed'.
    """

    entity: NodeRef
    ordering_basis: Literal["timeline", "chronological", "mixed"]
    appearances: list[ArcAppearance]
    pending_count: int = 0
