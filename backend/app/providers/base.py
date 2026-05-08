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
    ) -> str: ...
