"""Pydantic schemas for assessment API endpoints."""

from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field


# Base schemas
class AssessmentAnswerResponse(BaseModel):
    """Assessment answer response schema."""

    id: UUID
    control_id: UUID
    documentation_score: Optional[int] = None
    implementation_score: Optional[int] = None
    comments: Optional[str] = None
    evidence_files: List[str] = Field(default_factory=list)
    confidence_level: Optional[int] = None
    answered_by: Optional[UUID] = None
    answered_at: Optional[datetime] = None
    is_final: bool = False

    model_config = {"from_attributes": True}


class AssessmentResponse(BaseModel):
    """Assessment response schema."""

    id: UUID
    title: str
    description: Optional[str] = None
    organization_id: UUID
    security_level: str
    status: str
    created_by: Optional[UUID] = None
    updated_by: Optional[str] = None  # User name of last person who updated the assessment
    assigned_to: Optional[List[UUID]] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    due_date: Optional[datetime] = None

    # Scoring fields
    compliance_percentage: Optional[float] = None
    total_controls: Optional[int] = None
    answered_controls: Optional[int] = None
    mandatory_controls: Optional[int] = None
    mandatory_answered: Optional[int] = None

    model_config = {"from_attributes": True}


class AssessmentDetailResponse(BaseModel):
    """Detailed assessment response with additional context."""

    assessment: AssessmentResponse
    scores: Dict[str, Any] = Field(default_factory=dict)
    progress: Dict[str, Any] = Field(default_factory=dict)
    validation: Dict[str, Any] = Field(default_factory=dict)
    active_users: int = 0
    statistics: Dict[str, Any] = Field(default_factory=dict)
    valid_transitions: List[str] = Field(default_factory=list)


class AssessmentListResponse(BaseModel):
    """Assessment list response with pagination."""

    assessments: List[AssessmentResponse] = Field(default_factory=list)
    total: int = Field(description="Total number of assessments matching the query")
    limit: int = Field(description="Maximum number of results per page")
    offset: int = Field(description="Number of results skipped")
    has_more: bool = Field(description="Whether there are more results available")


class AssessmentResultResponse(BaseModel):
    """Assessment results response."""

    assessment_id: UUID
    overall_score: Optional[float] = None
    compliance_percentage: Optional[float] = None
    measure_results: List[Dict[str, Any]] = Field(default_factory=list)
    submeasure_results: List[Dict[str, Any]] = Field(default_factory=list)
    calculated_at: datetime
    statistics: Dict[str, Any] = Field(default_factory=dict)


class AssessmentProgressResponse(BaseModel):
    """Assessment progress response."""

    assessment_id: UUID
    completion_percentage: float = 0.0
    mandatory_completion_percentage: float = 0.0
    total_controls: int = 0
    answered_controls: int = 0
    mandatory_controls: int = 0
    mandatory_answered: int = 0
    measure_progress: List[Dict[str, Any]] = Field(default_factory=list)
    updated_at: datetime


class AssessmentValidationResponse(BaseModel):
    """Assessment validation response."""

    assessment_id: UUID
    valid: bool
    can_submit: bool
    missing_mandatory: List[UUID] = Field(default_factory=list)
    low_scores_without_comments: List[UUID] = Field(default_factory=list)
    validation_errors: List[str] = Field(default_factory=list)
    statistics: Dict[str, Any] = Field(default_factory=dict)


class AssessmentActivityResponse(BaseModel):
    """Assessment activity response."""

    assessment_id: UUID
    active_users: List[Dict[str, Any]] = Field(default_factory=list)
    recent_changes: List[Dict[str, Any]] = Field(default_factory=list)
    last_updated: Optional[datetime] = None


# Control response schema for questionnaire
class ControlInQuestionnaireResponse(BaseModel):
    """Control data within questionnaire structure."""
    
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    is_mandatory: bool
    requirement_id: UUID
    security_level: str
    # Minimum score requirement
    minimum_score: Optional[float] = None
    submeasure_id: Optional[UUID] = None
    # Answer data if exists
    documentation_score: Optional[int] = None
    implementation_score: Optional[int] = None
    comments: Optional[str] = None
    evidence_files: List[str] = Field(default_factory=list)
    answered_at: Optional[datetime] = None
    answered_by: Optional[UUID] = None


# Submeasure response schema for questionnaire
class SubmeasureInQuestionnaireResponse(BaseModel):
    """Submeasure data within questionnaire structure."""
    
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    controls: List[ControlInQuestionnaireResponse]
    # Aggregate scoring fields
    total_controls: int = 0
    answered_controls: int = 0
    mandatory_controls: int = 0
    mandatory_answered: int = 0
    documentation_avg: Optional[float] = None
    implementation_avg: Optional[float] = None
    overall_score: Optional[float] = None
    passes_threshold: Optional[bool] = None


# Measure response schema for questionnaire
class MeasureInQuestionnaireResponse(BaseModel):
    """Measure data within questionnaire structure."""
    
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    submeasures: List[SubmeasureInQuestionnaireResponse]
    # Aggregate fields
    total_controls: int = 0
    answered_controls: int = 0
    mandatory_controls: int = 0
    mandatory_answered: int = 0
    overall_score: Optional[float] = None


class QuestionnaireResponse(BaseModel):
    """Questionnaire structure response for assessment."""

    assessment_id: UUID
    security_level: str
    version_id: UUID
    measures: List[MeasureInQuestionnaireResponse]
    statistics: Dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime


# Request schemas
class CreateAssessmentRequest(BaseModel):
    """Create assessment request schema."""

    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    organization_id: UUID
    security_level: str = Field(pattern="^(osnovna|srednja|napredna)$")
    due_date: Optional[datetime] = None
    assigned_to: Optional[List[UUID]] = None


class UpdateAssessmentRequest(BaseModel):
    """Update assessment request schema."""

    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    due_date: Optional[datetime] = None
    assigned_to: Optional[List[UUID]] = None


class UpdateAnswerRequest(BaseModel):
    """Update answer request schema."""

    control_id: UUID
    submeasure_id: UUID  # Required for submeasure-specific answers
    documentation_score: Optional[int] = Field(None, ge=1, le=5)
    implementation_score: Optional[int] = Field(None, ge=1, le=5)
    comments: Optional[str] = Field(None, max_length=2000)
    evidence_files: Optional[List[str]] = Field(default_factory=list)
    confidence_level: Optional[int] = Field(None, ge=1, le=5)


class BatchUpdateAnswersRequest(BaseModel):
    """Batch update answers request schema."""

    answers: List[UpdateAnswerRequest] = Field(min_length=1)


class TransitionStatusRequest(BaseModel):
    """Status transition request schema."""

    new_status: str = Field(
        pattern="^(draft|in_progress|review|completed|abandoned|archived)$"
    )
    reason: Optional[str] = None
    current_status: Optional[str] = None
    force: bool = False


class AssignUsersRequest(BaseModel):
    """Assign users request schema."""

    user_ids: List[UUID] = Field(min_length=1)


# Search and filter schemas
class AssessmentSearchRequest(BaseModel):
    """Assessment search request parameters."""

    search_term: Optional[str] = Field(
        None, description="Search term for assessment title/description"
    )
    organization_id: Optional[UUID] = Field(None, description="Filter by organization")
    status: Optional[str] = Field(None, description="Filter by status")
    security_level: Optional[str] = Field(None, description="Filter by security level")
    assigned_user_id: Optional[UUID] = Field(
        None, description="Filter by assigned user"
    )
    created_after: Optional[datetime] = Field(
        None, description="Filter by creation date (after)"
    )
    created_before: Optional[datetime] = Field(
        None, description="Filter by creation date (before)"
    )
    limit: int = Field(50, ge=1, le=200, description="Maximum results per page")
    offset: int = Field(0, ge=0, description="Number of results to skip")


# Response schemas for operations
class OperationResponse(BaseModel):
    """Generic operation response schema."""

    success: bool
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = Field(default_factory=dict)


class CreateAssessmentResponse(BaseModel):
    """Create assessment response schema."""

    success: bool
    assessment_id: str
    title: str
    status: str
    security_level: str
    created_at: str


class UpdateAnswerResponse(BaseModel):
    """Update answer response schema."""

    success: bool
    answer_id: str
    assessment_id: str
    control_id: str
    updated_at: str
    recalculation: Dict[str, Any] = Field(default_factory=dict)


class StatusTransitionResponse(BaseModel):
    """Status transition response schema."""

    success: bool
    assessment_id: str
    old_status: str
    new_status: str
    updated_at: str
    compliance_status: Optional[str] = None
    compliance_percentage: Optional[float] = None


class ErrorResponse(BaseModel):
    """Error response schema."""

    detail: str = Field(description="Error message")
    error_code: Optional[str] = Field(
        None, description="Error code for programmatic handling"
    )
    validation_errors: Optional[List[str]] = Field(
        None, description="Validation error details"
    )


# ============================================================================
# V2 SCHEMAS WITH SUBMEASURE CONTEXT SUPPORT
# (Merged from assessment_v2.py)
# ============================================================================

class UpdateAnswerRequestV2(BaseModel):
    """Update answer request with submeasure context."""
    
    control_id: str = Field(description="ID of the control being answered")
    submeasure_id: str = Field(description="ID of the submeasure context for this answer")
    documentation_score: Optional[int] = Field(None, ge=1, le=5)
    implementation_score: Optional[int] = Field(None, ge=1, le=5)
    comments: Optional[str] = Field(None, max_length=2000)
    evidence_files: Optional[List[str]] = Field(default_factory=list)
    confidence_level: Optional[int] = Field(None, ge=1, le=5)

    model_config = {
        "json_schema_extra": {
            "example": {
                "control_id": "123e4567-e89b-12d3-a456-426614174000",
                "submeasure_id": "223e4567-e89b-12d3-a456-426614174000",
                "documentation_score": 4,
                "implementation_score": 3,
                "comments": "Policy implemented but needs updates",
                "evidence_files": ["policy.pdf", "procedure.docx"],
                "confidence_level": 4
            }
        }
    }


class BatchUpdateAnswersRequestV2(BaseModel):
    """Batch update answers request with submeasure context."""
    
    answers: List[UpdateAnswerRequestV2] = Field(min_length=1)


class ControlInQuestionnaireResponseV2(BaseModel):
    """Control information within questionnaire with submeasure context."""
    
    # Control identification
    id: str = Field(description="Control UUID")
    code: str = Field(description="Control code (e.g., POL-001)")
    name_hr: str = Field(description="Control name in Croatian")
    description_hr: Optional[str] = Field(None, description="Control description in Croatian")
    
    # Context information
    submeasure_id: str = Field(description="Submeasure UUID this control instance belongs to")
    instance_id: str = Field(description="Unique identifier combining control_id:submeasure_id")
    
    # Requirements
    order_index: int
    is_mandatory: bool = Field(description="Whether control is mandatory at this security level")
    is_applicable: bool = Field(description="Whether control applies to this submeasure")
    minimum_score: Optional[float] = Field(None, description="Minimum required score for this control in this context")
    
    # Current answer (if exists)
    documentation_score: Optional[int] = Field(None, ge=1, le=5)
    implementation_score: Optional[int] = Field(None, ge=1, le=5)
    average_score: Optional[float] = Field(None, description="Calculated average of both scores")
    meets_minimum: Optional[bool] = Field(None, description="Whether current score meets minimum requirement")
    
    # Answer metadata
    comments: Optional[str] = None
    evidence_files: Optional[List[str]] = Field(default_factory=list)
    answered_at: Optional[datetime] = None
    answered_by: Optional[str] = None
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "code": "POL-001",
                "name_hr": "Politika informacijske sigurnosti",
                "submeasure_id": "223e4567-e89b-12d3-a456-426614174000",
                "instance_id": "123e4567-e89b-12d3-a456-426614174000:223e4567-e89b-12d3-a456-426614174000",
                "order_index": 1,
                "is_mandatory": True,
                "is_applicable": True,
                "minimum_score": 3.5,
                "documentation_score": 4,
                "implementation_score": 3,
                "average_score": 3.5,
                "meets_minimum": True
            }
        }
    }


class SubmeasureInQuestionnaireResponseV2(BaseModel):
    """Submeasure with controls maintaining context."""
    
    id: str
    code: str
    number: str = Field(description="Submeasure number (e.g., 1.1)")
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    
    # Controls within this submeasure context
    controls: List[ControlInQuestionnaireResponseV2]
    
    # Aggregate scoring
    total_controls: int
    answered_controls: int
    mandatory_controls: int
    mandatory_answered: int
    controls_meeting_minimum: int = Field(description="Number of controls meeting their minimum scores")
    mandatory_meeting_minimum: int = Field(description="Number of mandatory controls meeting minimum")
    
    # Calculated scores
    documentation_avg: Optional[float] = None
    implementation_avg: Optional[float] = None
    overall_score: Optional[float] = None
    
    # Compliance status
    is_compliant: bool = Field(description="All mandatory controls answered and meeting minimum")
    compliance_issues: List[str] = Field(default_factory=list, description="List of compliance issues")


class MeasureInQuestionnaireResponseV2(BaseModel):
    """Measure containing submeasures with proper context."""
    
    id: str
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    
    submeasures: List[SubmeasureInQuestionnaireResponseV2]
    
    # Aggregate fields
    total_controls: int
    answered_controls: int
    mandatory_controls: int
    mandatory_answered: int
    overall_score: Optional[float] = None
    is_compliant: bool


class QuestionnaireResponseV2(BaseModel):
    """Complete questionnaire structure with submeasure context support."""
    
    assessment_id: str
    security_level: str
    version_id: Optional[str] = None
    measures: List[MeasureInQuestionnaireResponseV2]
    
    # Statistics
    statistics: dict = Field(description="Overall questionnaire statistics")
    
    # Metadata
    generated_at: datetime
    supports_multi_context: bool = Field(
        default=True, 
        description="Indicates this questionnaire supports controls in multiple submeasures"
    )


# Frontend-specific types for better TypeScript generation
class AnswerSubmissionV2(BaseModel):
    """Single answer submission with context."""
    
    control_id: str
    submeasure_id: str
    documentation_score: Optional[int] = None
    implementation_score: Optional[int] = None
    comments: Optional[str] = None
    
    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "control_id": "123e4567-e89b-12d3-a456-426614174000",
                "submeasure_id": "223e4567-e89b-12d3-a456-426614174000",
                "documentation_score": 4,
                "implementation_score": 3,
                "comments": "Recently updated policy"
            }
        }
    }
