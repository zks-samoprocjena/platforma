"""Assessment models - assessments, answers, results, progress, audit, activity, and assignments."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

# Forward references for type hints
if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.reference import QuestionnaireVersion, Control, Measure, Submeasure
    from app.models.compliance_scoring_v2 import SubmeasureScore, MeasureScore, ComplianceScore
    from app.models.document_generation import DocumentGenerationJob
    from app.models.document import AIRecommendation


class Assessment(BaseModel):
    """Assessment instances for organizations."""

    __tablename__ = "assessments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questionnaire_versions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    security_level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, index=True
    )

    # Ownership and assignment
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    assigned_to: Mapped[Optional[List[uuid.UUID]]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )

    # Lifecycle timestamps
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Calculated scores (cached for performance)
    total_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Overall results
    total_score: Mapped[Optional[Numeric]] = mapped_column(Numeric(5, 2), nullable=True)
    compliance_percentage: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    compliance_status: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, index=True
    )  # 'compliant', 'non_compliant', or None if not yet calculated

    # Metadata
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="assessments"
    )
    questionnaire_version: Mapped[Optional["QuestionnaireVersion"]] = relationship(
        "QuestionnaireVersion"
    )
    answers: Mapped[List["AssessmentAnswer"]] = relationship(
        "AssessmentAnswer", back_populates="assessment", cascade="all, delete-orphan"
    )
    results: Mapped[List["AssessmentResult"]] = relationship(
        "AssessmentResult", back_populates="assessment", cascade="all, delete-orphan"
    )
    progress: Mapped[List["AssessmentProgress"]] = relationship(
        "AssessmentProgress", back_populates="assessment", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[List["AssessmentAuditLog"]] = relationship(
        "AssessmentAuditLog", back_populates="assessment"
    )
    activities: Mapped[List["AssessmentActivity"]] = relationship(
        "AssessmentActivity", back_populates="assessment", cascade="all, delete-orphan"
    )
    assignments: Mapped[List["AssessmentAssignment"]] = relationship(
        "AssessmentAssignment",
        back_populates="assessment",
        cascade="all, delete-orphan",
    )

    # Compliance scoring relationships
    submeasure_scores: Mapped[List["SubmeasureScore"]] = relationship(
        "SubmeasureScore", back_populates="assessment", cascade="all, delete-orphan"
    )
    measure_scores: Mapped[List["MeasureScore"]] = relationship(
        "MeasureScore", back_populates="assessment", cascade="all, delete-orphan"
    )
    compliance_scores: Mapped[List["ComplianceScore"]] = relationship(
        "ComplianceScore", back_populates="assessment", cascade="all, delete-orphan"
    )
    
    # Document generation relationship
    document_generation_jobs: Mapped[List["DocumentGenerationJob"]] = relationship(
        "DocumentGenerationJob", back_populates="assessment", cascade="all, delete-orphan"
    )
    
    # AI recommendations relationship
    recommendations: Mapped[List["AIRecommendation"]] = relationship(
        "AIRecommendation", back_populates="assessment", cascade="all, delete-orphan"
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "security_level IN ('osnovna', 'srednja', 'napredna')",
            name="ck_assessment_valid_security_level",
        ),
        CheckConstraint(
            "status IN ('draft', 'in_progress', 'review', 'completed', 'abandoned', 'archived')",
            name="ck_assessment_valid_status",
        ),
        CheckConstraint(
            "compliance_percentage IS NULL OR (compliance_percentage >= 0 AND compliance_percentage <= 100)",
            name="ck_assessment_valid_compliance_percentage",
        ),
    )

    def __repr__(self) -> str:
        return f"<Assessment(title={self.title}, status={self.status}, level={self.security_level})>"


class AssessmentAnswer(BaseModel):
    """Individual answers to controls within an assessment."""

    __tablename__ = "assessment_answers"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    control_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("controls.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # NEW: Submeasure context - required for submeasure-specific answers
    submeasure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Scores (1-5 scale)
    documentation_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    implementation_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Supporting information
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_files: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True
    )
    confidence_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Answer metadata
    answered_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="answers"
    )
    control: Mapped["Control"] = relationship("Control")
    submeasure: Mapped["Submeasure"] = relationship("Submeasure")

    # Constraints
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "control_id", "submeasure_id", 
            name="uq_assessment_control_submeasure_answer"
        ),
        CheckConstraint(
            "documentation_score IS NULL OR (documentation_score >= 1 AND documentation_score <= 5)",
            name="ck_valid_documentation_score",
        ),
        CheckConstraint(
            "implementation_score IS NULL OR (implementation_score >= 1 AND implementation_score <= 5)",
            name="ck_valid_implementation_score",
        ),
        CheckConstraint(
            "confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5)",
            name="ck_valid_confidence_level",
        ),
    )

    @property
    def average_score(self) -> Optional[float]:
        """Calculate average score if both scores are present."""
        if (
            self.documentation_score is not None
            and self.implementation_score is not None
        ):
            return (self.documentation_score + self.implementation_score) / 2.0
        return None

    def __repr__(self) -> str:
        return f"<AssessmentAnswer(assessment={self.assessment_id}, control={self.control_id}, submeasure={self.submeasure_id}, scores={self.documentation_score}/{self.implementation_score})>"


class AssessmentResult(BaseModel):
    """Aggregated scoring results by measure and submeasure."""

    __tablename__ = "assessment_results"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    measure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    submeasure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Scores
    average_score: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    documentation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    implementation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    compliance_percentage: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(5, 2), nullable=True
    )

    # Control counts
    total_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Calculation metadata
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="results"
    )
    measure: Mapped[Optional["Measure"]] = relationship("Measure")
    submeasure: Mapped[Optional["Submeasure"]] = relationship("Submeasure")

    # Constraints
    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "measure_id",
            "submeasure_id",
            name="uq_assessment_measure_submeasure_result",
        ),
        CheckConstraint(
            "compliance_percentage IS NULL OR (compliance_percentage >= 0 AND compliance_percentage <= 100)",
            name="ck_valid_compliance_percentage",
        ),
        CheckConstraint(
            "average_score IS NULL OR (average_score >= 1 AND average_score <= 5)",
            name="ck_valid_average_score",
        ),
    )

    def __repr__(self) -> str:
        return f"<AssessmentResult(assessment={self.assessment_id}, measure={self.measure_id}, submeasure={self.submeasure_id}, percentage={self.compliance_percentage}%)>"


class AssessmentProgress(BaseModel):
    """Track completion progress by different dimensions."""

    __tablename__ = "assessment_progress"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Progress by measure
    measure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    controls_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_mandatory: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_mandatory_answered: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Progress percentages
    completion_percentage: Mapped[Numeric] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    mandatory_completion_percentage: Mapped[Numeric] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )

    # Timestamps
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="progress"
    )
    measure: Mapped[Optional["Measure"]] = relationship("Measure")

    # Constraints
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "measure_id", name="uq_assessment_measure_progress"
        ),
        CheckConstraint(
            "completion_percentage >= 0 AND completion_percentage <= 100",
            name="ck_valid_completion_percentage",
        ),
        CheckConstraint(
            "mandatory_completion_percentage >= 0 AND mandatory_completion_percentage <= 100",
            name="ck_valid_mandatory_completion_percentage",
        ),
    )

    # Properties for API compatibility
    @property
    def total_controls(self) -> int:
        """Alias for controls_total for API compatibility."""
        return self.controls_total

    @property
    def answered_controls(self) -> int:
        """Alias for controls_answered for API compatibility."""
        return self.controls_answered
    
    @property
    def completed_controls(self) -> int:
        """Alias for controls_answered for frontend compatibility."""
        return self.controls_answered

    @property
    def mandatory_controls(self) -> int:
        """Alias for controls_mandatory for API compatibility."""
        return self.controls_mandatory

    @property
    def mandatory_answered(self) -> int:
        """Alias for controls_mandatory_answered for API compatibility."""
        return self.controls_mandatory_answered
    
    @property
    def completed_mandatory(self) -> int:
        """Alias for controls_mandatory_answered for frontend compatibility."""
        return self.controls_mandatory_answered


    def __repr__(self) -> str:
        return f"<AssessmentProgress(assessment={self.assessment_id}, measure={self.measure_id}, completion={self.completion_percentage}%)>"


class AssessmentAuditLog(BaseModel):
    """Comprehensive audit trail for compliance and debugging."""

    __tablename__ = "assessment_audit_log"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id"),  # No cascade delete - preserve audit trail
        nullable=False,
        index=True,
    )

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Change details
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Context
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="audit_logs"
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "action IN ('created', 'status_changed', 'answer_updated', 'submitted', 'assigned', 'deleted')",
            name="ck_valid_audit_action",
        ),
        CheckConstraint(
            "entity_type IN ('assessment', 'answer', 'result', 'assignment')",
            name="ck_valid_entity_type",
        ),
    )

    def __repr__(self) -> str:
        return f"<AssessmentAuditLog(assessment={self.assessment_id}, action={self.action}, entity_type={self.entity_type})>"


class AssessmentActivity(BaseModel):
    """Real-time collaboration tracking."""

    __tablename__ = "assessment_activity"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )

    measure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Activity details
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    section_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    control_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("controls.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    last_active: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="activities"
    )
    measure: Mapped[Optional["Measure"]] = relationship("Measure")
    control: Mapped[Optional["Control"]] = relationship("Control")

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "activity_type IN ('viewing', 'editing', 'idle')",
            name="ck_valid_activity_type",
        ),
    )

    def __repr__(self) -> str:
        return f"<AssessmentActivity(assessment={self.assessment_id}, user={self.user_id}, type={self.activity_type})>"


class AssessmentAssignment(BaseModel):
    """Optional section assignments for collaboration."""

    __tablename__ = "assessment_assignments"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )

    measure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="CASCADE"),
        nullable=True,
    )

    submeasure_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Assignment details
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(
        String(50), default="assigned", nullable=False, index=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment", back_populates="assignments"
    )
    measure: Mapped[Optional["Measure"]] = relationship("Measure")
    submeasure: Mapped[Optional["Submeasure"]] = relationship("Submeasure")

    # Constraints
    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "measure_id",
            "user_id",
            name="uq_assessment_measure_user_assignment",
        ),
        UniqueConstraint(
            "assessment_id",
            "submeasure_id",
            "user_id",
            name="uq_assessment_submeasure_user_assignment",
        ),
        CheckConstraint(
            "status IN ('assigned', 'in_progress', 'completed')",
            name="ck_valid_assignment_status",
        ),
        CheckConstraint(
            "(measure_id IS NOT NULL AND submeasure_id IS NULL) OR (measure_id IS NULL AND submeasure_id IS NOT NULL)",
            name="ck_assignment_either_measure_or_submeasure",
        ),
    )

    def __repr__(self) -> str:
        return f"<AssessmentAssignment(assessment={self.assessment_id}, user={self.user_id}, status={self.status})>"
