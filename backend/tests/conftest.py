"""Test configuration and fixtures."""

import pytest
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.models.base import Base
from app.core.config import settings


@pytest.fixture
async def async_engine():
    """Create async test database engine."""
    # Use test database URL or in-memory SQLite for tests
    test_database_url = settings.DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://"
    ).replace("assessment_db", "test_assessment_db")
    
    engine = create_async_engine(
        test_database_url,
        poolclass=NullPool,
        echo=False,
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Drop tables after tests
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def db_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create async database session for tests."""
    async_session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_maker() as session:
        yield session
        await session.rollback()