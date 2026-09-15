from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolves to backend/.env regardless of where uvicorn is invoked from
# config.py -> parents[0]=core/ -> parents[1]=app/ -> parents[2]=backend/
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    db_path: str = "./data/constellation.db"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000"

    # Cloud providers
    voyage_api_key: str = ""
    anthropic_api_key: str = ""

    # Local providers (Phase 7)
    ollama_base_url: str = "http://localhost:11434"
    ollama_embed_model: str = "mxbai-embed-large"
    ollama_gen_model: str = "llama3.2"

    # Embedding worker pacing — defaults sized for the Voyage free tier
    # (3 RPM / 10 K TPM): one job every 22 s ≈ 2.7 RPM with headroom.
    embedding_worker_interval_seconds: int = 22
    embedding_rate_limit_cooldown_seconds: int = 60
    embedding_drain_batch_size: int = 1

    # MCP tool surface (Track C Phase C4, ADR-089).
    # Comma-separated bearer tokens: "token|Client Name|scopes" with scopes
    # joined by "+", e.g.
    #   MCP_TOKENS="s3cret1|ChatGPT|read,s3cret2|Claude Code|read+write"
    # Empty (the default) disables the /mcp endpoint entirely: every request
    # is rejected before reaching the transport. Never commit real tokens —
    # this lives in .env only.
    mcp_tokens: str = ""
    # Per-token sliding-window rate limit (calls per minute).
    mcp_rate_limit_per_minute: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level instance so `from app.core.config import settings` works
# throughout the codebase alongside the get_settings() dependency pattern
settings = get_settings()
