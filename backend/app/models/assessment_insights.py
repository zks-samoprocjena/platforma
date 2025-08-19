import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class AssessmentInsights(BaseModel):
    """Persisted snapshot of assessment insights (gaps, roadmap, AI summaries)."""

    __tablename__ = "assessment_insights"

    # Foreign keys / ownership
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Persisted data blobs
    gaps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    roadmap: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    measures_ai: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Status / provenance
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ok", index=True)
    source_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Compute metadata
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Relationships
    assessment = relationship("Assessment")

    __table_args__ = (
        UniqueConstraint("assessment_id", name="uq_assessment_insights_assessment_id"),
        Index("idx_assessment_insights_org", "organization_id"),
        CheckConstraint("status IN ('ok','stale','error')", name="ck_assessment_insights_status"),
    )

    def __repr__(self) -> str:
        return f"<AssessmentInsights(assessment_id={self.assessment_id}, status={self.status})>" 