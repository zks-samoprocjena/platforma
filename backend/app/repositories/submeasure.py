"""Repository for Submeasure model operations."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reference import Submeasure, Control, ControlSubmeasureMapping
from app.repositories.base import BaseRepository


class SubmeasureRepository(BaseRepository[Submeasure]):
    """Repository for Submeasure operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Submeasure)

    async def get_by_measure_id(self, measure_id: UUID) -> List[Submeasure]:
        """Get all submeasures for a specific measure."""
        result = await self.db.execute(
            select(Submeasure)
            .where(Submeasure.measure_id == measure_id)
            .order_by(Submeasure.order_index)
        )
        return list(result.scalars().all())

    async def get_by_id_with_controls(self, id: UUID) -> Optional[Submeasure]:
        """Get submeasure with all associated controls loaded."""
        result = await self.db.execute(
            select(Submeasure)
            .options(
                selectinload(Submeasure.control_mappings).selectinload(
                    ControlSubmeasureMapping.control
                )
            )
            .where(Submeasure.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Submeasure]:
        """Get submeasure by its code."""
        result = await self.db.execute(
            select(Submeasure).where(Submeasure.code == code)
        )
        return result.scalar_one_or_none()

    async def get_all_by_measure_ids(self, measure_ids: List[UUID]) -> List[Submeasure]:
        """Get all submeasures for multiple measures."""
        result = await self.db.execute(
            select(Submeasure)
            .where(Submeasure.measure_id.in_(measure_ids))
            .order_by(Submeasure.measure_id, Submeasure.order_index)
        )
        return list(result.scalars().all())

    async def get_conditional_submeasures(self, measure_id: UUID) -> List[Submeasure]:
        """Get all conditional submeasures for a measure."""
        result = await self.db.execute(
            select(Submeasure)
            .where(
                Submeasure.measure_id == measure_id,
                Submeasure.is_conditional == True
            )
            .order_by(Submeasure.order_index)
        )
        return list(result.scalars().all())

    async def count_by_measure_id(self, measure_id: UUID) -> int:
        """Count submeasures for a specific measure."""
        from sqlalchemy import func
        
        result = await self.db.execute(
            select(func.count(Submeasure.id))
            .where(Submeasure.measure_id == measure_id)
        )
        return result.scalar() or 0