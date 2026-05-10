from pydantic import BaseModel

from app.models.node import NodeRef


class BridgeCandidate(BaseModel):
    """A pair of notes with high embedding similarity but no edge between them."""

    node_a: NodeRef
    node_b: NodeRef
    similarity: float
