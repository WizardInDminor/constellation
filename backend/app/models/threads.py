"""Open Threads & Pending Payoffs — project-wide situational awareness (ADR-089).

Generic across modes: 'open threads' are the project's unresolved lines of
inquiry (lifecycle status:open / status:developing nodes, plus unresolved
tension edges), and 'pending payoffs' are set-ups awaiting follow-through
(story events with prose_status='planned'). Derived from existing data — no
schema change.
"""

from datetime import datetime

from pydantic import BaseModel

from app.models.node import NodeRef


class ThreadItem(BaseModel):
    node: NodeRef
    status: str | None = None  # lifecycle status tag value (open/developing)
    prose_status: str | None = None  # for pending payoffs
    created_at: datetime


class TensionThread(BaseModel):
    """An unresolved CONTRADICTS/QUESTIONS edge — an open tension to settle."""

    edge_id: str
    type: str
    note: str | None = None
    from_node: NodeRef
    to_node: NodeRef


class ProjectThreads(BaseModel):
    open_questions: list[ThreadItem]
    pending_payoffs: list[ThreadItem]
    unresolved_tensions: list[TensionThread]
