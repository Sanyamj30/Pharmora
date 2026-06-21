import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
from loguru import logger

# Retrieve DB details from environment, default to postgres database for local dev
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/postgres"
)

# Database connection pool configuration
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800")) # Recycle connections after 30 mins

logger.info(f"Initializing async database engine with URL schema: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")

# Create SQLAlchemy async engine
engine_kwargs = {
    "pool_recycle": DB_POOL_RECYCLE,
    "pool_pre_ping": True,
    "future": True
}
# SQLite does not support pool_size or max_overflow
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs["pool_size"] = DB_POOL_SIZE
    engine_kwargs["max_overflow"] = DB_MAX_OVERFLOW

engine = create_async_engine(
    DATABASE_URL,
    **engine_kwargs
)

# Create async session factory
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class Base(DeclarativeBase):
    """Declarative Base class for all ORM models across microservices."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency to yield an AsyncSession per request with automatic transaction handling."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database transaction error: {str(e)}. Rolling back session.")
            await session.rollback()
            raise
        else:
            await session.commit()
        finally:
            await session.close()
