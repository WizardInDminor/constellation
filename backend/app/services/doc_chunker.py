"""Pure, synchronous markdown/text document chunker.

Splits a document into DocumentChunk records for the ingest pipeline.
No async, no DB, no provider calls — independently unit-testable.
"""

import re
from dataclasses import dataclass


_MARKDOWN_EXTENSIONS = {".md", ".markdown"}
_HEADING_RE = re.compile(r"(?m)^(#{2,3}) (.+)")
_SPLIT_RE = re.compile(r"(?m)(?=^#{2,3} )", )

MAX_CHARS = 2400  # ≈ 600 tokens at chars/4
MAX_CHUNKS = 30


@dataclass
class DocumentChunk:
    chunk_index: int
    heading: str | None
    text: str


def chunk_document(content: str, filename: str = "") -> list[DocumentChunk]:
    """Split *content* into DocumentChunks suitable for the ingest pipeline.

    Markdown detection: triggered when *filename* has a .md/.markdown extension,
    OR (if filename is absent) when the content contains at least one H2/H3 line.
    Non-markdown content is split by paragraph then grouped to MAX_CHARS.
    """
    if not content.strip():
        return []

    use_markdown = _is_markdown(content, filename)

    if use_markdown:
        raw_chunks = _split_by_headings(content)
    else:
        raw_chunks = _split_by_paragraphs(content)

    # Apply oversized fallback and assign final indices
    result: list[DocumentChunk] = []
    for raw in raw_chunks:
        if len(raw.text) > MAX_CHARS:
            sub = _split_oversized(raw)
            result.extend(sub)
        else:
            result.append(raw)

    # Re-index after any oversized splits
    for i, chunk in enumerate(result):
        chunk.chunk_index = i

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_markdown(content: str, filename: str) -> bool:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in _MARKDOWN_EXTENSIONS:
        return True
    if filename and ext not in _MARKDOWN_EXTENSIONS:
        return False
    return bool(_HEADING_RE.search(content))


def _split_by_headings(content: str) -> list[DocumentChunk]:
    parts = _SPLIT_RE.split(content)
    chunks: list[DocumentChunk] = []
    for i, part in enumerate(parts):
        text = part.strip()
        if not text:
            continue
        heading_match = _HEADING_RE.match(text)
        heading = heading_match.group(2).strip() if heading_match else None
        chunks.append(DocumentChunk(chunk_index=i, heading=heading, text=text))
    return chunks


def _split_by_paragraphs(content: str) -> list[DocumentChunk]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", content) if p.strip()]
    return _group_paragraphs(paragraphs, heading=None)


def _split_oversized(chunk: DocumentChunk) -> list[DocumentChunk]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", chunk.text) if p.strip()]
    if len(paragraphs) <= 1:
        # Single unsplittable block — keep as-is rather than truncating
        return [chunk]
    return _group_paragraphs(paragraphs, heading=chunk.heading)


def _group_paragraphs(
    paragraphs: list[str], heading: str | None
) -> list[DocumentChunk]:
    groups: list[DocumentChunk] = []
    current_parts: list[str] = []
    current_len = 0

    for para in paragraphs:
        if current_parts and current_len + len(para) + 2 > MAX_CHARS:
            groups.append(
                DocumentChunk(
                    chunk_index=0,
                    heading=heading if not groups else None,
                    text="\n\n".join(current_parts),
                )
            )
            current_parts = []
            current_len = 0
        current_parts.append(para)
        current_len += len(para) + 2

    if current_parts:
        groups.append(
            DocumentChunk(
                chunk_index=0,
                heading=heading if not groups else None,
                text="\n\n".join(current_parts),
            )
        )

    return groups
