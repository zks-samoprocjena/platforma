"""
Updated reference models with proper M:N relationships.
Replaces the old reference.py after database migration.
"""
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, Boolean, Float, ForeignKey, Text, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.models.base import BaseModel

# Forward references to avoid circular imports
if TYPE_CHECKING:
    from app.models.document import AIRecommendation


class QuestionnaireVersion(BaseModel):
    """Represents a version of the compliance questionnaire."""
    __tablename__ = "questionnaire_versions"
    
    version_number: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_file: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Relationships
    measures: Mapped[List["Measure"]] = relationship(
        "Measure",
        back_populates="version",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    def __repr__(self):
        return f"<QuestionnaireVersion {self.version_number}>"


class Measure(BaseModel):
    """Represents a compliance measure (top-level category)."""
    __tablename__ = "measures"
    
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questionnaire_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    name_hr: Mapped[str] = mapped_column(String(255), nullable=False)
    description_hr: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Relationships
    version: Mapped["QuestionnaireVersion"] = relationship(
        "QuestionnaireVersion",
        back_populates="measures"
    )
    submeasures: Mapped[List["Submeasure"]] = relationship(
        "Submeasure",
        back_populates="measure",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    __table_args__ = (
        UniqueConstraint("version_id", "code"),
    )
    
    def __repr__(self):
        return f"<Measure {self.code}: {self.name_hr}>"


class Submeasure(BaseModel):
    """Represents a submeasure within a measure."""
    __tablename__ = "submeasures"
    
    measure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("measures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name_hr: Mapped[str] = mapped_column(String(255), nullable=False)
    description_hr: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    submeasure_type: Mapped[str] = mapped_column(String(1), nullable=False, default="A")
    is_conditional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    condition_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Relationships
    measure: Mapped["Measure"] = relationship(
        "Measure",
        back_populates="submeasures"
    )
    control_mappings: Mapped[List["ControlSubmeasureMapping"]] = relationship(
        "ControlSubmeasureMapping",
        back_populates="submeasure",
        cascade="all, delete-orphan"
    )
    control_requirements: Mapped[List["ControlRequirement"]] = relationship(
        "ControlRequirement",
        back_populates="submeasure",
        cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        UniqueConstraint("measure_id", "code"),
    )
    
    def __repr__(self):
        return f"<Submeasure {self.code}: {self.name_hr}>"


class Control(BaseModel):
    """
    Represents a unique control.
    Each control has a unique code (e.g., POL-001, KRIP-001).
    Controls can be associated with multiple submeasures.
    """
    __tablename__ = "controls"
    
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name_hr: Mapped[str] = mapped_column(String(255), nullable=False)
    description_hr: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Relationships
    submeasure_mappings: Mapped[List["ControlSubmeasureMapping"]] = relationship(
        "ControlSubmeasureMapping",
        back_populates="control",
        cascade="all, delete-orphan"
    )
    control_requirements: Mapped[List["ControlRequirement"]] = relationship(
        "ControlRequirement",
        back_populates="control",
        cascade="all, delete-orphan"
    )
    recommendations: Mapped[List["AIRecommendation"]] = relationship(
        "AIRecommendation",
        back_populates="control"
    )
    
    def __repr__(self):
        return f"<Control {self.code}>"


class ControlSubmeasureMapping(BaseModel):
    """
    Maps controls to submeasures (M:N relationship).
    This allows a single control to appear in multiple submeasures.
    """
    __tablename__ = "control_submeasure_mapping"
    
    control_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("controls.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submeasure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Relationships
    control: Mapped["Control"] = relationship(
        "Control",
        back_populates="submeasure_mappings"
    )
    submeasure: Mapped["Submeasure"] = relationship(
        "Submeasure",
        back_populates="control_mappings"
    )
    
    __table_args__ = (
        UniqueConstraint("control_id", "submeasure_id"),
    )
    
    def __repr__(self):
        return f"<ControlSubmeasureMapping {self.control.code} -> {self.submeasure.code}>"


class ControlRequirement(BaseModel):
    """
    Defines requirements for a control-submeasure pair at each security level.
    Each combination of (control, submeasure, level) has specific requirements.
    """
    __tablename__ = "control_requirements"
    
    control_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("controls.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submeasure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submeasures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_applicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    minimum_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Relationships
    control: Mapped["Control"] = relationship(
        "Control",
        back_populates="control_requirements"
    )
    submeasure: Mapped["Submeasure"] = relationship(
        "Submeasure",
        back_populates="control_requirements"
    )
    
    __table_args__ = (
        UniqueConstraint("control_id", "submeasure_id", "level"),
        CheckConstraint("level IN ('osnovna', 'srednja', 'napredna')"),
        CheckConstraint("minimum_score IS NULL OR minimum_score IN (2.0, 2.5, 3.0, 3.5, 4.0, 5.0)"),
    )
    
    def __repr__(self):
        return f"<ControlRequirement {self.control.code}-{self.submeasure.code} ({self.level})>"