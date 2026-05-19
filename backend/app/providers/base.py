from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    @property
    def model_id(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed(self, text: str) -> list[float]: ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


@runtime_checkable
class GenerationProvider(Protocol):
    @property
    def model_id(self) -> str: ...

    async def complete(
        self,
        messages: list[dict],
        system: str,
        max_tokens: int = 1024,
        *,
        enable_web_search: bool = False,
    ) -> str:
        """Run a single completion turn.

        `enable_web_search` (ADR-070) opts into provider-side web research
        for this call. Anthropic implements it via the server-side
        web_search tool; Ollama (local) raises NotImplementedError. Callers
        that want graceful degradation should catch the error and fall
        back to a no-search prompt.
        """
        ...
