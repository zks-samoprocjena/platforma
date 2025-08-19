"""Document processing models for Sprint 3 RAG functionality with global document support."""
import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Integer, Text, ForeignKey, Index, Boolean, CheckConstraint, Numeric, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from typing import Any

from .base import BaseModel

# Forward references to avoid circular imports
if TYPE_CHECKING:
    from .assessment import Assessment
    from .organization import Organization
    from .reference import Control


class ProcessedDocument(AsyncAttrs, BaseModel):
    """Represents an uploaded compliance document (PDF, DOCX, etc.) for RAG processing.
    
    Supports both global documents (available to all organizations) and 
    organization-specific documents (private to the owning organization).
    """
    
    __tablename__ = "processed_documents"

    # Organization relationship (nullable for global documents)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,  # Null for global documents
        index=True
    )
    
    # Document scope
    scope: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default="organization",
        index=True
    )  # "global" | "organization"
    
    # Global document indicators
    is_global: Mapped[bool] = mapped_column(
        Boolean, 
        nullable=False, 
        default=False,
        index=True
    )
    
    # Track who uploaded (especially important for global docs)
    uploaded_by: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True
    )
    
    # Document type for categorization
    document_type: Mapped[Optional[str]] = mapped_column(
        String(50), 
        nullable=True,
        index=True
    )  # "standard", "regulation", "policy", "procedure", "guideline"
    
    # Source for global documents
    source: Mapped[Optional[str]] = mapped_column(
        String(50), 
        nullable=True
    )  # "ISO", "NIST", "ZKS", "NIS2", "custom"
    
    # Basic document information
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Processing status
    status: Mapped[str] = mapped_column(
        String(50), 
        nullable=False, 
        default="pending",
        index=True
    )  # pending, processing, completed, failed, deleted
    
    # Timestamps
    upload_date: Mapped[datetime] = mapped_column(nullable=False)
    processed_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    
    # Processing metadata and information
    processing_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # Relationships
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk", 
        back_populates="processed_document",
        cascade="all, delete-orphan"
    )
    
    # Indexes and constraints for performance and data integrity
    __table_args__ = (
        Index("idx_documents_org_status", "organization_id", "status"),
        Index("idx_documents_scope_type", "scope", "document_type"),
        Index("idx_documents_global", "is_global", "status"),
        Index("idx_documents_upload_date", "upload_date"),
        CheckConstraint(
            "(scope = 'global' AND organization_id IS NULL AND is_global = true) OR "
            "(scope = 'organization' AND organization_id IS NOT NULL AND is_global = false)",
            name="check_document_scope_consistency"
        ),
    )

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, title='{self.title}', status='{self.status}')>"


class DocumentChunk(AsyncAttrs, BaseModel):
    """Represents a processed chunk of a document with embeddings."""
    
    __tablename__ = "document_chunks"

    # ProcessedDocument relationship
    processed_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("processed_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Chunk information
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Vector embedding (768 dimensions for multilingual model)
    embedding: Mapped[Optional[list[float]]] = mapped_column(
        Vector(768), 
        nullable=True
    )
    
    # Chunk metadata (page number, section, etc.)
    chunk_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # Two-layer RAG metadata (added in migration 018)
    control_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    doc_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    section_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_start: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_anchor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Relationships
    processed_document: Mapped["ProcessedDocument"] = relationship(
        "ProcessedDocument", 
        back_populates="chunks"
    )
    
    # Indexes for performance
    __table_args__ = (
        Index("idx_chunks_document_idx", "processed_document_id", "chunk_index"),
        Index("idx_chunks_embedding", "embedding", postgresql_using="ivfflat", postgresql_with={"lists": 100}),
    )

    def __repr__(self) -> str:
        return f"<DocumentChunk(id={self.id}, processed_document_id={self.processed_document_id}, index={self.chunk_index})>"


class AIRecommendation(AsyncAttrs, BaseModel):
    """Represents AI-generated recommendations for assessment improvements."""
    
    __tablename__ = "ai_recommendations"

    # Assessment and control relationships
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    control_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("controls.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # Recommendation details
    recommendation_type: Mapped[str] = mapped_column(
        String(50), 
        nullable=False,
        default="improvement"
    )  # improvement, documentation, compliance, roadmap
    
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Priority and effort
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")  # high, medium, low
    effort_estimate: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")  # high, medium, low
    impact_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0.0)
    
    # Gap tracking
    current_score: Mapped[float] = mapped_column(Numeric(3, 1), nullable=False, default=0.0)
    target_score: Mapped[float] = mapped_column(Numeric(3, 1), nullable=False, default=5.0)
    
    # Implementation tracking
    is_implemented: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    implemented_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    confidence_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 2), nullable=True)
    implementation_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    source_chunks: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="hr")
    
    # Versioning for regeneration
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    superseded_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_recommendations.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="recommendations")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="ai_recommendations")
    control: Mapped[Optional["Control"]] = relationship("Control", back_populates="recommendations")
    superseded_by: Mapped[Optional["AIRecommendation"]] = relationship(
        "AIRecommendation",
        remote_side="AIRecommendation.id",
        back_populates="superseded_recommendations"
    )
    superseded_recommendations: Mapped[List["AIRecommendation"]] = relationship(
        "AIRecommendation",
        back_populates="superseded_by"
    )
    
    # Indexes for performance
    __table_args__ = (
        Index("idx_recommendations_assessment", "assessment_id"),
        Index("idx_recommendations_organization", "organization_id"),
        Index("idx_recommendations_control", "control_id"),
        Index("idx_recommendations_type", "recommendation_type"),
        Index("idx_recommendations_active", "is_active"),
        # Note: Unique constraint for active recommendations is handled in migration
        # using CREATE UNIQUE INDEX with WHERE clause
    )

    def __repr__(self) -> str:
        return f"<AIRecommendation(id={self.id}, type='{self.recommendation_type}', assessment_id={self.assessment_id})>"