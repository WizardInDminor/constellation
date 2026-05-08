from app.providers.base import GenerationProvider


async def complete(
    provider: GenerationProvider,
    messages: list[dict],
    system: str,
    max_tokens: int = 1024,
) -> str:
    return await provider.complete(messages, system, max_tokens)
