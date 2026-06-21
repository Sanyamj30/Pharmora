import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Add project root and service root to system path so we can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from shared.database import Base
# Make sure models are imported so target_metadata is fully populated
from services.auth_service.app.models import User, Region, UserOutletScope, RefreshToken

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
    # If the URL is an async schema, strip the async part for offline context if needed,
    # but Alembic offline usually handles URLs transparently.
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # Default to auth database
    url = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/pharmora_auth"
    )
    
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = url
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    # Run online migration
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If we are inside an running event loop (e.g. tests or notebook),
        # use a task to run the migration rather than asyncio.run
        loop.create_task(run_migrations_online())
    else:
        asyncio.run(run_migrations_online())
