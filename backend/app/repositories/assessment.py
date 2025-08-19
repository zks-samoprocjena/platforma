"""Assessment repository for data access operations."""

import uuid
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assessment import (
    Assessment,
    AssessmentAnswer,
    AssessmentAuditLog,
    AssessmentActivity,
    AssessmentProgress,
    AssessmentResult,
)
from app.repositories.base import BaseRepository


class AssessmentRepository(BaseRepository[Assessment]):
    """Repository for assessment operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Assessment)

    async def get_with_relationships(
        self, assessment_id: uuid.UUID
    ) -> Optional[Assessment]:
        """Get assessment with all relationships loaded."""
        query = (
            select(Assessment)
            .options(
                selectinload(Assessment.answers),
                selectinload(Assessment.results),
                selectinload(Assessment.progress),
                selectinload(Assessment.assignments),
            )
            .where(Assessment.id == assessment_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_organization(
        self,
        organization_id: uuid.UUID,
        status: Optional[str] = None,
        security_level: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[Assessment]:
        """Get assessments for an organization with filtering."""
        query = select(Assessment).where(Assessment.organization_id == organization_id)

        if status:
            query = query.where(Assessment.status == status)

        if security_level:
            query = query.where(Assessment.security_level == security_level)

        query = query.order_by(desc(Assessment.updated_at))

        if offset:
            query = query.offset(offset)

        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_assigned_to_user(
        self, user_id: uuid.UUID, status: Optional[str] = None
    ) -> List[Assessment]:
        """Get assessments assigned to a specific user."""
        query = select(Assessment).where(Assessment.assigned_to.contains([user_id]))

        if status:
            query = query.where(Assessment.status == status)

        query = query.order_by(desc(Assessment.updated_at))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def search_assessments(
        self,
        organization_id: Optional[uuid.UUID] = None,
        search_term: Optional[str] = None,
        status_list: Optional[List[str]] = None,
        security_levels: Optional[List[str]] = None,
        assigned_user_id: Optional[uuid.UUID] = None,
        created_after: Optional[datetime] = None,
        created_before: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Assessment]:
        """Search assessments with comprehensive filtering."""
        query = select(Assessment)

        conditions = []

        if organization_id:
            conditions.append(Assessment.organization_id == organization_id)

        if search_term:
            search_pattern = f"%{search_term}%"
            conditions.append(
                or_(
                    Assessment.title.ilike(search_pattern),
                    Assessment.description.ilike(search_pattern),
                )
            )

        if status_list:
            conditions.append(Assessment.status.in_(status_list))

        if security_levels:
            conditions.append(Assessment.security_level.in_(security_levels))

        if assigned_user_id:
            conditions.append(Assessment.assigned_to.contains([assigned_user_id]))

        if created_after:
            conditions.append(Assessment.created_at >= created_after)

        if created_before:
            conditions.append(Assessment.created_at <= created_before)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(desc(Assessment.updated_at)).offset(offset).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_search_results(
        self,
        organization_id: Optional[uuid.UUID] = None,
        search_term: Optional[str] = None,
        status_list: Optional[List[str]] = None,
        security_levels: Optional[List[str]] = None,
        assigned_user_id: Optional[uuid.UUID] = None,
        created_after: Optional[datetime] = None,
        created_before: Optional[datetime] = None,
    ) -> int:
        """Count assessments matching search criteria."""
        query = select(func.count(Assessment.id))

        conditions = []

        if organization_id:
            conditions.append(Assessment.organization_id == organization_id)

        if search_term:
            search_pattern = f"%{search_term}%"
            conditions.append(
                or_(
                    Assessment.title.ilike(search_pattern),
                    Assessment.description.ilike(search_pattern),
                )
            )

        if status_list:
            conditions.append(Assessment.status.in_(status_list))

        if security_levels:
            conditions.append(Assessment.security_level.in_(security_levels))

        if assigned_user_id:
            conditions.append(Assessment.assigned_to.contains([assigned_user_id]))

        if created_after:
            conditions.append(Assessment.created_at >= created_after)

        if created_before:
            conditions.append(Assessment.created_at <= created_before)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        return result.scalar_one()

    async def count_by_status(self, organization_id: uuid.UUID) -> Dict[str, int]:
        """Count assessments by status for an organization."""
        query = (
            select(Assessment.status, func.count(Assessment.id))
            .where(Assessment.organization_id == organization_id)
            .group_by(Assessment.status)
        )
        result = await self.db.execute(query)
        return {status: count for status, count in result.all()}

    async def get_recent_activity(
        self, organization_id: uuid.UUID, days: int = 30, limit: int = 10
    ) -> List[Assessment]:
        """Get recently active assessments."""
        cutoff_date = datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        cutoff_date = cutoff_date.replace(day=cutoff_date.day - days)

        query = (
            select(Assessment)
            .where(
                and_(
                    Assessment.organization_id == organization_id,
                    Assessment.updated_at >= cutoff_date,
                )
            )
            .order_by(desc(Assessment.updated_at))
            .limit(limit)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_by_organization(self, organization_id: uuid.UUID) -> int:
        """Count total assessments for a specific organization."""
        query = select(func.count(Assessment.id)).where(
            Assessment.organization_id == organization_id
        )
        result = await self.db.execute(query)
        return result.scalar_one()

    async def update_status(
        self,
        assessment_id: uuid.UUID,
        new_status: str,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[Assessment]:
        """Update assessment status with audit trail."""
        assessment = await self.get_by_id(assessment_id)
        if not assessment:
            return None

        # old_status = assessment.status  # Could be used for audit logging
        assessment.status = new_status
        assessment.updated_at = datetime.utcnow()

        # Set completion timestamp for certain status transitions
        if new_status == "completed" and not assessment.completed_at:
            assessment.completed_at = datetime.utcnow()
        elif new_status == "in_progress" and not assessment.started_at:
            assessment.started_at = datetime.utcnow()

        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def soft_delete(
        self, assessment_id: uuid.UUID, user_id: Optional[uuid.UUID] = None
    ) -> bool:
        """Soft delete assessment (mark as archived)."""
        assessment = await self.get_by_id(assessment_id)
        if not assessment:
            return False

        assessment.status = "archived"
        assessment.updated_at = datetime.utcnow()

        await self.db.flush()
        return True


# ============================================================================
# OBSOLETE CLASS - POTENTIALLY SAFE TO DELETE AFTER V3 TESTING
# ============================================================================
# This AssessmentAnswerRepository class is OLDER and may be obsolete.
# V3 Service uses: app.repositories.assessment_answer_repository.AssessmentAnswerRepository
# NOT this one: app.repositories.assessment.AssessmentAnswerRepository
#
# TODO: Verify if any services still use this class, then safe to delete
# ============================================================================

class AssessmentAnswerRepository_OLD(BaseRepository[AssessmentAnswer]):
    """OBSOLETE Repository for assessment answer operations.
    
    NOTE: This class has been RENAMED to _OLD to avoid conflicts.
    The active class is in assessment_answer_repository.py
    """

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentAnswer)

    async def get_by_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[AssessmentAnswer]:
        """Get all answers for an assessment."""
        query = (
            select(AssessmentAnswer)
            .where(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(AssessmentAnswer.answered_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_control(
        self, assessment_id: uuid.UUID, control_id: uuid.UUID, submeasure_id: Optional[uuid.UUID] = None
    ) -> Optional[AssessmentAnswer]:
        """Get answer for specific control in assessment."""
        if submeasure_id:
            query = select(AssessmentAnswer).where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.control_id == control_id,
                    AssessmentAnswer.submeasure_id == submeasure_id,
                )
            )
        else:
            # For backward compatibility, if no submeasure_id provided, get the first match
            query = select(AssessmentAnswer).where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    AssessmentAnswer.control_id == control_id,
                )
            )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def batch_update_answers(
        self, assessment_id: uuid.UUID, answers_data: List[Dict]
    ) -> List[AssessmentAnswer]:
        """Batch update multiple answers for an assessment."""
        updated_answers = []

        for answer_data in answers_data:
            control_id = answer_data["control_id"]
            existing_answer = await self.get_by_control(assessment_id, control_id)

            if existing_answer:
                # Update existing answer
                for field, value in answer_data.items():
                    if field != "control_id" and hasattr(existing_answer, field):
                        setattr(existing_answer, field, value)
                existing_answer.answered_at = datetime.utcnow()
                updated_answers.append(existing_answer)
            else:
                # Create new answer
                new_answer = AssessmentAnswer(
                    assessment_id=assessment_id,
                    **answer_data,
                    answered_at=datetime.utcnow(),
                )
                self.db.add(new_answer)
                updated_answers.append(new_answer)

        await self.db.flush()
        return updated_answers

    # ============================================================================
    # OBSOLETE METHOD - COMMENTED OUT FOR SAFE DELETION LATER
    # ============================================================================
    # This method was mistakenly added here during V3 implementation.
    # The correct implementation is in AssessmentAnswerRepository class
    # in assessment_answer_repository.py file.
    # 
    # V3 Service uses: app.repositories.assessment_answer_repository.AssessmentAnswerRepository
    # NOT: app.repositories.assessment.AssessmentAnswerRepository
    #
    # TODO: Safe to delete this method after V3 is confirmed working
    # ============================================================================
    
    # async def get_completion_stats(self, assessment_id: uuid.UUID) -> Dict:
    #     """OBSOLETE - Get comprehensive completion statistics for assessment including control counts."""
    #     # Import here to avoid circular imports
    #     from app.models.reference import Control
    #     
    #     # Get assessment to determine security level
    #     assessment_query = select(Assessment).where(Assessment.id == assessment_id)
    #     assessment_result = await self.db.execute(assessment_query)
    #     assessment = assessment_result.scalar_one_or_none()
    #     
    #     if not assessment:
    #         return {
    #             "total_controls": 0,
    #             "answered_controls": 0,
    #             "mandatory_controls": 0,
    #             "mandatory_answered": 0,
    #         }
    #     
    #     # Get all unique controls for this assessment (via answered controls)
    #     answered_controls_query = (
    #         select(func.count(func.distinct(AssessmentAnswer.control_id)))
    #         .where(AssessmentAnswer.assessment_id == assessment_id)
    #     )
    #     answered_result = await self.db.execute(answered_controls_query)
    #     answered_controls = answered_result.scalar() or 0
    #     
    #     # Get all controls that have answers for this assessment
    #     control_ids_query = (
    #         select(func.distinct(AssessmentAnswer.control_id))
    #         .where(AssessmentAnswer.assessment_id == assessment_id)
    #     )
    #     control_ids_result = await self.db.execute(control_ids_query)
    #     answered_control_ids = [row[0] for row in control_ids_result.all()]
    #     
    #     if answered_control_ids:
    #         # Get mandatory controls that have been answered
    #         mandatory_answered_query = (
    #             select(func.count(Control.id))
    #             .where(
    #                 and_(
    #                     Control.id.in_(answered_control_ids),
    #                     Control.is_mandatory[assessment.security_level].astext.cast(Boolean) == True
    #                 )
    #             )
    #         )
    #         mandatory_answered_result = await self.db.execute(mandatory_answered_query)
    #         mandatory_answered = mandatory_answered_result.scalar() or 0
    #         
    #         # Get total mandatory controls among those answered (approximation)
    #         # This is simplified - in a real implementation you'd want to get all relevant controls for the assessment
    #         mandatory_controls = mandatory_answered  # Conservative estimate
    #         total_controls = answered_controls  # Conservative estimate
    #     else:
    #         mandatory_answered = 0
    #         mandatory_controls = 0
    #         total_controls = 0
    #     
    #     return {
    #         "total_controls": total_controls,
    #         "answered_controls": answered_controls,
    #         "mandatory_controls": mandatory_controls,
    #         "mandatory_answered": mandatory_answered,
    #     }


class AssessmentAuditRepository(BaseRepository[AssessmentAuditLog]):
    """Repository for assessment audit log operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentAuditLog)

    async def get_by_assessment(
        self, assessment_id: uuid.UUID, limit: int = 100, offset: int = 0
    ) -> List[AssessmentAuditLog]:
        """Get audit logs for an assessment."""
        query = (
            select(AssessmentAuditLog)
            .where(AssessmentAuditLog.assessment_id == assessment_id)
            .order_by(desc(AssessmentAuditLog.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_user(
        self, user_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> List[AssessmentAuditLog]:
        """Get audit logs for a specific user."""
        query = (
            select(AssessmentAuditLog)
            .where(AssessmentAuditLog.user_id == user_id)
            .order_by(desc(AssessmentAuditLog.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_action(
        self, assessment_id: uuid.UUID, action: str, limit: int = 50
    ) -> List[AssessmentAuditLog]:
        """Get audit logs by specific action type."""
        query = (
            select(AssessmentAuditLog)
            .where(
                and_(
                    AssessmentAuditLog.assessment_id == assessment_id,
                    AssessmentAuditLog.action == action,
                )
            )
            .order_by(desc(AssessmentAuditLog.created_at))
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())


class AssessmentActivityRepository(BaseRepository[AssessmentActivity]):
    """Repository for assessment activity tracking."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentActivity)

    async def get_active_users(
        self, assessment_id: uuid.UUID, minutes: int = 5
    ) -> List[AssessmentActivity]:
        """Get currently active users in assessment."""
        cutoff_time = datetime.utcnow().timestamp() - (minutes * 60)

        query = (
            select(AssessmentActivity)
            .where(
                and_(
                    AssessmentActivity.assessment_id == assessment_id,
                    AssessmentActivity.ended_at.is_(None),
                    AssessmentActivity.last_active
                    >= datetime.fromtimestamp(cutoff_time),
                )
            )
            .order_by(desc(AssessmentActivity.last_active))
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def end_user_session(
        self, assessment_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        """End active session for user in assessment."""
        query = select(AssessmentActivity).where(
            and_(
                AssessmentActivity.assessment_id == assessment_id,
                AssessmentActivity.user_id == user_id,
                AssessmentActivity.ended_at.is_(None),
            )
        )
        result = await self.db.execute(query)
        activities = result.scalars().all()

        for activity in activities:
            activity.ended_at = datetime.utcnow()

        await self.db.flush()
        return len(activities) > 0


class AssessmentProgressRepository(BaseRepository[AssessmentProgress]):
    """Repository for assessment progress tracking."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentProgress)

    async def get_by_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[AssessmentProgress]:
        """Get progress records for assessment."""
        query = (
            select(AssessmentProgress)
            .where(AssessmentProgress.assessment_id == assessment_id)
            .order_by(AssessmentProgress.measure_id.nulls_first())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_overall_progress(
        self, assessment_id: uuid.UUID
    ) -> Optional[AssessmentProgress]:
        """Get overall progress (measure_id is null). If multiple exist, return the most recent."""
        query = select(AssessmentProgress).where(
            and_(
                AssessmentProgress.assessment_id == assessment_id,
                AssessmentProgress.measure_id.is_(None),
            )
        ).order_by(desc(AssessmentProgress.updated_at))
        result = await self.db.execute(query)
        return result.scalars().first()

    async def cleanup_duplicate_overall_progress(
        self, assessment_id: uuid.UUID
    ) -> int:
        """Remove duplicate overall progress records, keeping only the most recent."""
        # Get all overall progress records
        query = select(AssessmentProgress).where(
            and_(
                AssessmentProgress.assessment_id == assessment_id,
                AssessmentProgress.measure_id.is_(None),
            )
        ).order_by(desc(AssessmentProgress.updated_at))
        
        result = await self.db.execute(query)
        all_records = list(result.scalars().all())
        
        # If there's more than one, delete all except the most recent
        if len(all_records) > 1:
            records_to_delete = all_records[1:]  # Keep first (most recent)
            for record in records_to_delete:
                await self.db.delete(record)
            await self.db.flush()
            return len(records_to_delete)
        
        return 0


class AssessmentResultRepository(BaseRepository[AssessmentResult]):
    """Repository for assessment result caching."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentResult)

    async def get_current_results(
        self, assessment_id: uuid.UUID
    ) -> List[AssessmentResult]:
        """Get current cached results for assessment."""
        query = (
            select(AssessmentResult)
            .where(
                and_(
                    AssessmentResult.assessment_id == assessment_id,
                    AssessmentResult.is_current is True,
                )
            )
            .order_by(AssessmentResult.measure_id, AssessmentResult.submeasure_id)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_measure_results(
        self, assessment_id: uuid.UUID, measure_id: uuid.UUID
    ) -> List[AssessmentResult]:
        """Get results for specific measure and its submeasures."""
        query = (
            select(AssessmentResult)
            .where(
                and_(
                    AssessmentResult.assessment_id == assessment_id,
                    AssessmentResult.measure_id == measure_id,
                    AssessmentResult.is_current is True,
                )
            )
            .order_by(AssessmentResult.submeasure_id.nulls_first())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_last_activity_user_id(self, assessment_id: uuid.UUID) -> Optional[uuid.UUID]:
        """Get the user ID of the last person to have activity on an assessment."""
        query = (
            select(AssessmentActivity.user_id)
            .where(AssessmentActivity.assessment_id == assessment_id)
            .order_by(desc(AssessmentActivity.last_active))
            .limit(1)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
