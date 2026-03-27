"""Database service - async PostgreSQL with connection pooling."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import get_settings

_engine = None
_session_factory = None


async def init_db():
    global _engine, _session_factory
    settings = get_settings()
    _engine = create_async_engine(
        settings.database_url,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        echo=settings.debug,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_db():
    global _engine
    if _engine:
        await _engine.dispose()


async def get_session() -> AsyncSession:
    async with _session_factory() as session:
        yield session


async def check_db() -> bool:
    try:
        async with _engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
