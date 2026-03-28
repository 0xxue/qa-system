"""
AI QA System V3 - Application Entry Point

Enterprise-grade AI-powered QA system with:
- LangGraph workflow orchestration
- LightRAG semantic retrieval
- LiteLLM unified multi-model interface
- FastAPI async API with SSE streaming
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.middleware.trace import TraceMiddleware
from app.middleware.rate_limiter import RateLimiter
from app.middleware.error_handler import register_error_handlers
from app.middleware.logging_config import setup_logging
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    settings = get_settings()
    setup_logging(service_name="ai-qa", level=settings.log_level, json_format=settings.log_format == "json")

    import structlog
    logger = structlog.get_logger()
    logger.info("Starting AI QA System V3", env=settings.app_env)

    # Initialize services (graceful - skip if unavailable)
    try:
        from app.services.database import init_db, close_db
        await init_db()
        logger.info("Database connected")
    except Exception as e:
        logger.warning("Database not available, running without DB", error=str(e))
        close_db = None

    try:
        from app.services.cache import init_redis, close_redis
        await init_redis()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis not available, running without cache", error=str(e))
        close_redis = None

    try:
        from app.services.rag import init_rag
        await init_rag()
        logger.info("RAG knowledge base loaded")
    except Exception as e:
        logger.warning("RAG init failed, using keyword fallback", error=str(e))

    yield

    # Shutdown
    logger.info("Shutting down...")
    if close_redis: await close_redis()
    if close_db: await close_db()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="3.0.0",
        description="Enterprise AI QA System with LangGraph + RAG + Multi-Model",
        docs_url="/docs" if settings.debug else None,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Middleware (order matters: trace first, then rate limit)
    app.add_middleware(TraceMiddleware)
    app.add_middleware(RateLimiter, limit=settings.rate_limit_per_minute, burst=settings.rate_limit_burst)

    # Prometheus metrics
    if settings.enable_metrics:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    # Error handlers
    register_error_handlers(app)

    # Routes
    app.include_router(api_router, prefix="/api/v1")

    # WebSocket routes (mounted directly, bypasses HTTP middleware)
    from app.api.v1.ws import router as ws_router
    app.include_router(ws_router)

    return app


app = create_app()
