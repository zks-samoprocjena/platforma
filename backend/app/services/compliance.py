"""
Compliance service V2 with M:N relationship support.
Replaces the obsolete compliance.py service.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.reference import (
    QuestionnaireVersion, Measure, Control, Submeasure,
    ControlSubmeasureMapping, ControlRequirement
)
from app.repositories.measure import MeasureRepository
from app.repositories.control_repository import ControlRepository


class ComplianceService:
    """Service for compliance operations with M:N control-submeasure support."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.measure_repo = MeasureRepository(db)
        self.control_repo = ControlRepository(db)

    async def get_active_version(self) -> Optional[QuestionnaireVersion]:
        """Get the currently active questionnaire version."""
        result = await self.db.execute(
            select(QuestionnaireVersion).where(QuestionnaireVersion.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_compliance_structure(self) -> Dict[str, Any]:
        """Get the complete compliance structure with proper M:N relationships."""
        version = await self.get_active_version()
        if not version:
            return {"version": None, "measures": [], "summary": {}}

        # Get measures with full hierarchy
        measures = await self.measure_repo.get_by_version_with_full_structure(
            version.id
        )

        # Get structure summary with accurate counts
        summary = await self.get_accurate_structure_summary(version.id)

        return {
            "version": {
                "id": version.id,
                "version_number": version.version_number,
                "description": version.description,
                "is_active": version.is_active,
                "created_at": version.created_at,
            },
            "measures": measures,
            "summary": summary,
        }

    async def get_accurate_structure_summary(self, version_id: UUID) -> Dict[str, Any]:
        """Get accurate structure summary considering M:N relationships."""
        # Count measures
        measure_result = await self.db.execute(
            select(func.count(Measure.id))
            .where(Measure.version_id == version_id)
        )
        total_measures = measure_result.scalar() or 0

        # Count submeasures
        submeasure_result = await self.db.execute(
            select(func.count(Submeasure.id))
            .join(Measure)
            .where(Measure.version_id == version_id)
        )
        total_submeasures = submeasure_result.scalar() or 0

        # Count unique controls
        control_result = await self.db.execute(
            select(func.count(func.distinct(Control.id)))
            .select_from(Control)
            .join(ControlSubmeasureMapping)
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version_id)
        )
        total_controls = control_result.scalar() or 0

        # Get level statistics
        level_stats = await self.control_repo.get_level_statistics(version_id)

        return {
            "total_measures": total_measures,
            "total_submeasures": total_submeasures,
            "total_unique_controls": total_controls,
            "levels": level_stats,
        }

    async def get_controls_for_level(
        self, level: str, mandatory_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Get controls for a security level with submeasure context."""
        version = await self.get_active_version()
        if not version:
            return []

        return await self.control_repo.get_by_level(
            version.id, level, mandatory_only
        )

    async def search_controls(
        self,
        search_term: Optional[str] = None,
        measure_id: Optional[UUID] = None,
        submeasure_id: Optional[UUID] = None,
        level: Optional[str] = None,
        mandatory_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Search controls with proper M:N relationship handling."""
        version = await self.get_active_version()
        if not version:
            return {
                "controls": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
                "has_more": False,
            }

        return await self.control_repo.search_controls(
            version_id=version.id,
            search_term=search_term,
            measure_id=measure_id,
            submeasure_id=submeasure_id,
            level=level,
            mandatory_only=mandatory_only,
            limit=limit,
            offset=offset,
        )

    async def get_compliance_summary(self) -> Dict[str, Any]:
        """Get high-level compliance summary with accurate counts."""
        version = await self.get_active_version()
        if not version:
            return {
                "version": None,
                "levels": {},
                "total_controls": 0,
                "measures_count": 0,
            }

        # Get level statistics
        level_stats = await self.control_repo.get_level_statistics(version.id)

        # Get measure count
        measure_result = await self.db.execute(
            select(func.count(Measure.id))
            .where(Measure.version_id == version.id)
        )
        measures_count = measure_result.scalar() or 0

        # Get total unique controls
        control_result = await self.db.execute(
            select(func.count(func.distinct(Control.id)))
            .select_from(Control)
            .join(ControlSubmeasureMapping)
            .join(Submeasure)
            .join(Measure)
            .where(Measure.version_id == version.id)
        )
        total_controls = control_result.scalar() or 0

        return {
            "version": {
                "id": version.id,
                "version_number": version.version_number,
                "updated_at": version.updated_at,
            },
            "levels": level_stats,
            "total_controls": total_controls,
            "measures_count": measures_count,
        }

    async def get_control_details_with_context(
        self, control_id: UUID, submeasure_id: Optional[UUID] = None
    ) -> Optional[Dict[str, Any]]:
        """Get control details with all its submeasure contexts."""
        if submeasure_id:
            # Get specific control-submeasure context
            return await self.control_repo.get_control_with_submeasure_context(
                control_id, submeasure_id
            )
        
        # Get control with all submeasure mappings
        control = await self.control_repo.get_by_id_with_requirements(control_id)
        if not control:
            return None
            
        # Get all submeasure mappings
        mapping_result = await self.db.execute(
            select(
                ControlSubmeasureMapping,
                Submeasure,
                Measure
            )
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(ControlSubmeasureMapping.control_id == control_id)
            .order_by(Measure.order_index, Submeasure.order_index)
        )
        
        mappings = []
        for mapping, submeasure, measure in mapping_result.all():
            # Get requirements for this control-submeasure pair
            req_result = await self.db.execute(
                select(ControlRequirement)
                .where(
                    and_(
                        ControlRequirement.control_id == control_id,
                        ControlRequirement.submeasure_id == submeasure.id
                    )
                )
            )
            requirements = list(req_result.scalars().all())
            
            mappings.append({
                "submeasure": submeasure,
                "measure": measure,
                "order_index": mapping.order_index,
                "requirements": requirements
            })
        
        return {
            "control": control,
            "mappings": mappings
        }