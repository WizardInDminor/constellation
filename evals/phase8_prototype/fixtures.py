"""Fixtures for the Phase 8.0 prototype gate.

Each fixture is a query the harness runs through the live RAG pipeline. The
`expected_load_bearing_edge_ids` field annotates the edges whose presence the
candidate prompt should be able to use — it's diagnostic (printed alongside
the output) and powers the soft-delete experiment for F1.

The fixtures were chosen against the live corpus as of commit cac3bb0; rerun
the inspection queries in this file's docstring if the corpus drifts.

Selection rationale: docs/ux-build-plan.md §4 calls for 3 CONTRADICTS pairs.
The live corpus has only one. The gate is broadened to the edge-vocabulary
the corpus actually exercises — see evals/phase8_prototype/README.md for
the full justification.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Fixture:
    name: str
    edge_type_focus: str  # the primary edge type the fixture is meant to exercise
    query: str
    expected_load_bearing_edge_ids: list[str] = field(default_factory=list)
    rationale: str = ""


# F1 — the one real CONTRADICTS pair. Edge id is fixed; the soft-delete
# experiment removes this edge from the context and re-runs the candidate.
#
# from: 03c2a226 — "Humans as Biological Sensors Interpreting Environmental Fields"
# to:   96d7521f — "Human Consciousness as a Field-Interpretation Process"
# note: "Active vs Passive participation in reality and mental states"
F1_CONTRADICTS_EDGE_ID = "aa23807a-f826-466c-a642-6e72b61c8f19"


FIXTURES: list[Fixture] = [
    Fixture(
        name="F1_consciousness_contradicts",
        edge_type_focus="CONTRADICTS",
        query=(
            "How should I think about the role of human consciousness in relation "
            "to environmental fields — is it actively interpreting them, or "
            "passively sensing them? What positions have I taken in my notes?"
        ),
        expected_load_bearing_edge_ids=[F1_CONTRADICTS_EDGE_ID],
        rationale=(
            "The query is engineered to retrieve both halves of the corpus's "
            "single CONTRADICTS pair. Default prompt's failure mode: synthesise "
            "the two views into a smooth 'consciousness both senses and "
            "interprets' answer that averages the tension out. Candidate prompt "
            "should explicitly name the active-vs-passive contradiction and "
            "show that both positions are present in the user's own notes."
        ),
    ),
    Fixture(
        name="F2_mcp4922_supports",
        edge_type_focus="SUPPORTS",
        query=(
            "What's the correct SPI configuration for driving the MCP4922 DAC "
            "from an STM32F407 on the Discovery board, and what specific "
            "gotchas should I plan for?"
        ),
        rationale=(
            "Routes to the MCP4922/SPI cluster, which has dense SUPPORTS + "
            "ELABORATES edges, almost all with rich authored notes (e.g. "
            "'Confirms the same complete SPI2 configuration — 16-bit frame, "
            "CPOL=0/CPHA=0, ...'). Default prompt typically lists facts from "
            "each note in isolation. Candidate prompt should use SUPPORTS / "
            "BUILDS_ON edges as evidence-aggregation signals — treating the "
            "supporting notes as reinforcing the configuration claims rather "
            "than as independent parallel notes."
        ),
    ),
    Fixture(
        name="F3_looper_analogous",
        edge_type_focus="ANALOGOUS_TO",
        query=(
            "What patterns do I have in my notes for capturing musical timing "
            "information hands-free in a looper or pedal design? How do the "
            "approaches relate?"
        ),
        rationale=(
            "Routes to the looper / footswitch / envelope-detection cluster, "
            "where two notes are linked by ANALOGOUS_TO with a long authored "
            "note explicitly naming the cross-domain parallel ('Both notes "
            "describe dedicated input mechanisms for capturing rhythmic/timing "
            "information hands-free…'). Default prompt typically describes "
            "each technique separately. Candidate prompt should recognise the "
            "structural parallel the ANALOGOUS_TO edge points at and discuss "
            "the two as parallel design patterns for the same underlying "
            "problem."
        ),
    ),
]
