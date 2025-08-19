"""Repository for Measure model operations."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reference import Measure, Submeasure, Control, ControlRequirement
from app.repositories.base import BaseRepository


class MeasureRepository(BaseRepository[Measure]):
    """Repository for Measure operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Measure)

    async def get_by_version_id(self, version_id: UUID) -> List[Measure]:
        """Get all measures for a specific questionnaire version."""
        result = await self.db.execute(
            select(Measure)
            .where(Measure.version_id == version_id)
            .order_by(Measure.order_index)
        )
        return list(result.scalars().all())

    async def get_by_id_with_submeasures(self, id: UUID) -> Optional[Measure]:
        """Get measure with all submeasures loaded."""
        result = await self.db.execute(
            select(Measure)
            .options(
                selectinload(Measure.submeasures).selectinload(Submeasure.controls)
            )
            .where(Measure.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_version_with_full_structure(
        self, version_id: UUID
    ) -> List[Measure]:
        """Get all measures with complete hierarchy for a version."""
        result = await self.db.execute(
            select(Measure)
            .options(
                selectinload(Measure.submeasures)
                .selectinload(Submeasure.controls)
                .selectinload(Control.requirements)
            )
            .where(Measure.version_id == version_id)
            .order_by(Measure.order_index)
        )
        return list(result.scalars().all())

    async def get_by_code(self, version_id: UUID, code: str) -> Optional[Measure]:
        """Get measure by code within a specific version."""
        result = await self.db.execute(
            select(Measure)
            .where(Measure.version_id == version_id)
            .where(Measure.code == code)
        )
        return result.scalar_one_or_none()

    async def count_by_version(self, version_id: UUID) -> int:
        """Count measures in a specific version."""
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.count(Measure.id)).where(Measure.version_id == version_id)
        )
        return result.scalar()

    async def get_structure_summary(self, version_id: UUID) -> dict:
        """Get structure summary for a questionnaire version."""
        from sqlalchemy import func

        # Count measures
        measures_count = await self.count_by_version(version_id)

        # Count submeasures
        submeasures_result = await self.db.execute(
            select(func.count(Submeasure.id))
            .join(Measure)
            .where(Measure.version_id == version_id)
        )
        submeasures_count = submeasures_result.scalar()

        # Count controls
        controls_result = await self.db.execute(
            select(func.count(Control.id))
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version_id)
        )
        controls_count = controls_result.scalar()

        # Count requirements by level
        from sqlalchemy import case

        requirements_result = await self.db.execute(
            select(
                ControlRequirement.level,
                func.count(ControlRequirement.id).label("count"),
                func.sum(case((ControlRequirement.is_mandatory, 1), else_=0)).label(
                    "mandatory_count"
                ),
            )
            .join(Control)
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version_id)
            .group_by(ControlRequirement.level)
        )
        requirements_by_level = {
            row.level: {
                "total": row.count,
                "mandatory": row.mandatory_count,
                "voluntary": row.count - row.mandatory_count,
            }
            for row in requirements_result.all()
        }

        return {
            "measures_count": measures_count,
            "submeasures_count": submeasures_count,
            "controls_count": controls_count,
            "requirements_by_level": requirements_by_level,
        }
