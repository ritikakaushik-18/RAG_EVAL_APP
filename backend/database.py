import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from config import settings
from models import Base

logger = logging.getLogger(__name__)

# asyncpg doesn't support the pgbouncer-style ?sslmode query param in the same
# way psycopg2 does — strip it and pass ssl via connect_args instead.
def _build_engine_url(url: str) -> tuple[str, dict]:
    connect_args: dict = {}
    if "sslmode=require" in url:
        url = url.replace("sslmode=require", "").replace("&&", "&").rstrip("?&")
        connect_args["ssl"] = "require"
    # channel_binding is a psycopg2/libpq param, not understood by asyncpg
    if "channel_binding=require" in url:
        url = url.replace("channel_binding=require", "").replace("&&", "&").rstrip("?&")
    # Clean trailing ? or &
    url = url.rstrip("?&")
    return url, connect_args


_clean_url, _connect_args = _build_engine_url(settings.DATABASE_URL)

engine = create_async_engine(
    _clean_url,
    connect_args=_connect_args,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables() -> None:
    async with engine.begin() as conn:
        logger.info("Enabling pgvector extension...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        logger.info("Creating tables...")
        await conn.run_sync(Base.metadata.create_all)
        # Additive migrations — safe to run on tables that already exist
        for stmt in [
            "ALTER TABLE eval_results ADD COLUMN IF NOT EXISTS failure_attribution TEXT",
            "ALTER TABLE eval_results ADD COLUMN IF NOT EXISTS recommendation TEXT",
            "ALTER TABLE eval_runs    ADD COLUMN IF NOT EXISTS overall_recommendation TEXT",
            "ALTER TABLE eval_runs    ADD COLUMN IF NOT EXISTS winner_explanation TEXT",
        ]:
            await conn.execute(text(stmt))
        logger.info("Database schema ready.")


async def check_db_connection() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error("Database health check failed: %s", e)
        return False
