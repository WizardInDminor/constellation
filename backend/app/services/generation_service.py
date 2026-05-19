from app.providers.base import GenerationProvider


async def complete(
    provider: GenerationProvider,
    messages: list[dict],
    system: str,
    max_tokens: int = 1024,
    *,
    enable_web_search: bool = False,
) -> str:
    # Only forward `enable_web_search` when actually requested, so callers
    # using older inline fake providers (without the kwarg) keep working.
    if enable_web_search:
        return await provider.complete(messages, system, max_tokens, enable_web_search=True)
    return await provider.complete(messages, system, max_tokens)
