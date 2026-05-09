import json
import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.deps import DB, GenProvider
from app.models.ingest import (
    ChunkResult,
    IngestDocumentRequest,
    IngestDocumentResponse,
    LiteratureCandidate,
    PendingIngestResponse,
)
from app.models.source import SourceCreate
from app.repositories import ingest_repo, source_repo
from app.services import generation_service
from app.services.doc_chunker import MAX_CHUNKS, chunk_document

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

_LITERATURE_SYSTEM_PROMPT = """\
You are a zettelkasten assistant. The user will give you a passage from a source document.
Your job is to extract atomic literature notes — each capturing one factual claim,
specification, or procedure that the source asserts.

Rules:
- Literature notes record what the SOURCE says. Do not add synthesis, opinion, or
  commentary that is not in the passage.
- Each note covers exactly ONE claim, specification, or procedure.
- Title: a concise declarative statement of the fact or spec (5–15 words). Avoid vague
  titles like "SPI Overview" — state the claim directly, e.g. "MCP4922 SPI clock maximum
  is 20 MHz at 5V".
- Content: 2–4 sentences. Preserve units, ranges, conditions, and qualifications exactly
  as stated. Quote key phrases when precise wording matters.
- Summary: one sentence (max 20 words) for search result previews.
- Return 1–4 candidates per passage. Prefer fewer, high-quality notes over many shallow
  ones.
- Skip: boilerplate, legal notices, ordering information, repeated headers,
  table-of-contents entries, and any content that conveys no new factual claim.

Return ONLY valid JSON — no markdown fences, no preamble, no commentary:
{"candidates": [{"title": "...", "content": "...", "summary": "..."}, ...]}\
"""


@router.post("/document")
async def ingest_document(
    body: IngestDocumentRequest, db: DB, gen_provider: GenProvider
) -> IngestDocumentResponse:
    await ingest_repo.expire_old(db)

    if not body.content.strip():
        raise HTTPException(400, "content cannot be empty")

    # Resolve source
    if body.source_id is not None:
        src = await source_repo.get_by_id(db, body.source_id)
        if src is None:
            raise HTTPException(404, f"Source {body.source_id!r} not found")
        source_id = src.id
        source_title = src.title
    else:
        assert body.source is not None
        created = await source_repo.create(
            db,
            SourceCreate(
                title=body.source.title,
                type=body.source.type,
                author=body.source.author,
                url=body.source.url,
            ),
        )
        source_id = created.id
        source_title = created.title

    # Chunk
    chunks = chunk_document(body.content)
    if not chunks:
        raise HTTPException(400, "content produced no processable chunks")

    if len(chunks) > MAX_CHUNKS:
        raise HTTPException(
            400,
            f"Document too large: {len(chunks)} chunks exceeds the {MAX_CHUNKS}-chunk limit. "
            "Paste a specific chapter or section instead of the full file.",
        )

    # Generate candidates per chunk
    chunk_results: list[ChunkResult] = []
    for chunk in chunks:
        user_msg = (
            f"SOURCE: {source_title}\n\n"
            f"PASSAGE (section: {chunk.heading or 'introduction'}):\n{chunk.text}"
        )
        try:
            raw = await generation_service.complete(
                gen_provider,
                [{"role": "user", "content": user_msg}],
                _LITERATURE_SYSTEM_PROMPT,
                max_tokens=1024,
            )
            candidates = _parse_candidates(raw)
            chunk_results.append(
                ChunkResult(
                    chunk_index=chunk.chunk_index,
                    heading=chunk.heading,
                    candidates=candidates,
                )
            )
        except Exception as exc:
            log.warning("Chunk %d generation failed: %s", chunk.chunk_index, exc)
            chunk_results.append(
                ChunkResult(
                    chunk_index=chunk.chunk_index,
                    heading=chunk.heading,
                    candidates=[],
                    error=str(exc),
                )
            )

    # Persist pending ingest
    pending_id = await ingest_repo.upsert(db, source_id, chunk_results)

    total = sum(len(r.candidates) for r in chunk_results)
    return IngestDocumentResponse(
        source_id=source_id,
        pending_ingest_id=pending_id,
        chunks_processed=len(chunk_results),
        total_candidates=total,
        chunks=chunk_results,
    )


@router.get("/pending/{source_id}")
async def get_pending(source_id: str, db: DB) -> PendingIngestResponse:
    record = await ingest_repo.get_by_source(db, source_id)
    if record is None:
        raise HTTPException(404, f"No pending ingest found for source {source_id!r}")
    return record


@router.delete("/pending/{source_id}", status_code=204)
async def clear_pending(source_id: str, db: DB) -> None:
    await ingest_repo.delete_by_source(db, source_id)


def _parse_candidates(raw: str) -> list[LiteratureCandidate]:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        cleaned = match.group()
    data = json.loads(cleaned)
    if isinstance(data, list):
        data = {"candidates": data}
    raw_list = data.get("candidates", [])
    result: list[LiteratureCandidate] = []
    for item in raw_list:
        try:
            result.append(LiteratureCandidate.model_validate(item))
        except (ValidationError, KeyError):
            continue
    return result
