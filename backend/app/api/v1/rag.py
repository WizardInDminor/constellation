import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.deps import DB, EmbedProvider, GenProvider
from app.models import EdgeCreate, NodeDetail, PermanentCreate
from app.models.rag import (
    LinkSuggestion,
    RagRequest,
    RagResponse,
    SaveAnswerRequest,
    ScopedRagRequest,
    SuggestLinksResponse,
    SuggestPermanentResponse,
)
from app.repositories import edge_repo, node_repo
from app.services import embedding_service, generation_service, rag_service

router = APIRouter(prefix="/rag", tags=["rag"])

_SYSTEM_PROMPT = """\
You are a zettelkasten assistant. The user will give you a raw fleeting note \
(a thought captured quickly). Your job is to decompose it into atomic permanent \
notes for a personal knowledge base.

Rules:
- Return EXACTLY ONE candidate per distinct idea — often just 1. Two or three only \
when the note genuinely contains that many separate ideas.
- If the note already lists enumerated points, each point maps to one candidate; \
do not invent additional ones.
- Each candidate covers exactly ONE idea.
- Write in the user's own words — paraphrase and clarify, don't copy verbatim.
- Each note must be self-contained (readable without the original note).
- Title: concise and specific (5–12 words), states the idea directly.
- Content: 2–5 sentences that fully express the idea.
- Summary: a single sentence (max 20 words) suitable for search result previews.

Return ONLY valid JSON — no markdown fences, no preamble, no commentary:
{"candidates": [{"title": "...", "content": "...", "summary": "..."}, ...]}\
"""


@router.post("/suggest-permanent/{node_id}")
async def suggest_permanent(
    node_id: str, db: DB, provider: GenProvider
) -> SuggestPermanentResponse:
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    if node.type != "fleeting":
        raise HTTPException(
            422, f"Node is type '{node.type}'; only fleeting notes can be processed"
        )

    messages = [
        {"role": "user", "content": f"Title: {node.title}\n\nContent:\n{node.content}"}
    ]
    raw = await generation_service.complete(provider, messages, _SYSTEM_PROMPT, max_tokens=1024)

    try:
        cleaned = raw.strip()
        # Strip markdown code fences
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        # Extract the outermost JSON object or array from surrounding prose
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
        if match:
            cleaned = match.group()
        data = json.loads(cleaned)
        # Handle raw array format — Claude sometimes returns [...] directly
        if isinstance(data, list):
            data = {"candidates": data}
        return SuggestPermanentResponse.model_validate(
            {"fleeting_id": node_id, "candidates": data["candidates"]}
        )
    except (json.JSONDecodeError, KeyError, ValidationError) as exc:
        import logging
        logging.getLogger(__name__).error("Unparseable AI response: %r", raw)
        raise HTTPException(500, "AI returned unparseable response") from exc


_SUGGEST_LINKS_SYSTEM = """\
You are a zettelkasten assistant. The user will give you a source note and up to 10 \
candidate notes from their knowledge base. Your job is to identify genuine conceptual \
connections — not superficial keyword overlap.

For each candidate where a real relationship exists, return it with the most fitting \
edge type and a one-sentence rationale. Skip candidates where no meaningful connection \
exists. It is better to return two strong suggestions than eight weak ones.

Edge types:
  SUPPORTS     — the candidate provides evidence or argument for the source
  CONTRADICTS  — the candidate is in tension with the source
  ELABORATES   — the candidate zooms in on one aspect of the source
  ANALOGOUS_TO — structural similarity across domains
  QUESTIONS    — the candidate raises a problem with or about the source
  INSPIRED_BY  — looser creative or associative link
  COLLECTS     — the source (a structure note) includes the candidate in its map

Return ONLY valid JSON — no markdown fences, no commentary:
{"suggestions": [{"node_id": "...", "edge_type": "...", "rationale": "..."}, ...]}\
"""


@router.post("/suggest-links/{node_id}")
async def suggest_links(
    node_id: str, db: DB, embed_provider: EmbedProvider, gen_provider: GenProvider
) -> SuggestLinksResponse:
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    if node.type == "fleeting":
        raise HTTPException(
            422, "Fleeting notes cannot be used as link suggestion sources"
        )

    # Embed source inline — always fresh so we don't depend on a stored vector
    vector = await embed_provider.embed(f"{node.title}\n\n{node.content}")
    candidate_ids = await embedding_service.find_similar(
        db, vector, exclude_id=node_id, limit=10
    )
    if not candidate_ids:
        return SuggestLinksResponse(source_id=node_id, suggestions=[])

    # Fetch full content for each candidate
    candidates = []
    for cid in candidate_ids:
        c = await node_repo.get_by_id(db, cid)
        if c is not None:
            candidates.append(c)

    candidate_blocks = "\n\n".join(
        f"[{i + 1}] node_id: {c.id}\n    Title: {c.title}\n    Content: {c.content}"
        for i, c in enumerate(candidates)
    )
    user_msg = (
        f"SOURCE NOTE:\nTitle: {node.title}\nContent: {node.content}"
        f"\n\nCANDIDATES:\n{candidate_blocks}"
    )

    raw = await generation_service.complete(
        gen_provider, [{"role": "user", "content": user_msg}], _SUGGEST_LINKS_SYSTEM, max_tokens=1024
    )

    try:
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            cleaned = match.group()
        data = json.loads(cleaned)
        raw_suggestions = data.get("suggestions", [])
    except (json.JSONDecodeError, KeyError) as exc:
        import logging
        logging.getLogger(__name__).error("Unparseable suggest-links response: %r", raw)
        raise HTTPException(500, "AI returned unparseable response") from exc

    # Enrich with title/type from the candidates we already have in memory
    candidates_by_id = {c.id: c for c in candidates}
    suggestions: list[LinkSuggestion] = []
    for s in raw_suggestions:
        cid = s.get("node_id", "")
        c = candidates_by_id.get(cid)
        if c is None:
            continue
        try:
            suggestions.append(
                LinkSuggestion(
                    node_id=cid,
                    node_title=c.title,
                    node_type=c.type,
                    edge_type=s["edge_type"],
                    rationale=s.get("rationale", ""),
                )
            )
        except (ValidationError, KeyError):
            continue

    return SuggestLinksResponse(source_id=node_id, suggestions=suggestions)


@router.post("/query")
async def rag_query(
    body: RagRequest, db: DB, embed_provider: EmbedProvider, gen_provider: GenProvider
) -> RagResponse:
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        return await rag_service.query(
            db,
            embed_provider,
            gen_provider,
            body.query,
            expansion_depth=body.depth,
        )
    except rag_service.EmbedUnavailableError as exc:
        raise HTTPException(503, "Embedding service unavailable") from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("RAG query failed: %s", exc)
        raise HTTPException(500, "RAG query failed") from exc


@router.post("/scoped")
async def rag_scoped(
    body: ScopedRagRequest, db: DB, gen_provider: GenProvider
) -> RagResponse:
    """Run RAG against an explicit list of node IDs — no retrieval, no expansion."""
    if not body.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    try:
        return await rag_service.query_scoped(
            db,
            gen_provider,
            body.query,
            body.node_ids,
            custom_prompt=body.custom_prompt,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Scoped RAG failed: %s", exc)
        raise HTTPException(500, "Scoped RAG failed") from exc


def _derive_title(query: str) -> str:
    """Title for a saved answer — first 80 chars of the query, trimmed at a word boundary."""
    q = query.strip()
    if len(q) <= 80:
        return q or "Synthesis"
    cut = q[:80].rsplit(" ", 1)[0] or q[:80]
    return cut + "…"


@router.post("/save-answer")
async def save_answer(
    body: SaveAnswerRequest, db: DB, embed_provider: EmbedProvider
) -> NodeDetail:
    """Persist a RAG answer as a permanent note with COLLECTS edges to cited sources."""
    if not body.answer.strip():
        raise HTTPException(400, "Answer cannot be empty")

    title = (body.title or _derive_title(body.query)).strip() or "Synthesis"

    summary_parts = [f"Synthesis of {len(body.provenance_ids)} notes"]
    if body.query.strip():
        q_short = body.query[:120].strip()
        summary_parts.append(f"query: {q_short}")
    summary = " — ".join(summary_parts)

    node = await node_repo.create_permanent(
        db,
        PermanentCreate(
            title=title,
            content=body.answer,
            summary=summary,
        ),
    )

    # Auto-link to each cited source via COLLECTS — silently skip ids that
    # don't resolve (the citation pass on the frontend may include bad refs).
    for src_id in body.provenance_ids:
        if src_id == node.id:
            continue
        target = await node_repo.get_by_id(db, src_id)
        if target is None:
            continue
        try:
            await edge_repo.create(
                db,
                EdgeCreate(
                    from_id=node.id,
                    to_id=src_id,
                    type="COLLECTS",
                    note=None,
                ),
            )
        except Exception:
            # Edge already exists or other integrity issue — skip
            continue

    # Embed inline so the saved synthesis is searchable / linkable immediately
    await embedding_service.embed_or_queue(db, node.id, embed_provider)

    refreshed = await node_repo.get_by_id(db, node.id)
    assert refreshed is not None
    return refreshed
