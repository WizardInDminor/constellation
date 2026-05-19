import asyncio
import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

from app.core.deps import DB, EmbedProvider, GenProvider
from app.models import EdgeCreate, NodeDetail, NodeRef, PermanentCreate
from app.models.rag import (
    ClusterLinkProposal,
    ClusterSuggestRequest,
    ClusterSuggestResponse,
    LinkSuggestion,
    RagRequest,
    RagResponse,
    SaveAnswerRequest,
    ScopedRagRequest,
    SuggestLinksResponse,
    SuggestPermanentResponse,
)
from app.providers.base import EmbeddingProvider, GenerationProvider
from app.repositories import edge_repo, node_repo, tag_repo
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

    messages = [{"role": "user", "content": f"Title: {node.title}\n\nContent:\n{node.content}"}]
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
  CITES        — the source references the candidate as a specific reference (closer to a footnote than a curation)
  BUILDS_ON    — the source advances or extends the candidate's framework
  APPLIES_TO   — the source applies the candidate's idea to a new domain or instance
  MEASURES     — the source is an empirical measurement of the candidate's claim or quantity
  EXTENDS      — the source adds scope or generality to the candidate (dimension-ward rather than depth-ward)
  REFINES      — the source sharpens or specializes the candidate without contradicting it

Return ONLY valid JSON — no markdown fences, no commentary:
{"suggestions": [{"node_id": "...", "edge_type": "...", "rationale": "..."}, ...]}\
"""


async def _suggest_links_for_node(
    db,
    source: NodeDetail,
    embed_provider: EmbeddingProvider,
    gen_provider: GenerationProvider,
) -> list[LinkSuggestion]:
    """Per-node suggest-links body, extracted so both the singular and cluster
    endpoints share the same retrieval + LLM call + parsing logic.
    """
    vector = await embed_provider.embed(f"{source.title}\n\n{source.content}")
    candidate_ids = await embedding_service.find_similar(db, vector, exclude_id=source.id, limit=10)
    if not candidate_ids:
        return []

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
        f"SOURCE NOTE:\nTitle: {source.title}\nContent: {source.content}"
        f"\n\nCANDIDATES:\n{candidate_blocks}"
    )

    raw = await generation_service.complete(
        gen_provider,
        [{"role": "user", "content": user_msg}],
        _SUGGEST_LINKS_SYSTEM,
        max_tokens=1024,
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
        raise ValueError("AI returned unparseable response") from exc

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
    return suggestions


_CLUSTER_MAX_SCOPE = 50


@router.post("/suggest-links/cluster")
async def suggest_links_cluster(
    body: ClusterSuggestRequest,
    db: DB,
    embed_provider: EmbedProvider,
    gen_provider: GenProvider,
) -> ClusterSuggestResponse:
    """Run suggest-links over a scope (explicit node_ids or a tag).

    Per-source results are deduped by canonical (sorted) pair-key so the user
    sees one row per pair-of-notes, not two from different source perspectives.
    First-seen wins; the input order is the request's `node_ids` list or the
    tag-resolved order (oldest-first by created_at).
    """
    if body.node_ids and body.tag_id:
        raise HTTPException(422, "Provide either node_ids or tag_id, not both")
    if not body.node_ids and not body.tag_id:
        raise HTTPException(422, "Provide either node_ids or tag_id")

    if body.tag_id is not None:
        ids = await tag_repo.list_node_ids_for_tag(db, body.tag_id, limit=_CLUSTER_MAX_SCOPE)
    else:
        ids = (body.node_ids or [])[:_CLUSTER_MAX_SCOPE]

    # Resolve to NodeDetail, skip fleeting (suggest-links rejects them) and missing
    sources: list[NodeDetail] = []
    for nid in ids:
        n = await node_repo.get_by_id(db, nid)
        if n is not None and n.type != "fleeting":
            sources.append(n)

    if not sources:
        return ClusterSuggestResponse(proposals=[], scope_size=0)

    # Per-source suggest-links in parallel; any single failure becomes empty list
    results = await asyncio.gather(
        *(_suggest_links_for_node(db, s, embed_provider, gen_provider) for s in sources),
        return_exceptions=True,
    )

    # Flatten + dedupe by canonical pair-key (sorted), first-seen wins
    seen_pairs: set[tuple[str, str]] = set()
    proposals: list[ClusterLinkProposal] = []
    sources_by_id = {s.id: s for s in sources}
    for source, result in zip(sources, results, strict=True):
        if isinstance(result, Exception):
            continue
        for s in result:
            pair_key = tuple(sorted([source.id, s.node_id]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            proposals.append(
                ClusterLinkProposal(
                    from_node=NodeRef(id=source.id, title=source.title, type=source.type),
                    to_node=NodeRef(id=s.node_id, title=s.node_title, type=s.node_type),
                    edge_type=s.edge_type,
                    rationale=s.rationale,
                )
            )

    return ClusterSuggestResponse(proposals=proposals, scope_size=len(sources))


@router.post("/suggest-links/{node_id}")
async def suggest_links(
    node_id: str, db: DB, embed_provider: EmbedProvider, gen_provider: GenProvider
) -> SuggestLinksResponse:
    node = await node_repo.get_by_id(db, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    if node.type == "fleeting":
        raise HTTPException(422, "Fleeting notes cannot be used as link suggestion sources")

    try:
        suggestions = await _suggest_links_for_node(db, node, embed_provider, gen_provider)
    except ValueError as exc:
        raise HTTPException(500, "AI returned unparseable response") from exc

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
            mode=body.mode,
            tag_filter=body.tag_filter,
            since=body.since,
        )
    except rag_service.EmbedUnavailableError as exc:
        raise HTTPException(503, "Embedding service unavailable") from exc
    except Exception as exc:
        import logging

        logging.getLogger(__name__).error("RAG query failed: %s", exc)
        raise HTTPException(500, "RAG query failed") from exc


@router.post("/scoped")
async def rag_scoped(body: ScopedRagRequest, db: DB, gen_provider: GenProvider) -> RagResponse:
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
            include_session_fleetings=body.include_session_fleetings,
            session_id=body.session_id,
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
async def save_answer(body: SaveAnswerRequest, db: DB, embed_provider: EmbedProvider) -> NodeDetail:
    """Persist a RAG answer as a permanent note with CITES edges to cited sources."""
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

    # Auto-link to each cited source via CITES (ADR-051, supersedes ADR-036).
    # Silently skip ids that don't resolve — the citation pass on the
    # frontend may include bad refs.
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
                    type="CITES",
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


# ---------------------------------------------------------------------------
# Narrative dump → proposed nodes (Slice 5)
# ---------------------------------------------------------------------------


_NARRATIVE_DUMP_SYSTEM = """\
You are a narrative-mode assistant. The user has dumped a block of \
unstructured narrative thinking — a character rant, a sequence of beats, \
a tangle of theme observations — and wants you to extract structured \
candidate nodes from it. They will review your proposals individually \
before any of them become real graph data.

The user passes a `dump_type`:

- `"story-arc"` — extract candidate STORY EVENT nodes (scenes / beats). \
For each, return a short title (5-12 words), a `story_time` if the dump \
implies one (e.g. "Act 2 Scene 3", "Day 14"), and a 2-3 sentence \
description that becomes the event's content.
- `"character"` — extract candidate CHARACTER nodes (people in the \
story). For each, return name, archetype (Protagonist / Antagonist / \
Supporting / Other / Complex), and a 2-3 sentence description.
- `"themes"` — extract candidate THEME nodes (motifs, recurring ideas, \
subtext). For each, return a short label and a one-sentence canonical \
usage note.

Be conservative. Three sharp candidates is better than nine vague ones. \
Don't invent details the dump doesn't support; if the dump is thin, \
return fewer candidates.

Return ONLY valid JSON, no markdown:
{
  "candidates": [
    {"title": "...", "description": "...", "story_time": "..." | null,
     "archetype": "..." | null, "subtype": "event|character|theme"}
  ]
}
"""


class NarrativeDumpRequest(BaseModel):
    dump_text: str
    dump_type: str  # "story-arc" | "character" | "themes"


class NarrativeCandidate(BaseModel):
    title: str
    description: str
    story_time: str | None = None
    archetype: str | None = None
    subtype: str  # "event" | "character" | "theme"


class NarrativeDumpResponse(BaseModel):
    candidates: list[NarrativeCandidate]


@router.post("/narrative-dump")
async def narrative_dump(
    body: NarrativeDumpRequest, db: DB, gen_provider: GenProvider
) -> NarrativeDumpResponse:
    """Extract proposed event / character / theme nodes from a free-form
    narrative dump (philosophy doc §2.7 — "Story Dump" surface). The user
    reviews proposals individually before any become real nodes.
    """
    if not body.dump_text.strip():
        raise HTTPException(400, "dump_text cannot be empty")
    if body.dump_type not in ("story-arc", "character", "themes"):
        raise HTTPException(422, "dump_type must be one of: story-arc, character, themes")

    user_msg = f"dump_type: {body.dump_type}\n\nDump:\n{body.dump_text.strip()}"
    raw = await generation_service.complete(
        gen_provider,
        [{"role": "user", "content": user_msg}],
        _NARRATIVE_DUMP_SYSTEM,
        max_tokens=2048,
    )

    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        cleaned = match.group()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"Narrative dump returned unparseable JSON: {exc}") from exc

    raw_candidates = data.get("candidates", [])
    if not isinstance(raw_candidates, list):
        return NarrativeDumpResponse(candidates=[])
    out: list[NarrativeCandidate] = []
    for c in raw_candidates:
        if not isinstance(c, dict):
            continue
        title = (c.get("title") or "").strip()
        if not title:
            continue
        subtype = c.get("subtype", "")
        if subtype not in ("event", "character", "theme"):
            # Infer from dump_type if missing
            subtype = {
                "story-arc": "event",
                "character": "character",
                "themes": "theme",
            }.get(body.dump_type, "event")
        out.append(
            NarrativeCandidate(
                title=title,
                description=(c.get("description") or "").strip(),
                story_time=c.get("story_time") or None,
                archetype=c.get("archetype") or None,
                subtype=subtype,
            )
        )
    return NarrativeDumpResponse(candidates=out)
