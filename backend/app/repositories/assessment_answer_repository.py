"""Assessment answer repository with submeasure context support.

============================================================================
ACTIVE REPOSITORY FOR V3 API
============================================================================
This is the ACTIVE AssessmentAnswerRepository class used by:
- AssessmentService 
- V3 API endpoints
- All V3 compliance scoring

Import path: app.repositories.assessment_answer_repository.AssessmentAnswerRepository

NOTE: There's an obsolete class with the same name in assessment.py 
that has been renamed to AssessmentAnswerRepository_OLD
============================================================================
"""
import uuid
import logging
from typing import List, Optional, Dict, Any

from sqlalchemy import select, update, func, and_, Boolean

logger = logging.getLogger(__name__)
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository
from app.models.assessment import AssessmentAnswer, Assessment  # Use original model with submeasure support


class AssessmentAnswerRepository(BaseRepository[AssessmentAnswer]):
    """ACTIVE Repository for assessment answers with submeasure context.
    
    Used by V3 API for comprehensive assessment management including:
    - Progress calculation with get_completion_stats()
    - Submeasure-specific answer management
    - Control scoring and compliance tracking
    """

    def __init__(self, db):
        super().__init__(db, AssessmentAnswer)

    async def get_by_control_and_submeasure(
        self,
        assessment_id: uuid.UUID,
        control_id: uuid.UUID,
        submeasure_id: uuid.UUID,
    ) -> Optional[AssessmentAnswer]:
        """Get answer for specific control and submeasure combination."""
        query = select(AssessmentAnswer).where(
            and_(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.control_id == control_id,
                AssessmentAnswer.submeasure_id == submeasure_id,
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_submeasure(
        self,
        assessment_id: uuid.UUID,
        submeasure_id: uuid.UUID,
    ) -> List[AssessmentAnswer]:
        """Get all answers for a specific submeasure."""
        query = (
            select(AssessmentAnswer)
            .options(
                selectinload(AssessmentAnswer.control),
                selectinload(AssessmentAnswer.submeasure),
            )
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.submeasure_id == submeasure_id,
                )
            )
            .order_by(AssessmentAnswer.updated_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_for_assessment(
        self,
        assessment_id: uuid.UUID,
    ) -> List[AssessmentAnswer]:
        """Get all answers for an assessment."""
        query = (
            select(AssessmentAnswer)
            .options(
                selectinload(AssessmentAnswer.control),
                selectinload(AssessmentAnswer.submeasure),
            )
            .where(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(AssessmentAnswer.updated_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_or_update(
        self,
        assessment_id: uuid.UUID,
        control_id: uuid.UUID,
        submeasure_id: uuid.UUID,
        documentation_score: Optional[int] = None,
        implementation_score: Optional[int] = None,
        comments: Optional[str] = None,
        evidence_files: Optional[List[str]] = None,
        confidence_level: Optional[int] = None,
        answered_by: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AssessmentAnswer:
        """Create new answer or update existing one."""
        
        # Check if answer already exists
        existing = await self.get_by_control_and_submeasure(
            assessment_id, control_id, submeasure_id
        )
        
        if existing:
            # Update existing answer
            update_stmt = (
                update(AssessmentAnswer)
                .where(AssessmentAnswer.id == existing.id)
                .values(
                    documentation_score=documentation_score,
                    implementation_score=implementation_score,
                    comments=comments,
                    evidence_files=evidence_files or [],
                    confidence_level=confidence_level,
                    answered_by=answered_by,
                )
                .execution_options(synchronize_session="fetch")
            )
            await self.db.execute(update_stmt)
            await self.db.commit()
            return await self.get_by_control_and_submeasure(assessment_id, control_id, submeasure_id)
        else:
            # Create new answer
            answer = AssessmentAnswer(
                assessment_id=assessment_id,
                control_id=control_id,
                submeasure_id=submeasure_id,
                documentation_score=documentation_score,
                implementation_score=implementation_score,
                comments=comments,
                evidence_files=evidence_files or [],
                confidence_level=confidence_level,
                answered_by=answered_by,
            )
            
            self.db.add(answer)
            await self.db.commit()
            await self.db.refresh(answer)
            return answer

    async def get_batch_for_controls(
        self,
        assessment_id: uuid.UUID,
        control_submeasure_pairs: List[tuple[uuid.UUID, uuid.UUID]],
    ) -> List[AssessmentAnswer]:
        """Get answers for multiple control-submeasure pairs efficiently."""
        if not control_submeasure_pairs:
            return []
        
        # Build OR condition for all control-submeasure pairs
        conditions = [
            and_(
                AssessmentAnswer.control_id == control_id,
                AssessmentAnswer.submeasure_id == submeasure_id,
            )
            for control_id, submeasure_id in control_submeasure_pairs
        ]
        
        query = (
            select(AssessmentAnswer)
            .options(
                selectinload(AssessmentAnswer.control),
                selectinload(AssessmentAnswer.submeasure),
            )
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    func.or_(*conditions)
                )
            )
        )
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_submeasure_statistics(
        self,
        assessment_id: uuid.UUID,
        submeasure_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Get statistics for a specific submeasure."""
        query = select(
            func.count(AssessmentAnswer.id).label("total_answered"),
            func.avg(AssessmentAnswer.documentation_score).label("avg_doc_score"),
            func.avg(AssessmentAnswer.implementation_score).label("avg_impl_score"),
            func.avg(
                (
                    func.nullif(AssessmentAnswer.documentation_score, None) +
                    func.nullif(AssessmentAnswer.implementation_score, None)
                ) / 2.0
            ).label("avg_overall_score"),
        ).where(
            and_(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.submeasure_id == submeasure_id,
            )
        )
        
        result = await self.db.execute(query)
        row = result.first()
        
        return {
            "total_answered": row.total_answered or 0,
            "avg_documentation_score": float(row.avg_doc_score) if row.avg_doc_score else None,
            "avg_implementation_score": float(row.avg_impl_score) if row.avg_impl_score else None,
            "avg_overall_score": float(row.avg_overall_score) if row.avg_overall_score else None,
        }

    async def get_assessment_statistics(
        self,
        assessment_id: uuid.UUID,
    ) -> List[Dict[str, Any]]:
        """Get statistics grouped by submeasure for entire assessment."""
        query = (
            select(
                AssessmentAnswer.submeasure_id,
                func.count(AssessmentAnswer.id).label("answered_count"),
                func.avg(AssessmentAnswer.documentation_score).label("avg_doc"),
                func.avg(AssessmentAnswer.implementation_score).label("avg_impl"),
            )
            .where(AssessmentAnswer.assessment_id == assessment_id)
            .group_by(AssessmentAnswer.submeasure_id)
        )
        
        result = await self.db.execute(query)
        
        return [
            {
                "submeasure_id": str(row.submeasure_id),
                "answered_count": row.answered_count,
                "avg_documentation_score": float(row.avg_doc) if row.avg_doc else None,
                "avg_implementation_score": float(row.avg_impl) if row.avg_impl else None,
            }
            for row in result
        ]

    async def bulk_update_final_status(
        self,
        assessment_id: uuid.UUID,
        submeasure_id: Optional[uuid.UUID] = None,
        is_final: bool = True,
    ) -> int:
        """Mark answers as final (for assessment submission)."""
        stmt = update(AssessmentAnswer).where(
            AssessmentAnswer.assessment_id == assessment_id
        ).values(is_final=is_final)
        
        if submeasure_id:
            stmt = stmt.where(AssessmentAnswer.submeasure_id == submeasure_id)
        
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

    async def get_completion_stats(self, assessment_id: uuid.UUID) -> Dict[str, Any]:
        """Get comprehensive completion statistics for assessment including control counts."""
        logger.info(f"[ANSWER_REPO] Getting completion stats for assessment {assessment_id}")
        
        # Import here to avoid circular imports
        from app.models.reference import Control, ControlRequirement, Submeasure, Measure, ControlSubmeasureMapping
        
        # Get assessment to determine security level and version
        assessment_query = select(Assessment).where(Assessment.id == assessment_id)
        assessment_result = await self.db.execute(assessment_query)
        assessment = assessment_result.scalar_one_or_none()
        
        if not assessment:
            logger.warning(f"[ANSWER_REPO] Assessment {assessment_id} not found")
            return {
                "total_controls": 0,
                "answered_controls": 0,
                "mandatory_controls": 0,
                "mandatory_answered": 0,
            }
        
        logger.debug(f"[ANSWER_REPO] Assessment {assessment_id}: version_id={assessment.version_id}, "
                    f"security_level={assessment.security_level}")
        
        # Get total available controls for this assessment's security level and version
        # Count all control-submeasure combinations (not distinct controls)
        # This accounts for controls that appear in multiple submeasures
        total_controls_query = (
            select(func.count())
            .select_from(ControlSubmeasureMapping)
            .join(Control, ControlSubmeasureMapping.control_id == Control.id)
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .join(
                ControlRequirement,
                and_(
                    ControlRequirement.control_id == Control.id,
                    ControlRequirement.submeasure_id == ControlSubmeasureMapping.submeasure_id,
                    ControlRequirement.level == assessment.security_level
                )
            )
            .where(
                and_(
                    Measure.version_id == assessment.version_id,
                    ControlRequirement.is_applicable == True
                )
            )
        )
        total_controls_result = await self.db.execute(total_controls_query)
        total_controls = total_controls_result.scalar() or 0
        
        # Get total mandatory controls for this assessment's security level
        # Count all mandatory control-submeasure combinations
        mandatory_controls_query = (
            select(func.count())
            .select_from(ControlSubmeasureMapping)
            .join(Control, ControlSubmeasureMapping.control_id == Control.id)
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .join(
                ControlRequirement,
                and_(
                    ControlRequirement.control_id == Control.id,
                    ControlRequirement.submeasure_id == ControlSubmeasureMapping.submeasure_id,
                    ControlRequirement.level == assessment.security_level
                )
            )
            .where(
                and_(
                    Measure.version_id == assessment.version_id,
                    ControlRequirement.is_applicable == True,
                    ControlRequirement.is_mandatory == True
                )
            )
        )
        mandatory_controls_result = await self.db.execute(mandatory_controls_query)
        mandatory_controls = mandatory_controls_result.scalar() or 0
        
        # Get count of answered controls for this assessment (fully rated, level-matched)
        # Count each control-submeasure combination with BOTH scores present and matching assessment level
        answered_controls_query = (
            select(func.count())
            .select_from(AssessmentAnswer)
            .join(
                ControlRequirement,
                and_(
                    ControlRequirement.control_id == AssessmentAnswer.control_id,
                    ControlRequirement.submeasure_id == AssessmentAnswer.submeasure_id,
                    ControlRequirement.level == assessment.security_level,
                    ControlRequirement.is_applicable == True,
                )
            )
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.documentation_score.isnot(None),
                    AssessmentAnswer.implementation_score.isnot(None),
                )
            )
        )
        answered_result = await self.db.execute(answered_controls_query)
        answered_controls = answered_result.scalar() or 0
        
        # Get count of answered mandatory controls (fully rated, level-matched)
        # Count each mandatory control-submeasure combination with BOTH scores present
        mandatory_answered_query = (
            select(func.count())
            .select_from(AssessmentAnswer)
            .join(
                ControlRequirement,
                and_(
                    ControlRequirement.control_id == AssessmentAnswer.control_id,
                    ControlRequirement.submeasure_id == AssessmentAnswer.submeasure_id,
                    ControlRequirement.level == assessment.security_level,
                    ControlRequirement.is_applicable == True,
                    ControlRequirement.is_mandatory == True,
                )
            )
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.documentation_score.isnot(None),
                    AssessmentAnswer.implementation_score.isnot(None),
                )
            )
        )
        mandatory_answered_result = await self.db.execute(mandatory_answered_query)
        mandatory_answered = mandatory_answered_result.scalar() or 0
        
        # Calculate percentages with defensive checks
        completion_percentage = (
            round((answered_controls / total_controls) * 100, 1) if total_controls > 0 else 0.0
        )
        mandatory_completion_percentage = (
            round((mandatory_answered / mandatory_controls) * 100, 1) if mandatory_controls > 0 else 0.0
        )
        
        logger.info(
            f"[ANSWER_REPO] Completion stats for {assessment_id}: "
            f"total={total_controls}, answered={answered_controls} ({completion_percentage}%), "
            f"mandatory={mandatory_controls}, mandatory_answered={mandatory_answered} ({mandatory_completion_percentage}%)"
        )
        
        return {
            "total_controls": total_controls,
            "answered_controls": answered_controls,
            "mandatory_controls": mandatory_controls,
            "mandatory_answered": mandatory_answered,
            "completion_percentage": completion_percentage,
            "mandatory_completion_percentage": mandatory_completion_percentage,
        }

    async def get_last_updated_by_user_id(self, assessment_id: uuid.UUID) -> Optional[uuid.UUID]:
        """Get the user ID of the last person to answer questions in this assessment."""
        query = (
            select(AssessmentAnswer.answered_by)
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.answered_by.is_not(None)
                )
            )
            .order_by(AssessmentAnswer.updated_at.desc())
            .limit(1)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()