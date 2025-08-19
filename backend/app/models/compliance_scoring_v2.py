"""
Compliance scoring models V2 - Compatible with M:N control-submeasure relationships.
These models handle scoring where controls can belong to multiple submeasures.
"""
import uuid
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ControlScoreHistory(BaseModel):
    """
    Tracks individual control scoring history.
    Each record represents a score for a control in the context of a specific submeasure.
    """

    __tablename__ = "control_score_history"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "control_id", "submeasure_id", "version", 
            name="uq_control_score_submeasure_version"
        ),
        Index("idx_control_score_assessment", "assessment_id"),
        Index("idx_control_score_control", "control_id"),
        Index("idx_control_score_submeasure", "submeasure_id"),
    )

    # Foreign keys
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    control_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("controls.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    submeasure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="CASCADE"),
        nullable=False,
        comment="The submeasure context for this control score"
    )
    
    # Scoring data
    documentation_score: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Documentation maturity score (1-5)"
    )
    implementation_score: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Implementation maturity score (1-5)"
    )
    overall_score: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Calculated overall score"
    )
    
    # Compliance tracking
    meets_requirement: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Whether score meets minimum requirement for security level"
    )
    minimum_required: Mapped[Optional[float]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Minimum score required based on security level"
    )
    
    # Metadata
    is_mandatory: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_applicable: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    
    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment")
    control: Mapped["Control"] = relationship("Control")
    submeasure: Mapped["Submeasure"] = relationship("Submeasure")
    
    # Constraints
    __table_args__ += (
        CheckConstraint(
            "documentation_score IS NULL OR documentation_score BETWEEN 1 AND 5",
            name="ck_control_score_doc_range"
        ),
        CheckConstraint(
            "implementation_score IS NULL OR implementation_score BETWEEN 1 AND 5",
            name="ck_control_score_impl_range"
        ),
    )


class SubmeasureScore(BaseModel):
    """Stores submeasure-level scoring results and compliance status."""

    __tablename__ = "submeasure_scores"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "submeasure_id", "version", 
            name="uq_submeasure_score_version"
        ),
        Index("idx_submeasure_score_assessment", "assessment_id"),
        Index("idx_submeasure_score_compliance", "assessment_id", "passes_overall"),
    )

    # Foreign keys
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    submeasure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Scoring data
    documentation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Average documentation score for controls in this submeasure"
    )
    implementation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Average implementation score for controls in this submeasure"
    )
    overall_score: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True
    )
    
    # Compliance flags
    passes_individual_threshold: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="All mandatory controls meet minimum score"
    )
    passes_average_threshold: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Average score meets threshold"
    )
    passes_overall: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Both individual and average thresholds passed"
    )
    
    # Control statistics
    total_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Failed controls tracking
    failed_controls: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String), nullable=True,
        comment="List of control codes that failed requirements"
    )
    
    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="submeasure_scores")
    submeasure: Mapped["Submeasure"] = relationship("Submeasure")


class MeasureScore(BaseModel):
    """Stores measure-level scoring results and compliance status."""

    __tablename__ = "measure_scores"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "measure_id", "version", 
            name="uq_measure_score_version"
        ),
        Index("idx_measure_score_assessment", "assessment_id"),
        Index("idx_measure_score_compliance", "assessment_id", "passes_compliance"),
    )

    # Foreign keys
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    measure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Scoring data
    documentation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Average documentation score across all submeasures"
    )
    implementation_avg: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Average implementation score across all submeasures"
    )
    overall_score: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True
    )
    
    # Compliance status
    passes_compliance: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="All submeasures pass compliance"
    )
    
    # Submeasure statistics
    total_submeasures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed_submeasures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Critical failures tracking
    critical_failures: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String), nullable=True,
        comment="Submeasure codes that critically failed"
    )
    
    # Control statistics (aggregated)
    total_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="measure_scores")
    measure: Mapped["Measure"] = relationship("Measure")


class ComplianceScore(BaseModel):
    """Stores overall compliance scoring results for assessments."""

    __tablename__ = "compliance_scores"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "version", 
            name="uq_compliance_score_version"
        ),
        Index("idx_compliance_score_assessment", "assessment_id"),
        Index("idx_compliance_score_level", "security_level"),
    )

    # Foreign key
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Security level context
    security_level: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Security level used for compliance calculation"
    )
    
    # Overall scoring
    overall_score: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(3, 2), nullable=True,
        comment="Overall compliance score (0-5)"
    )
    compliance_percentage: Mapped[Optional[Numeric]] = mapped_column(
        Numeric(5, 2), nullable=True,
        comment="Percentage of compliance achieved"
    )
    
    # Compliance status
    is_compliant: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Overall compliance status"
    )
    compliance_grade: Mapped[Optional[str]] = mapped_column(
        String(2), nullable=True,
        comment="Letter grade (A, B, C, D, F)"
    )
    
    # Measure statistics
    total_measures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed_measures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    critical_measures_failed: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String), nullable=True
    )
    
    # Control statistics (overall)
    total_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_controls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mandatory_passed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Risk indicators
    high_risk_areas: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String), nullable=True,
        comment="Measures with critical compliance failures"
    )
    
    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="compliance_scores")
    
    # Constraints
    __table_args__ += (
        CheckConstraint(
            "security_level IN ('osnovna', 'srednja', 'napredna')",
            name="ck_compliance_score_security_level"
        ),
        CheckConstraint(
            "compliance_grade IS NULL OR compliance_grade IN ('A', 'B', 'C', 'D', 'F')",
            name="ck_compliance_score_grade"
        ),
    )