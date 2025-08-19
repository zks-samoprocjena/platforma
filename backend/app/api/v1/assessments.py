"""Assessment API endpoints v2 with submeasure context support."""

from datetime import datetime, timezone
from typing import List, Optional, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi import status as http_status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import StreamingResponse

from app.core.database import get_async_session
from app.api.deps import get_current_user
from app.models.organization import User
from app.core.exceptions import ValidationError
from app.schemas.assessment import (
    AssessmentDetailResponse,
    AssessmentListResponse,
    AssessmentProgressResponse,
    AssessmentResponse,
    AssessmentResultResponse,
    AssessmentValidationResponse,
    AssessmentActivityResponse,
    CreateAssessmentRequest,
    CreateAssessmentResponse,
    ErrorResponse,
    OperationResponse,
    StatusTransitionResponse,
    TransitionStatusRequest,
    UpdateAnswerResponse,
    UpdateAssessmentRequest,
    AssignUsersRequest,
)
from app.schemas.assessment import (
    UpdateAnswerRequestV2,
    BatchUpdateAnswersRequestV2,
    QuestionnaireResponseV2,
    ControlInQuestionnaireResponseV2,
    SubmeasureInQuestionnaireResponseV2,
    MeasureInQuestionnaireResponseV2,
)
from app.schemas.assessment_insights import AssessmentInsightsResponse
from app.services.assessment_service import AssessmentService
from app.services.assessment_insights_service import AssessmentInsightsService
from app.services.keycloak_service import KeycloakService
# OBSOLETE: from app.services.assessment_service_enhanced import AssessmentLifecycleService
# from app.services.scoring_engine_v2 import ScoringEngineV2  # Not needed - using V3 compliance scoring

router = APIRouter(prefix="/assessments", tags=["assessments"])


def get_client_info(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Extract client IP and user agent from request."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip_address, user_agent


@router.get(
    "/",
    summary="List assessments",
    description="List assessments with optional filtering by status, security level, and organization.",
)
async def list_assessments(
    organization_id: UUID = Query(..., description="Organization ID is required for tenant isolation"),
    search_term: Optional[str] = None,
    status: Optional[str] = None,
    security_level: Optional[str] = None,
    assigned_user_id: Optional[UUID] = None,
    exclude_archived: bool = True,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """List assessments with filtering options."""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[ASSESSMENTS_V2] List assessments request - organization_id: {organization_id}, "
                f"status: {status}, security_level: {security_level}, limit: {limit}, offset: {offset}")
    
    service = AssessmentService(db)
    
    try:
        # Always filter by organization - no global fallback for security
        assessments = await service.assessment_repository.get_by_organization(
            organization_id=organization_id,
            status=status if status and not exclude_archived else None,
            security_level=security_level,
            limit=limit,
            offset=offset,
        )
            
        # Filter out archived if needed
        if exclude_archived:
            assessments = [a for a in assessments if a.status != "archived"]
            
        # Count total for this organization only
        total_count = await service.assessment_repository.count_by_organization(organization_id)
        
        logger.info(f"[ASSESSMENTS_V2] Found {len(assessments)} assessments, total count: {total_count} for org: {organization_id}")
        
        # Get last activity users for assessments
        keycloak_service = KeycloakService()
        assessment_list = []
        
        for a in assessments:
            # Get last user who answered questions in this assessment
            last_user_id = await service.answer_repository.get_last_updated_by_user_id(a.id)
            updated_by_name = None
            
            if last_user_id:
                try:
                    user_data = await keycloak_service.get_user_by_id(str(last_user_id))
                    if user_data:
                        # Try different name fields from Keycloak
                        updated_by_name = (
                            user_data.get("firstName", "") + " " + user_data.get("lastName", "")
                        ).strip()
                        if not updated_by_name:
                            updated_by_name = user_data.get("username")
                except Exception as e:
                    logger.warning(f"Failed to get user name for {last_user_id}: {e}")
            
            assessment_dict = {
                "id": str(a.id),
                "title": a.title,
                "description": a.description,
                "organization_id": str(a.organization_id),
                "security_level": a.security_level,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
                "created_by": str(a.created_by) if a.created_by else None,
                "updated_by": updated_by_name,
                "assigned_to": a.assigned_to,
                "total_controls": a.total_controls,
                "answered_controls": a.answered_controls,
                "mandatory_controls": a.mandatory_controls,
                "mandatory_answered": a.mandatory_answered,
                "completion_percentage": (
                    (a.answered_controls / a.total_controls * 100) if a.total_controls > 0 else 0
                ),
                "compliance_percentage": float(a.compliance_percentage) if a.compliance_percentage is not None else None, 
                "compliance_status": a.compliance_status,
            }
            assessment_list.append(assessment_dict)
        
        return {
            "assessments": assessment_list,
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
        }
        
    except Exception as e:
        logger.error(f"[ASSESSMENTS_V2] Failed to list assessments for org {organization_id}: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list assessments: {str(e)}",
        )


@router.post(
    "/",
    response_model=CreateAssessmentResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create new assessment",
    description="Create a new assessment for a specific organization and security level.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        422: {"model": ErrorResponse, "description": "Validation error"},
    },
)
async def create_assessment(
    request_data: CreateAssessmentRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> CreateAssessmentResponse:
    """Create a new assessment - same as v1 for now."""
    service = AssessmentService(db)
    ip_address, user_agent = get_client_info(request)

    try:
        # Pass the request object directly - that's what the method expects
        assessment = await service.create_assessment(
            request=request_data,
            created_by=current_user.id,
            user_id=current_user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Build response
        return CreateAssessmentResponse(
            success=True,
            assessment_id=str(assessment.id),
            title=assessment.title,
            status=assessment.status,
            security_level=assessment.security_level,
            created_at=assessment.created_at.isoformat() if assessment.created_at else datetime.utcnow().isoformat(),
        )

    except ValueError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create assessment: {str(e)}",
        )


@router.get(
    "/{assessment_id}",
    response_model=AssessmentDetailResponse,
    summary="Get assessment details",
    description="Retrieve detailed information about a specific assessment.",
    responses={404: {"model": ErrorResponse, "description": "Assessment not found"}},
)
async def get_assessment(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentDetailResponse:
    """Get assessment details."""
    service = AssessmentService(db)
    
    try:
        # Get assessment with overview data
        assessment = await service.get_assessment(assessment_id)
        overview = await service.get_assessment_overview(assessment_id)
        
        # Get last user who answered questions in this assessment
        keycloak_service = KeycloakService()
        last_user_id = await service.answer_repository.get_last_updated_by_user_id(assessment_id)
        updated_by_name = None
        
        if last_user_id:
            try:
                user_data = await keycloak_service.get_user_by_id(str(last_user_id))
                if user_data:
                    # Try different name fields from Keycloak
                    updated_by_name = (
                        user_data.get("firstName", "") + " " + user_data.get("lastName", "")
                    ).strip()
                    if not updated_by_name:
                        updated_by_name = user_data.get("username")
            except Exception as e:
                logger.warning(f"Failed to get user name for {last_user_id}: {e}")
        
        # Build progress data that matches frontend expectations
        progress_data = overview.get("progress", {})
        
        # Build response
        return AssessmentDetailResponse(
            assessment={
                "id": str(assessment.id),
                "title": assessment.title,
                "description": assessment.description,
                "organization_id": str(assessment.organization_id),
                "security_level": assessment.security_level,
                "status": assessment.status,
                "created_at": assessment.created_at.isoformat() if assessment.created_at else None,
                "updated_at": assessment.updated_at.isoformat() if assessment.updated_at else None,
                "created_by": str(assessment.created_by) if assessment.created_by else None,
                "updated_by": updated_by_name,
                "assigned_to": assessment.assigned_to,
                "due_date": assessment.due_date.isoformat() if assessment.due_date else None,
                "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else None,
                "version_id": str(assessment.version_id) if assessment.version_id else None,
                # Include progress fields for frontend compatibility
                "total_controls": progress_data.get("total_controls", 0),
                "answered_controls": progress_data.get("answered_controls", 0),
                "mandatory_controls": progress_data.get("mandatory_controls", 0),
                "mandatory_answered": progress_data.get("mandatory_answered", 0),
                "compliance_percentage": progress_data.get("completion_percentage"),
                "compliance_status": assessment.compliance_status,
                # Add proper progress structure that frontend expects
                "progress": {
                    "total_controls": progress_data.get("total_controls", 0),
                    "completed_controls": progress_data.get("answered_controls", 0),  # Map to expected field name
                    "mandatory_controls": progress_data.get("mandatory_controls", 0),
                    "completed_mandatory": progress_data.get("mandatory_answered", 0),  # Map to expected field name
                    "completion_percentage": progress_data.get("completion_percentage", 0),
                    "mandatory_completion_percentage": progress_data.get("mandatory_completion_percentage", 0),
                    "last_updated": assessment.updated_at.isoformat() if assessment.updated_at else None
                }
            },
            progress=progress_data,
            compliance=overview.get("compliance", {}),
            statistics=overview.get("statistics", {}),
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve assessment: {str(e)}",
        )


@router.get(
    "/{assessment_id}/progress",
    response_model=AssessmentProgressResponse,
    summary="Get assessment progress",
    description="Retrieve current progress statistics for an assessment.",
    responses={404: {"model": ErrorResponse, "description": "Assessment not found"}},
)
async def get_assessment_progress(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentProgressResponse:
    """Get assessment progress."""
    service = AssessmentService(db)
    
    try:
        # Get overview which includes progress data
        overview = await service.get_assessment_overview(assessment_id)
        progress = overview.get("progress", {})
        
        return AssessmentProgressResponse(
            assessment_id=str(assessment_id),
            total_controls=progress.get("total_controls", 0),
            answered_controls=progress.get("answered_controls", 0),
            mandatory_controls=progress.get("mandatory_controls", 0),
            mandatory_answered=progress.get("mandatory_answered", 0),
            completion_percentage=progress.get("completion_percentage", 0.0),
            mandatory_completion_percentage=progress.get("mandatory_completion_percentage", 0.0),
            measure_progress=progress.get("by_measure", []),
            updated_at=progress.get("last_activity") or datetime.utcnow(),
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve progress: {str(e)}",
        )


@router.get(
    "/{assessment_id}/results",
    response_model=AssessmentResultResponse,
    summary="Get assessment results",
    description="Retrieve calculated results and scores for an assessment.",
    responses={404: {"model": ErrorResponse, "description": "Assessment not found"}},
)
async def get_assessment_results(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentResultResponse:
    """Get assessment results."""
    service = AssessmentService(db)
    
    try:
        # Get overview and compliance data
        overview = await service.get_assessment_overview(assessment_id)
        compliance = await service.get_assessment_compliance(assessment_id)
        
        # Get overall score and compliance percentage from compliance data
        overall_data = compliance.get("overall", {})
        overall_score = overall_data.get("overall_score", 0.0)
        compliance_percentage = overall_data.get("compliance_percentage", 0.0)
        
        # Get measure results from compliance data
        measure_results = []
        for measure in compliance.get("measures", []):
            measure_id_str = measure.get("measure_id")
            
            # Convert string UUID to UUID object for database query
            try:
                from uuid import UUID as UUIDType
                measure_id_uuid = UUIDType(measure_id_str) if measure_id_str else None
            except (ValueError, TypeError):
                measure_id_uuid = None
            
            # Get stored control counts from MeasureScore table using raw SQL
            measure_score = None
            if measure_id_uuid:
                try:
                    from sqlalchemy import text
                    measure_score_query = text("""
                        SELECT total_controls, answered_controls, mandatory_controls, 
                               mandatory_answered, total_submeasures, passed_submeasures
                        FROM measure_scores 
                        WHERE assessment_id = :assessment_id AND measure_id = :measure_id
                    """)
                    measure_score_result = await db.execute(measure_score_query, {
                        'assessment_id': str(assessment_id),
                        'measure_id': str(measure_id_uuid)
                    })
                    row = measure_score_result.fetchone()
                    
                    if row:
                        # Create a simple object with the data we need
                        class MeasureScoreData:
                            def __init__(self, row):
                                self.total_controls = row[0] or 0
                                self.answered_controls = row[1] or 0
                                self.mandatory_controls = row[2] or 0
                                self.mandatory_answered = row[3] or 0
                                self.total_submeasures = row[4] or 0
                                self.passed_submeasures = row[5] or 0
                        
                        measure_score = MeasureScoreData(row)
                        
                except Exception:
                    measure_score = None
            
            # Calculate submeasure counts from filtered compliance data
            submeasures_data = measure.get("submeasures", [])
            total_submeasures = len(submeasures_data)
            passed_submeasures = len([sub for sub in submeasures_data if sub.get("passes_overall", False)])
            
            # Build measure result with stored control counts and calculated submeasure counts
            measure_result = {
                "measure_code": measure.get("measure_code"),
                "measure_id": measure_id_str,
                "overall_score": measure.get("overall_score", 0.0),
                "documentation_avg": measure.get("documentation_avg"),
                "implementation_avg": measure.get("implementation_avg"),
                "compliance_percentage": measure.get("compliance_percentage", 0.0),
                "passes_compliance": measure.get("passes_compliance", False),
                "critical_failures": measure.get("critical_failures", []),
                # Use calculated submeasure counts from filtered compliance data
                "total_submeasures": total_submeasures,
                "passed_submeasures": passed_submeasures
            }
            
            # Compute control counts from filtered compliance submeasures to avoid stale measure_scores
            subs = submeasures_data
            measure_result.update({
                "total_controls": sum((sub.get("total_controls") or 0) for sub in subs),
                "answered_controls": sum((sub.get("answered_controls") or 0) for sub in subs),
                "mandatory_controls": sum((sub.get("mandatory_controls") or 0) for sub in subs),
                "mandatory_answered": sum((sub.get("mandatory_answered") or 0) for sub in subs),
            })
            
            measure_results.append(measure_result)
        
        # Get submeasure results
        submeasure_results = []
        for measure in compliance.get("measures", []):
            for submeasure in measure.get("submeasures", []):
                submeasure_results.append({
                    "submeasure_id": submeasure.get("submeasure_id"),
                    "submeasure_code": submeasure.get("submeasure_code"),
                    "measure_code": measure.get("measure_code"),
                    "overall_score": submeasure.get("overall_score", 0.0),
                    "documentation_avg": submeasure.get("documentation_avg"),
                    "implementation_avg": submeasure.get("implementation_avg"),
                    "passes_overall": submeasure.get("passes_overall", False),
                    "passes_individual_threshold": submeasure.get("passes_individual_threshold", False),
                    "passes_average_threshold": submeasure.get("passes_average_threshold", False),
                    "total_controls": submeasure.get("total_controls", 0),
                    "answered_controls": submeasure.get("answered_controls", 0),
                    "mandatory_controls": submeasure.get("mandatory_controls", 0),
                    "mandatory_answered": submeasure.get("mandatory_answered", 0),
                    "control_count": submeasure.get("total_controls", 0),  # Use total_controls as control_count
                    "failed_controls": submeasure.get("failed_controls", [])
                })
        
        # Build statistics in the format expected by frontend
        progress_data = overview.get("progress", {})
        
        statistics = {
            "total_controls": progress_data.get("total_controls", 0),
            "answered_controls": progress_data.get("answered_controls", 0),
            "mandatory_controls": progress_data.get("mandatory_controls", 0),
            "mandatory_answered": progress_data.get("mandatory_answered", 0),
            "completion_percentage": progress_data.get("completion_percentage", 0),
            "mandatory_completion_percentage": progress_data.get("mandatory_completion_percentage", 0),
            "compliance": compliance.get("overall", {})
        }
        
        return AssessmentResultResponse(
            assessment_id=assessment_id,
            overall_score=float(overall_score) if overall_score else 0.0,
            compliance_percentage=float(compliance_percentage) if compliance_percentage else 0.0,
            measure_results=measure_results,
            submeasure_results=submeasure_results,
            calculated_at=datetime.now(timezone.utc),
            statistics=statistics,
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve results: {str(e)}",
        )


@router.get(
    "/{assessment_id}/questionnaire",
    response_model=QuestionnaireResponseV2,
    summary="Get assessment questionnaire with submeasure context",
    description="Retrieve the questionnaire structure with proper submeasure context for controls.",
    responses={404: {"model": ErrorResponse, "description": "Assessment not found"}},
)
async def get_assessment_questionnaire(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> QuestionnaireResponseV2:
    """Get questionnaire structure with submeasure context."""
    service = AssessmentService(db)
    
    try:
        questionnaire = await service.get_questionnaire(assessment_id)
        return questionnaire
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate questionnaire: {str(e)}",
        )


@router.put(
    "/{assessment_id}/answers",
    response_model=Dict,
    summary="Update a single assessment answer",
    description="Update a single assessment answer with submeasure context.",
    responses={
        404: {"model": ErrorResponse, "description": "Assessment not found"},
        400: {"model": ErrorResponse, "description": "Invalid answer data"},
    },
)
async def update_assessment_answer(
    assessment_id: UUID,
    request_data: UpdateAnswerRequestV2,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Update a single assessment answer with submeasure context."""
    service = AssessmentService(db)
    ip_address, user_agent = get_client_info(request)

    try:
        # Validate required fields
        if not request_data.control_id or not request_data.submeasure_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="control_id and submeasure_id are required",
            )
        
        # Convert single answer to batch format
        result = await service.batch_update_answers(
            assessment_id=assessment_id,
            answers=[request_data],
            user_id=current_user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Mark insights as stale after answer updates
        from app.services.assessment_insights_service import AssessmentInsightsService
        await AssessmentInsightsService(db).mark_stale(assessment_id)

        return result

    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update answer: {str(e)}",
        )


@router.put(
    "/{assessment_id}/answers/batch",
    response_model=Dict,
    summary="Batch update assessment answers",
    description="Batch update multiple assessment answers with submeasure context and automatic score recalculation.",
    responses={
        404: {"model": ErrorResponse, "description": "Assessment not found"},
        400: {"model": ErrorResponse, "description": "Invalid answer data"},
    },
)
async def batch_update_assessment_answers(
    assessment_id: UUID,
    request_data: BatchUpdateAnswersRequestV2,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Batch update assessment answers with submeasure context."""
    service = AssessmentService(db)
    ip_address, user_agent = get_client_info(request)

    try:
        result = await service.batch_update_answers(
            assessment_id=assessment_id,
            answers=request_data.answers,
            user_id=current_user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        await db.commit()
        
        # Mark insights as stale after batch updates
        from app.services.assessment_insights_service import AssessmentInsightsService
        await AssessmentInsightsService(db).mark_stale(assessment_id)
        
        return result

    except ValidationError as e:
        await db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update answers: {str(e)}",
        )




@router.get(
    "/{assessment_id}/submeasure/{submeasure_id}/results",
    response_model=Dict,
    summary="Get submeasure-specific results",
    description="Retrieve results for a specific submeasure including control-level details.",
    responses={404: {"model": ErrorResponse, "description": "Assessment or submeasure not found"}},
)
async def get_submeasure_results(
    assessment_id: UUID,
    submeasure_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get detailed results for a specific submeasure."""
    service = AssessmentService(db)
    
    try:
        # Get compliance data and extract submeasure results
        compliance_data = await service.get_assessment_compliance(assessment_id)
        
        # Find the specific submeasure in compliance results
        submeasure_result = None
        for measure in compliance_data.get("measures", []):
            for submeasure in measure.get("submeasures", []):
                if submeasure.get("submeasure_id") == str(submeasure_id):
                    submeasure_result = submeasure
                    break
            if submeasure_result:
                break
        
        if not submeasure_result:
            raise HTTPException(
                status_code=404,
                detail="Submeasure not found in assessment"
            )
        
        return {
            "assessment_id": str(assessment_id),
            "submeasure_id": str(submeasure_id),
            "score": submeasure_result.get("overall_score"),
            "details": submeasure_result,
            "generated_at": datetime.utcnow().isoformat(),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate submeasure results: {str(e)}",
        )




@router.get(
    "/{assessment_id}/validation",
    response_model=Dict,
    summary="Validate assessment with submeasure context",
    description="Validate assessment completeness and compliance at submeasure level.",
    responses={404: {"model": ErrorResponse, "description": "Assessment not found"}},
)
async def validate_assessment(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Validate assessment for completeness and compliance."""
    service = AssessmentService(db)
    
    try:
        questionnaire = await service.get_questionnaire(assessment_id)
        
        validation_issues = []
        validation_warnings = []
        
        # Check each submeasure for issues
        for measure in questionnaire.measures:
            for submeasure in measure.submeasures:
                # Check mandatory controls
                if submeasure.mandatory_controls > submeasure.mandatory_answered:
                    validation_issues.append({
                        "type": "missing_mandatory",
                        "submeasure": submeasure.number,
                        "message": f"Submeasure {submeasure.number} has {submeasure.mandatory_controls - submeasure.mandatory_answered} unanswered mandatory controls",
                        "severity": "error",
                    })
                
                # Check minimum scores
                if submeasure.mandatory_controls > submeasure.mandatory_meeting_minimum:
                    validation_warnings.append({
                        "type": "below_minimum",
                        "submeasure": submeasure.number,
                        "message": f"Submeasure {submeasure.number} has {submeasure.mandatory_controls - submeasure.mandatory_meeting_minimum} mandatory controls below minimum score",
                        "severity": "warning",
                    })
                
                # Add specific compliance issues
                for issue in submeasure.compliance_issues:
                    validation_issues.append({
                        "type": "compliance",
                        "submeasure": submeasure.number,
                        "message": issue,
                        "severity": "error",
                    })
        
        is_valid = len(validation_issues) == 0
        can_submit = is_valid and questionnaire.statistics["completion_percentage"] >= 80  # 80% threshold
        
        return {
            "assessment_id": str(assessment_id),
            "is_valid": is_valid,
            "can_submit": can_submit,
            "completion_percentage": questionnaire.statistics["completion_percentage"],
            "validation_issues": validation_issues,
            "validation_warnings": validation_warnings,
            "validated_at": datetime.utcnow().isoformat(),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate assessment: {str(e)}",
        )


@router.get(
    "/{assessment_id}/compliance",
    summary="Get assessment compliance",
    description="Get detailed compliance status for an assessment.",
)
async def get_assessment_compliance(
    assessment_id: UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get detailed compliance status for an assessment."""
    
    service = AssessmentService(db)
    
    try:
        compliance_data = await service.get_assessment_compliance(assessment_id)
        return compliance_data
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get compliance data",
        )


@router.get(
    "/{assessment_id}/spider-data",
    summary="Get spider diagram data",
    description="Get assessment data formatted for spider (radar) chart visualizations.",
)
async def get_spider_diagram_data(
    assessment_id: UUID,
    locale: str = "en",
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get spider diagram data for assessment visualization."""
    
    service = AssessmentService(db)
    
    try:
        # Get compliance data
        compliance_data = await service.get_assessment_compliance(assessment_id)
        
        # Get assessment details
        assessment = await service.get_assessment(assessment_id)
        
        # Define translations
        translations = {
            "en": {
                "documentation": "Documentation",
                "implementation": "Implementation",
                "overall_compliance": "Overall Compliance",
                "documentation_maturity": "Documentation Maturity",
                "implementation_maturity": "Implementation Maturity",
                "mandatory_coverage": "Mandatory Coverage",
                "total_coverage": "Total Coverage"
            },
            "hr": {
                "documentation": "Dokumentacija",
                "implementation": "Implementacija",
                "overall_compliance": "Ukupna usklađenost",
                "documentation_maturity": "Zrelost dokumentacije",
                "implementation_maturity": "Zrelost implementacije",
                "mandatory_coverage": "Pokrivenost obveznih",
                "total_coverage": "Ukupna pokrivenost"
            }
        }
        
        # Get translations for current locale
        t = translations.get(locale, translations["en"])
        
        # Prepare data for different spider diagram types
        spider_data = {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            
            # 1. Documentation vs Implementation by Measure
            "documentation_vs_implementation": {
                "labels": [],  # Measure codes
                "datasets": [
                    {
                        "label": t["documentation"],
                        "data": [],  # Documentation averages
                    },
                    {
                        "label": t["implementation"],
                        "data": [],  # Implementation averages
                    }
                ]
            },
            
            # 2. Measure Compliance
            "measure_compliance": {
                "labels": [],  # Measure codes
                "data": [],    # Compliance percentages
            },
            
            # 3. Assessment Dimensions
            "assessment_dimensions": {
                "labels": [
                    t["overall_compliance"],
                    t["documentation_maturity"],
                    t["implementation_maturity"],
                    t["mandatory_coverage"],
                    t["total_coverage"]
                ],
                "data": []  # Values for each dimension
            }
        }
        
        # Calculate overall documentation and implementation averages
        total_doc_score = 0
        total_impl_score = 0
        measure_count = 0
        
        # Process measure data
        for measure in compliance_data.get("measures", []):
            # Add measure label
            spider_data["documentation_vs_implementation"]["labels"].append(f"M{measure['measure_code']}")
            spider_data["measure_compliance"]["labels"].append(f"M{measure['measure_code']}")
            
            # Add documentation and implementation scores
            doc_avg = measure.get("documentation_avg", 0) or 0
            impl_avg = measure.get("implementation_avg", 0) or 0
            
            spider_data["documentation_vs_implementation"]["datasets"][0]["data"].append(
                float(doc_avg) if doc_avg else 0
            )
            spider_data["documentation_vs_implementation"]["datasets"][1]["data"].append(
                float(impl_avg) if impl_avg else 0
            )
            
            # Add compliance percentage
            spider_data["measure_compliance"]["data"].append(
                float(measure.get("compliance_percentage", 0))
            )
            
            # Accumulate for overall averages
            if doc_avg:
                total_doc_score += float(doc_avg)
            if impl_avg:
                total_impl_score += float(impl_avg)
            measure_count += 1
        
        # Calculate assessment dimensions
        overall_data = compliance_data.get("overall", {})
        
        # Get progress data
        overview = await service.get_assessment_overview(assessment_id)
        progress = overview.get("progress", {})
        
        # Calculate dimension values (normalized to 0-5 scale)
        dimensions_data = [
            # Overall Compliance (0-100% -> 0-5)
            float(overall_data.get("compliance_percentage", 0)) / 20,
            
            # Documentation Maturity (1-5 scale)
            (total_doc_score / measure_count) if measure_count > 0 else 0,
            
            # Implementation Maturity (1-5 scale)
            (total_impl_score / measure_count) if measure_count > 0 else 0,
            
            # Mandatory Coverage (0-100% -> 0-5)
            float(progress.get("mandatory_completion_percentage", 0)) / 20,
            
            # Total Coverage (0-100% -> 0-5)
            float(progress.get("completion_percentage", 0)) / 20
        ]
        
        spider_data["assessment_dimensions"]["data"] = dimensions_data
        
        return spider_data
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get spider diagram data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/heatmap-data",
    summary="Get heat map data",
    description="Get assessment data formatted for heat map visualizations.",
)
async def get_heatmap_data(
    assessment_id: UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get heat map data for assessment visualization."""
    
    service = AssessmentService(db)
    
    try:
        # Get compliance data
        compliance_data = await service.get_assessment_compliance(assessment_id)
        
        # Get assessment details
        assessment = await service.get_assessment(assessment_id)
        
        # Prepare heat map data
        heatmap_data = {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            
            # 1. Compliance Risk Matrix (Measures x Submeasures)
            "compliance_matrix": {
                "rows": [],  # Measure codes
                "columns": [],  # Submeasure numbers
                "data": []  # 2D array of scores
            },
            
            # 2. Control Implementation Heat Map
            "control_heatmap": {
                "categories": [],  # Categories for grouping
                "data": []  # Score data
            }
        }
        
        # Build compliance matrix data
        matrix_data = []
        submeasure_columns = set()
        
        for measure in compliance_data.get("measures", []):
            measure_row = {
                "measure_code": f"M{measure['measure_code']}",
                "scores": {}
            }
            
            for idx, submeasure in enumerate(measure.get("submeasures", [])):
                # Get submeasure code from the compliance data
                submeasure_code = submeasure.get("submeasure_code", "")
                if not submeasure_code:
                    # Fallback to constructing from measure code and index
                    submeasure_code = f"{measure['measure_code']}.{idx + 1}"
                
                submeasure_columns.add(submeasure_code)
                
                # For compliance matrix, we need to check if submeasure passes compliance
                # Use passes_overall field or calculate from compliance
                if submeasure.get("passes_overall") is not None:
                    # Convert boolean to percentage (100 for pass, 0 for fail)
                    compliance_pct = 100 if submeasure.get("passes_overall") else 0
                else:
                    # Fallback to using overall_score if available
                    score = submeasure.get("overall_score", 0) or 0
                    # Convert 1-5 score to 0-100 percentage
                    compliance_pct = (score / 5.0) * 100 if score else 0
                    
                measure_row["scores"][submeasure_code] = compliance_pct
            
            matrix_data.append(measure_row)
        
        # Sort submeasure columns
        sorted_columns = sorted(list(submeasure_columns))
        
        # Build matrix rows
        heatmap_data["compliance_matrix"]["rows"] = [m["measure_code"] for m in matrix_data]
        heatmap_data["compliance_matrix"]["columns"] = sorted_columns
        
        # Build matrix data (2D array)
        matrix_2d = []
        for measure_row in matrix_data:
            row_values = []
            for col in sorted_columns:
                score = measure_row["scores"].get(col, None)
                row_values.append(score)
            matrix_2d.append(row_values)
        
        heatmap_data["compliance_matrix"]["data"] = matrix_2d
        
        # 2. Control Implementation Heat Map
        # Get control data from questionnaire which includes scores
        questionnaire = await service.get_questionnaire(assessment_id)
        control_data = []
        
        for measure in questionnaire.measures:
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    # Check if control has been answered
                    if control.documentation_score is not None and control.implementation_score is not None:
                        gap = abs((control.documentation_score or 0) - (control.implementation_score or 0))
                        if gap >= 2:  # Only include controls with significant gaps (2 or more)
                            control_data.append({
                                "control_id": control.id,
                                "control_code": control.code,
                                "measure_code": measure.code,
                                "submeasure_number": submeasure.number,
                                "documentation_score": control.documentation_score,
                                "implementation_score": control.implementation_score,
                                "gap": gap
                            })
        
        # Sort by gap (largest gaps first)
        control_data.sort(key=lambda x: x["gap"], reverse=True)
        
        # Take all controls with gaps (no limit)
        top_gaps = control_data
        
        heatmap_data["control_heatmap"] = {
            "controls": [
                {
                    "label": f"{c['control_code']}",  # Use just the control code for cleaner labels
                    "documentation": c["documentation_score"],
                    "implementation": c["implementation_score"],
                    "gap": c["gap"]
                }
                for c in top_gaps
            ]
        }
        
        # 3. Summary statistics for color scales
        # Count total controls from questionnaire
        total_control_count = sum(
            len(submeasure.controls) 
            for measure in questionnaire.measures 
            for submeasure in measure.submeasures
        )
        
        heatmap_data["statistics"] = {
            "min_score": 0,
            "max_score": 100,
            "avg_compliance": compliance_data.get("overall", {}).get("compliance_percentage", 0),
            "total_controls": total_control_count,
            "controls_with_gaps": len(control_data)  # control_data only contains controls with gaps
        }
        
        return heatmap_data
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get heat map data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/submeasure-compliance-spider",
    summary="Get submeasure compliance spider data",
    description="Get submeasure-level compliance data formatted for spider chart visualization.",
)
async def get_submeasure_compliance_spider(
    assessment_id: UUID,
    locale: str = "en",
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get submeasure compliance data for detailed spider visualization."""
    
    service = AssessmentService(db)
    
    try:
        # Get compliance data
        compliance_data = await service.get_assessment_compliance(assessment_id)
        
        # Get assessment details
        assessment = await service.get_assessment(assessment_id)
        
        # Define translations
        translations = {
            "en": {
                "current_compliance": "Current Compliance",
                "minimum_required": "Minimum Required"
            },
            "hr": {
                "current_compliance": "Trenutna usklađenost",
                "minimum_required": "Minimalno potrebno"
            }
        }
        
        # Get translations for current locale
        t = translations.get(locale, translations["en"])
        
        # Prepare submeasure spider data
        spider_data = {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            "labels": [],  # Submeasure codes
            "datasets": [
                {
                    "label": t["current_compliance"],
                    "data": [],  # Compliance percentages (0-5 scale)
                    "borderColor": "#3b82f6",
                    "backgroundColor": "rgba(59, 130, 246, 0.2)",
                },
                {
                    "label": t["minimum_required"],
                    "data": [],  # Minimum required scores (constant 3.0 for mandatory)
                    "borderColor": "#ef4444",
                    "backgroundColor": "rgba(239, 68, 68, 0.1)",
                    "borderDash": [5, 5],
                }
            ]
        }
        
        # Process submeasure data
        for measure in compliance_data.get("measures", []):
            for submeasure in measure.get("submeasures", []):
                # Create submeasure label
                submeasure_code = submeasure.get("submeasure_code", "")
                if not submeasure_code:
                    submeasure_code = f"{measure['measure_code']}.{submeasure.get('submeasure_number', '')}"
                
                spider_data["labels"].append(submeasure_code)
                
                # Calculate compliance score (0-5 scale)
                # Use overall_score if available, otherwise calculate from compliance percentage
                if submeasure.get("overall_score") is not None:
                    compliance_score = float(submeasure["overall_score"])
                else:
                    # Convert compliance percentage to 0-5 scale
                    compliance_pct = float(submeasure.get("compliance_percentage", 0))
                    compliance_score = (compliance_pct / 100) * 5
                
                spider_data["datasets"][0]["data"].append(compliance_score)
                
                # Set minimum required (3.0 for mandatory submeasures, 2.0 for voluntary)
                is_mandatory = submeasure.get("is_mandatory", False)
                min_required = 3.0 if is_mandatory else 2.0
                spider_data["datasets"][1]["data"].append(min_required)
        
        return spider_data
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get submeasure compliance spider data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/security-categories-spider",
    summary="Get security categories spider data",
    description="Get assessment data grouped by security categories for spider chart visualization.",
)
async def get_security_categories_spider(
    assessment_id: UUID,
    locale: str = "en",
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get security categories performance data for spider visualization."""
    
    service = AssessmentService(db)
    
    try:
        # Get questionnaire with all control data
        questionnaire = await service.get_questionnaire(assessment_id)
        
        # Get assessment details
        assessment = await service.get_assessment(assessment_id)
        
        # Define security categories based on measure areas with translations
        category_mappings = {
            "en": {
                "1": "Governance & Policy",
                "2": "Access Control",
                "3": "Asset Management",
                "4": "Physical Security",
                "5": "Operations Security",
                "6": "Network Security",
                "7": "System Security",
                "8": "Application Security",
                "9": "Data Protection",
                "10": "Incident Response",
                "11": "Continuity Planning",
                "12": "Compliance & Audit",
                "13": "Supply Chain",
            },
            "hr": {
                "1": "Upravljanje i politike",
                "2": "Kontrola pristupa",
                "3": "Upravljanje imovinom",
                "4": "Fizička sigurnost",
                "5": "Operacijska sigurnost",
                "6": "Mrežna sigurnost",
                "7": "Sigurnost sustava",
                "8": "Sigurnost aplikacija",
                "9": "Zaštita podataka",
                "10": "Odgovor na incidente",
                "11": "Planiranje kontinuiteta",
                "12": "Usklađenost i revizija",
                "13": "Lanac opskrbe",
            }
        }
        
        # Get category mapping for current locale
        category_mapping = category_mappings.get(locale, category_mappings["en"])
        
        # Initialize category data
        category_scores = {}
        for category in category_mapping.values():
            category_scores[category] = {
                "documentation_total": 0,
                "documentation_count": 0,
                "implementation_total": 0,
                "implementation_count": 0,
                "mandatory_met": 0,
                "mandatory_total": 0,
            }
        
        # Process all controls and aggregate by category
        for measure in questionnaire.measures:
            category = category_mapping.get(measure.code, "Other")
            
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    if control.documentation_score is not None:
                        category_scores[category]["documentation_total"] += control.documentation_score
                        category_scores[category]["documentation_count"] += 1
                    
                    if control.implementation_score is not None:
                        category_scores[category]["implementation_total"] += control.implementation_score
                        category_scores[category]["implementation_count"] += 1
                    
                    # Track mandatory control compliance
                    if control.is_mandatory:
                        category_scores[category]["mandatory_total"] += 1
                        if (control.documentation_score or 0) >= 3 and (control.implementation_score or 0) >= 3:
                            category_scores[category]["mandatory_met"] += 1
        
        # Define translations for labels
        translations = {
            "en": {
                "documentation": "Documentation",
                "implementation": "Implementation",
                "mandatory_compliance": "Mandatory Compliance"
            },
            "hr": {
                "documentation": "Dokumentacija",
                "implementation": "Implementacija",
                "mandatory_compliance": "Obvezna usklađenost"
            }
        }
        
        # Get translations for current locale
        t = translations.get(locale, translations["en"])
        
        # Prepare spider data
        spider_data = {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            "labels": [],  # Category names
            "datasets": [
                {
                    "label": t["documentation"],
                    "data": [],  # Average documentation scores
                    "borderColor": "#3b82f6",
                    "backgroundColor": "rgba(59, 130, 246, 0.2)",
                },
                {
                    "label": t["implementation"],
                    "data": [],  # Average implementation scores
                    "borderColor": "#10b981",
                    "backgroundColor": "rgba(16, 185, 129, 0.2)",
                },
                {
                    "label": t["mandatory_compliance"],
                    "data": [],  # Mandatory compliance percentage (0-5 scale)
                    "borderColor": "#f59e0b",
                    "backgroundColor": "rgba(245, 158, 11, 0.1)",
                }
            ]
        }
        
        # Calculate averages for each category
        for category, scores in category_scores.items():
            # Skip categories with no data
            if scores["documentation_count"] == 0 and scores["implementation_count"] == 0:
                continue
            
            spider_data["labels"].append(category)
            
            # Documentation average
            doc_avg = (scores["documentation_total"] / scores["documentation_count"]) if scores["documentation_count"] > 0 else 0
            spider_data["datasets"][0]["data"].append(doc_avg)
            
            # Implementation average
            impl_avg = (scores["implementation_total"] / scores["implementation_count"]) if scores["implementation_count"] > 0 else 0
            spider_data["datasets"][1]["data"].append(impl_avg)
            
            # Mandatory compliance (convert percentage to 0-5 scale)
            mandatory_pct = (scores["mandatory_met"] / scores["mandatory_total"] * 100) if scores["mandatory_total"] > 0 else 0
            mandatory_score = (mandatory_pct / 100) * 5
            spider_data["datasets"][2]["data"].append(mandatory_score)
        
        return spider_data
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get security categories spider data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/progress-timeline",
    summary="Get progress timeline heatmap data",
    description="Get assessment progress over time for timeline visualization.",
)
async def get_progress_timeline(
    assessment_id: UUID,
    locale: str = "en",
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get progress timeline data for heatmap visualization."""
    
    service = AssessmentService(db)
    
    try:
        # Get assessment with answers
        assessment = await service.get_assessment(assessment_id)
        questionnaire = await service.get_questionnaire(assessment_id)
        
        # Get activity history (last 30 days)
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        # Translations
        translations = {
            "en": {
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                "no_activity": "No activity",
                "low_activity": "Low activity",
                "medium_activity": "Medium activity",
                "high_activity": "High activity"
            },
            "hr": {
                "days": ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"],
                "no_activity": "Bez aktivnosti",
                "low_activity": "Niska aktivnost",
                "medium_activity": "Srednja aktivnost",
                "high_activity": "Visoka aktivnost"
            }
        }
        
        t = translations.get(locale, translations["en"])
        
        # Create timeline data structure
        timeline_data = {
            "assessment_id": str(assessment_id),
            "timeline_matrix": {
                "rows": [],  # Weeks
                "columns": t["days"],  # Days of week
                "data": []  # Activity intensity per day
            },
            "measure_progress": {
                "labels": [],  # Measure codes
                "start_dates": [],  # When first control was answered
                "completion_dates": [],  # When all controls were answered
                "duration_days": []  # How long it took
            },
            "activity_summary": {
                "total_days_active": 0,
                "average_controls_per_day": 0,
                "most_active_day": "",
                "least_active_day": ""
            }
        }
        
        # Analyze answer timestamps to build activity map
        activity_by_date = defaultdict(int)
        measure_activity = defaultdict(lambda: {"first": None, "last": None, "count": 0})
        
        for measure in questionnaire.measures:
            measure_code = f"M{measure.code}"
            
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    # Check if control has been answered
                    if control.answered_at:
                        date = control.answered_at.date()
                        activity_by_date[date] += 1
                        
                        # Track measure activity
                        if measure_activity[measure_code]["first"] is None or date < measure_activity[measure_code]["first"]:
                            measure_activity[measure_code]["first"] = date
                        if measure_activity[measure_code]["last"] is None or date > measure_activity[measure_code]["last"]:
                            measure_activity[measure_code]["last"] = date
                        measure_activity[measure_code]["count"] += 1
        
        # Build weekly timeline matrix (last 4 weeks)
        today = datetime.now().date()
        start_date = today - timedelta(days=28)
        
        weekly_data = []
        for week in range(4):
            week_start = start_date + timedelta(weeks=week)
            week_label = f"Week {week + 1}"
            week_data = []
            
            for day in range(7):
                current_date = week_start + timedelta(days=day)
                activity_count = activity_by_date.get(current_date, 0)
                
                # Normalize to 0-100 scale
                if activity_count == 0:
                    intensity = 0
                elif activity_count <= 5:
                    intensity = 25
                elif activity_count <= 10:
                    intensity = 50
                elif activity_count <= 20:
                    intensity = 75
                else:
                    intensity = 100
                
                week_data.append(intensity)
            
            timeline_data["timeline_matrix"]["rows"].append(week_label)
            weekly_data.append(week_data)
        
        timeline_data["timeline_matrix"]["data"] = weekly_data
        
        # Build measure progress data
        for measure_code, activity in sorted(measure_activity.items()):
            timeline_data["measure_progress"]["labels"].append(measure_code)
            
            if activity["first"]:
                timeline_data["measure_progress"]["start_dates"].append(activity["first"].isoformat())
                if activity["last"]:
                    duration = (activity["last"] - activity["first"]).days
                    timeline_data["measure_progress"]["completion_dates"].append(activity["last"].isoformat())
                    timeline_data["measure_progress"]["duration_days"].append(duration)
                else:
                    timeline_data["measure_progress"]["completion_dates"].append(None)
                    timeline_data["measure_progress"]["duration_days"].append(None)
            else:
                timeline_data["measure_progress"]["start_dates"].append(None)
                timeline_data["measure_progress"]["completion_dates"].append(None)
                timeline_data["measure_progress"]["duration_days"].append(None)
        
        # Calculate summary statistics
        if activity_by_date:
            timeline_data["activity_summary"]["total_days_active"] = len(activity_by_date)
            total_controls = sum(activity_by_date.values())
            timeline_data["activity_summary"]["average_controls_per_day"] = round(
                total_controls / len(activity_by_date), 1
            )
            
            # Find most and least active days
            sorted_days = sorted(activity_by_date.items(), key=lambda x: x[1])
            if sorted_days:
                timeline_data["activity_summary"]["least_active_day"] = sorted_days[0][0].isoformat()
                timeline_data["activity_summary"]["most_active_day"] = sorted_days[-1][0].isoformat()
        
        return timeline_data
        
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get progress timeline data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/risk-priority-matrix",
    summary="Get risk priority matrix data",
    description="Get control risk prioritization data for matrix visualization.",
)
async def get_risk_priority_matrix(
    assessment_id: UUID,
    locale: str = "en",
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get risk priority matrix data for strategic planning."""
    
    service = AssessmentService(db)
    
    try:
        # Get questionnaire with all control data
        questionnaire = await service.get_questionnaire(assessment_id)
        assessment = await service.get_assessment(assessment_id)
        
        # Translations
        translations = {
            "en": {
                "low_effort": "Low Effort",
                "medium_effort": "Medium Effort",
                "high_effort": "High Effort",
                "low_risk": "Low Risk",
                "medium_risk": "Medium Risk",
                "high_risk": "High Risk",
                "quick_wins": "Quick Wins",
                "major_projects": "Major Projects",
                "fill_ins": "Fill-ins",
                "thankless_tasks": "Thankless Tasks"
            },
            "hr": {
                "low_effort": "Nizak napor",
                "medium_effort": "Srednji napor", 
                "high_effort": "Visok napor",
                "low_risk": "Nizak rizik",
                "medium_risk": "Srednji rizik",
                "high_risk": "Visok rizik",
                "quick_wins": "Brze pobjede",
                "major_projects": "Veliki projekti",
                "fill_ins": "Dopune",
                "thankless_tasks": "Nezahvalni zadaci"
            }
        }
        
        t = translations.get(locale, translations["en"])
        
        # Prepare risk priority matrix
        matrix_data = {
            "assessment_id": str(assessment_id),
            "security_level": assessment.security_level,
            "matrix": {
                "x_axis": "Implementation Effort",  # Based on current implementation score
                "y_axis": "Risk/Criticality",  # Based on mandatory status and security level
                "quadrants": {
                    "quick_wins": {  # High Risk, Low Effort
                        "label": t["quick_wins"],
                        "controls": []
                    },
                    "major_projects": {  # High Risk, High Effort
                        "label": t["major_projects"],
                        "controls": []
                    },
                    "fill_ins": {  # Low Risk, Low Effort
                        "label": t["fill_ins"],
                        "controls": []
                    },
                    "thankless_tasks": {  # Low Risk, High Effort
                        "label": t["thankless_tasks"],
                        "controls": []
                    }
                }
            },
            "scatter_data": []  # For scatter plot visualization
        }
        
        # Analyze each control
        for measure in questionnaire.measures:
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    # Skip controls that are already compliant
                    if (control.documentation_score or 0) >= 3 and (control.implementation_score or 0) >= 3:
                        continue
                    
                    # Calculate effort score (0-100)
                    # More nuanced calculation based on current state
                    current_impl = control.implementation_score or 0
                    current_doc = control.documentation_score or 0
                    
                    # Base effort on how much work is needed to reach compliance (3)
                    gap_to_compliance = max(0, 3 - current_impl)
                    
                    # Effort calculation:
                    # 0->3: 100% effort
                    # 1->3: 66% effort  
                    # 2->3: 33% effort
                    # 3+: 0% effort
                    effort_base = gap_to_compliance * 33
                    
                    # Add effort if documentation is also poor
                    if current_doc < 3:
                        effort_base += 10
                    
                    # Add effort for doc-impl gap (coordination needed)
                    doc_impl_gap = abs(current_doc - current_impl)
                    if doc_impl_gap >= 2:
                        effort_base += 15
                    
                    effort_score = min(effort_base, 100)
                    
                    # Calculate risk/criticality score (0-100)
                    # More balanced approach
                    risk_score = 0
                    
                    # Base risk from mandatory status
                    if control.is_mandatory:
                        # Mandatory controls are always higher risk
                        risk_score = 55
                        
                        # Add risk based on how far from compliance
                        if current_impl == 0:
                            risk_score += 30  # Critical
                        elif current_impl == 1:
                            risk_score += 20  # High
                        elif current_impl == 2:
                            risk_score += 10  # Moderate
                    else:
                        # Voluntary controls have variable risk
                        # Based on security level and current state
                        if assessment.security_level == "napredna":
                            risk_score = 35  # Higher baseline for advanced
                        elif assessment.security_level == "srednja":
                            risk_score = 25  # Medium baseline
                        else:
                            risk_score = 15  # Lower baseline for basic
                        
                        # Add risk if severely underperforming
                        if current_impl == 0:
                            risk_score += 20
                        elif current_impl == 1:
                            risk_score += 10
                    
                    # Bonus risk for large gaps (indicates problems)
                    if doc_impl_gap >= 3:
                        risk_score += 10
                    
                    # Cap at 100
                    risk_score = min(risk_score, 100)
                    
                    # Create control entry
                    control_entry = {
                        "control_id": str(control.id),
                        "control_code": control.code,
                        "measure": f"M{measure.code}",
                        "is_mandatory": control.is_mandatory,
                        "documentation_score": control.documentation_score,
                        "implementation_score": control.implementation_score,
                        "effort_score": effort_score,
                        "risk_score": risk_score
                    }
                    
                    # Add to scatter data
                    matrix_data["scatter_data"].append({
                        "x": effort_score,
                        "y": risk_score,
                        "label": control.code,
                        "color": "#ef4444" if control.is_mandatory else "#3b82f6"
                    })
                    
                    # Categorize into quadrants
                    if risk_score >= 50 and effort_score < 50:
                        matrix_data["matrix"]["quadrants"]["quick_wins"]["controls"].append(control_entry)
                    elif risk_score >= 50 and effort_score >= 50:
                        matrix_data["matrix"]["quadrants"]["major_projects"]["controls"].append(control_entry)
                    elif risk_score < 50 and effort_score < 50:
                        matrix_data["matrix"]["quadrants"]["fill_ins"]["controls"].append(control_entry)
                    else:
                        matrix_data["matrix"]["quadrants"]["thankless_tasks"]["controls"].append(control_entry)
        
        # Add summary statistics
        matrix_data["summary"] = {
            "total_controls_needing_work": len(matrix_data["scatter_data"]),
            "quick_wins_count": len(matrix_data["matrix"]["quadrants"]["quick_wins"]["controls"]),
            "major_projects_count": len(matrix_data["matrix"]["quadrants"]["major_projects"]["controls"]),
            "fill_ins_count": len(matrix_data["matrix"]["quadrants"]["fill_ins"]["controls"]),
            "thankless_tasks_count": len(matrix_data["matrix"]["quadrants"]["thankless_tasks"]["controls"])
        }
        
        return matrix_data
        
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get risk priority matrix data: {str(e)}",
        )


@router.post(
    "/{assessment_id}/validate-submission",
    summary="Validate assessment for submission",
    description="Validate assessment readiness for submission with detailed compliance checks.",
)
async def validate_assessment_submission(
    assessment_id: UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Validate assessment readiness for submission."""
    
    service = AssessmentService(db)
    
    try:
        validation_result = await service.validate_assessment_submission(assessment_id)
        return validation_result
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate assessment",
        )


@router.post(
    "/{assessment_id}/recalculate",
    summary="Recalculate compliance scores",
    description="Force recalculation of all compliance scores for an assessment.",
)
async def recalculate_compliance(
    assessment_id: UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Force recalculation of compliance scores."""
    
    service = AssessmentService(db)
    
    try:
        # Use the compliance scoring service to recalculate
        from app.services.compliance_scoring import ComplianceScoringService
        scoring_service = ComplianceScoringService(db)
        
        # Calculate and store compliance results
        compliance_result = await scoring_service.calculate_overall_compliance(assessment_id)
        await scoring_service.store_compliance_results(compliance_result)
        
        # Get updated compliance data
        compliance_data = await service.get_assessment_compliance(assessment_id)
        
        return {
            "assessment_id": str(assessment_id),
            "status": "recalculated",
            "timestamp": datetime.utcnow().isoformat(),
            "compliance": compliance_data,
        }
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recalculate compliance: {str(e)}",
        )


@router.put(
    "/{assessment_id}",
    response_model=AssessmentResponse,
    summary="Update assessment details",
    description="Update assessment metadata like title, description, due date, etc.",
)
async def update_assessment(
    assessment_id: UUID,
    request_data: UpdateAssessmentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentResponse:
    """Update assessment details."""
    service = AssessmentService(db)
    
    try:
        # Update assessment
        assessment = await service.update_assessment(
            assessment_id=assessment_id,
            request=request_data,
            user_id=current_user.id,
        )
        
        return AssessmentResponse(
            id=str(assessment.id),
            title=assessment.title,
            description=assessment.description,
            organization_id=str(assessment.organization_id),
            security_level=assessment.security_level,
            status=assessment.status,
            created_at=assessment.created_at.isoformat() if assessment.created_at else None,
            updated_at=assessment.updated_at.isoformat() if assessment.updated_at else None,
            created_by=str(assessment.created_by) if assessment.created_by else None,
            assigned_to=assessment.assigned_to,
            due_date=assessment.due_date.isoformat() if assessment.due_date else None,
            completed_at=assessment.completed_at.isoformat() if assessment.completed_at else None,
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update assessment: {str(e)}",
        )


@router.put(
    "/{assessment_id}/status",
    response_model=StatusTransitionResponse,
    summary="Transition assessment status",
    description="Transition assessment to a new status with validation.",
)
async def transition_assessment_status(
    assessment_id: UUID,
    request_data: TransitionStatusRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> StatusTransitionResponse:
    """Transition assessment status with validation."""
    service = AssessmentService(db)
    ip_address, user_agent = get_client_info(request)
    
    try:
        # Update status
        assessment = await service.update_status(
            assessment_id=assessment_id,
            new_status=request_data.new_status,
            user_id=current_user.id,
            reason=request_data.reason,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return StatusTransitionResponse(
            success=True,
            assessment_id=str(assessment.id),
            old_status=request_data.current_status or "review",
            new_status=assessment.status,
            updated_at=datetime.utcnow().isoformat(),
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to transition status: {str(e)}",
        )


@router.delete(
    "/{assessment_id}",
    response_model=OperationResponse,
    summary="Archive assessment",
    description="Soft delete (archive) an assessment.",
)
async def delete_assessment(
    assessment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> OperationResponse:
    """Soft delete (archive) an assessment."""
    service = AssessmentService(db)
    
    try:
        # Archive assessment
        await service.delete_assessment(
            assessment_id=assessment_id,
            user_id=current_user.id,
        )
        
        return OperationResponse(
            success=True,
            message=f"Assessment {assessment_id} archived successfully",
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to archive assessment: {str(e)}",
        )


@router.post(
    "/{assessment_id}/submit",
    response_model=StatusTransitionResponse,
    summary="Submit assessment for review",
    description="Submit assessment for final review after validation.",
)
async def submit_assessment(
    assessment_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> StatusTransitionResponse:
    """Submit assessment for review."""
    service = AssessmentService(db)
    ip_address, user_agent = get_client_info(request)
    
    try:
        # First validate
        validation = await service.validate_assessment_submission(assessment_id)
        
        if not validation["can_submit"]:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Assessment cannot be submitted",
                    "validation_errors": validation.get("errors", []),
                    "validation_warnings": validation.get("warnings", []),
                },
            )
        
        # Update compliance status
        compliance_status = validation["compliance_summary"]["compliance_status"]
        await service.assessment_repository.update(
            assessment_id,
            compliance_status=compliance_status,
            compliance_percentage=validation["compliance_summary"]["compliance_percentage"],
        )
        
        # Transition to review status
        assessment = await service.update_status(
            assessment_id=assessment_id,
            new_status="review",
            user_id=current_user.id,
            reason=f"Submitted for review (Compliance: {compliance_status})",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return StatusTransitionResponse(
            success=True,
            assessment_id=str(assessment.id),
            old_status="in_progress",
            new_status="review",
            updated_at=datetime.utcnow().isoformat(),
            compliance_status=compliance_status,
            compliance_percentage=validation["compliance_summary"]["compliance_percentage"],
        )
        
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit assessment: {str(e)}",
        )


@router.get(
    "/{assessment_id}/export/pdf",
    summary="Export assessment as PDF",
    description="Generate and download assessment report as PDF.",
    response_class=StreamingResponse,
)
async def export_assessment_pdf(
    assessment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    """Export assessment as PDF report."""
    service = AssessmentService(db)
    
    try:
        # Get report data
        report_data = await service.get_assessment_report_data(assessment_id)
        
        # Import PDF service
        from app.services.pdf_export_service import PDFExportService
        pdf_service = PDFExportService()
        
        # Generate PDF
        pdf_bytes = await pdf_service.generate_assessment_pdf(report_data)
        
        # Return as streaming response
        from io import BytesIO
        pdf_stream = BytesIO(pdf_bytes)
        
        filename = f"assessment_{assessment_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(pdf_bytes)),
            },
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export PDF: {str(e)}",
        )


@router.get(
    "/{assessment_id}/control-priority-bar",
    summary="Get control implementation by priority",
    description="Get control implementation levels grouped by mandatory vs voluntary for bar chart.",
)
async def get_control_priority_bar_chart(
    assessment_id: UUID,
    locale: str = Query(default="hr", description="Locale for translations (hr or en)"),
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get control implementation data grouped by priority."""
    
    service = AssessmentService(db)
    
    # Translation dictionary
    translations = {
        "hr": {
            "mandatory": "Obavezne kontrole",
            "voluntary": "Dobrovoljne kontrole",
            "documentation": "Dokumentacija",
            "implementation": "Implementacija",
            "average_score": "Prosječna ocjena",
            "count": "Broj kontrola",
            "title": "Implementacija po prioritetu",
            "description": "Usporedba implementacije obaveznih i dobrovoljnih kontrola"
        },
        "en": {
            "mandatory": "Mandatory Controls",
            "voluntary": "Voluntary Controls",
            "documentation": "Documentation",
            "implementation": "Implementation",
            "average_score": "Average Score",
            "count": "Control Count",
            "title": "Implementation by Priority",
            "description": "Comparison of mandatory vs voluntary control implementation"
        }
    }
    
    t = translations.get(locale, translations["hr"])
    
    try:
        # Get assessment and questionnaire
        assessment = await service.get_assessment(assessment_id)
        if not assessment:
            raise ValidationError(f"Assessment {assessment_id} not found")
        
        questionnaire = await service.get_questionnaire(assessment_id)
        if not questionnaire:
            raise ValidationError("No questionnaire data found")
        
        # Initialize statistics
        mandatory_stats = {
            "documentation_sum": 0,
            "implementation_sum": 0,
            "count": 0,
            "by_score": {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        }
        
        voluntary_stats = {
            "documentation_sum": 0,
            "implementation_sum": 0,
            "count": 0,
            "by_score": {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        }
        
        # Analyze controls
        for measure in questionnaire.measures:
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    doc_score = control.documentation_score or 0
                    impl_score = control.implementation_score or 0
                    
                    if control.is_mandatory:
                        mandatory_stats["documentation_sum"] += doc_score
                        mandatory_stats["implementation_sum"] += impl_score
                        mandatory_stats["count"] += 1
                        mandatory_stats["by_score"][impl_score] += 1
                    else:
                        voluntary_stats["documentation_sum"] += doc_score
                        voluntary_stats["implementation_sum"] += impl_score
                        voluntary_stats["count"] += 1
                        voluntary_stats["by_score"][impl_score] += 1
        
        # Calculate averages
        mandatory_doc_avg = (mandatory_stats["documentation_sum"] / mandatory_stats["count"]) if mandatory_stats["count"] > 0 else 0
        mandatory_impl_avg = (mandatory_stats["implementation_sum"] / mandatory_stats["count"]) if mandatory_stats["count"] > 0 else 0
        
        voluntary_doc_avg = (voluntary_stats["documentation_sum"] / voluntary_stats["count"]) if voluntary_stats["count"] > 0 else 0
        voluntary_impl_avg = (voluntary_stats["implementation_sum"] / voluntary_stats["count"]) if voluntary_stats["count"] > 0 else 0
        
        return {
            "assessment_id": str(assessment_id),
            "title": t["title"],
            "description": t["description"],
            "data": {
                "labels": [t["mandatory"], t["voluntary"]],
                "datasets": [
                    {
                        "label": t["documentation"],
                        "data": [round(mandatory_doc_avg, 2), round(voluntary_doc_avg, 2)],
                        "backgroundColor": "rgba(59, 130, 246, 0.8)",
                        "borderColor": "rgb(59, 130, 246)",
                        "borderWidth": 1
                    },
                    {
                        "label": t["implementation"],
                        "data": [round(mandatory_impl_avg, 2), round(voluntary_impl_avg, 2)],
                        "backgroundColor": "rgba(34, 197, 94, 0.8)",
                        "borderColor": "rgb(34, 197, 94)",
                        "borderWidth": 1
                    }
                ]
            },
            "statistics": {
                "mandatory": {
                    "count": mandatory_stats["count"],
                    "documentation_average": round(mandatory_doc_avg, 2),
                    "implementation_average": round(mandatory_impl_avg, 2),
                    "score_distribution": mandatory_stats["by_score"]
                },
                "voluntary": {
                    "count": voluntary_stats["count"],
                    "documentation_average": round(voluntary_doc_avg, 2),
                    "implementation_average": round(voluntary_impl_avg, 2),
                    "score_distribution": voluntary_stats["by_score"]
                }
            }
        }
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate bar chart data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/top-bottom-controls-bar",
    summary="Get top and bottom performing controls",
    description="Get the best and worst performing controls for bar chart visualization.",
)
async def get_top_bottom_controls_bar_chart(
    assessment_id: UUID,
    top_n: int = Query(default=5, description="Number of top/bottom controls to return"),
    locale: str = Query(default="hr", description="Locale for translations (hr or en)"),
    db: AsyncSession = Depends(get_async_session),
) -> Dict:
    """Get top and bottom performing controls."""
    
    service = AssessmentService(db)
    
    # Translation dictionary
    translations = {
        "hr": {
            "title": "Najbolje i najslabije kontrole",
            "description": "Pregled kontrola s najboljim i najslabijim performansama",
            "top_controls": "Top kontrole",
            "bottom_controls": "Najslabije kontrole",
            "mandatory": "Obavezna",
            "voluntary": "Dobrovoljna",
            "score": "Ukupna ocjena"
        },
        "en": {
            "title": "Top and Bottom Performing Controls",
            "description": "Overview of best and worst performing controls",
            "top_controls": "Top Controls",
            "bottom_controls": "Bottom Controls",
            "mandatory": "Mandatory",
            "voluntary": "Voluntary",
            "score": "Total Score"
        }
    }
    
    t = translations.get(locale, translations["hr"])
    
    try:
        # Get assessment and questionnaire
        assessment = await service.get_assessment(assessment_id)
        if not assessment:
            raise ValidationError(f"Assessment {assessment_id} not found")
        
        questionnaire = await service.get_questionnaire(assessment_id)
        if not questionnaire:
            raise ValidationError("No questionnaire data found")
        
        # Collect all controls with scores
        control_scores = []
        
        for measure in questionnaire.measures:
            for submeasure in measure.submeasures:
                for control in submeasure.controls:
                    doc_score = control.documentation_score or 0
                    impl_score = control.implementation_score or 0
                    total_score = (doc_score + impl_score) / 2
                    
                    control_name = control.name_hr if hasattr(control, 'name_hr') else control.name
                    control_scores.append({
                        "control_id": str(control.id),
                        "control_code": control.code,
                        "control_name": control_name[:50] + "..." if len(control_name) > 50 else control_name,
                        "measure_code": measure.code,
                        "submeasure_code": submeasure.code,
                        "is_mandatory": control.is_mandatory,
                        "documentation_score": doc_score,
                        "implementation_score": impl_score,
                        "total_score": total_score
                    })
        
        # Sort by total score
        control_scores.sort(key=lambda x: x["total_score"], reverse=True)
        
        # Get top and bottom N controls
        top_controls = control_scores[:top_n]
        bottom_controls = control_scores[-top_n:] if len(control_scores) >= top_n else control_scores
        bottom_controls.reverse()  # Worst first
        
        # Prepare bar chart data
        all_controls = bottom_controls + top_controls
        labels = [f"{c['control_code']}" for c in all_controls]
        doc_scores = [c['documentation_score'] for c in all_controls]
        impl_scores = [c['implementation_score'] for c in all_controls]
        
        # Add colors based on mandatory status
        background_colors = []
        border_colors = []
        for c in all_controls:
            if c['is_mandatory']:
                background_colors.append("rgba(239, 68, 68, 0.8)")  # Red for mandatory
                border_colors.append("rgb(239, 68, 68)")
            else:
                background_colors.append("rgba(59, 130, 246, 0.8)")  # Blue for voluntary
                border_colors.append("rgb(59, 130, 246)")
        
        return {
            "assessment_id": str(assessment_id),
            "title": t["title"],
            "description": t["description"],
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": "Dokumentacija",
                        "data": doc_scores,
                        "backgroundColor": "rgba(59, 130, 246, 0.6)",
                        "borderColor": "rgb(59, 130, 246)",
                        "borderWidth": 1
                    },
                    {
                        "label": "Implementacija",
                        "data": impl_scores,
                        "backgroundColor": "rgba(34, 197, 94, 0.6)",
                        "borderColor": "rgb(34, 197, 94)",
                        "borderWidth": 1
                    }
                ]
            },
            "details": {
                "top_controls": [
                    {
                        "rank": i + 1,
                        "control_code": c["control_code"],
                        "control_name": c["control_name"],
                        "is_mandatory": c["is_mandatory"],
                        "priority": t["mandatory"] if c["is_mandatory"] else t["voluntary"],
                        "documentation_score": c["documentation_score"],
                        "implementation_score": c["implementation_score"],
                        "total_score": round(c["total_score"], 2)
                    }
                    for i, c in enumerate(top_controls)
                ],
                "bottom_controls": [
                    {
                        "rank": i + 1,
                        "control_code": c["control_code"],
                        "control_name": c["control_name"],
                        "is_mandatory": c["is_mandatory"],
                        "priority": t["mandatory"] if c["is_mandatory"] else t["voluntary"],
                        "documentation_score": c["documentation_score"],
                        "implementation_score": c["implementation_score"],
                        "total_score": round(c["total_score"], 2)
                    }
                    for i, c in enumerate(bottom_controls)
                ]
            }
        }
        
    except ValidationError as e:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate bar chart data: {str(e)}",
        )


@router.get(
    "/{assessment_id}/insights",
    response_model=AssessmentInsightsResponse,
    summary="Get assessment insights",
    description="Return persisted assessment insights; optionally refresh if stale.",
)
async def get_assessment_insights(
    assessment_id: UUID,
    refresh_if_stale: bool = Query(False, description="Refresh insights if status is stale or error"),
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentInsightsResponse:
    service = AssessmentInsightsService(db)
    try:
        record = await service.get(assessment_id)
        if record is None or (refresh_if_stale and record.get("status") in {"stale", "error"}):
            record = await service.compute_and_persist(assessment_id, force=record is None)
        # Coerce to response schema
        return AssessmentInsightsResponse(
            assessment_id=UUID(record["assessment_id"]) if isinstance(record["assessment_id"], str) else record["assessment_id"],
            computed_at=datetime.fromisoformat(record["computed_at"]) if isinstance(record["computed_at"], str) else record["computed_at"],
            gaps=record.get("gaps") or [],
            roadmap=record.get("roadmap") or {},
            ai_summary=record.get("ai_summary"),
            measures_ai=record.get("measures_ai") or {},
            status=record.get("status", "ok"),
            source_version=record.get("source_version", "v1"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get insights: {e}",
        )


@router.post(
    "/{assessment_id}/insights/refresh",
    response_model=AssessmentInsightsResponse,
    summary="Refresh assessment insights",
    description="Force recompute and persist of assessment insights.",
)
async def refresh_assessment_insights(
    assessment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AssessmentInsightsResponse:
    service = AssessmentInsightsService(db)
    try:
        record = await service.refresh(assessment_id)
        return AssessmentInsightsResponse(
            assessment_id=UUID(record["assessment_id"]) if isinstance(record["assessment_id"], str) else record["assessment_id"],
            computed_at=datetime.fromisoformat(record["computed_at"]) if isinstance(record["computed_at"], str) else record["computed_at"],
            gaps=record.get("gaps") or [],
            roadmap=record.get("roadmap") or {},
            ai_summary=record.get("ai_summary"),
            measures_ai=record.get("measures_ai") or {},
            status=record.get("status", "ok"),
            source_version=record.get("source_version", "v1"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh insights: {e}",
        )