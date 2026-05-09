import json

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.deps import DB, GenProvider
from app.models.rag import SuggestPermanentResponse
from app.repositories import node_repo
from app.services import generation_service

router = APIRouter(prefix="/rag", tags=["rag"])

_SYSTEM_PROMPT = """\
You are a zettelkasten assistant. The user will give you a raw fleeting note \
(a thought captured quickly). Your job is to decompose it into 1–3 atomic \
permanent notes suitable for a personal knowledge base.

Rules:
- Each candidate covers exactly ONE idea
- Write in the user's own words — paraphrase and clarify, don't copy verbatim
- Each note must be self-contained (readable without the original note)
- Title: concise and specific (5–12 words), states the idea directly
- Content: 2–5 sentences that fully express the idea
- Summary: a single sentence (max 20 words) suitable for search result previews

Return ONLY valid JSON with no markdown fences, no preamble, no commentary:
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
        data = json.loads(raw)
        return SuggestPermanentResponse.model_validate(
            {"fleeting_id": node_id, "candidates": data["candidates"]}
        )
    except (json.JSONDecodeError, KeyError, ValidationError) as exc:
        raise HTTPException(500, "AI returned unparseable response") from exc
