"""Assessment service v3 with comprehensive compliance scoring."""

import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from app.models.assessment import Assessment, AssessmentAnswer, AssessmentProgress, AssessmentAuditLog
from app.models.organization import User
from app.models.reference import Control, Submeasure, Measure, ControlSubmeasureMapping, ControlRequirement
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment import AssessmentRepository, AssessmentProgressRepository, AssessmentAuditRepository
from app.services.compliance_scoring import ComplianceScoringService
# Removed ScoringEngine import - all scoring now handled by ComplianceScoringService
from app.schemas.assessment import CreateAssessmentRequest, UpdateAssessmentRequest, AssessmentResponse, AssessmentProgressResponse
from app.schemas.assessment import (
    UpdateAnswerRequestV2,
    BatchUpdateAnswersRequestV2,
    ControlInQuestionnaireResponseV2,
    SubmeasureInQuestionnaireResponseV2,
    MeasureInQuestionnaireResponseV2,
    QuestionnaireResponseV2,
)
from app.core.exceptions import ValidationError
import logging

logger = logging.getLogger(__name__)


class AssessmentService:
    """
    Assessment service with full compliance scoring integration and lifecycle management.
    
    Features:
    - Complete assessment CRUD operations
    - Automatic status transitions (draft → in_progress → completed)
    - Real-time progress calculation and updates
    - Control answer management with submeasure context
    - Real-time compliance calculation
    - Threshold-based scoring
    - Dual-condition submeasure compliance
    - Comprehensive audit logging
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.answer_repository = AssessmentAnswerRepository(db)
        self.assessment_repository = AssessmentRepository(db)
        self.progress_repository = AssessmentProgressRepository(db)
        self.audit_repository = AssessmentAuditRepository(db)
        self.compliance_scoring = ComplianceScoringService(db)  # Unified compliance scoring service
    
    # ============================================================================
    # ASSESSMENT LIFECYCLE MANAGEMENT (NEW)
    # ============================================================================
    
    async def create_assessment(
        self,
        request: CreateAssessmentRequest,
        created_by: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Assessment:
        """
        Create a new assessment with proper initialization.
        
        Steps:
        1. Validate organization access
        2. Create assessment record
        3. Initialize progress tracking
        4. Create audit log entry
        5. Return created assessment
        """
        
        logger.info(f"[V3_SERVICE] Creating assessment '{request.title}' for organization {request.organization_id}")
        
        # Get active questionnaire version
        from app.models.reference import QuestionnaireVersion
        from sqlalchemy import select
        
        version_query = select(QuestionnaireVersion.id).where(QuestionnaireVersion.is_active == True)
        version_result = await self.db.execute(version_query)
        active_version_id = version_result.scalar_one()
        
        logger.info(f"[V3_SERVICE] Using active questionnaire version: {active_version_id}")
        
        # Create assessment
        assessment_data = {
            "title": request.title,
            "description": request.description,
            "organization_id": request.organization_id,
            "security_level": request.security_level,
            "status": "draft",
            "created_by": created_by,
            "assigned_to": request.assigned_to or [],
            "due_date": request.due_date,
            "version_id": active_version_id,  # Always set version_id
            # Explicitly set default values for NOT NULL fields
            "total_controls": 0,
            "answered_controls": 0,
            "mandatory_controls": 0,
            "mandatory_answered": 0,
        }
        
        assessment = await self.assessment_repository.create(**assessment_data)
        
        # Initialize progress tracking
        await self._initialize_progress_tracking(assessment.id)
        
        # Calculate actual progress stats to get correct mandatory controls count
        try:
            await self.calculate_and_update_progress(assessment.id)
        except Exception as e:
            logger.warning(f"[V3_SERVICE] Failed to calculate initial progress: {str(e)}")
        
        # Create audit log
        await self.audit_repository.create(
            assessment_id=assessment.id,
            user_id=user_id,
            action="created",
            entity_type="assessment",
            entity_id=assessment.id,
            new_values={
                "title": assessment.title,
                "status": assessment.status,
                "security_level": assessment.security_level,
            },
            change_summary=f"Assessment '{assessment.title}' created",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Commit the transaction
        await self.db.commit()
        
        logger.info(f"[V3_SERVICE] Assessment {assessment.id} created successfully")
        
        return assessment
    
    async def get_assessment(self, assessment_id: uuid.UUID) -> Assessment:
        """Get assessment by ID with validation."""
        assessment = await self.assessment_repository.get_with_relationships(assessment_id)
        
        if not assessment:
            raise ValidationError(f"Assessment {assessment_id} not found")
        
        return assessment
    
    async def update_assessment(
        self,
        assessment_id: uuid.UUID,
        request: UpdateAssessmentRequest,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Assessment:
        """
        Update assessment details.
        
        Steps:
        1. Get current assessment
        2. Track changes for audit
        3. Update assessment
        4. Create audit log entry
        5. Return updated assessment
        """
        
        logger.info(f"[V3_SERVICE] Updating assessment {assessment_id}")
        
        # Get current assessment
        current_assessment = await self.get_assessment(assessment_id)
        
        # Build update data
        update_data = {}
        old_values = {}
        new_values = {}
        
        if request.title is not None:
            old_values["title"] = current_assessment.title
            new_values["title"] = request.title
            update_data["title"] = request.title
        
        if request.description is not None:
            old_values["description"] = current_assessment.description
            new_values["description"] = request.description
            update_data["description"] = request.description
        
        if request.due_date is not None:
            old_values["due_date"] = current_assessment.due_date
            new_values["due_date"] = request.due_date
            update_data["due_date"] = request.due_date
        
        if request.assigned_to is not None:
            old_values["assigned_to"] = current_assessment.assigned_to
            new_values["assigned_to"] = request.assigned_to
            update_data["assigned_to"] = request.assigned_to
        
        # Update assessment
        updated_assessment = await self.assessment_repository.update(assessment_id, **update_data)
        
        # Create audit log if there were changes
        if old_values:
            await self.audit_repository.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="updated",
                entity_type="assessment",
                entity_id=assessment_id,
                old_values=old_values,
                new_values=new_values,
                change_summary=f"Assessment details updated",
                ip_address=ip_address,
                user_agent=user_agent,
            )
        
        logger.info(f"[V3_SERVICE] Assessment {assessment_id} updated successfully")
        
        return updated_assessment
    
    async def update_status(
        self,
        assessment_id: uuid.UUID,
        new_status: str,
        user_id: Optional[uuid.UUID] = None,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        force: bool = False,
    ) -> Assessment:
        """
        Update assessment status with validation and auto-transitions.
        
        Valid transitions:
        - draft → in_progress (when first answer submitted)
        - in_progress → review (manual)
        - review → completed (when validation passes)
        - any → abandoned (manual with force)
        """
        
        logger.info(f"[V3_SERVICE] Updating assessment {assessment_id} status to {new_status}")
        
        # Get current assessment
        current_assessment = await self.get_assessment(assessment_id)
        old_status = current_assessment.status
        
        # Validate status transition
        if not force:
            await self._validate_status_transition(current_assessment, new_status)
        
        # Update timestamps based on status
        update_data = {"status": new_status}
        
        if new_status == "in_progress" and old_status == "draft":
            update_data["started_at"] = datetime.now(timezone.utc)
        elif new_status == "completed" and old_status != "completed":
            update_data["completed_at"] = datetime.now(timezone.utc)
        
        # Update assessment
        updated_assessment = await self.assessment_repository.update(assessment_id, **update_data)
        
        # Create audit log
        change_summary = f"Status changed from {old_status} to {new_status}"
        if reason:
            change_summary += f": {reason}"
            
        await self.audit_repository.create(
            assessment_id=assessment_id,
            user_id=user_id,
            action="status_changed",
            entity_type="assessment",
            entity_id=assessment_id,
            old_values={"status": old_status},
            new_values={"status": new_status},
            change_summary=change_summary,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        logger.info(f"[V3_SERVICE] Assessment {assessment_id} status updated: {old_status} → {new_status}")
        
        return updated_assessment
    
    async def delete_assessment(
        self,
        assessment_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """
        Soft delete assessment (mark as archived).
        """
        
        logger.info(f"[V3_SERVICE] Deleting assessment {assessment_id}")
        
        # Get current assessment
        current_assessment = await self.get_assessment(assessment_id)
        
        # Soft delete by setting status to archived
        result = await self.assessment_repository.soft_delete(assessment_id, user_id)
        
        if result:
            # Create audit log
            await self.audit_repository.create(
                assessment_id=assessment_id,
                user_id=user_id,
                action="deleted",
                entity_type="assessment",
                entity_id=assessment_id,
                old_values={"status": current_assessment.status},
                new_values={"status": "archived"},
                change_summary=f"Assessment '{current_assessment.title}' archived",
                ip_address=ip_address,
                user_agent=user_agent,
            )
            
            logger.info(f"[V3_SERVICE] Assessment {assessment_id} deleted successfully")
        
        return result
    
    async def calculate_and_update_progress(self, assessment_id: uuid.UUID) -> Dict[str, Any]:
        """
        Calculate and update assessment progress with detailed metrics.
        
        Returns:
        - Overall progress percentage
        - Progress by measure
        - Control answer statistics
        - Mandatory control completion
        """
        
        logger.info(f"[V3_SERVICE] Calculating progress for assessment {assessment_id}")
        
        # Get assessment
        assessment = await self.get_assessment(assessment_id)
        
        # Get completion stats from answer repository
        completion_stats = await self.answer_repository.get_completion_stats(assessment_id)
        
        logger.debug(f"[V3_SERVICE] Completion stats for {assessment_id}: {completion_stats}")
        
        # Calculate overall progress with defensive checks
        overall_progress = 0.0
        if completion_stats["total_controls"] > 0:
            overall_progress = (completion_stats["answered_controls"] / completion_stats["total_controls"]) * 100
            # Defensive: Cap at 100% to prevent constraint violations
            if overall_progress > 100.0:
                logger.warning(f"[V3_SERVICE] Overall progress exceeded 100%: {overall_progress:.1f}% "
                             f"({completion_stats['answered_controls']}/{completion_stats['total_controls']}). Capping at 100%.")
                overall_progress = 100.0
            logger.debug(f"[V3_SERVICE] Overall progress: {completion_stats['answered_controls']}/{completion_stats['total_controls']} = {overall_progress:.1f}%")
        
        # Calculate mandatory progress with defensive checks
        mandatory_progress = 0.0
        if completion_stats["mandatory_controls"] > 0:
            mandatory_progress = (completion_stats["mandatory_answered"] / completion_stats["mandatory_controls"]) * 100
            # Defensive: Cap at 100% to prevent constraint violations
            if mandatory_progress > 100.0:
                logger.warning(f"[V3_SERVICE] Mandatory progress exceeded 100%: {mandatory_progress:.1f}% "
                             f"({completion_stats['mandatory_answered']}/{completion_stats['mandatory_controls']}). Capping at 100%.")
                mandatory_progress = 100.0
            logger.debug(f"[V3_SERVICE] Mandatory progress: {completion_stats['mandatory_answered']}/{completion_stats['mandatory_controls']} = {mandatory_progress:.1f}%")
        
        # Calculate compliance status if all mandatory controls are answered
        compliance_status = None
        if completion_stats["mandatory_answered"] == completion_stats["mandatory_controls"] and completion_stats["mandatory_controls"] > 0:
            # Calculate compliance to determine status
            try:
                overall_compliance = await self.compliance_scoring.calculate_overall_compliance(assessment_id)
                compliance_status = "compliant" if overall_compliance.passes_compliance else "non_compliant"
                compliance_percentage_value = float(overall_compliance.compliance_percentage)
            except Exception as e:
                logger.warning(f"[V3_SERVICE] Failed to calculate compliance status: {str(e)}")
                compliance_percentage_value = overall_progress
        else:
            compliance_percentage_value = overall_progress
        
        # Update assessment cached fields
        update_data = {
            "total_controls": completion_stats["total_controls"],
            "answered_controls": completion_stats["answered_controls"],
            "mandatory_controls": completion_stats["mandatory_controls"],
            "mandatory_answered": completion_stats["mandatory_answered"],
            "compliance_percentage": compliance_percentage_value,
        }
        
        if compliance_status is not None:
            update_data["compliance_status"] = compliance_status
            
        await self.assessment_repository.update(
            assessment_id,
            **update_data
        )
        
        # Store overall progress record (upsert - update existing or create new)
        # First cleanup any duplicate progress records
        duplicates_removed = await self.progress_repository.cleanup_duplicate_overall_progress(assessment_id)
        if duplicates_removed > 0:
            logger.warning(f"[V3_SERVICE] Cleaned up {duplicates_removed} duplicate progress records for assessment {assessment_id}")
        
        existing_progress = await self.progress_repository.get_overall_progress(assessment_id)
        
        if existing_progress:
            # Update existing progress record
            await self.progress_repository.update(
                existing_progress.id,
                controls_total=completion_stats["total_controls"],
                controls_answered=completion_stats["answered_controls"],
                controls_mandatory=completion_stats["mandatory_controls"],
                controls_mandatory_answered=completion_stats["mandatory_answered"],
                completion_percentage=overall_progress,
                mandatory_completion_percentage=mandatory_progress,
                last_updated=datetime.now(timezone.utc),
            )
        else:
            # Create new progress record
            await self.progress_repository.create(
                assessment_id=assessment_id,
                measure_id=None,  # Overall progress
                controls_total=completion_stats["total_controls"],
                controls_answered=completion_stats["answered_controls"],
                controls_mandatory=completion_stats["mandatory_controls"],
                controls_mandatory_answered=completion_stats["mandatory_answered"],
                completion_percentage=overall_progress,
                mandatory_completion_percentage=mandatory_progress,
            )
        
        logger.info(f"[V3_SERVICE] Progress calculated for assessment {assessment_id}: {overall_progress:.1f}%")
        
        return {
            "assessment_id": str(assessment_id),
            "completion_percentage": overall_progress,
            "mandatory_completion_percentage": mandatory_progress,
            "total_controls": completion_stats["total_controls"],
            "answered_controls": completion_stats["answered_controls"],
            "mandatory_controls": completion_stats["mandatory_controls"],
            "mandatory_answered": completion_stats["mandatory_answered"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def get_assessment_overview(self, assessment_id: uuid.UUID) -> Dict[str, Any]:
        """
        Get comprehensive assessment overview including progress, compliance, and status.
        """
        
        logger.info(f"[V3_SERVICE] Getting overview for assessment {assessment_id}")
        
        # Get assessment with relationships
        assessment = await self.get_assessment(assessment_id)
        
        # Calculate current progress
        progress = await self.calculate_and_update_progress(assessment_id)
        
        # Get compliance status
        compliance = await self.get_assessment_compliance(assessment_id)
        
        # Check auto-transition eligibility
        can_auto_transition = await self._check_auto_transition_eligibility(assessment)
        
        return {
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "description": assessment.description,
                "organization_id": str(assessment.organization_id),  # Add missing field
                "status": assessment.status,
                "security_level": assessment.security_level,
                "created_at": assessment.created_at.isoformat(),
                "updated_at": assessment.updated_at.isoformat(),
                "started_at": assessment.started_at.isoformat() if assessment.started_at else None,
                "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else None,
                "due_date": assessment.due_date.isoformat() if assessment.due_date else None,
                "assigned_to": assessment.assigned_to,
                "created_by": assessment.created_by,  # Add for completeness
                "version_id": str(assessment.version_id) if assessment.version_id else None,  # Add version_id
                # Add progress fields for frontend compatibility
                "total_controls": progress["total_controls"],
                "answered_controls": progress["answered_controls"],
                "mandatory_controls": progress["mandatory_controls"],
                "mandatory_answered": progress["mandatory_answered"],
                "completion_percentage": progress["completion_percentage"],
                "mandatory_completion_percentage": progress["mandatory_completion_percentage"],
            },
            "progress": progress,
            "compliance": compliance,
            "status_transitions": {
                "current_status": assessment.status,
                "can_auto_transition": can_auto_transition,
                "next_eligible_status": self._get_next_eligible_status(assessment.status, can_auto_transition),
                "valid_manual_transitions": self._get_valid_manual_transitions(assessment.status),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    
    # ============================================================================
    # AUTO-TRANSITION LOGIC (NEW)
    # ============================================================================
    
    async def check_and_auto_transition(
        self,
        assessment_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[Assessment]:
        """
        Check if assessment should auto-transition and perform transition if needed.
        
        Auto-transition rules:
        - draft → in_progress: When first answer is submitted
        - in_progress → completed: When all mandatory controls answered and compliance passes
        """
        
        logger.info(f"[V3_SERVICE] Checking auto-transition for assessment {assessment_id}")
        
        # Get current assessment
        assessment = await self.get_assessment(assessment_id)
        
        # Check transition eligibility
        can_transition = await self._check_auto_transition_eligibility(assessment)
        
        if not can_transition:
            logger.debug(f"[V3_SERVICE] No auto-transition needed for assessment {assessment_id}")
            return None
        
        # Determine next status
        next_status = None
        
        if assessment.status == "draft":
            # Check if any answers exist
            completion_stats = await self.answer_repository.get_completion_stats(assessment_id)
            if completion_stats["answered_controls"] > 0:
                next_status = "in_progress"
        
        elif assessment.status == "in_progress":
            # Check if ready for completion
            progress = await self.calculate_and_update_progress(assessment_id)
            compliance = await self.get_assessment_compliance(assessment_id)
            
            # Auto-complete if mandatory controls answered and compliance passes
            if (progress["mandatory_completion_percentage"] >= 100.0 and 
                compliance["overall"]["passes_compliance"]):
                next_status = "completed"
        
        # Perform auto-transition if needed
        if next_status:
            logger.info(f"[V3_SERVICE] Auto-transitioning assessment {assessment_id}: {assessment.status} → {next_status}")
            
            updated_assessment = await self.update_status(
                assessment_id=assessment_id,
                new_status=next_status,
                user_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            
            return updated_assessment
        
        return None
    
    # ============================================================================
    # ENHANCED ANSWER MANAGEMENT (MODIFIED TO INCLUDE AUTO-TRANSITIONS)
    # ============================================================================
        
    async def update_answer(
        self,
        assessment_id: uuid.UUID,
        control_id: uuid.UUID,
        submeasure_id: uuid.UUID,
        documentation_score: Optional[int] = None,
        implementation_score: Optional[int] = None,
        comments: Optional[str] = None,
        evidence_files: Optional[List[str]] = None,
        confidence_level: Optional[int] = None,
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update assessment answer with comprehensive compliance recalculation and auto-transition logic.
        
        Steps:
        1. Validate assessment access
        2. Create/update answer
        3. Calculate control score with threshold check
        4. Calculate submeasure compliance (dual conditions)
        5. Calculate measure and overall compliance
        6. Update progress tracking
        7. Check for auto-transitions
        8. Return detailed compliance status
        """
        
        logger.info(f"[V3_SERVICE] Updating answer for assessment {assessment_id}, control {control_id}, submeasure {submeasure_id}")
        
        # Validate assessment exists and user has access
        assessment = await self._get_assessment(assessment_id)
        
        # Create or update answer
        answer = await self.answer_repository.create_or_update(
            assessment_id=assessment_id,
            control_id=control_id,
            submeasure_id=submeasure_id,
            documentation_score=documentation_score,
            implementation_score=implementation_score,
            comments=comments,
            evidence_files=evidence_files or [],
            confidence_level=confidence_level,
            answered_by=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Serialize answer immediately while session is active
        answer_data = {
            "id": answer.id,
            "assessment_id": answer.assessment_id,
            "control_id": answer.control_id,
            "submeasure_id": answer.submeasure_id,
            "documentation_score": answer.documentation_score,
            "implementation_score": answer.implementation_score,
            "average_score": answer.average_score,
            "comments": answer.comments,
            "evidence_files": answer.evidence_files,
            "confidence_level": answer.confidence_level,
            "answered_by": answer.answered_by,
            "answered_at": answer.answered_at,
            "is_final": answer.is_final,
            "created_at": answer.created_at,
            "updated_at": answer.updated_at,
        }
        
        logger.debug(f"[V3_SERVICE] Answer updated: avg_score={answer.average_score}")
        
        # Calculate control score with threshold check
        control_score = await self.compliance_scoring.calculate_control_score(
            assessment_id=assessment_id,
            control_id=control_id,
            submeasure_id=submeasure_id,
            security_level=assessment.security_level,
        )
        
        logger.debug(f"[V3_SERVICE] Control score calculated: {control_score.overall_score}, passes={control_score.passes_threshold}")
        
        # Calculate submeasure compliance (dual conditions)
        submeasure_compliance = await self.compliance_scoring.calculate_submeasure_compliance(
            assessment_id=assessment_id,
            submeasure_id=submeasure_id,
            security_level=assessment.security_level,
        )
        
        logger.debug(f"[V3_SERVICE] Submeasure compliance: passes_overall={submeasure_compliance.passes_overall}")
        
        # Calculate overall compliance
        overall_compliance = await self.compliance_scoring.calculate_overall_compliance(
            assessment_id=assessment_id,
        )
        
        logger.debug(f"[V3_SERVICE] Overall compliance: {overall_compliance.compliance_percentage}%")
        
        # Store compliance results
        await self.compliance_scoring.store_compliance_results(overall_compliance)
        
        # Update progress tracking
        progress = await self.calculate_and_update_progress(assessment_id)
        
        # Check for auto-transitions
        auto_transitioned = await self.check_and_auto_transition(
            assessment_id=assessment_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Build response message
        message = self._build_update_message(control_score, submeasure_compliance, overall_compliance)
        
        if auto_transitioned:
            message += f" | Status auto-transitioned to {auto_transitioned.status}"
        
        logger.info(f"[V3_SERVICE] Answer update complete for assessment {assessment_id}")
        
        return {
            "answer": answer_data,
            "control_score": control_score,
            "submeasure_compliance": submeasure_compliance,
            "overall_compliance": {
                "overall_score": float(overall_compliance.overall_score) if overall_compliance.overall_score else None,
                "passes_compliance": overall_compliance.passes_compliance,
                "compliance_percentage": float(overall_compliance.compliance_percentage),
                "maturity_score": float(overall_compliance.maturity_score) if overall_compliance.maturity_score else None,
                "total_measures": overall_compliance.total_measures,
                "passed_measures": overall_compliance.passed_measures,
            },
            "progress": progress,
            "status_transition": {
                "auto_transitioned": auto_transitioned is not None,
                "new_status": auto_transitioned.status if auto_transitioned else assessment.status,
                "old_status": assessment.status,
            },
            "message": message,
        }
    
    # ============================================================================
    # HELPER METHODS (NEW)
    # ============================================================================
    
    async def _initialize_progress_tracking(self, assessment_id: uuid.UUID) -> None:
        """Initialize progress tracking for a new assessment."""
        
        logger.debug(f"[V3_SERVICE] Initializing progress tracking for assessment {assessment_id}")
        
        # Create initial overall progress record
        await self.progress_repository.create(
            assessment_id=assessment_id,
            measure_id=None,  # Overall progress
            controls_total=0,
            controls_answered=0,
            controls_mandatory=0,
            controls_mandatory_answered=0,
            completion_percentage=0.0,
            mandatory_completion_percentage=0.0,
        )
    
    async def _validate_status_transition(self, assessment: Assessment, new_status: str) -> None:
        """Validate that a status transition is allowed."""
        
        current_status = assessment.status
        
        # Define allowed transitions
        allowed_transitions = {
            "draft": ["in_progress", "abandoned"],
            "in_progress": ["review", "completed", "abandoned"],
            "review": ["in_progress", "completed", "abandoned"],
            "completed": ["archived"],
            "abandoned": ["draft", "archived"],
            "archived": [],  # No transitions from archived
        }
        
        if new_status not in allowed_transitions.get(current_status, []):
            raise ValidationError(
                f"Invalid status transition: {current_status} → {new_status}. "
                f"Allowed transitions from {current_status}: {allowed_transitions.get(current_status, [])}"
            )
    
    async def _check_auto_transition_eligibility(self, assessment: Assessment) -> bool:
        """Check if assessment is eligible for auto-transition."""
        
        # Only allow auto-transitions for draft and in_progress status
        return assessment.status in ["draft", "in_progress"]
    
    def _get_next_eligible_status(self, current_status: str, can_auto_transition: bool) -> Optional[str]:
        """Get the next status the assessment can auto-transition to."""
        
        if not can_auto_transition:
            return None
        
        if current_status == "draft":
            return "in_progress"
        elif current_status == "in_progress":
            return "completed"
        
        return None
    
    def _get_valid_manual_transitions(self, current_status: str) -> List[str]:
        """Get list of valid manual status transitions."""
        
        manual_transitions = {
            "draft": ["abandoned"],
            "in_progress": ["review", "abandoned"],
            "review": ["in_progress", "completed", "abandoned"],
            "completed": ["archived"],
            "abandoned": ["draft", "archived"],
            "archived": [],
        }
        
        return manual_transitions.get(current_status, [])
    
    # ============================================================================
    # EXISTING METHODS (UNCHANGED)
    # ============================================================================
    
    async def get_assessment_compliance(
        self,
        assessment_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Get detailed compliance status for an assessment."""
        
        logger.info(f"[V3_SERVICE] Getting compliance status for assessment {assessment_id}")
        
        # Get assessment
        assessment = await self._get_assessment(assessment_id)
        
        # Calculate overall compliance
        overall_compliance = await self.compliance_scoring.calculate_overall_compliance(
            assessment_id=assessment_id,
        )
        
        # Get detailed measure compliance
        measure_compliance = []
        for measure in overall_compliance.measures:
            # Calculate measure compliance percentage based on passed submeasures
            measure_compliance_percentage = 0.0
            if measure.total_submeasures > 0:
                measure_compliance_percentage = (measure.passed_submeasures / measure.total_submeasures) * 100
            
            measure_data = {
                "measure_id": str(measure.measure_id),
                "measure_code": measure.measure_code,
                "overall_score": float(measure.overall_score) if measure.overall_score else None,
                "documentation_avg": float(measure.documentation_avg) if measure.documentation_avg else None,
                "implementation_avg": float(measure.implementation_avg) if measure.implementation_avg else None,
                "passes_compliance": measure.passes_compliance,
                "compliance_percentage": measure_compliance_percentage,
                "critical_failures": measure.critical_failures,
                "submeasures": [],
            }
            
            for submeasure in measure.submeasures:
                # Only include submeasures that have applicable controls for this security level
                if submeasure.total_controls > 0:
                    submeasure_data = {
                        "submeasure_id": str(submeasure.submeasure_id),
                        "submeasure_code": submeasure.submeasure_code,
                        "overall_score": float(submeasure.overall_score) if submeasure.overall_score else None,
                        "documentation_avg": float(submeasure.documentation_avg) if submeasure.documentation_avg else None,
                        "implementation_avg": float(submeasure.implementation_avg) if submeasure.implementation_avg else None,
                        "passes_individual_threshold": submeasure.passes_individual_threshold,
                        "passes_average_threshold": submeasure.passes_average_threshold,
                        "passes_overall": submeasure.passes_overall,
                        "failed_controls": submeasure.failed_controls,
                        "total_controls": submeasure.total_controls,
                        "answered_controls": submeasure.answered_controls,
                        "mandatory_controls": submeasure.mandatory_controls,
                        "mandatory_answered": submeasure.mandatory_answered,
                        "control_count": submeasure.total_controls,  # Use actual total controls
                    }
                    measure_data["submeasures"].append(submeasure_data)
            
            measure_compliance.append(measure_data)
        
        logger.info(f"[V3_SERVICE] Compliance data retrieved for assessment {assessment_id}")
        
        return {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            "overall": {
                "overall_score": float(overall_compliance.overall_score) if overall_compliance.overall_score else None,
                "passes_compliance": overall_compliance.passes_compliance,
                "compliance_percentage": float(overall_compliance.compliance_percentage),
                "maturity_score": float(overall_compliance.maturity_score) if overall_compliance.maturity_score else None,
                "total_measures": overall_compliance.total_measures,
                "passed_measures": overall_compliance.passed_measures,
            },
            "measures": measure_compliance,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def validate_assessment_submission(
        self,
        assessment_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Validate assessment readiness for submission."""
        
        logger.info(f"[V3_SERVICE] Validating assessment {assessment_id} for submission")
        
        # Get assessment
        assessment = await self._get_assessment(assessment_id)
        
        # Get completion stats
        completion_stats = await self.answer_repository.get_completion_stats(assessment_id)
        
        # Calculate overall compliance
        overall_compliance = await self.compliance_scoring.calculate_overall_compliance(
            assessment_id=assessment_id,
        )
        
        # Validation checks
        errors = []
        warnings = []
        
        # Check if all mandatory controls are answered
        if completion_stats["mandatory_controls"] > 0 and completion_stats["mandatory_answered"] < completion_stats["mandatory_controls"]:
            unanswered_count = completion_stats["mandatory_controls"] - completion_stats["mandatory_answered"]
            errors.append({
                "type": "incomplete_mandatory",
                "message": f"{unanswered_count} mandatory controls are not answered",
                "mandatory_total": completion_stats["mandatory_controls"],
                "mandatory_answered": completion_stats["mandatory_answered"],
            })
        
        # Check overall completion - require at least 90% of all controls to be answered
        completion_percentage = (completion_stats["answered_controls"] / completion_stats["total_controls"] * 100) if completion_stats["total_controls"] > 0 else 0
        if completion_percentage < 90:
            errors.append({
                "type": "incomplete_assessment", 
                "message": f"Assessment is only {completion_percentage:.1f}% complete. At least 90% of controls must be answered.",
                "total_controls": completion_stats["total_controls"],
                "answered_controls": completion_stats["answered_controls"],
            })
        
        # Add warnings for controls below threshold
        controls_below_threshold = []
        for measure in overall_compliance.measures:
            for submeasure in measure.submeasures:
                # Check for failed controls that need comments
                for failed_control in submeasure.failed_controls:
                    controls_below_threshold.append({
                        "control_code": failed_control,
                        "submeasure_code": submeasure.submeasure_code,
                    })
        
        if controls_below_threshold:
            warnings.append({
                "type": "controls_below_threshold",
                "message": f"{len(controls_below_threshold)} controls are below compliance threshold",
                "controls": controls_below_threshold,
            })
        
        # Compliance status is now a warning, not an error
        if not overall_compliance.passes_compliance:
            warnings.append({
                "type": "non_compliant",
                "message": f"Assessment does not meet compliance requirements ({overall_compliance.compliance_percentage:.2f}%)",
                "compliance_percentage": float(overall_compliance.compliance_percentage),
                "passed_measures": overall_compliance.passed_measures,
                "total_measures": overall_compliance.total_measures,
            })
        
        # Can submit if no errors (warnings are OK)
        can_submit = len(errors) == 0
        is_valid = can_submit  # For backward compatibility
        
        logger.info(f"[V3_SERVICE] Assessment {assessment_id} validation complete: can_submit={can_submit}, errors={len(errors)}, warnings={len(warnings)}")
        
        return {
            "assessment_id": str(assessment_id),
            "is_valid": is_valid,
            "can_submit": can_submit,
            "errors": errors,
            "warnings": warnings,
            "completion_stats": {
                "total_controls": completion_stats["total_controls"],
                "answered_controls": completion_stats["answered_controls"],
                "completion_percentage": completion_percentage,
                "mandatory_controls": completion_stats["mandatory_controls"],
                "mandatory_answered": completion_stats["mandatory_answered"],
            },
            "compliance_summary": {
                "overall_score": float(overall_compliance.overall_score) if overall_compliance.overall_score else None,
                "passes_compliance": overall_compliance.passes_compliance,
                "compliance_percentage": float(overall_compliance.compliance_percentage),
                "total_measures": overall_compliance.total_measures,
                "passed_measures": overall_compliance.passed_measures,
                "compliance_status": "compliant" if overall_compliance.passes_compliance else "non_compliant",
            },
            "validated_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def _get_assessment(self, assessment_id: uuid.UUID) -> Assessment:
        """Get assessment by ID with validation."""
        query = select(Assessment).where(Assessment.id == assessment_id)
        result = await self.db.execute(query)
        assessment = result.scalar_one_or_none()
        
        if not assessment:
            raise ValidationError(f"Assessment {assessment_id} not found")
        
        return assessment
    
    def _build_update_message(
        self,
        control_score,
        submeasure_compliance,
        overall_compliance,
    ) -> str:
        """Build descriptive message for answer update."""
        
        parts = []
        
        # Control score message
        if control_score.passes_threshold:
            parts.append(f"Control {control_score.control_code} meets threshold")
        else:
            parts.append(f"Control {control_score.control_code} below threshold ({control_score.overall_score:.1f} < {control_score.minimum_required:.1f})")
        
        # Submeasure compliance message
        if submeasure_compliance.passes_overall:
            parts.append(f"Submeasure {submeasure_compliance.submeasure_code} compliant")
        else:
            failed_count = len(submeasure_compliance.failed_controls)
            parts.append(f"Submeasure {submeasure_compliance.submeasure_code} non-compliant ({failed_count} failed controls)")
        
        # Overall compliance message
        parts.append(f"Overall compliance: {overall_compliance.compliance_percentage:.1f}%")
        
        return " | ".join(parts)
    
    async def get_assessment_report_data(self, assessment_id: uuid.UUID) -> Dict[str, Any]:
        """
        Get comprehensive assessment data for PDF report generation.
        
        Returns all data needed for a complete assessment report including:
        - Assessment metadata
        - Progress statistics 
        - Compliance scores by measure/submeasure
        - Control-level details
        - Recommendations (if available)
        """
        logger.info(f"[V3_SERVICE] Getting report data for assessment {assessment_id}")
        
        # Get assessment with organization info
        assessment = await self._get_assessment(assessment_id)
        
        # Get organization name via relationship
        try:
            org_name = assessment.organization.name if assessment.organization else str(assessment.organization_id)
        except Exception:
            org_name = str(assessment.organization_id)
        
        # Get compliance data
        compliance_data = await self.get_assessment_compliance(assessment_id)
        
        # Get progress data
        progress_data = await self.calculate_and_update_progress(assessment_id)
        
        # Get detailed measure data with controls
        measures_detail = []
        
        # Query all answers for the assessment
        answers_query = (
            select(AssessmentAnswer)
            .where(AssessmentAnswer.assessment_id == assessment_id)
            .options(
                selectinload(AssessmentAnswer.control),
                selectinload(AssessmentAnswer.submeasure).selectinload(Submeasure.measure)
            )
        )
        answers_result = await self.db.execute(answers_query)
        answers = answers_result.scalars().all()
        
        # Group answers by measure and submeasure
        measure_map = {}
        for answer in answers:
            if answer.submeasure and answer.submeasure.measure:
                measure_id = str(answer.submeasure.measure.id)
                submeasure_id = str(answer.submeasure.id)
                
                if measure_id not in measure_map:
                    measure_map[measure_id] = {
                        "measure_id": measure_id,
                        "measure_code": answer.submeasure.measure.code,
                        "measure_name": answer.submeasure.measure.name_hr,
                        "submeasures": {}
                    }
                
                if submeasure_id not in measure_map[measure_id]["submeasures"]:
                    measure_map[measure_id]["submeasures"][submeasure_id] = {
                        "submeasure_id": submeasure_id,
                        "submeasure_code": answer.submeasure.code,
                        "submeasure_name": answer.submeasure.name_hr,
                        "controls": []
                    }
                
                # Derive mandatory/minimum via ControlRequirement helpers
                is_mandatory = await self._is_control_mandatory(
                    answer.control.id,
                    answer.submeasure.id,
                    assessment.security_level.lower(),
                )
                minimum_score = await self._get_minimum_score(
                    answer.control.id,
                    answer.submeasure.id,
                    assessment.security_level.lower(),
                )

                control_data = {
                    "control_id": str(answer.control.id),
                    "control_code": answer.control.code,
                    "control_name": answer.control.name_hr,
                    "documentation_score": answer.documentation_score,
                    "implementation_score": answer.implementation_score,
                    "average_score": answer.average_score,
                    "is_mandatory": is_mandatory,
                    "minimum_score": minimum_score,
                }
                measure_map[measure_id]["submeasures"][submeasure_id]["controls"].append(control_data)
        
        # Convert to list format
        for measure_id, measure_data in measure_map.items():
            # Flatten controls from submeasures for template compatibility
            all_controls = []
            for submeasure in measure_data["submeasures"].values():
                all_controls.extend(submeasure["controls"])
            
            # Sort controls by score (worst first) for better reporting
            all_controls.sort(key=lambda c: c["average_score"] if c["average_score"] is not None else 5.0)
            
            measure_detail = {
                "measure_id": measure_data["measure_id"],
                "measure_code": measure_data["measure_code"],
                "measure_name": measure_data["measure_name"],
                "submeasures": list(measure_data["submeasures"].values()),
                "controls": all_controls  # Add flattened controls for template
            }
            
            # Find corresponding compliance data
            for compliance_measure in compliance_data["measures"]:
                if compliance_measure["measure_id"] == measure_id:
                    measure_detail.update({
                        "overall_score": compliance_measure["overall_score"],
                        "documentation_score": compliance_measure.get("documentation_avg", 0),
                        "implementation_score": compliance_measure.get("implementation_avg", 0),
                        "total_score": compliance_measure["overall_score"],  # For template compatibility
                        "passes_compliance": compliance_measure["passes_compliance"],
                        "compliance_percentage": compliance_measure["compliance_percentage"],
                        "name": measure_data["measure_name"],  # Add name for template
                        "code": measure_data["measure_code"],  # Add code for template
                    })
                    break
            
            measures_detail.append(measure_detail)
        
        # Sort measures by code (numeric order)
        measures_detail.sort(key=lambda m: int(m["measure_code"].split('.')[0]) if m["measure_code"] else 999)
        
        # Build report data
        report_data = {
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "description": assessment.description,
                "organization_id": str(assessment.organization_id),
                "organization_name": org_name,
                "security_level": assessment.security_level,
                "status": assessment.status,
                "created_at": assessment.created_at.isoformat(),
                "updated_at": assessment.updated_at.isoformat(),
                "due_date": assessment.due_date.isoformat() if assessment.due_date else None,
            },
            "progress": progress_data,
            "compliance": {
                "overall": compliance_data["overall"],
                "measures": measures_detail,
                "calculated_at": compliance_data["calculated_at"],
            },
            "recommendations": [],  # TODO: Add AI recommendations when available
        }
        
        logger.info(f"[V3_SERVICE] Report data compiled for assessment {assessment_id}")
        
        return report_data
    
    # ============================================================================
    # METHODS PORTED FROM V2 FOR QUESTIONNAIRE AND BATCH UPDATES
    # ============================================================================
    
    async def get_questionnaire(
        self, assessment_id: uuid.UUID
    ) -> QuestionnaireResponseV2:
        """Get questionnaire structure with submeasure context and existing answers."""
        
        # Get assessment details
        assessment = await self.get_assessment(assessment_id)
        if not assessment:
            raise ValidationError(f"Assessment {assessment_id} not found")
        
        # Get all answers for this assessment
        existing_answers = await self.answer_repository.get_all_for_assessment(assessment_id)
        answers_map = {
            f"{answer.control_id}:{answer.submeasure_id}": answer
            for answer in existing_answers
        }
        
        # Get measures for this security level
        measures_query = (
            select(Measure)
            .options(
                selectinload(Measure.submeasures).selectinload(
                    Submeasure.control_mappings
                ).selectinload(ControlSubmeasureMapping.control)
            )
            .order_by(Measure.order_index)
        )
        result = await self.db.execute(measures_query)
        measures = list(result.scalars().unique())
        
        # Build questionnaire structure
        questionnaire_measures = []
        total_controls = 0
        total_answered = 0
        
        for measure in measures:
            measure_controls = 0
            measure_answered = 0
            submeasures_data = []
            
            for submeasure in sorted(measure.submeasures, key=lambda s: s.order_index):
                controls_data = []
                
                for mapping in sorted(
                    submeasure.control_mappings, 
                    key=lambda m: m.order_index
                ):
                    control = mapping.control
                    instance_id = f"{control.id}:{submeasure.id}"
                    answer = answers_map.get(instance_id)
                    
                    # Check if control is applicable at this security level
                    is_applicable = await self._is_control_applicable(
                        control.id, submeasure.id, assessment.security_level.lower()
                    )
                    
                    if not is_applicable:
                        continue
                    
                    control_data = ControlInQuestionnaireResponseV2(
                        id=str(control.id),
                        code=control.code,
                        name_hr=control.name_hr,
                        description_hr=control.description_hr,
                        submeasure_id=str(submeasure.id),
                        instance_id=instance_id,
                        order_index=mapping.order_index,
                        is_mandatory=await self._is_control_mandatory(
                            control.id, submeasure.id, assessment.security_level.lower()
                        ),
                        is_applicable=is_applicable,
                        minimum_score=await self._get_minimum_score(
                            control.id, submeasure.id, assessment.security_level.lower()
                        ),
                        documentation_score=answer.documentation_score if answer else None,
                        implementation_score=answer.implementation_score if answer else None,
                        average_score=answer.average_score if answer else None,
                        meets_minimum=await self._check_meets_minimum(
                            answer, control.id, submeasure.id, assessment.security_level.lower()
                        ) if answer else None,
                        comments=answer.comments if answer else None,
                        evidence_files=answer.evidence_files if answer else [],
                        answered_at=answer.answered_at if answer else None,
                        answered_by=str(answer.answered_by) if answer and answer.answered_by else None,
                    )
                    
                    controls_data.append(control_data)
                    measure_controls += 1
                    total_controls += 1
                    
                    if answer and answer.average_score is not None:
                        measure_answered += 1
                        total_answered += 1
                
                # Calculate submeasure statistics
                submeasure_stats = await self.answer_repository.get_submeasure_statistics(
                    assessment_id, submeasure.id
                )
                
                submeasure_data = SubmeasureInQuestionnaireResponseV2(
                    id=str(submeasure.id),
                    code=submeasure.code,
                    number=submeasure.code,  # Using code as number since model doesn't have number field
                    name_hr=submeasure.name_hr,
                    description_hr=submeasure.description_hr,
                    order_index=submeasure.order_index,
                    controls=controls_data,
                    total_controls=len(controls_data),
                    answered_controls=sum(
                        1 for c in controls_data 
                        if c.documentation_score is not None 
                        or c.implementation_score is not None
                    ),
                    mandatory_controls=sum(1 for c in controls_data if c.is_mandatory),
                    mandatory_answered=sum(
                        1 for c in controls_data 
                        if c.is_mandatory and c.average_score is not None
                    ),
                    controls_meeting_minimum=sum(
                        1 for c in controls_data if c.meets_minimum
                    ),
                    mandatory_meeting_minimum=sum(
                        1 for c in controls_data 
                        if c.is_mandatory and c.meets_minimum
                    ),
                    documentation_avg=submeasure_stats.get("avg_documentation_score"),
                    implementation_avg=submeasure_stats.get("avg_implementation_score"),
                    overall_score=submeasure_stats.get("avg_overall_score"),
                    is_compliant=all(
                        c.meets_minimum for c in controls_data if c.is_mandatory
                    ),
                    compliance_issues=[
                        f"Control {c.code} does not meet minimum score"
                        for c in controls_data
                        if c.is_mandatory and not c.meets_minimum
                    ],
                )
                
                submeasures_data.append(submeasure_data)
            
            # Create measure data
            measure_data = MeasureInQuestionnaireResponseV2(
                id=str(measure.id),
                code=measure.code,
                name_hr=measure.name_hr,
                description_hr=measure.description_hr,
                order_index=measure.order_index,
                submeasures=submeasures_data,
                total_controls=measure_controls,
                answered_controls=measure_answered,
                mandatory_controls=sum(s.mandatory_controls for s in submeasures_data),
                mandatory_answered=sum(s.mandatory_answered for s in submeasures_data),
                overall_score=None,  # Will be calculated by scoring engine
                is_compliant=all(s.is_compliant for s in submeasures_data),
            )
            
            questionnaire_measures.append(measure_data)
        
        # Create overall statistics
        statistics = {
            "total_measures": len(questionnaire_measures),
            "total_submeasures": sum(len(m.submeasures) for m in questionnaire_measures),
            "total_controls": total_controls,
            "total_answered": total_answered,
            "completion_percentage": (
                round((total_answered / total_controls) * 100, 2) 
                if total_controls > 0 else 0
            ),
            "compliant_measures": sum(1 for m in questionnaire_measures if m.is_compliant),
        }
        
        return QuestionnaireResponseV2(
            assessment_id=str(assessment_id),
            security_level=assessment.security_level,
            version_id=str(assessment.version_id) if assessment.version_id else None,
            measures=questionnaire_measures,
            statistics=statistics,
            generated_at=datetime.utcnow(),
            supports_multi_context=True,
        )
    
    async def batch_update_answers(
        self,
        assessment_id: uuid.UUID,
        answers: List[UpdateAnswerRequestV2],
        user_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict:
        """Batch update multiple answers with optimized calculations."""
        
        logger.info(f"[V3_SERVICE] Updating {len(answers)} answers for assessment {assessment_id}")
        
        # For single answer, use lightweight update
        if len(answers) == 1:
            logger.info("[V3_SERVICE] Using optimized single answer update path")
            answer = answers[0]
            
            # Validate relationship
            await self._validate_control_submeasure_relationship(
                answer.control_id, answer.submeasure_id
            )
            
            # Update single answer
            answer_data = {
                "control_id": answer.control_id,
                "submeasure_id": answer.submeasure_id,
                "documentation_score": answer.documentation_score,
                "implementation_score": answer.implementation_score,
                "comments": answer.comments,
                "evidence_files": answer.evidence_files,
                "confidence_level": answer.confidence_level,
                "answered_by": user_id,
            }
            
            updated = await self.answer_repository.create_or_update(
                assessment_id=assessment_id,
                control_id=answer.control_id,
                submeasure_id=answer.submeasure_id,
                documentation_score=answer.documentation_score,
                implementation_score=answer.implementation_score,
                comments=answer.comments,
                evidence_files=answer.evidence_files,
                confidence_level=answer.confidence_level,
                answered_by=user_id,
            )
            
            # Minimal audit log
            await self.audit_repository.create(
                assessment_id=assessment_id,
                action="answer_updated",
                entity_type="answer",
                entity_id=assessment_id,
                new_values={
                    "control_id": str(answer.control_id),
                    "submeasure_id": str(answer.submeasure_id),
                    "scores": {
                        "documentation": answer.documentation_score,
                        "implementation": answer.implementation_score,
                    }
                },
                user_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                change_summary=f"Updated answer for control {answer.control_id}",
            )
            
            # For single answers, at least update the progress stats
            # Skip the heavy scoring calculations but update counts
            try:
                await self.calculate_and_update_progress(assessment_id)
            except Exception as e:
                logger.warning(f"[V3_SERVICE] Progress update failed: {str(e)}")
            
            # Check for auto-transition even for single answers
            try:
                await self.check_and_auto_transition(
                    assessment_id=assessment_id,
                    user_id=user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            except Exception as e:
                logger.warning(f"[V3_SERVICE] Auto-transition check failed: {str(e)}")
            
            logger.info("[V3_SERVICE] Single answer update completed")
            
            return {
                "updated_count": 1,
                "submeasures_affected": 1,
                "message": "Answer updated successfully",
            }
        
        # For batch updates, validate all first
        for answer in answers:
            await self._validate_control_submeasure_relationship(
                answer.control_id, answer.submeasure_id
            )
        
        # Convert to repository format
        answers_data = [
            {
                "control_id": answer.control_id,
                "submeasure_id": answer.submeasure_id,
                "documentation_score": answer.documentation_score,
                "implementation_score": answer.implementation_score,
                "comments": answer.comments,
                "evidence_files": answer.evidence_files,
                "confidence_level": answer.confidence_level,
                "answered_by": user_id,
            }
            for answer in answers
        ]
        
        # Update all answers
        updated_answers = []
        for answer_data in answers_data:
            updated = await self.answer_repository.create_or_update(
                assessment_id=assessment_id,
                **answer_data
            )
            updated_answers.append(updated)
        
        # Create audit log for batch update
        await self.audit_repository.create(
            assessment_id=assessment_id,
            action="answer_updated",
            entity_type="assessment",
            entity_id=assessment_id,
            new_values={
                "count": len(updated_answers),
                "submeasures_affected": len(
                    set(str(a.submeasure_id) for a in updated_answers)
                ),
            },
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            change_summary=f"Updated {len(updated_answers)} answers",
        )
        
        # For true batch updates, do calculations
        affected_submeasures = set(a.submeasure_id for a in updated_answers)
        
        try:
            # Recalculate scores with timeout protection
            for submeasure_id in affected_submeasures:
                await self.scoring_engine_v2.calculate_submeasure_score(
                    assessment_id, submeasure_id
                )
            
            # Overall calculations
            await self.scoring_engine_v2.calculate_overall_score(assessment_id)
            await self.calculate_and_update_progress(assessment_id)
            
            # Auto-transition check (don't block on this)
            # Note: This is still synchronous but at least it's last
            await self.check_and_auto_transition(assessment_id, user_id, ip_address, user_agent)
            
        except Exception as e:
            logger.error(f"[V3_SERVICE] Error in batch calculations: {str(e)}")
            # Don't fail - answers are saved
        
        return {
            "updated_count": len(updated_answers),
            "submeasures_affected": len(affected_submeasures),
            "message": "Batch update completed successfully",
        }
    
    # ============================================================================
    # HELPER METHODS PORTED FROM V2
    # ============================================================================
    
    async def _validate_control_submeasure_relationship(
        self, control_id: uuid.UUID, submeasure_id: uuid.UUID
    ) -> None:
        """Validate that a control belongs to a submeasure."""
        query = select(ControlSubmeasureMapping).where(
            and_(
                ControlSubmeasureMapping.control_id == control_id,
                ControlSubmeasureMapping.submeasure_id == submeasure_id,
            )
        )
        result = await self.db.execute(query)
        mapping = result.scalar_one_or_none()
        
        if not mapping:
            raise ValidationError(
                f"Control {control_id} is not associated with submeasure {submeasure_id}"
            )
    
    async def _is_control_applicable(
        self, control_id: uuid.UUID, submeasure_id: uuid.UUID, security_level: str
    ) -> bool:
        """Check if control is applicable at given security level."""
        # Query ControlRequirement for this control-submeasure-level combination
        from app.models.reference import ControlRequirement
        
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.submeasure_id == submeasure_id,
                ControlRequirement.level == security_level.lower(),
            )
        )
        result = await self.db.execute(query)
        requirement = result.scalar_one_or_none()
        
        # If no requirement record exists, default to applicable
        if not requirement:
            return True
            
        return requirement.is_applicable
    
    async def _is_control_mandatory(
        self, control_id: uuid.UUID, submeasure_id: uuid.UUID, security_level: str
    ) -> bool:
        """Check if control is mandatory at given security level."""
        # Query ControlRequirement for this control-submeasure-level combination
        from app.models.reference import ControlRequirement
        
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.submeasure_id == submeasure_id,
                ControlRequirement.level == security_level.lower(),
            )
        )
        result = await self.db.execute(query)
        requirement = result.scalar_one_or_none()
        
        # If no requirement record exists, default to not mandatory
        if not requirement:
            return False
            
        return requirement.is_mandatory
    
    async def _get_minimum_score(
        self, control_id: uuid.UUID, submeasure_id: uuid.UUID, security_level: str
    ) -> Optional[float]:
        """Get minimum required score for control at given security level."""
        # Query ControlRequirement for this control-submeasure-level combination
        from app.models.reference import ControlRequirement
        
        query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.submeasure_id == submeasure_id,
                ControlRequirement.level == security_level.lower(),
            )
        )
        result = await self.db.execute(query)
        requirement = result.scalar_one_or_none()
        
        # If no requirement record exists, return None (no minimum)
        if not requirement:
            return None
            
        return requirement.minimum_score
    
    async def _check_meets_minimum(
        self, 
        answer: Optional[AssessmentAnswer], 
        control_id: uuid.UUID,
        submeasure_id: uuid.UUID,
        security_level: str
    ) -> bool:
        """Check if answer meets minimum score requirement."""
        if not answer or answer.average_score is None:
            return False
        
        min_score = await self._get_minimum_score(control_id, submeasure_id, security_level)
        if min_score is None:
            return True
        
        return answer.average_score >= min_score