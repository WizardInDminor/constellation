from pydantic import BaseModel

from app.models.edge import EdgeType
from app.models.node import NodeRef


class BridgeCandidate(BaseModel):
    """A pair of notes with high embedding similarity but no edge between them."""

    node_a: NodeRef
    node_b: NodeRef
    similarity: float


class TriangleCandidate(BaseModel):
    """A pair of notes that share graph neighbours but have no direct edge.

    `intermediates` are the shared-neighbour nodes (≥ `min_intermediates` per
    ADR-056). Structural counterpart to BridgeCandidate.
    """

    node_a: NodeRef
    node_b: NodeRef
    intermediates: list[NodeRef]
    intermediate_count: int


class ClassifyBridgeRequest(BaseModel):
    """Two node IDs the user wants Claude to evaluate for a meaningful edge."""

    node_a_id: str
    node_b_id: str


class BridgeClassification(BaseModel):
    """Claude's verdict on a bridge pair.

    `no_connection=True` means Claude judged the embedding similarity to be
    surface coincidence; the other fields are None in that case. Otherwise
    `from_id`/`to_id` indicate the recommended directionality of the edge
    (always one of the two IDs supplied in the request).
    """

    no_connection: bool
    edge_type: EdgeType | None = None
    from_id: str | None = None
    to_id: str | None = None
    rationale: str
