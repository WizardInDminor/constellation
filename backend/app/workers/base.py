"""Builder Pipeline worker protocols (ADR-080).

Workers are the replaceable units of the Builder Pipeline: each performs one
specialized production task behind a small typed protocol, mirroring the
provider abstraction (ADR-003). The Director orchestrates workers; workers
never orchestrate each other.

Protocols are added here as their pipeline slices land — a speculative
interface for a worker that doesn't exist yet is a contract nobody has
validated. The full roster (Writer, Storyboard, Prompt Compiler, Voice, Image,
Video, Music, Timeline Builder) is documented in the builder architecture doc.
"""

from typing import Protocol, runtime_checkable

from app.models.builder import CreativeBrief


class WorkerError(Exception):
    """A worker failed to produce its contracted output (bad model output,
    provider failure…). The Director records this on the stage run."""


@runtime_checkable
class Interpreter(Protocol):
    """Turns a raw creative idea into a structured CreativeBrief."""

    @property
    def name(self) -> str: ...

    @property
    def model_id(self) -> str: ...

    async def interpret(self, idea: str) -> CreativeBrief: ...
