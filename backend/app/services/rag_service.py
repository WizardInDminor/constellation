import logging

import aiosqlite

from app.models.rag import EdgeTraversed, NodeUsed, RagMode, RagResponse
from app.providers.base import EmbeddingProvider, GenerationProvider
from app.repositories import node_repo
from app.services import embedding_service, graph_service, search_service

logger = logging.getLogger(__name__)


class EmbedUnavailableError(RuntimeError):
    """Raised when the embedding provider fails during a RAG query."""


_DEFAULT_PROMPT = """\
You are a zettelkasten assistant. Answer the user's question using only the notes provided below.

Rules:
- Answer directly. Cite notes inline as [Note N] where N is the note number shown in the context.
- If the notes don't contain enough information to answer, say so rather than speculating.
- Preserve the nuance of individual notes; do not blend them into vague generalities.
- Be concise — this is a personal knowledge base, not a general-purpose encyclopedia.
- Do not invent facts not present in the provided notes.\
"""

# ADR-053: advocacy-mode prompt. Swapped in when mode="brief". The user has
# explicitly asked for a one-sided argument; the default prompt's "preserve
# nuance" / "don't blend" rules would push the model back toward balanced
# summary.
_BRIEF_PROMPT = """\
You are a zettelkasten assistant. The user has explicitly asked for a one-sided brief in support of their position. Do not introduce counterarguments unless the user asks for them.

Rules:
- Argue the case directly and commit to it. Use the provided notes as supporting evidence.
- Cite notes inline as [Note N] where N is the note number shown in the context.
- Do not hedge, balance, or list "on the other hand" considerations.
- If the notes don't cover the position, say so honestly — then argue from the closest related notes rather than fabricating.
- Be concise. A brief, not an encyclopedia entry.\
"""

# A10: critic mode. The user wants the questions a careful reader would ask
# about the input. The "query" is typically a note's content; retrieval pulls
# related notes for context. Goal is sharp, specific questions — not generic
# "what about evidence?" prompts.
_CRITIC_PROMPT = """\
You are a careful, skeptical reader of the user's zettelkasten. The user has given you a piece of their own thinking and (possibly) related notes from their knowledge base. Your job is to enumerate the specific questions a careful reader would ask about the input.

Rules:
- Return a numbered list of 3 to 6 questions.
- Each question must be specific to the input's content — name a claim, definition, assumption, scope, or unstated condition. Do not ask generic questions ("what is the evidence?" / "have you considered alternatives?").
- Each question is one or two short sentences.
- Surface what the input assumes, omits, or oversimplifies. Use related notes as context — if a related note contradicts or extends the input, raise that.
- No preamble. No commentary after the list. Just the numbered questions.\
"""


def _system_prompt_for(mode: RagMode | None) -> str:
    if mode == "brief":
        return _BRIEF_PROMPT
    if mode == "critic":
        return _CRITIC_PROMPT
    return _DEFAULT_PROMPT


# Kept for backward-compat with callers that read the default prompt directly.
_SYSTEM_PROMPT = _DEFAULT_PROMPT

_MAX_SEED_NODES = 8
_MAX_NEIGHBOR_NODES = 12
_EXCERPT_CHARS = 200

# ADR-057: below this clamped-cosine similarity, the retrieved seeds are too
# weak to honestly anchor an answer. The default-mode `/ask` prompt
# pre-pends a hedge so the model leads with "your notes don't cover this"
# instead of falling back on training-grade prose. brief/critic modes
# bypass — they have their own retrieval-resistant prompts.
_LOW_CONFIDENCE_THRESHOLD = 0.55

_LOW_CONFIDENCE_HEDGE = (
    "Note: the knowledge base doesn't directly cover this question. "
    "The notes below are the closest related context; the answer should "
    "lead by saying so plainly, then draw on what is there without "
    "inventing detail."
)


def _distance_to_similarity(distance: float) -> float:
    """L2 distance → clamped cosine similarity. Mirrors discover_service."""
    sim = 1.0 - (distance * distance) / 2.0
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


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
        provenance.append(
            NodeUsed(node_id=node.id, title=node.title, node_type=node.type, role=role)
        )

    return "\n\n---\n\n".join(blocks), provenance


async def query(
    db: aiosqlite.Connection,
    embed_provider: EmbeddingProvider,
    gen_provider: GenerationProvider,
    query_text: str,
    *,
    expansion_depth: int = 1,
    mode: RagMode | None = None,
) -> RagResponse:
    # 1. Embed query
    try:
        vector = await embed_provider.embed(query_text)
    except Exception as exc:
        raise EmbedUnavailableError("Embedding service unavailable") from exc

    # 2. Hybrid search → top seed candidates. Retain distances so we can detect
    # low-confidence retrieval (ADR-057) and prepend a hedge in default mode.
    semantic_pairs = await embedding_service.search_similar_with_distances(
        db, vector, limit=10
    )
    semantic_ids = [nid for nid, _ in semantic_pairs]
    fts_ids = await node_repo.fts_search(db, q=query_text, limit=10)
    merged_ids = search_service.rrf_merge([semantic_ids, fts_ids])[:_MAX_SEED_NODES]
    top_similarity = (
        _distance_to_similarity(semantic_pairs[0][1]) if semantic_pairs else 0.0
    )

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
        # ADR-057: if we have notes but they're weak, lead with a hedge.
        # brief / critic modes have their own retrieval-aware prompts.
        is_default_mode = mode is None or mode == "default"
        low_confidence = (
            is_default_mode
            and seed_nodes
            and top_similarity < _LOW_CONFIDENCE_THRESHOLD
        )
        if low_confidence:
            user_content = (
                f"{_LOW_CONFIDENCE_HEDGE}\n\nQuestion: {query_text}\n\nNotes:\n\n{context_text}"
            )
        else:
            user_content = f"Question: {query_text}\n\nNotes:\n\n{context_text}"
    else:
        provenance = []
        user_content = f"Question: {query_text}\n\n(No relevant notes found in the knowledge base.)"

    # 7. Generate answer
    messages = [{"role": "user", "content": user_content}]
    system_prompt = _system_prompt_for(mode)
    answer = await gen_provider.complete(messages, system_prompt, max_tokens=2048)

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


_SCOPED_INSTRUCTION = (
    "The notes below are the complete, intentionally-selected scope. "
    "Treat them as the authoritative source set; do not speculate beyond them."
)


async def query_scoped(
    db: aiosqlite.Connection,
    gen_provider: GenerationProvider,
    query_text: str,
    node_ids: list[str],
    custom_prompt: str | None = None,
) -> RagResponse:
    """Run RAG against an explicit list of node IDs — no retrieval, no expansion.

    Used by the /synthesize workflow where the user has already chosen which
    notes form the context (via tags, date range, or manual selection).
    """
    seed_nodes = []
    for nid in node_ids:
        node = await node_repo.get_by_id(db, nid)
        if node is not None:
            seed_nodes.append(node)

    if not seed_nodes:
        return RagResponse(
            answer="(No matching notes were found in the selected scope.)",
            query=query_text,
            provenance=[],
            edges_traversed=[],
        )

    context_text, provenance = _build_context(seed_nodes, [], [])
    user_content = f"Question: {query_text}\n\nNotes:\n\n{context_text}"

    system_prompt = _SYSTEM_PROMPT + "\n\n" + _SCOPED_INSTRUCTION
    if custom_prompt:
        system_prompt = system_prompt + "\n\nAdditional guidance from the user:\n" + custom_prompt

    messages = [{"role": "user", "content": user_content}]
    answer = await gen_provider.complete(messages, system_prompt, max_tokens=2048)

    return RagResponse(
        answer=answer,
        query=query_text,
        provenance=provenance,
        edges_traversed=[],
    )
