#!/usr/bin/env python3
"""Standing diagnostic for the Phase 8.2 reactivation decision.

For each fixture, reports:
  - raw neighbor count produced by `graph_service.expand` (no cap)
  - whether the `_MAX_NEIGHBOR_NODES` cap actually binds
  - if it binds: edge-type breakdown of the kept vs dropped neighbours
  - for any CONTRADICTS / SUPPORTS edge in the retrieved set: the cosine
    similarity between its endpoints

Per docs/ux-build-plan.md §4 (and ADR-058 once written), **Phase 8.2
reactivates** when this probe shows the neighbour cap binding on
CONTRADICTS or SUPPORTS edges on **≥2 fixtures** where the connected
notes have **cosine similarity below 0.6** — that's the signal that
cross-domain typed-edge relationships exist whose endpoints are not
similarity-discoverable, which is the case retrieval-side ranking would
help.

Re-run periodically (after material corpus growth or after Phase 9's
narrative timeline lands) to see whether the criterion is met.

Invocation (from backend/):
    uv run python /home/matt/dev/constellation/evals/phase8_prototype/probe_retrieval.py
"""
import asyncio
import math
import struct
import sys
from collections import Counter
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent
_BACKEND = _REPO_ROOT / "backend"
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_BACKEND))

from app.core.config import get_settings  # noqa: E402
from app.core.database import open_database  # noqa: E402
from app.providers.voyage import VoyageEmbeddingProvider  # noqa: E402
from app.repositories import config_repo, node_repo  # noqa: E402
from app.services import embedding_service, graph_service, search_service  # noqa: E402
from app.services.rag_service import _MAX_NEIGHBOR_NODES, _MAX_SEED_NODES  # noqa: E402

from fixtures import FIXTURES  # noqa: E402

# Reactivation threshold for Phase 8.2 (build-plan §4).
_LOW_SIMILARITY_THRESHOLD = 0.6
_HIGH_SIGNAL_TYPES = {"CONTRADICTS", "SUPPORTS"}


async def _fetch_embedding(db, node_id: str) -> list[float] | None:
    cursor = await db.execute(
        "SELECT embedding FROM vec_nodes WHERE node_id = ?", (node_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    packed = row["embedding"]
    return list(struct.unpack(f"{len(packed) // 4}f", packed))


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


async def _endpoint_similarity(db, from_id: str, to_id: str) -> float | None:
    a = await _fetch_embedding(db, from_id)
    b = await _fetch_embedding(db, to_id)
    if a is None or b is None:
        return None
    return _cosine(a, b)


async def _probe(db, embed_provider, query_text: str) -> dict:
    vector = await embed_provider.embed(query_text)
    semantic_pairs = await embedding_service.search_similar_with_distances(
        db, vector, limit=10
    )
    semantic_ids = [nid for nid, _ in semantic_pairs]
    fts_ids = await node_repo.fts_search(db, q=query_text, limit=10)
    merged_ids = search_service.rrf_merge([semantic_ids, fts_ids])[:_MAX_SEED_NODES]

    neighbor_ids, traversed_edge_ids = await graph_service.expand(db, merged_ids, depth=1)
    raw_neighbor_count = len(neighbor_ids)
    capped_neighbor_ids = neighbor_ids[:_MAX_NEIGHBOR_NODES]
    dropped_neighbor_ids = neighbor_ids[_MAX_NEIGHBOR_NODES:]

    edges = await graph_service.fetch_edges_by_ids(db, traversed_edge_ids)

    seed_set = set(merged_ids)
    kept_set = set(capped_neighbor_ids)
    dropped_set = set(dropped_neighbor_ids)

    kept_edge_types: Counter[str] = Counter()
    dropped_edge_types: Counter[str] = Counter()
    high_signal_edges: list[dict] = []

    for e in edges:
        # An edge "reaches into" the dropped set if either endpoint is dropped
        # and the other endpoint is a seed or kept-neighbor.
        endpoints_in_context = (e.from_id in seed_set or e.from_id in kept_set) and (
            e.to_id in seed_set or e.to_id in kept_set
        )
        endpoints_dropped = (e.from_id in dropped_set or e.to_id in dropped_set) and (
            e.from_id in seed_set or e.to_id in seed_set
        )
        if endpoints_in_context:
            kept_edge_types[e.type] += 1
        if endpoints_dropped:
            dropped_edge_types[e.type] += 1

        if e.type in _HIGH_SIGNAL_TYPES:
            sim = await _endpoint_similarity(db, e.from_id, e.to_id)
            high_signal_edges.append(
                {
                    "type": e.type,
                    "from_id": e.from_id,
                    "to_id": e.to_id,
                    "similarity": sim,
                    "status": "dropped" if endpoints_dropped else (
                        "kept" if endpoints_in_context else "out-of-context"
                    ),
                }
            )

    reactivation_signal = any(
        edge["status"] == "dropped"
        and edge["similarity"] is not None
        and edge["similarity"] < _LOW_SIMILARITY_THRESHOLD
        for edge in high_signal_edges
    )

    return {
        "seeds": len(merged_ids),
        "raw_neighbors": raw_neighbor_count,
        "cap": _MAX_NEIGHBOR_NODES,
        "cap_binds": raw_neighbor_count > _MAX_NEIGHBOR_NODES,
        "dropped_neighbors": len(dropped_neighbor_ids),
        "total_edges": len(edges),
        "kept_edge_types": dict(kept_edge_types),
        "dropped_edge_types": dict(dropped_edge_types),
        "high_signal_edges": high_signal_edges,
        "reactivation_signal": reactivation_signal,
    }


async def main() -> None:
    settings = get_settings()
    if not settings.voyage_api_key:
        raise RuntimeError("VOYAGE_API_KEY required for the probe (embedding only).")

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
        embed = VoyageEmbeddingProvider(api_key=settings.voyage_api_key, model=embed_model)

        print(f"Cap: _MAX_NEIGHBOR_NODES = {_MAX_NEIGHBOR_NODES}")
        print(
            f"Phase 8.2 reactivation threshold: cosine similarity < "
            f"{_LOW_SIMILARITY_THRESHOLD} on {sorted(_HIGH_SIGNAL_TYPES)} edges "
            f"that are dropped at the cap, on ≥2 fixtures\n"
        )

        fixtures_with_signal = 0
        for fx in FIXTURES:
            r = await _probe(db, embed, fx.query)
            print(f"=== {fx.name} ===")
            print(f"  seeds:                {r['seeds']}")
            print(f"  raw neighbours:       {r['raw_neighbors']}")
            print(f"  dropped at cap:       {r['dropped_neighbors']}")
            print(f"  total edges:          {r['total_edges']}")
            print(f"  cap binds?            {r['cap_binds']}")
            print(f"  kept edge types:      {r['kept_edge_types']}")
            print(f"  dropped edge types:   {r['dropped_edge_types']}")
            if r["high_signal_edges"]:
                print("  high-signal edges (CONTRADICTS/SUPPORTS):")
                for edge in r["high_signal_edges"]:
                    sim_str = (
                        f"{edge['similarity']:.3f}"
                        if edge["similarity"] is not None
                        else "n/a"
                    )
                    print(
                        f"    {edge['type']:12s} sim={sim_str:>6s} status={edge['status']}"
                    )
            print(f"  reactivation signal?  {r['reactivation_signal']}")
            print()
            if r["reactivation_signal"]:
                fixtures_with_signal += 1

        print("---")
        print(f"Fixtures with reactivation signal: {fixtures_with_signal} / {len(FIXTURES)}")
        if fixtures_with_signal >= 2:
            print(
                "→ Phase 8.2 REACTIVATION CRITERION MET. Reconsider the retrieval-side "
                "deferral per docs/ux-build-plan.md §4."
            )
        else:
            print(
                "→ Phase 8.2 stays deferred. Re-run after material corpus growth or "
                "after Phase 9 introduces cross-domain typed edges."
            )
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
