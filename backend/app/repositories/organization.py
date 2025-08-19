"""Organization repository for data access operations."""

from typing import Optional, List
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.repositories.base import BaseRepository


class OrganizationRepository(BaseRepository[Organization]):
    """Repository for organization data operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Organization)

    async def get(self, id: UUID) -> Optional[Organization]:
        """Get organization by ID."""
        return await self.get_by_id(id)

    async def get_by_code(self, code: str) -> Optional[Organization]:
        """Get organization by code."""
        result = await self.db.execute(
            select(Organization).where(Organization.code == code.upper())
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[Organization]:
        """Get organization by name."""
        result = await self.db.execute(
            select(Organization).where(Organization.name.ilike(f"%{name}%"))
        )
        return result.scalar_one_or_none()

    async def get_active_organizations(self) -> List[Organization]:
        """Get all active organizations."""
        result = await self.db.execute(
            select(Organization).where(Organization.active == True)
        )
        return list(result.scalars().all())

    async def get_by_admin_user(self, admin_user_id: str) -> Optional[Organization]:
        """Get organization by admin user ID."""
        result = await self.db.execute(
            select(Organization).where(Organization.admin_user_id == admin_user_id)
        )
        return result.scalar_one_or_none() 