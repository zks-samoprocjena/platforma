"""Test fixtures package."""

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_async_session


async def get_test_db_session():
    """Get database session for testing."""
    async for session in get_async_session():
        return session