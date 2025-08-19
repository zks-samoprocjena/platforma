"""
OBSOLETE - DO NOT USE
Questionnaire service for assessment creation and control management.
This service uses the old 1:N relationship model and ControlRepository.
Needs to be updated to use ControlRepository with M:N support.
Marked obsolete on 2025-07-11.
"""

import uuid
from typing import Dict, List, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reference import (
    Control,
    ControlRequirement,
    Measure,
    QuestionnaireVersion,
    Submeasure,
)
from app.repositories.control_repository import ControlRepository
from app.repositories.measure import MeasureRepository


class QuestionnaireService:
    """Service for questionnaire management and assessment creation."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.measure_repo = MeasureRepository(db_session)
        self.control_repo = ControlRepository(db_session)

    async def get_questionnaire_for_level(
        self, security_level: str, version_id: Optional[uuid.UUID] = None
    ) -> Dict:
        """Get complete questionnaire structure for specific security level."""

        # Validate security level
        valid_levels = ["osnovna", "srednja", "napredna"]
        if security_level not in valid_levels:
            return {"error": f"Invalid security level. Must be one of: {valid_levels}"}

        # Get active version if not specified
        if not version_id:
            version = await self._get_active_version()
            if not version:
                return {"error": "No active questionnaire version found"}
            version_id = version.id
        else:
            version = await self.db.get(QuestionnaireVersion, version_id)
            if not version:
                return {"error": "Questionnaire version not found"}

        # Get measures with complete hierarchy
        measures = await self._get_measures_with_hierarchy(version_id)

        questionnaire_structure = []
        total_controls = 0
        mandatory_controls = 0

        for measure in measures:
            measure_data = {
                "measure_id": str(measure.id),
                "code": measure.code,
                "title": measure.name_hr,
                "description": measure.description_hr,
                "order_index": measure.order_index,
                "submeasures": [],
            }

            measure_controls = 0
            measure_mandatory = 0

            for submeasure in measure.submeasures:
                submeasure_data = {
                    "submeasure_id": str(submeasure.id),
                    "code": submeasure.code,
                    "title": submeasure.name_hr,
                    "description": submeasure.description_hr,
                    "order_index": submeasure.order_index,
                    "controls": [],
                }

                submeasure_controls = 0
                submeasure_mandatory = 0

                for control in submeasure.controls:
                    # Get control requirement for this security level and submeasure
                    requirement = await self._get_control_requirement(
                        control.id, security_level, submeasure.id
                    )

                    if requirement and requirement.is_applicable:
                        control_data = {
                            "control_id": str(control.id),
                            "code": control.code,
                            "title": control.name_hr,
                            "description": control.description_hr,
                            "order_index": control.order_index,
                            "is_mandatory": requirement.is_mandatory,
                            "security_level": security_level,
                            "requirement_id": str(requirement.id),
                            "minimum_score": requirement.minimum_score,
                            "submeasure_id": str(submeasure.id),  # Use the submeasure we're currently iterating
                        }

                        submeasure_data["controls"].append(control_data)
                        submeasure_controls += 1
                        total_controls += 1

                        if requirement.is_mandatory:
                            submeasure_mandatory += 1
                            mandatory_controls += 1

                if submeasure_controls > 0:
                    submeasure_data["total_controls"] = submeasure_controls
                    submeasure_data["mandatory_controls"] = submeasure_mandatory
                    measure_data["submeasures"].append(submeasure_data)
                    measure_controls += submeasure_controls
                    measure_mandatory += submeasure_mandatory

            if measure_controls > 0:
                measure_data["total_controls"] = measure_controls
                measure_data["mandatory_controls"] = measure_mandatory
                questionnaire_structure.append(measure_data)

        return {
            "questionnaire_id": str(version_id),
            "version": version.version_number,
            "security_level": security_level,
            "total_measures": len(questionnaire_structure),
            "total_controls": total_controls,
            "mandatory_controls": mandatory_controls,
            "voluntary_controls": total_controls - mandatory_controls,
            "structure": questionnaire_structure,
            "metadata": {
                "created_at": version.created_at.isoformat(),
                "is_active": version.is_active,
                "description": version.description,
            },
        }

    async def get_control_details(
        self, control_id: uuid.UUID, security_level: Optional[str] = None
    ) -> Dict:
        """Get detailed information for a specific control."""

        control = await self.control_repo.get_by_id(control_id)
        if not control:
            return {"error": "Control not found"}

        # Get all requirements for this control
        query = (
            select(ControlRequirement)
            .where(ControlRequirement.control_id == control_id)
            .order_by(ControlRequirement.level)
        )
        result = await self.db.execute(query)
        requirements = result.scalars().all()

        # Get submeasure and measure info
        submeasure = await self.db.get(Submeasure, control.submeasure_id)
        measure = (
            await self.db.get(Measure, submeasure.measure_id) if submeasure else None
        )

        control_details = {
            "control_id": str(control.id),
            "code": control.code,
            "title": control.name_hr,
            "description": control.description_hr,
            "order_index": control.order_index,
            "submeasure": {
                "id": str(submeasure.id),
                "code": submeasure.code,
                "title": submeasure.name_hr,
            }
            if submeasure
            else None,
            "measure": {
                "id": str(measure.id),
                "code": measure.code,
                "title": measure.name_hr,
            }
            if measure
            else None,
            "requirements": [],
        }

        for requirement in requirements:
            req_data = {
                "requirement_id": str(requirement.id),
                "security_level": requirement.level,
                "is_mandatory": requirement.is_mandatory,
                "is_applicable": requirement.is_applicable,
            }

            # Include requirement if no specific level requested or if it matches
            if not security_level or requirement.level == security_level:
                control_details["requirements"].append(req_data)

        # If specific level requested, include level-specific info
        if security_level:
            specific_requirement = next(
                (r for r in requirements if r.level == security_level), None
            )
            if specific_requirement:
                control_details["current_requirement"] = {
                    "is_mandatory": specific_requirement.is_mandatory,
                    "is_applicable": specific_requirement.is_applicable,
                }

        return control_details

    async def get_questionnaire_statistics(
        self, version_id: Optional[uuid.UUID] = None
    ) -> Dict:
        """Get comprehensive statistics for questionnaire."""

        # Get active version if not specified
        if not version_id:
            version = await self._get_active_version()
            if not version:
                return {"error": "No active questionnaire version found"}
            version_id = version.id

        stats = {
            "questionnaire_id": str(version_id),
            "by_security_level": {},
            "by_measure": [],
            "totals": {
                "total_measures": 0,
                "total_submeasures": 0,
                "total_controls": 0,
                "unique_controls": 0,
            },
        }

        # Get counts for each security level
        for level in ["osnovna", "srednja", "napredna"]:
            level_stats = await self._get_level_statistics(level)
            stats["by_security_level"][level] = level_stats

        # Get measure-by-measure breakdown
        measures = await self._get_measures_with_hierarchy(version_id)
        stats["totals"]["total_measures"] = len(measures)

        for measure in measures:
            measure_stats = {
                "measure_id": str(measure.id),
                "code": measure.code,
                "title": measure.name_hr,
                "submeasures": len(measure.submeasures),
                "by_level": {},
            }

            total_submeasures = 0
            total_unique_controls = 0

            for submeasure in measure.submeasures:
                unique_controls = len(submeasure.controls)
                total_submeasures += 1
                total_unique_controls += unique_controls

                # Count controls by level for this submeasure
                for level in ["osnovna", "srednja", "napredna"]:
                    level_count = await self._count_applicable_controls_in_submeasure(
                        submeasure.id, level
                    )
                    if level not in measure_stats["by_level"]:
                        measure_stats["by_level"][level] = {"total": 0, "mandatory": 0}

                    mandatory_count = (
                        await self._count_mandatory_controls_in_submeasure(
                            submeasure.id, level
                        )
                    )

                    measure_stats["by_level"][level]["total"] += level_count
                    measure_stats["by_level"][level]["mandatory"] += mandatory_count

            measure_stats["total_submeasures"] = total_submeasures
            measure_stats["unique_controls"] = total_unique_controls
            stats["by_measure"].append(measure_stats)

            stats["totals"]["total_submeasures"] += total_submeasures
            stats["totals"]["unique_controls"] += total_unique_controls

        return stats

    async def validate_questionnaire_completeness(
        self, version_id: Optional[uuid.UUID] = None
    ) -> Dict:
        """Validate questionnaire structure and completeness."""

        # Get active version if not specified
        if not version_id:
            version = await self._get_active_version()
            if not version:
                return {"error": "No active questionnaire version found"}
            version_id = version.id

        validation_result = {
            "questionnaire_id": str(version_id),
            "is_valid": True,
            "issues": [],
            "warnings": [],
            "statistics": {},
        }

        # Check each security level
        for level in ["osnovna", "srednja", "napredna"]:
            level_stats = await self._get_level_statistics(level)
            validation_result["statistics"][level] = level_stats

            # Validate minimum control counts
            if level_stats["total_controls"] < 50:
                validation_result["warnings"].append(
                    f"Security level '{level}' has only {level_stats['total_controls']} controls"
                )

            if level_stats["mandatory_controls"] == 0:
                validation_result["issues"].append(
                    f"Security level '{level}' has no mandatory controls"
                )
                validation_result["is_valid"] = False

        # Check for orphaned controls (controls without requirements)
        orphaned_count = await self._count_orphaned_controls()
        if orphaned_count > 0:
            validation_result["warnings"].append(
                f"{orphaned_count} controls have no level requirements"
            )

        return validation_result

    async def _get_active_version(self) -> Optional[QuestionnaireVersion]:
        """Get the currently active questionnaire version."""
        query = select(QuestionnaireVersion).where(
            QuestionnaireVersion.is_active == True
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_measures_with_hierarchy(
        self, version_id: uuid.UUID
    ) -> List[Measure]:
        """Get measures with complete submeasure and control hierarchy."""
        query = (
            select(Measure)
            .options(
                selectinload(Measure.submeasures).selectinload(Submeasure.controls)
            )
            .where(Measure.version_id == version_id)
            .order_by(Measure.order_index)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _get_control_requirement(
        self, control_id: uuid.UUID, security_level: str, submeasure_id: Optional[uuid.UUID] = None
    ) -> Optional[ControlRequirement]:
        """Get control requirement for specific security level and optional submeasure."""
        # First try to get submeasure-specific requirement
        if submeasure_id:
            query = select(ControlRequirement).where(
                and_(
                    ControlRequirement.control_id == control_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.submeasure_id == submeasure_id,
                )
            )
            result = await self.db.execute(query)
            requirement = result.scalar_one_or_none()
            if requirement:
                return requirement
        
        # Fallback to general requirement (no submeasure)
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.level == security_level,
                ControlRequirement.submeasure_id.is_(None),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_level_statistics(self, security_level: str) -> Dict:
        """Get statistics for a specific security level."""
        # Count total applicable controls
        query = select(func.count(ControlRequirement.id)).where(
            and_(
                ControlRequirement.level == security_level,
                ControlRequirement.is_applicable is True,
            )
        )
        result = await self.db.execute(query)
        total_controls = result.scalar() or 0

        # Count mandatory controls
        query = select(func.count(ControlRequirement.id)).where(
            and_(
                ControlRequirement.level == security_level,
                ControlRequirement.is_applicable is True,
                ControlRequirement.is_mandatory is True,
            )
        )
        result = await self.db.execute(query)
        mandatory_controls = result.scalar() or 0

        return {
            "total_controls": total_controls,
            "mandatory_controls": mandatory_controls,
            "voluntary_controls": total_controls - mandatory_controls,
        }

    async def _count_applicable_controls_in_submeasure(
        self, submeasure_id: uuid.UUID, security_level: str
    ) -> int:
        """Count applicable controls in submeasure for security level."""
        query = (
            select(func.count(ControlRequirement.id))
            .join(Control, ControlRequirement.control_id == Control.id)
            .where(
                and_(
                    Control.submeasure_id == submeasure_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.is_applicable is True,
                )
            )
        )
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def _count_mandatory_controls_in_submeasure(
        self, submeasure_id: uuid.UUID, security_level: str
    ) -> int:
        """Count mandatory controls in submeasure for security level."""
        query = (
            select(func.count(ControlRequirement.id))
            .join(Control, ControlRequirement.control_id == Control.id)
            .where(
                and_(
                    Control.submeasure_id == submeasure_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.is_applicable is True,
                    ControlRequirement.is_mandatory is True,
                )
            )
        )
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def _count_orphaned_controls(self) -> int:
        """Count controls that have no level requirements."""
        query = (
            select(func.count(Control.id))
            .outerjoin(ControlRequirement, Control.id == ControlRequirement.control_id)
            .where(ControlRequirement.id.is_(None))
        )
        result = await self.db.execute(query)
        return result.scalar() or 0
