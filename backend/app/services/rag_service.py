import logging

import aiosqlite

from app.models.rag import EdgeTraversed, NodeUsed, RagResponse
from app.providers.base import EmbeddingProvider, GenerationProvider
from app.repositories import node_repo
from app.services import embedding_service, graph_service, search_service

logger = logging.getLogger(__name__)


class EmbedUnavailableError(RuntimeError):
    """Raised when the embedding provider fails during a RAG query."""


_SYSTEM_PROMPT = """\
You are a zettelkasten assistant. Answer the user's question using only the notes provided below.

Rules:
- Answer directly. Cite notes inline as [Note N] where N is the note number shown in the context.
- If the notes don't contain enough information to answer, say so rather than speculating.
- Preserve the nuance of individual notes; do not blend them into vague generalities.
- Be concise — this is a personal knowledge base, not a general-purpose encyclopedia.
- Do not invent facts not present in the provided notes.\
"""

_MAX_SEED_NODES = 8
_MAX_NEIGHBOR_NODES = 12
_EXCERPT_CHARS = 200


def _excerpt(text: str) -> str:
    if len(text) <= _EXCERPT_CHARS:
        return text
    return text[:_EXCERPT_CHARS].rstrip() + "…"


def _build_context(
    seed_nodes: list,
    neighbor_nodes: list,
    edges: list,
) -> tuple[str, list[NodeUsed]]:
    """Assemble numbered context blocks and provenance list.

    Seeds get full content. Neighbors get summary-or-excerpt.
    Returns (context_text, ordered_provenance).
    """
    all_nodes: list[tuple[object, str]] = []  # (NodeDetail, role)
    for n in seed_nodes:
        all_nodes.append((n, "direct"))
    for n in neighbor_nodes:
        all_nodes.append((n, "neighbor"))

    # Build a map of node_id → note number for cross-referencing edges
    note_num: dict[str, int] = {n.id: i + 1 for i, (n, _) in enumerate(all_nodes)}

    # Build edge lookup keyed by (from_id, to_id) for annotation
    edge_annotations: dict[str, list[str]] = {}  # node_id → list of "→ [TYPE] Note N"
    for e in edges:
        fn, tn = e.from_id, e.to_id
        if fn in note_num and tn in note_num:
            annotation = f"→ {e.type} Note {note_num[tn]}"
            if e.note:
                annotation += f" ({e.note})"
            edge_annotations.setdefault(fn, []).append(annotation)

    blocks: list[str] = []
    provenance: list[NodeUsed] = []

    for i, (node, role) in enumerate(all_nodes):
        num = i + 1
        if role == "direct":
            body = node.content
        else:
            body = node.summary if node.summary else _excerpt(node.content)

        block_lines = [f"[Note {num}] {node.title} ({node.type})"]
        if node.tags:
            block_lines.append("Tags: " + ", ".join(t.name for t in node.tags))
        block_lines.append(body)

        if node.id in edge_annotations:
            block_lines.append("Connections: " + "; ".join(edge_annotations[node.id]))

        blocks.append("\n".join(block_lines))
        provenance.append(NodeUsed(node_id=node.id, title=node.title, node_type=node.type, role=role))

    return "\n\n---\n\n".join(blocks), provenance


async def query(
    db: aiosqlite.Connection,
    embed_provider: EmbeddingProvider,
    gen_provider: GenerationProvider,
    query_text: str,
    *,
    expansion_depth: int = 1,
) -> RagResponse:
    # 1. Embed query
    try:
        vector = await embed_provider.embed(query_text)
    except Exception as exc:
        raise EmbedUnavailableError("Embedding service unavailable") from exc

    # 2. Hybrid search → top seed candidates
    semantic_ids = await embedding_service.search_similar(db, vector, limit=10)
    fts_ids = await node_repo.fts_search(db, q=query_text, limit=10)
    merged_ids = search_service.rrf_merge([semantic_ids, fts_ids])[:_MAX_SEED_NODES]

    # 3. Fetch seed node details
    seed_nodes = []
    for nid in merged_ids:
        node = await node_repo.get_by_id(db, nid)
        if node is not None:
            seed_nodes.append(node)

    # 4. Graph expansion
    neighbor_ids, traversed_edge_ids = await graph_service.expand(
        db, merged_ids, depth=expansion_depth
    )
    neighbor_ids = neighbor_ids[:_MAX_NEIGHBOR_NODES]

    neighbor_nodes = []
    for nid in neighbor_ids:
        node = await node_repo.get_by_id(db, nid)
        if node is not None:
            neighbor_nodes.append(node)

    # 5. Fetch edge details for context annotation and provenance
    edges = await graph_service.fetch_edges_by_ids(db, traversed_edge_ids)

    # 6. Context assembly
    if seed_nodes or neighbor_nodes:
        context_text, provenance = _build_context(seed_nodes, neighbor_nodes, edges)
        user_content = f"Question: {query_text}\n\nNotes:\n\n{context_text}"
    else:
        provenance = []
        user_content = (
            f"Question: {query_text}\n\n"
            "(No relevant notes found in the knowledge base.)"
        )

    # 7. Generate answer
    messages = [{"role": "user", "content": user_content}]
    answer = await gen_provider.complete(messages, _SYSTEM_PROMPT, max_tokens=2048)

    # 8. Build provenance for edges
    seed_and_neighbor_ids = {n.id for n in seed_nodes + neighbor_nodes}
    edges_traversed = [
        EdgeTraversed(
            edge_id=e.id,
            from_id=e.from_id,
            to_id=e.to_id,
            edge_type=e.type,
            note=e.note,
        )
        for e in edges
        if e.from_id in seed_and_neighbor_ids or e.to_id in seed_and_neighbor_ids
    ]

    return RagResponse(
        answer=answer,
        query=query_text,
        provenance=provenance,
        edges_traversed=edges_traversed,
    )
