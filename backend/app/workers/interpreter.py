"""LLM Interpreter worker — raw idea → structured CreativeBrief (ADR-080).

The interpreter extracts what the idea already contains and proposes the
minimum structure the pipeline needs. It must not silently invent large
amounts of new material: gaps belong in `open_questions`, where the user (or
the Director, later) decides how to fill them.
"""

import json
import re

from pydantic import ValidationError

from app.models.builder import CreativeBrief
from app.providers.base import GenerationProvider
from app.services import generation_service
from app.workers.base import WorkerError

_SYSTEM_PROMPT = """\
You are the Interpreter in a creative production pipeline. The user gives you a raw \
creative idea — spoken-style, unstructured, possibly a single sentence. Extract a \
structured creative brief from it.

Rules:
- Preserve the user's intent. Extract what is there; propose only the minimum \
structure needed for production planning.
- Where the idea is silent (format, tone, characters…), make at most a light, \
clearly-derivable proposal — and put genuine unknowns in open_questions instead \
of inventing answers.
- logline: one sentence. premise: one short paragraph.
- format: the medium and rough length if inferable (e.g. "3-minute animated short").

Return ONLY valid JSON — no markdown fences, no preamble, no commentary:
{"title": "...", "logline": "...", "premise": "...", "format": "...", "tone": "...",
 "themes": ["..."],
 "characters": [{"name": "...", "role": "...", "description": "..."}],
 "locations": [{"name": "...", "description": "..."}],
 "style_notes": "...", "open_questions": ["..."]}\
"""


def _parse_json_object(raw: str) -> dict:
    """Strip fences / surrounding prose and parse the outermost JSON object.
    Same cleaning ceremony as the RAG suggestion endpoints."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        cleaned = match.group()
    return json.loads(cleaned)


class LLMInterpreter:
    """Interpreter backed by the active GenerationProvider (ADR-003 — no direct
    SDK calls; any provider that speaks the protocol works)."""

    name = "llm_interpreter"

    def __init__(self, provider: GenerationProvider):
        self._provider = provider

    @property
    def model_id(self) -> str:
        return self._provider.model_id

    async def interpret(self, idea: str) -> CreativeBrief:
        messages = [{"role": "user", "content": f"Creative idea:\n\n{idea}"}]
        raw = await generation_service.complete(
            self._provider, messages, _SYSTEM_PROMPT, max_tokens=2048
        )
        try:
            return CreativeBrief.model_validate(_parse_json_object(raw))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise WorkerError(f"Interpreter returned an unparseable brief: {exc}") from exc
