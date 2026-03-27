"""
Application Configuration

All sensitive values loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    app_name: str = "AI QA System"
    app_env: str = "development"
    debug: bool = True
    api_version: str = "v1"

    # Database (PostgreSQL + pgvector)
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_qa"

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl: int = 300  # 5 minutes

    # JWT Auth
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # LiteLLM (unified model interface)
    primary_model: str = "anthropic/claude-sonnet-4-20250514"
    secondary_model: str = "openai/gpt-4o"
    fallback_model: str = "deepseek/deepseek-chat"
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None

    # LiteLLM budget control
    max_budget_monthly: float = 100.0  # USD

    # Ollama (for local models)
    ollama_base_url: str = "http://localhost:11434"

    # RAG (LightRAG)
    rag_working_dir: str = "./data/rag"

    # Embedding (freely switchable: local / ollama / openai / openai_compatible)
    embedding_provider: str = "local"  # Default: free local, no API needed
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_api_base: Optional[str] = None
    embedding_api_key: Optional[str] = None

    # File Storage
    file_storage: str = "local"  # local or minio
    upload_dir: str = "./data/uploads"

    # Rate Limiting
    rate_limit_per_minute: int = 60
    rate_limit_burst: int = 10

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Monitoring
    enable_metrics: bool = True
    log_level: str = "INFO"
    log_format: str = "json"  # "json" for production, "console" for development

    # AI Bot (optional module — disable to run as pure QA API)
    enable_ai_bot: bool = False
    bot_websocket_path: str = "/ws/bot"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
