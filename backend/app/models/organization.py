"""Organization models - tenant-ready structure."""
import uuid
from typing import TYPE_CHECKING, List, Optional
from pydantic import BaseModel as PydanticBaseModel

from sqlalchemy import CheckConstraint, ForeignKey, String, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from datetime import datetime

if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.document_generation import DocumentGenerationJob, DocumentTemplate
    from app.models.document import AIRecommendation


class Organization(BaseModel):
    """Organizations that can perform assessments."""

    __tablename__ = "organizations"

    # Multi-tenancy support (nullable for MVP)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )

    # Basic fields
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    security_level: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    
    # Registration fields
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    admin_user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registration_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    setup_completed: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Relationships
    assessments: Mapped[List["Assessment"]] = relationship(
        "Assessment", back_populates="organization", cascade="all, delete-orphan"
    )
    documents: Mapped[List["Document"]] = relationship(
        "Document", back_populates="organization", cascade="all, delete-orphan"
    )
    document_templates: Mapped[List["DocumentTemplate"]] = relationship(
        "DocumentTemplate", back_populates="organization", cascade="all, delete-orphan"
    )
    document_generation_jobs: Mapped[List["DocumentGenerationJob"]] = relationship(
        "DocumentGenerationJob", back_populates="organization", cascade="all, delete-orphan"
    )
    ai_recommendations: Mapped[List["AIRecommendation"]] = relationship(
        "AIRecommendation", back_populates="organization", cascade="all, delete-orphan"
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "security_level IN ('osnovna', 'srednja', 'napredna')",
            name="ck_valid_organization_security_level",
        ),
        CheckConstraint(
            "type IN ('government', 'private-sector', 'critical-infrastructure', 'other')",
            name="ck_organization_type",
        ),
        CheckConstraint(
            "size IN ('1-10', '11-50', '51-250', '250+') OR size IS NULL",
            name="ck_organization_size",
        ),
    )

    def __repr__(self) -> str:
        return f"<Organization(name={self.name}, level={self.security_level})>"


class Document(BaseModel):
    """Documents uploaded by organizations."""

    __tablename__ = "documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Document generation fields
    is_template: Mapped[bool] = mapped_column(default=False, nullable=False)
    template_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    generation_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="documents"
    )
    versions: Mapped[List["DocumentVersion"]] = relationship(
        "DocumentVersion", back_populates="document", cascade="all, delete-orphan"
    )
    generation_job: Mapped[Optional["DocumentGenerationJob"]] = relationship(
        "DocumentGenerationJob", back_populates="document", uselist=False
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "document_type IN ('policy', 'procedure', 'guideline', 'evidence', 'other', "
            "'compliance_declaration', 'self_assessment_report', 'internal_record', "
            "'evaluation_report', 'action_plan')",
            name="ck_valid_document_type",
        ),
    )

    def __repr__(self) -> str:
        return f"<Document(name={self.name}, type={self.document_type})>"


class DocumentVersion(BaseModel):
    """Versions of uploaded documents."""

    __tablename__ = "document_versions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_number: Mapped[str] = mapped_column(String(20), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="versions")

    def __repr__(self) -> str:
        return f"<DocumentVersion(document={self.document_id}, version={self.version_number})>"


# Pydantic model for authenticated user (not stored in DB)
class User(PydanticBaseModel):
    """Authenticated user model from Keycloak JWT."""
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    roles: List[str] = []
    organization_id: str
    organization_name: Optional[str] = None
