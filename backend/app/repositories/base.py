"""Base repository class for data access patterns."""

from abc import ABC
from typing import Generic, List, Optional, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


class BaseRepository(ABC, Generic[ModelType]):
    """Base repository providing common CRUD operations."""

    def __init__(self, db: AsyncSession, model: type[ModelType]):
        self.db = db
        self.model = model

    async def get_by_id(self, id: UUID) -> Optional[ModelType]:
        """Get a single record by ID."""
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(
        self,
        limit: Optional[int] = None,
        offset: int = 0,
        order_by: Optional[str] = None,
    ) -> List[ModelType]:
        """Get all records with optional pagination and ordering."""
        query = select(self.model)

        if order_by:
            if hasattr(self.model, order_by):
                query = query.order_by(getattr(self.model, order_by))

        if offset:
            query = query.offset(offset)

        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self) -> int:
        """Count total records."""
        from sqlalchemy import func

        result = await self.db.execute(select(func.count(self.model.id)))
        return result.scalar()

    async def create(self, **kwargs) -> ModelType:
        """Create a new record."""
        instance = self.model(**kwargs)
        self.db.add(instance)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def update(self, id: UUID, **kwargs) -> Optional[ModelType]:
        """Update an existing record."""
        instance = await self.get_by_id(id)
        if not instance:
            return None

        for field, value in kwargs.items():
            if hasattr(instance, field):
                setattr(instance, field, value)

        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def delete(self, id: UUID) -> bool:
        """Delete a record by ID."""
        instance = await self.get_by_id(id)
        if not instance:
            return False

        await self.db.delete(instance)
        await self.db.flush()
        return True
