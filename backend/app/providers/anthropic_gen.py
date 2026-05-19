import anthropic

# ADR-070: Anthropic's server-side web_search tool. Versioned per Anthropic's
# tool catalog; bump here when the API surfaces a newer revision.
_WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
}


class AnthropicGenerationProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self._model = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    @property
    def model_id(self) -> str:
        return self._model

    async def complete(
        self,
        messages: list[dict],
        system: str,
        max_tokens: int = 1024,
        *,
        enable_web_search: bool = False,
    ) -> str:
        kwargs: dict = {
            "model": self._model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if enable_web_search:
            kwargs["tools"] = [_WEB_SEARCH_TOOL]

        response = await self._client.messages.create(**kwargs)

        # When web_search is enabled the model emits interleaved
        # `server_tool_use` and `web_search_tool_result` blocks alongside its
        # text blocks. The user-facing answer lives in the text blocks; we
        # concatenate them in order so all generated prose surfaces.
        text_chunks = [
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ]
        return "".join(text_chunks) if text_chunks else ""
