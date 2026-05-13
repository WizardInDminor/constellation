"""Classification helpers for embedding-provider exceptions.

Kept separate from `embedding_service` so the provider-SDK knowledge lives in
one place. The worker uses these to decide whether a failed embedding call is
worth a free retry (rate limit, transient network) or a terminal `failed`
status (auth, malformed input, dimension mismatch, etc.).
"""

from voyageai.error import (
    APIConnectionError,
    RateLimitError,
    ServiceUnavailableError,
    Timeout,
    TryAgain,
    VoyageError,
)

RETRIABLE_EXCEPTIONS: tuple[type[BaseException], ...] = (
    RateLimitError,
    TryAgain,
    Timeout,
    APIConnectionError,
    ServiceUnavailableError,
)


def is_retriable(exc: BaseException) -> bool:
    """True if the exception represents a transient provider condition."""
    return isinstance(exc, RETRIABLE_EXCEPTIONS)


def extract_retry_after_seconds(exc: BaseException) -> int | None:
    """Pull a `Retry-After` value off a VoyageError, if present.

    Voyage's SDK preserves response headers on its error types. The header is
    case-insensitive in HTTP, but the SDK stores it as the server sent it; we
    check both common spellings.
    """
    if not isinstance(exc, VoyageError):
        return None
    headers = exc.headers or {}
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None
