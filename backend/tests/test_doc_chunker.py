"""Unit tests for the doc_chunker pure function.

No fixtures, no DB, no async — just function calls.
"""

import pytest

from app.services.doc_chunker import MAX_CHARS, MAX_CHUNKS, DocumentChunk, chunk_document


# ---------------------------------------------------------------------------
# Basic cases
# ---------------------------------------------------------------------------


def test_empty_string_returns_empty():
    assert chunk_document("") == []


def test_whitespace_only_returns_empty():
    assert chunk_document("   \n\n\t  ") == []


def test_single_h2_produces_one_chunk():
    md = "## Pin Description\n\nEach pin is numbered 1–8."
    chunks = chunk_document(md, filename="doc.md")
    assert len(chunks) == 1
    assert chunks[0].heading == "Pin Description"
    assert "pin" in chunks[0].text.lower()


def test_two_h2s_produce_two_chunks():
    md = "## Section A\n\nContent A.\n\n## Section B\n\nContent B."
    chunks = chunk_document(md, filename="doc.md")
    assert len(chunks) == 2
    assert chunks[0].heading == "Section A"
    assert chunks[1].heading == "Section B"


def test_h3_splits_like_h2():
    md = "## Main\n\nIntro.\n\n### Sub\n\nDetail."
    chunks = chunk_document(md, filename="doc.md")
    assert len(chunks) == 2
    assert chunks[0].heading == "Main"
    assert chunks[1].heading == "Sub"


def test_preamble_before_first_heading_is_chunk_zero():
    md = "Intro text without a heading.\n\n## Section One\n\nBody."
    chunks = chunk_document(md, filename="doc.md")
    assert len(chunks) == 2
    assert chunks[0].heading is None
    assert "Intro" in chunks[0].text
    assert chunks[1].heading == "Section One"


def test_chunk_indices_are_sequential():
    md = "## A\n\nText.\n\n## B\n\nMore.\n\n## C\n\nEven more."
    chunks = chunk_document(md, filename="doc.md")
    assert [c.chunk_index for c in chunks] == [0, 1, 2]


# ---------------------------------------------------------------------------
# Oversized chunk fallback
# ---------------------------------------------------------------------------


def test_oversized_h2_section_splits_by_paragraph():
    long_para_a = "A " * 600      # ~1200 chars
    long_para_b = "B " * 600      # ~1200 chars
    md = f"## Big Section\n\n{long_para_a}\n\n{long_para_b}"
    chunks = chunk_document(md, filename="doc.md")
    assert len(chunks) >= 2
    for c in chunks:
        assert len(c.text) <= MAX_CHARS + 200  # allow one oversized single-para block


def test_single_unsplittable_block_kept_as_is():
    # A single paragraph longer than MAX_CHARS with no blank lines
    big = "word " * 600  # ~3000 chars, no \n\n
    chunks = chunk_document(big)
    assert len(chunks) == 1


# ---------------------------------------------------------------------------
# Non-markdown / plain text fallback
# ---------------------------------------------------------------------------


def test_no_headings_splits_by_paragraph():
    content = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    chunks = chunk_document(content, filename="notes.txt")
    # All three paragraphs are short; they may be grouped into one or more chunks
    assert len(chunks) >= 1
    combined = " ".join(c.text for c in chunks)
    assert "First" in combined
    assert "Second" in combined
    assert "Third" in combined


def test_txt_extension_triggers_paragraph_split_even_with_headings():
    content = "## Fake heading\n\nSome content."
    chunks = chunk_document(content, filename="notes.txt")
    # .txt extension forces paragraph mode — no heading extracted
    assert len(chunks) >= 1
    assert chunks[0].heading is None


def test_md_extension_triggers_markdown_split():
    content = "## Real Heading\n\nContent here."
    chunks = chunk_document(content, filename="file.md")
    assert chunks[0].heading == "Real Heading"


def test_no_filename_uses_content_heuristic_with_headings():
    content = "## Section\n\nBody text."
    chunks = chunk_document(content, filename="")
    assert chunks[0].heading == "Section"


def test_no_filename_uses_content_heuristic_without_headings():
    content = "Plain text paragraph.\n\nAnother paragraph."
    chunks = chunk_document(content, filename="")
    assert len(chunks) >= 1
    assert chunks[0].heading is None


# ---------------------------------------------------------------------------
# Paragraph grouping
# ---------------------------------------------------------------------------


def test_short_paragraphs_grouped_into_single_chunk():
    paras = "\n\n".join(["Short para."] * 5)
    chunks = chunk_document(paras, filename="notes.txt")
    assert len(chunks) == 1


def test_many_short_paragraphs_grouped_up_to_max_chars():
    # Each para is ~100 chars; 25 paras = ~2500 chars > MAX_CHARS
    para = "x " * 50  # 100 chars
    content = "\n\n".join([para] * 25)
    chunks = chunk_document(content, filename="notes.txt")
    assert len(chunks) >= 2
    for c in chunks:
        assert len(c.text) <= MAX_CHARS + len(para) + 2


# ---------------------------------------------------------------------------
# MAX_CHUNKS cap (tested at the chunker level)
# ---------------------------------------------------------------------------


def test_more_than_max_chunks_sections_are_all_returned():
    # chunk_document itself does NOT truncate; the route enforces the cap
    md = "\n\n".join(f"## Section {i}\n\nContent." for i in range(MAX_CHUNKS + 5))
    chunks = chunk_document(md, filename="big.md")
    assert len(chunks) == MAX_CHUNKS + 5
