"""
Document generation related models.
"""
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
import uuid
from sqlalchemy import (
    Boolean, String, Text, JSON, 
    Index, CheckConstraint, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.assessment import Assessment
    from app.models.organization import Document


class DocumentTemplate(BaseModel):
    """Model for storing document template definitions."""
    
    __tablename__ = "document_templates"
    
    template_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    schema: Mapped[Optional[dict]] = mapped_column(JSON, default={}, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="document_templates")
    generation_jobs: Mapped[List["DocumentGenerationJob"]] = relationship(
        "DocumentGenerationJob", 
        back_populates="template",
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index("idx_templates_key_version", "template_key", "version"),
        Index("idx_templates_active", "is_active"),
        Index("idx_templates_organization", "organization_id"),
    )


class DocumentGenerationJob(BaseModel):
    """Model for tracking document generation jobs."""
    
    __tablename__ = "document_generation_jobs"
    
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("document_templates.id"),
        nullable=False,
        index=True
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    options: Mapped[Optional[dict]] = mapped_column(JSON, default={}, nullable=True)
    job_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    
    # Relationships
    document: Mapped[Optional["Document"]] = relationship("Document", back_populates="generation_job")
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="document_generation_jobs")
    template: Mapped["DocumentTemplate"] = relationship("DocumentTemplate", back_populates="generation_jobs")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="document_generation_jobs")
    
    # Constraints and Indexes
    __table_args__ = (
        CheckConstraint(
            "document_type IN ('compliance_declaration', 'self_assessment_report', "
            "'internal_record', 'evaluation_report', 'action_plan')",
            name="chk_document_type"
        ),
        Index("idx_generation_jobs_document", "document_id"),
        Index("idx_generation_jobs_assessment", "assessment_id"),
        Index("idx_generation_jobs_template", "template_id"),
        Index("idx_generation_jobs_organization", "organization_id"),
        Index("idx_generation_jobs_status", "status"),
    )


# Enum for document types
class DocumentType:
    COMPLIANCE_DECLARATION = "compliance_declaration"
    SELF_ASSESSMENT_REPORT = "self_assessment_report"
    INTERNAL_RECORD = "internal_record"
    EVALUATION_REPORT = "evaluation_report"
    ACTION_PLAN = "action_plan"
    
    @classmethod
    def get_all(cls):
        return [
            cls.COMPLIANCE_DECLARATION,
            cls.SELF_ASSESSMENT_REPORT,
            cls.INTERNAL_RECORD,
            cls.EVALUATION_REPORT,
            cls.ACTION_PLAN
        ]
    
    @classmethod
    def get_display_name(cls, doc_type: str) -> str:
        names = {
            cls.COMPLIANCE_DECLARATION: "Izjava o sukladnosti",
            cls.SELF_ASSESSMENT_REPORT: "Izvještaj o samoprocjeni",
            cls.INTERNAL_RECORD: "Interni zapisnik o samoprocjeni",
            cls.EVALUATION_REPORT: "Evaluacijski izvještaj po mjerama",
            cls.ACTION_PLAN: "Akcijski plan za poboljšanja"
        }
        return names.get(doc_type, doc_type)