#!/usr/bin/env python3
"""Phase 8.0 prototype gate harness.

Invocation (from repo root):
    cd backend && uv run python ../evals/phase8_prototype/run.py [--label v0]

What it does: replicates `rag_service.query` retrieval (embed → hybrid search →
graph expansion → context assembly) once per fixture, then calls the generation
provider twice against the assembled context — once with the current default
prompt, once with the candidate edge-aware prompt. Holding retrieval constant
isolates the prompt's effect.

For the CONTRADICTS fixture, the harness also runs a third generation pass
with the single CONTRADICTS edge filtered out of the edges list before context
assembly. This is the soft-delete experiment (build-plan §4 Phase 8.0
acceptance #4) without mutating the database — edges flow into _build_context
as a parameter, so dropping one is enough.

Outputs are written as Markdown to evals/phase8_prototype/runs/<date>-<label>/.
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent
_BACKEND = _REPO_ROOT / "backend"

sys.path.insert(0, str(_HERE))      # so we can import the sibling prompts/fixtures
sys.path.insert(0, str(_BACKEND))   # so app.* is importable

from app.core.config import get_settings  # noqa: E402
from app.core.database import open_database  # noqa: E402
from app.providers.anthropic_gen import AnthropicGenerationProvider  # noqa: E402
from app.providers.voyage import VoyageEmbeddingProvider  # noqa: E402
from app.repositories import config_repo, node_repo  # noqa: E402
from app.services import embedding_service, graph_service, search_service  # noqa: E402
from app.services.rag_service import (  # noqa: E402
    _MAX_NEIGHBOR_NODES,
    _MAX_SEED_NODES,
    _build_context,
)

from fixtures import F1_CONTRADICTS_EDGE_ID, FIXTURES, Fixture  # noqa: E402
from prompts import CANDIDATE_PROMPT_V0, DEFAULT_PROMPT  # noqa: E402


async def _retrieve(db, embed_provider, query_text: str):
    """Mirror rag_service.query steps 1-5; return raw pieces so the caller can
    filter edges before _build_context (the soft-delete experiment)."""
    vector = await embed_provider.embed(query_text)
    semantic_pairs = await embedding_service.search_similar_with_distances(
        db, vector, limit=10
    )
    semantic_ids = [nid for nid, _ in semantic_pairs]
    fts_ids = await node_repo.fts_search(db, q=query_text, limit=10)
    merged_ids = search_service.rrf_merge([semantic_ids, fts_ids])[:_MAX_SEED_NODES]

    seed_nodes = []
    for nid in merged_ids:
        node = await node_repo.get_by_id(db, nid)
        if node is not None:
            seed_nodes.append(node)

    neighbor_ids, traversed_edge_ids = await graph_service.expand(db, merged_ids, depth=1)
    neighbor_ids = neighbor_ids[:_MAX_NEIGHBOR_NODES]
    neighbor_nodes = []
    for nid in neighbor_ids:
        node = await node_repo.get_by_id(db, nid)
        if node is not None:
            neighbor_nodes.append(node)

    edges = await graph_service.fetch_edges_by_ids(db, traversed_edge_ids)
    return seed_nodes, neighbor_nodes, edges


async def _generate(
    gen_provider, system_prompt: str, query_text: str, context_text: str
) -> str:
    user_content = f"Question: {query_text}\n\nNotes:\n\n{context_text}"
    return await gen_provider.complete(
        [{"role": "user", "content": user_content}],
        system_prompt,
        max_tokens=2048,
    )


def _render_fixture_markdown(
    fixture: Fixture,
    context_text: str,
    default_answer: str,
    candidate_answer: str,
    soft_delete_answer: str | None,
    soft_delete_note: str | None,
) -> str:
    lines = [
        f"# {fixture.name}",
        "",
        f"**Edge type focus:** {fixture.edge_type_focus}",
        "",
        f"**Query:** {fixture.query}",
        "",
        f"**Rationale:** {fixture.rationale}",
        "",
        "---",
        "",
        "## Default prompt output",
        "",
        default_answer.strip(),
        "",
        "---",
        "",
        "## Candidate prompt output",
        "",
        candidate_answer.strip(),
        "",
    ]
    if soft_delete_answer is not None:
        lines += [
            "---",
            "",
            "## Soft-delete experiment",
            "",
            "Candidate prompt re-run with the CONTRADICTS edge filtered out of the "
            "edges list before context assembly. Same retrieval, same seeds, same "
            "neighbours — only the typed-edge annotation is gone.",
            "",
            soft_delete_answer.strip(),
            "",
        ]
    elif soft_delete_note is not None:
        lines += [
            "---",
            "",
            "## Soft-delete experiment",
            "",
            f"_Skipped: {soft_delete_note}_",
            "",
        ]
    lines += [
        "---",
        "",
        "## Context assembled (identical across all prompts above)",
        "",
        "```",
        context_text,
        "```",
        "",
    ]
    return "\n".join(lines)


async def main(label: str) -> None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required.")
    if not settings.voyage_api_key:
        raise RuntimeError("VOYAGE_API_KEY is required.")

    db_path_setting = settings.db_path
    if db_path_setting.startswith("./"):
        db_path = str(_BACKEND / db_path_setting[2:])
    elif not Path(db_path_setting).is_absolute():
        db_path = str(_BACKEND / db_path_setting)
    else:
        db_path = db_path_setting

    db = await open_database(db_path)
    try:
        embed_model = (await config_repo.get(db, "embedding_model")).value
        gen_model = (await config_repo.get(db, "generation_model")).value
        embed_provider = VoyageEmbeddingProvider(
            api_key=settings.voyage_api_key, model=embed_model
        )
        gen_provider = AnthropicGenerationProvider(
            api_key=settings.anthropic_api_key, model=gen_model
        )

        run_dir = _HERE / "runs" / f"{datetime.now(UTC).strftime('%Y-%m-%d')}-{label}"
        run_dir.mkdir(parents=True, exist_ok=True)

        summary = [
            f"# Phase 8.0 prototype run — {label}",
            "",
            f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
            f"- Embed model: {embed_provider.model_id}",
            f"- Gen model: {gen_provider.model_id}",
            f"- Fixtures: {len(FIXTURES)}",
            "",
        ]

        for fixture in FIXTURES:
            print(f"=== {fixture.name} ===", flush=True)
            seed_nodes, neighbor_nodes, edges = await _retrieve(
                db, embed_provider, fixture.query
            )
            print(
                f"  seeds={len(seed_nodes)} neighbours={len(neighbor_nodes)} "
                f"edges={len(edges)}",
                flush=True,
            )
            context_text, _ = _build_context(seed_nodes, neighbor_nodes, edges)

            default_answer = await _generate(
                gen_provider, DEFAULT_PROMPT, fixture.query, context_text
            )
            candidate_answer = await _generate(
                gen_provider, CANDIDATE_PROMPT_V0, fixture.query, context_text
            )

            soft_delete_answer: str | None = None
            soft_delete_note: str | None = None
            if fixture.name == "F1_consciousness_contradicts":
                contradicts_present = any(
                    e.id == F1_CONTRADICTS_EDGE_ID for e in edges
                )
                if contradicts_present:
                    filtered = [e for e in edges if e.id != F1_CONTRADICTS_EDGE_ID]
                    sd_context, _ = _build_context(seed_nodes, neighbor_nodes, filtered)
                    soft_delete_answer = await _generate(
                        gen_provider, CANDIDATE_PROMPT_V0, fixture.query, sd_context
                    )
                else:
                    soft_delete_note = (
                        f"the expected CONTRADICTS edge "
                        f"({F1_CONTRADICTS_EDGE_ID}) was not in the retrieved edge "
                        f"set, so removing it would not change context. Adjust the "
                        f"fixture query so both endpoint nodes are in seeds/neighbours."
                    )

            md = _render_fixture_markdown(
                fixture,
                context_text,
                default_answer,
                candidate_answer,
                soft_delete_answer,
                soft_delete_note,
            )
            (run_dir / f"{fixture.name}.md").write_text(md)

            summary.append(
                f"- **{fixture.name}** ({fixture.edge_type_focus}): "
                f"seeds={len(seed_nodes)}, neighbours={len(neighbor_nodes)}, "
                f"edges={len(edges)}"
                + (
                    " — soft-delete experiment ran"
                    if soft_delete_answer is not None
                    else (
                        " — soft-delete skipped: " + soft_delete_note
                        if soft_delete_note
                        else ""
                    )
                )
            )

        summary.append("")
        summary.append("See per-fixture files for side-by-side outputs.")
        (run_dir / "summary.md").write_text("\n".join(summary))

        print(f"\nDone. Run dir: {run_dir.relative_to(_REPO_ROOT)}")
    finally:
        await db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--label",
        default="v0",
        help="run label (e.g. 'v0', 'v1'); output goes to runs/YYYY-MM-DD-<label>/",
    )
    args = parser.parse_args()
    asyncio.run(main(args.label))
