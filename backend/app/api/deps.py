"""API Dependencies."""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.core.auth import get_current_user, get_current_active_user, require_role, require_any_role
from app.models.organization import User


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session."""
    async with async_session_maker() as session:
        yield session


# Create admin role requirement
require_admin = require_role("admin")


# Re-export auth dependencies for convenience
__all__ = [
    "get_db",
    "get_current_user",
    "get_current_active_user", 
    "require_role",
    "require_any_role",
    "require_admin",
    "User",
]