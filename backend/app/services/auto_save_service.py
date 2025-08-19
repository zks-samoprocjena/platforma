"""Auto-save service for assessment progress."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.assessment import AssessmentRepository
from app.repositories.assessment_answer import AssessmentAnswerRepository
from app.repositories.assessment_audit import AssessmentAuditRepository


logger = logging.getLogger(__name__)


class AutoSaveService:
    """Service for handling automatic saving of assessment progress."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.answer_repo = AssessmentAnswerRepository(db)
        self.audit_repo = AssessmentAuditRepository(db)
        self._auto_save_intervals: Dict[UUID, int] = {}  # assessment_id -> seconds
        self._last_save_times: Dict[UUID, datetime] = {}

    async def enable_auto_save(
        self,
        assessment_id: UUID,
        interval_seconds: int = 30,
        user_id: Optional[UUID] = None,
    ) -> Dict[str, any]:
        """Enable auto-save for an assessment.
        
        Args:
            assessment_id: ID of assessment to auto-save
            interval_seconds: How often to save (default 30 seconds)
            user_id: User enabling auto-save
            
        Returns:
            Dict with success status and configuration
        """
        try:
            # Verify assessment exists
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {
                    "success": False,
                    "error": f"Assessment {assessment_id} not found"
                }
            
            # Only enable auto-save for draft and in_progress assessments
            if assessment.status not in ["draft", "in_progress"]:
                return {
                    "success": False,
                    "error": f"Auto-save not available for {assessment.status} assessments"
                }
            
            # Configure auto-save
            self._auto_save_intervals[assessment_id] = interval_seconds
            self._last_save_times[assessment_id] = datetime.utcnow()
            
            # Log the configuration
            await self.audit_repo.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="auto_save_enabled",
                entity_type="assessment",
                entity_id=assessment_id,
                change_summary=f"Auto-save enabled with {interval_seconds}s interval",
                ip_address=None,
                user_agent="AutoSaveService",
            )
            
            logger.info(f"Auto-save enabled for assessment {assessment_id} with {interval_seconds}s interval")
            
            return {
                "success": True,
                "assessment_id": str(assessment_id),
                "interval_seconds": interval_seconds,
                "enabled_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to enable auto-save for {assessment_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to enable auto-save: {str(e)}"
            }

    async def disable_auto_save(
        self,
        assessment_id: UUID,
        user_id: Optional[UUID] = None,
    ) -> Dict[str, any]:
        """Disable auto-save for an assessment."""
        try:
            if assessment_id in self._auto_save_intervals:
                del self._auto_save_intervals[assessment_id]
            
            if assessment_id in self._last_save_times:
                del self._last_save_times[assessment_id]
            
            # Log the disable action
            await self.audit_repo.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="auto_save_disabled",
                entity_type="assessment",
                entity_id=assessment_id,
                change_summary="Auto-save disabled",
                ip_address=None,
                user_agent="AutoSaveService",
            )
            
            logger.info(f"Auto-save disabled for assessment {assessment_id}")
            
            return {
                "success": True,
                "assessment_id": str(assessment_id),
                "disabled_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to disable auto-save for {assessment_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to disable auto-save: {str(e)}"
            }

    async def perform_auto_save(self, assessment_id: UUID) -> Dict[str, any]:
        """Perform an auto-save operation for an assessment."""
        try:
            # Check if auto-save is enabled
            if assessment_id not in self._auto_save_intervals:
                return {
                    "success": False,
                    "error": "Auto-save not enabled for this assessment"
                }
            
            # Check if it's time to save
            last_save = self._last_save_times.get(assessment_id)
            interval = self._auto_save_intervals[assessment_id]
            now = datetime.utcnow()
            
            if last_save and (now - last_save).total_seconds() < interval:
                return {
                    "success": False,
                    "error": "Auto-save interval not reached",
                    "seconds_remaining": interval - int((now - last_save).total_seconds())
                }
            
            # Get assessment and check if it needs saving
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {
                    "success": False,
                    "error": "Assessment not found"
                }
            
            # Update last activity timestamp
            await self.assessment_repo.update(assessment_id, updated_at=now)
            
            # Update last save time
            self._last_save_times[assessment_id] = now
            
            # Commit the transaction
            await self.db.commit()
            
            return {
                "success": True,
                "assessment_id": str(assessment_id),
                "saved_at": now.isoformat(),
                "next_save_in": interval,
            }
            
        except Exception as e:
            logger.error(f"Auto-save failed for {assessment_id}: {str(e)}")
            await self.db.rollback()
            return {
                "success": False,
                "error": f"Auto-save failed: {str(e)}"
            }

    async def get_auto_save_status(self, assessment_id: UUID) -> Dict[str, any]:
        """Get auto-save status for an assessment."""
        if assessment_id not in self._auto_save_intervals:
            return {
                "enabled": False,
                "assessment_id": str(assessment_id)
            }
        
        last_save = self._last_save_times.get(assessment_id)
        interval = self._auto_save_intervals[assessment_id]
        now = datetime.utcnow()
        
        next_save_in = None
        if last_save:
            elapsed = (now - last_save).total_seconds()
            next_save_in = max(0, interval - int(elapsed))
        
        return {
            "enabled": True,
            "assessment_id": str(assessment_id),
            "interval_seconds": interval,
            "last_save": last_save.isoformat() if last_save else None,
            "next_save_in_seconds": next_save_in,
        }

    async def auto_save_all_active(self) -> Dict[str, any]:
        """Perform auto-save for all assessments that need it."""
        results = []
        for assessment_id in list(self._auto_save_intervals.keys()):
            result = await self.perform_auto_save(assessment_id)
            if result["success"]:
                results.append({
                    "assessment_id": str(assessment_id),
                    "saved_at": result["saved_at"]
                })
        
        return {
            "success": True,
            "auto_saved_count": len(results),
            "assessments": results,
            "checked_at": datetime.utcnow().isoformat(),
        }

    def get_active_auto_saves(self) -> List[Dict[str, any]]:
        """Get list of all assessments with auto-save enabled."""
        active_saves = []
        for assessment_id, interval in self._auto_save_intervals.items():
            last_save = self._last_save_times.get(assessment_id)
            active_saves.append({
                "assessment_id": str(assessment_id),
                "interval_seconds": interval,
                "last_save": last_save.isoformat() if last_save else None,
            })
        
        return active_saves