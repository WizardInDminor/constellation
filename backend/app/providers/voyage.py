import voyageai


class VoyageEmbeddingProvider:
    """Embedding provider backed by Voyage AI.

    The voyageai SDK auto-routes keys that start with 'al-' (MongoDB Atlas) to
    https://ai.mongodb.com/v1 and all other keys to https://api.voyageai.com/v1.
    No explicit base_url override is needed.
    """

    def __init__(self, api_key: str, model: str = "voyage-4") -> None:
        self._model = model
        self._client = voyageai.AsyncClient(api_key=api_key, timeout=30.0)

    @property
    def model_id(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return 1024

    async def embed(self, text: str) -> list[float]:
        result = await self._client.embed([text], model=self._model)
        return result.embeddings[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        result = await self._client.embed(texts, model=self._model)
        return result.embeddings
