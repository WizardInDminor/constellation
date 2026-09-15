"""Provenance contracts (Track C Phase C1, ADR-084).

Every workflow-core write records who created it and where it came from.
Actor types follow the direction pack (docs/direction/04_DOMAIN_MODEL.md):
`human`, `ai_client`, `system`, `import`.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActorType = Literal["human", "ai_client", "system", "import"]


class ProvenanceCreate(BaseModel):
    """Provenance supplied with a write. Only `actor_type` is required —
    a human working in the UI needs nothing more; an MCP client supplies
    client identity and conversation references."""

    actor_type: ActorType
    actor_id: str | None = None
    client_type: str | None = None  # 'ui' | 'cli' | 'api' | 'mcp' | ...
    client_name: str | None = None  # 'Constellation UI', 'ChatGPT', 'Claude Code', ...
    source_session_id: str | None = None
    source_conversation_id: str | None = None
    source_message_reference: str | None = None
    request_id: str | None = None


class ProvenanceRecord(ProvenanceCreate):
    id: str
    created_at: datetime


# Default provenance for actions taken by the user through the app's own UI.
# Routes that predate the workflow core use this when emitting activity
# events, so the event log stays complete without burdening the UI client.
UI_PROVENANCE = ProvenanceCreate(
    actor_type="human", client_type="ui", client_name="Constellation UI"
)

SYSTEM_PROVENANCE = ProvenanceCreate(actor_type="system", client_type="system")
