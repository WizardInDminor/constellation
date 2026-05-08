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


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level instance so `from app.core.config import settings` works
# throughout the codebase alongside the get_settings() dependency pattern
settings = get_settings()
