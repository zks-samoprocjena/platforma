"""
Repository for Control operations with M:N relationship support.
Replaces the obsolete control.py repository.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy import select, and_, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.reference import (
    Control, ControlRequirement, ControlSubmeasureMapping,
    Submeasure, Measure
)
from app.repositories.base import BaseRepository


class ControlRepository(BaseRepository[Control]):
    """Repository for Control operations with M:N relationship support."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Control)

    async def get_by_submeasure_id(self, submeasure_id: UUID) -> List[Control]:
        """Get all controls for a specific submeasure via mapping table."""
        result = await self.db.execute(
            select(Control)
            .join(ControlSubmeasureMapping)
            .where(ControlSubmeasureMapping.submeasure_id == submeasure_id)
            .order_by(ControlSubmeasureMapping.order_index)
        )
        return list(result.scalars().all())

    async def get_by_measure_id(self, measure_id: UUID) -> List[Control]:
        """Get all controls for a specific measure."""
        result = await self.db.execute(
            select(Control)
            .distinct()
            .join(ControlSubmeasureMapping)
            .join(Submeasure)
            .where(Submeasure.measure_id == measure_id)
            .order_by(Control.code)
        )
        return list(result.scalars().all())

    async def get_by_version_id(self, version_id: UUID) -> List[Control]:
        """Get all controls for a questionnaire version."""
        result = await self.db.execute(
            select(Control)
            .distinct()
            .join(ControlSubmeasureMapping)
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version_id)
            .order_by(Control.code)
        )
        return list(result.scalars().all())

    async def get_by_id_with_requirements(self, id: UUID) -> Optional[Control]:
        """Get control with all requirements loaded."""
        result = await self.db.execute(
            select(Control)
            .options(selectinload(Control.control_requirements))
            .where(Control.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Control]:
        """Get control by code (controls are now unique across versions)."""
        result = await self.db.execute(
            select(Control)
            .where(Control.code == code)
        )
        return result.scalar_one_or_none()

    async def get_by_level(
        self, version_id: UUID, level: str, mandatory_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Get controls applicable for a specific security level with submeasure context."""
        query = (
            select(
                Control,
                Submeasure,
                Measure,
                ControlRequirement,
                ControlSubmeasureMapping.order_index
            )
            .options(
                selectinload(Submeasure.measure),
                selectinload(Measure.submeasures)
            )
            .join(ControlRequirement, Control.id == ControlRequirement.control_id)
            .join(ControlSubmeasureMapping, and_(
                Control.id == ControlSubmeasureMapping.control_id,
                ControlSubmeasureMapping.submeasure_id == ControlRequirement.submeasure_id
            ))
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(
                and_(
                    Measure.version_id == version_id,
                    ControlRequirement.level == level,
                    ControlRequirement.is_applicable == True
                )
            )
        )

        if mandatory_only:
            query = query.where(ControlRequirement.is_mandatory == True)

        query = query.order_by(
            Measure.order_index, 
            Submeasure.order_index, 
            ControlSubmeasureMapping.order_index
        )

        result = await self.db.execute(query)
        
        # Return structured data including submeasure context
        controls_with_context = []
        for row in result.all():
            control, submeasure, measure, requirement, order_index = row
            controls_with_context.append({
                "control": control,
                "submeasure": submeasure,
                "measure": measure,
                "requirement": requirement,
                "order_index": order_index
            })
        
        return controls_with_context

    async def search_controls(
        self,
        version_id: UUID,
        search_term: Optional[str] = None,
        measure_id: Optional[UUID] = None,
        submeasure_id: Optional[UUID] = None,
        level: Optional[str] = None,
        mandatory_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Search controls with filters and return paginated results."""
        query = (
            select(Control)
            .distinct()
            .join(ControlSubmeasureMapping)
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version_id)
        )

        # Apply filters
        if search_term:
            search_pattern = f"%{search_term}%"
            query = query.where(
                Control.name_hr.ilike(search_pattern)
                | Control.description_hr.ilike(search_pattern)
                | Control.code.ilike(search_pattern)
            )

        if measure_id:
            query = query.where(Submeasure.measure_id == measure_id)

        if submeasure_id:
            query = query.where(ControlSubmeasureMapping.submeasure_id == submeasure_id)

        if level:
            query = query.join(ControlRequirement, and_(
                Control.id == ControlRequirement.control_id,
                ControlSubmeasureMapping.submeasure_id == ControlRequirement.submeasure_id
            )).where(
                and_(
                    ControlRequirement.level == level,
                    ControlRequirement.is_applicable == True
                )
            )
            if mandatory_only:
                query = query.where(ControlRequirement.is_mandatory == True)

        # Count total before pagination
        count_result = await self.db.execute(
            select(func.count(func.distinct(Control.id)))
            .select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Apply pagination and ordering
        query = (
            query.order_by(Control.code)
            .offset(offset)
            .limit(limit)
        )

        result = await self.db.execute(query)
        controls = list(result.scalars().all())

        return {
            "controls": controls,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(controls) < total,
        }

    async def get_level_statistics(self, version_id: UUID) -> Dict[str, Dict[str, int]]:
        """Get control statistics by security level."""
        result = await self.db.execute(
            select(
                ControlRequirement.level,
                func.count(func.distinct(ControlRequirement.control_id)).label("total_controls"),
                func.sum(case((ControlRequirement.is_mandatory == True, 1), else_=0)).label(
                    "mandatory_count"
                ),
            )
            .select_from(ControlRequirement)
            .join(Submeasure, ControlRequirement.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(
                and_(
                    Measure.version_id == version_id,
                    ControlRequirement.is_applicable == True
                )
            )
            .group_by(ControlRequirement.level)
        )

        stats = {}
        for row in result.all():
            # Note: mandatory_count here is total requirements, not unique controls
            # We need a separate query for unique mandatory controls
            stats[row.level] = {
                "total": row.total_controls,
                "mandatory_requirements": row.mandatory_count or 0,
            }

        # Get unique mandatory controls per level
        for level in stats.keys():
            mandatory_result = await self.db.execute(
                select(func.count(func.distinct(ControlRequirement.control_id)))
                .select_from(ControlRequirement)
                .join(Submeasure, ControlRequirement.submeasure_id == Submeasure.id)
                .join(Measure, Submeasure.measure_id == Measure.id)
                .where(
                    and_(
                        Measure.version_id == version_id,
                        ControlRequirement.level == level,
                        ControlRequirement.is_mandatory == True,
                        ControlRequirement.is_applicable == True
                    )
                )
            )
            mandatory_controls = mandatory_result.scalar() or 0
            stats[level]["mandatory"] = mandatory_controls
            stats[level]["voluntary"] = stats[level]["total"] - mandatory_controls

        return stats

    async def get_control_with_submeasure_context(
        self, control_id: UUID, submeasure_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Get control with specific submeasure context and requirements."""
        result = await self.db.execute(
            select(
                Control,
                Submeasure,
                Measure,
                ControlSubmeasureMapping
            )
            .join(ControlSubmeasureMapping, Control.id == ControlSubmeasureMapping.control_id)
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(
                and_(
                    Control.id == control_id,
                    Submeasure.id == submeasure_id
                )
            )
            .options(
                selectinload(Control.control_requirements.and_(
                    ControlRequirement.submeasure_id == submeasure_id
                ))
            )
        )
        
        row = result.one_or_none()
        if not row:
            return None
            
        control, submeasure, measure, mapping = row
        
        # Get requirements for this control-submeasure pair
        req_result = await self.db.execute(
            select(ControlRequirement)
            .where(
                and_(
                    ControlRequirement.control_id == control_id,
                    ControlRequirement.submeasure_id == submeasure_id
                )
            )
        )
        requirements = list(req_result.scalars().all())
        
        return {
            "control": control,
            "submeasure": submeasure,
            "measure": measure,
            "order_index": mapping.order_index,
            "requirements": requirements
        }

    # ========== Control Requirement Methods (from control_requirement_repository) ==========
    
    async def get_requirement_by_control_submeasure_level(
        self,
        control_id: UUID,
        submeasure_id: UUID,
        level: str
    ) -> Optional[ControlRequirement]:
        """Get requirement for specific control, submeasure, and security level."""
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.submeasure_id == submeasure_id,
                ControlRequirement.level == level
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_mandatory_requirements_for_level(
        self,
        level: str
    ) -> List[ControlRequirement]:
        """Get all mandatory requirements for a security level."""
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.level == level,
                ControlRequirement.is_mandatory == True
            )
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_requirements_by_control_and_level(
        self,
        control_id: UUID,
        level: str
    ) -> List[ControlRequirement]:
        """Get all requirements for a control at a specific security level."""
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.level == level
            )
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def bulk_get_mandatory_status(
        self,
        control_submeasure_pairs: List[tuple[UUID, UUID]],
        level: str
    ) -> Dict[tuple[UUID, UUID], bool]:
        """Get mandatory status for multiple control-submeasure pairs efficiently."""
        if not control_submeasure_pairs:
            return {}
        
        from sqlalchemy import or_
        
        # Build conditions for all pairs
        conditions = []
        for control_id, submeasure_id in control_submeasure_pairs:
            conditions.append(
                and_(
                    ControlRequirement.control_id == control_id,
                    ControlRequirement.submeasure_id == submeasure_id,
                    ControlRequirement.level == level
                )
            )
        
        # Query all requirements in one go
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.level == level,
                or_(*conditions) if conditions else False
            )
        )
        
        result = await self.db.execute(query)
        requirements = result.scalars().all()
        
        # Build result dictionary
        mandatory_map = {}
        for req in requirements:
            key = (req.control_id, req.submeasure_id)
            mandatory_map[key] = req.is_mandatory
        
        # Fill in missing pairs with False
        for pair in control_submeasure_pairs:
            if pair not in mandatory_map:
                mandatory_map[pair] = False
        
        return mandatory_map