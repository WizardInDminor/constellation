"""MCP bearer-token authentication + scopes + rate limiting (Phase C4, ADR-089).

Single-user tool, multiple AI clients: each client gets its own static
bearer token in `.env` (`MCP_TOKENS`), mapping to a client name (bound into
provenance) and a scope set (`read`, `write`). No tokens configured = the
endpoint is disabled. This is deliberately not OAuth — remediation of the
direction pack's "MCP writes unsafe without auth" stop clause at the scale
the product actually runs at (localhost / Tailscale).
"""

import json
import time
from collections import deque
from contextvars import ContextVar
from dataclasses import dataclass, field

from app.core.config import get_settings


@dataclass(frozen=True)
class ClientIdentity:
    client_name: str
    scopes: frozenset[str] = field(default_factory=frozenset)


# Set by the middleware for the duration of a request; read by tools for
# scope checks and provenance.
current_client: ContextVar[ClientIdentity | None] = ContextVar(
    "mcp_current_client", default=None
)


class ScopeDenied(Exception):
    """Raised inside a tool when the authenticated client lacks a scope.

    Surfaces to the MCP client as a tool error (PERMISSION_DENIED)."""


def parse_token_map(raw: str) -> dict[str, ClientIdentity]:
    """Parse MCP_TOKENS ("token|Client Name|read+write, ...")."""
    tokens: dict[str, ClientIdentity] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split("|")
        if len(parts) != 3:
            raise ValueError(
                f"Malformed MCP_TOKENS entry (want 'token|name|scopes'): {entry!r}"
            )
        token, name, scopes = (p.strip() for p in parts)
        if not token or not name:
            raise ValueError(f"Malformed MCP_TOKENS entry: {entry!r}")
        scope_set = frozenset(s.strip() for s in scopes.split("+") if s.strip())
        tokens[token] = ClientIdentity(client_name=name, scopes=scope_set)
    return tokens


def require_identity() -> ClientIdentity:
    identity = current_client.get()
    if identity is None:
        raise ScopeDenied("AUTHENTICATION_REQUIRED: no authenticated MCP client")
    return identity


def require_scope(scope: str) -> ClientIdentity:
    identity = require_identity()
    if scope not in identity.scopes:
        raise ScopeDenied(
            f"PERMISSION_DENIED: client {identity.client_name!r} lacks the "
            f"{scope!r} scope"
        )
    return identity


class _RateLimiter:
    """Per-token sliding one-minute window."""

    def __init__(self) -> None:
        self._calls: dict[str, deque[float]] = {}

    def allow(self, token: str, limit: int) -> bool:
        now = time.monotonic()
        window = self._calls.setdefault(token, deque())
        while window and now - window[0] > 60.0:
            window.popleft()
        if len(window) >= limit:
            return False
        window.append(now)
        return True


class BearerAuthMiddleware:
    """ASGI wrapper around the mounted MCP app.

    Reads the token map lazily from settings on each request (cheap: settings
    are lru_cached) so tests and .env reloads see current values.
    """

    def __init__(self, app) -> None:
        self.app = app
        self._limiter = _RateLimiter()

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        settings = get_settings()
        token_map = parse_token_map(settings.mcp_tokens)

        async def deny(status: int, code: str, message: str) -> None:
            body = json.dumps(
                {"error": {"code": code, "message": message, "retryable": status == 429}}
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": status,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": body})

        if not token_map:
            await deny(
                403,
                "PERMISSION_DENIED",
                "MCP endpoint is disabled: no MCP_TOKENS configured.",
            )
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
        identity = token_map.get(token)
        if identity is None:
            await deny(401, "AUTHENTICATION_REQUIRED", "Missing or invalid bearer token.")
            return

        if not self._limiter.allow(token, settings.mcp_rate_limit_per_minute):
            await deny(429, "RATE_LIMITED", "Per-client rate limit exceeded; retry later.")
            return

        reset = current_client.set(identity)
        try:
            await self.app(scope, receive, send)
        finally:
            current_client.reset(reset)
