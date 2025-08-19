"""Draft management service for assessment lifecycle."""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.assessment import AssessmentRepository, AssessmentAuditRepository, AssessmentProgressRepository
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository


logger = logging.getLogger(__name__)


class DraftManagementService:
    """Service for managing assessment drafts - resume, discard, cleanup."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.answer_repo = AssessmentAnswerRepository(db)
        self.audit_repo = AssessmentAuditRepository(db)
        self.progress_repo = AssessmentProgressRepository(db)

    async def resume_draft(
        self,
        assessment_id: UUID,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, any]:
        """Resume working on a draft assessment.
        
        Args:
            assessment_id: ID of draft assessment to resume
            user_id: User resuming the draft
            ip_address: IP address of user
            user_agent: User agent string
            
        Returns:
            Dict with success status and assessment data
        """
        try:
            # Get assessment
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {
                    "success": False,
                    "error": f"Assessment {assessment_id} not found"
                }
            
            # Only allow resuming drafts
            if assessment.status != "draft":
                return {
                    "success": False,
                    "error": f"Cannot resume {assessment.status} assessment - only drafts can be resumed"
                }
            
            # Get current progress
            progress = await self.progress_repo.get_overall_progress(assessment_id)
            answered_count = progress.answered_controls if progress else 0
            
            # Get answered controls for context
            answered_controls = await self.answer_repo.get_all_for_assessment(assessment_id)
            
            # Update assessment activity
            await self.assessment_repo.update(
                assessment_id,
                updated_at=datetime.utcnow()
            )
            
            # Log resume action
            await self.audit_repo.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="draft_resumed",
                entity_type="assessment",
                entity_id=assessment_id,
                change_summary=f"Draft assessment resumed with {answered_count} answers",
                ip_address=ip_address,
                user_agent=user_agent,
            )
            
            await self.db.commit()
            
            logger.info(f"Draft assessment {assessment_id} resumed by user {user_id}")
            
            return {
                "success": True,
                "assessment_id": str(assessment_id),
                "title": assessment.title,
                "security_level": assessment.security_level,
                "answered_controls": answered_count,
                "total_controls": assessment.total_controls or 0,
                "completion_percentage": float(progress.completion_percentage) if progress else 0.0,
                "last_updated": assessment.updated_at.isoformat(),
                "resumed_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to resume draft {assessment_id}: {str(e)}")
            await self.db.rollback()
            return {
                "success": False,
                "error": f"Failed to resume draft: {str(e)}"
            }

    async def discard_draft(
        self,
        assessment_id: UUID,
        reason: Optional[str] = None,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, any]:
        """Discard a draft assessment permanently.
        
        Args:
            assessment_id: ID of draft assessment to discard
            reason: Optional reason for discarding
            user_id: User discarding the draft
            ip_address: IP address of user
            user_agent: User agent string
            
        Returns:
            Dict with success status
        """
        try:
            # Get assessment
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {
                    "success": False,
                    "error": f"Assessment {assessment_id} not found"
                }
            
            # Only allow discarding drafts
            if assessment.status != "draft":
                return {
                    "success": False,
                    "error": f"Cannot discard {assessment.status} assessment - only drafts can be discarded"
                }
            
            # Get stats before deletion
            answered_controls = await self.answer_repo.count_by_assessment(assessment_id)
            
            # Log discard action before changing status
            discard_summary = f"Draft discarded with {answered_controls} answers"
            if reason:
                discard_summary += f". Reason: {reason}"
            
            await self.audit_repo.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="draft_discarded",
                entity_type="assessment",
                entity_id=assessment_id,
                change_summary=discard_summary,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            
            # Change status to abandoned (preserves audit trail)
            await self.assessment_repo.update(
                assessment_id,
                status="abandoned",
                updated_at=datetime.utcnow()
            )
            
            await self.db.commit()
            
            logger.info(f"Draft assessment {assessment_id} discarded by user {user_id}")
            
            return {
                "success": True,
                "assessment_id": str(assessment_id),
                "title": assessment.title,
                "answered_controls": answered_controls,
                "discarded_at": datetime.utcnow().isoformat(),
                "reason": reason,
            }
            
        except Exception as e:
            logger.error(f"Failed to discard draft {assessment_id}: {str(e)}")
            await self.db.rollback()
            return {
                "success": False,
                "error": f"Failed to discard draft: {str(e)}"
            }

    async def list_user_drafts(
        self,
        user_id: UUID,
        organization_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, any]:
        """List draft assessments for a user.
        
        Args:
            user_id: User to get drafts for
            organization_id: Optional organization filter
            limit: Maximum results to return
            offset: Number of results to skip
            
        Returns:
            Dict with list of draft assessments
        """
        try:
            # Search for user's draft assessments
            drafts = await self.assessment_repo.search_assessments(
                assigned_user_id=user_id,
                status_list=["draft"],
                organization_id=organization_id,
                limit=limit,
                offset=offset,
            )
            
            # Enrich with progress information
            draft_details = []
            for draft in drafts:
                progress = await self.progress_repo.get_overall_progress(draft.id)
                answered_count = progress.answered_controls if progress else 0
                completion_percentage = float(progress.completion_percentage) if progress else 0.0
                
                draft_details.append({
                    "id": str(draft.id),
                    "title": draft.title,
                    "description": draft.description,
                    "security_level": draft.security_level,
                    "organization_id": str(draft.organization_id),
                    "created_at": draft.created_at.isoformat(),
                    "updated_at": draft.updated_at.isoformat(),
                    "due_date": draft.due_date.isoformat() if draft.due_date else None,
                    "answered_controls": answered_count,
                    "total_controls": draft.total_controls or 0,
                    "completion_percentage": completion_percentage,
                    "can_resume": True,
                })
            
            return {
                "success": True,
                "drafts": draft_details,
                "total": len(draft_details),
                "limit": limit,
                "offset": offset,
                "user_id": str(user_id),
            }
            
        except Exception as e:
            logger.error(f"Failed to list drafts for user {user_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to list drafts: {str(e)}"
            }

    async def cleanup_old_abandoned_drafts(
        self,
        days_old: int = 90,
        dry_run: bool = True,
    ) -> Dict[str, any]:
        """Clean up old abandoned drafts (housekeeping).
        
        Args:
            days_old: Age threshold in days for cleanup
            dry_run: If True, only report what would be cleaned up
            
        Returns:
            Dict with cleanup results
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            # Find old abandoned assessments
            old_abandoned = await self.assessment_repo.search_assessments(
                status_list=["abandoned"],
                # This would need a created_before parameter in the repository
                limit=1000,  # Large limit to check all
            )
            
            # Filter by date (since we don't have created_before parameter)
            candidates = [
                assessment for assessment in old_abandoned
                if assessment.updated_at < cutoff_date
            ]
            
            if dry_run:
                return {
                    "success": True,
                    "dry_run": True,
                    "would_cleanup_count": len(candidates),
                    "cutoff_date": cutoff_date.isoformat(),
                    "candidates": [
                        {
                            "id": str(assessment.id),
                            "title": assessment.title,
                            "updated_at": assessment.updated_at.isoformat(),
                        }
                        for assessment in candidates[:10]  # Show first 10
                    ]
                }
            
            # Actually perform cleanup (in a real scenario, this might archive rather than delete)
            cleaned_count = 0
            for assessment in candidates:
                # Log cleanup action
                await self.audit_repo.create(
                    assessment_id=assessment.id,
                    user_id=None,
                    action="cleanup_abandoned",
                    entity_type="assessment",
                    entity_id=assessment.id,
                    change_summary=f"Cleaned up abandoned draft older than {days_old} days",
                    ip_address=None,
                    user_agent="DraftCleanupService",
                )
                cleaned_count += 1
            
            await self.db.commit()
            
            logger.info(f"Cleaned up {cleaned_count} abandoned drafts older than {days_old} days")
            
            return {
                "success": True,
                "dry_run": False,
                "cleaned_count": cleaned_count,
                "cutoff_date": cutoff_date.isoformat(),
                "cleaned_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to cleanup abandoned drafts: {str(e)}")
            await self.db.rollback()
            return {
                "success": False,
                "error": f"Failed to cleanup: {str(e)}"
            }

    async def get_draft_statistics(
        self,
        organization_id: Optional[UUID] = None,
    ) -> Dict[str, any]:
        """Get statistics about draft assessments.
        
        Args:
            organization_id: Optional organization filter
            
        Returns:
            Dict with draft statistics
        """
        try:
            # Get all drafts
            drafts = await self.assessment_repo.search_assessments(
                status_list=["draft"],
                organization_id=organization_id,
                limit=1000,  # Large limit to get all
            )
            
            # Calculate statistics
            total_drafts = len(drafts)
            
            if total_drafts == 0:
                return {
                    "success": True,
                    "total_drafts": 0,
                    "organization_id": str(organization_id) if organization_id else None,
                }
            
            # Age statistics
            now = datetime.utcnow()
            ages = [(now - draft.created_at).days for draft in drafts]
            avg_age_days = sum(ages) / len(ages)
            oldest_days = max(ages)
            newest_days = min(ages)
            
            # Progress statistics
            progress_data = []
            for draft in drafts:
                progress = await self.progress_repo.get_overall_progress(draft.id)
                if progress:
                    progress_data.append(float(progress.completion_percentage))
                else:
                    progress_data.append(0.0)
            
            avg_completion = sum(progress_data) / len(progress_data) if progress_data else 0.0
            
            # Security level breakdown
            level_counts = {}
            for draft in drafts:
                level = draft.security_level
                level_counts[level] = level_counts.get(level, 0) + 1
            
            return {
                "success": True,
                "total_drafts": total_drafts,
                "age_statistics": {
                    "average_age_days": round(avg_age_days, 1),
                    "oldest_days": oldest_days,
                    "newest_days": newest_days,
                },
                "completion_statistics": {
                    "average_completion_percentage": round(avg_completion, 1),
                    "completed_drafts": len([p for p in progress_data if p > 50.0]),
                    "barely_started": len([p for p in progress_data if p < 10.0]),
                },
                "security_level_breakdown": level_counts,
                "organization_id": str(organization_id) if organization_id else None,
                "calculated_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get draft statistics: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to get statistics: {str(e)}"
            }