"""Pydantic schemas for compliance API responses."""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field


class ControlRequirementResponse(BaseModel):
    """Control requirement response schema."""

    level: str
    is_mandatory: bool
    is_applicable: bool

    model_config = {"from_attributes": True}


class ControlResponse(BaseModel):
    """Control response schema."""

    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    requirements: List[ControlRequirementResponse] = []

    model_config = {"from_attributes": True}


class SubmeasureResponse(BaseModel):
    """Submeasure response schema."""

    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    controls: List[ControlResponse] = []

    model_config = {"from_attributes": True}


class MeasureResponse(BaseModel):
    """Measure response schema."""

    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    submeasures: List[SubmeasureResponse] = []

    model_config = {"from_attributes": True}


class MeasureSummaryResponse(BaseModel):
    """Simplified measure response without submeasures."""

    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    submeasures_count: int = Field(description="Number of submeasures in this measure")

    model_config = {"from_attributes": True}


class QuestionnaireVersionResponse(BaseModel):
    """Questionnaire version response schema."""

    id: UUID
    version_number: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LevelStatisticsResponse(BaseModel):
    """Security level statistics response."""

    total: int = Field(description="Total controls for this level")
    mandatory: int = Field(description="Mandatory controls for this level")
    voluntary: int = Field(description="Voluntary controls for this level")


class ComplianceSummaryResponse(BaseModel):
    """Compliance summary statistics response."""

    version: Optional[QuestionnaireVersionResponse] = None
    statistics: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class ComplianceStructureResponse(BaseModel):
    """Complete compliance structure response."""

    version: Optional[QuestionnaireVersionResponse] = None
    measures: List[MeasureResponse] = []
    summary: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class ControlSearchResponse(BaseModel):
    """Control search results response."""

    controls: List[ControlResponse] = []
    total: int = Field(description="Total number of controls matching the query")
    limit: int = Field(description="Maximum number of results per page")
    offset: int = Field(description="Number of results skipped")
    has_more: bool = Field(description="Whether there are more results available")

    model_config = {"from_attributes": True}


class ControlDetailResponse(BaseModel):
    """Detailed control response with submeasure and measure context."""

    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    requirements: List[ControlRequirementResponse] = []
    submeasure: Dict[str, Any] = Field(description="Parent submeasure information")
    measure: Dict[str, Any] = Field(description="Parent measure information")

    model_config = {"from_attributes": True}


# Request schemas for filtering and search
class ControlSearchRequest(BaseModel):
    """Control search request parameters."""

    search_term: Optional[str] = Field(
        None, description="Search term for control name/description/code"
    )
    measure_id: Optional[UUID] = Field(None, description="Filter by measure ID")
    submeasure_id: Optional[UUID] = Field(None, description="Filter by submeasure ID")
    level: Optional[str] = Field(
        None, description="Filter by security level (osnovna/srednja/napredna)"
    )
    mandatory_only: bool = Field(False, description="Show only mandatory controls")
    limit: int = Field(100, ge=1, le=1000, description="Maximum results per page")
    offset: int = Field(0, ge=0, description="Number of results to skip")


class ErrorResponse(BaseModel):
    """Error response schema."""

    detail: str = Field(description="Error message")
    error_code: Optional[str] = Field(
        None, description="Error code for programmatic handling"
    )

    model_config = {"from_attributes": True}


# ============================================================================  
# V2 SCHEMAS - COMPATIBLE WITH M:N CONTROL-SUBMEASURE RELATIONSHIPS
# (Merged from compliance_v2.py)
# ============================================================================

class ControlRequirementResponseV2(BaseModel):
    """Control requirement response schema V2."""
    level: str
    is_mandatory: bool
    is_applicable: bool
    minimum_score: Optional[float] = None
    
    model_config = {"from_attributes": True}


class ControlResponseV2(BaseModel):
    """Control response schema V2 without order_index (order is context-dependent)."""
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    # order_index removed - it's on the mapping table
    
    model_config = {"from_attributes": True}


class ControlWithContextResponseV2(BaseModel):
    """Control with submeasure context including order V2."""
    control: ControlResponseV2
    submeasure: 'SubmeasureResponseV2'
    measure: 'MeasureResponseV2'
    order_index: int
    requirements: List[ControlRequirementResponseV2] = []
    
    model_config = {"from_attributes": True}


class SubmeasureResponseV2(BaseModel):
    """Submeasure response schema V2."""
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    submeasure_type: str = "A"
    is_conditional: bool = False
    condition_text: Optional[str] = None
    # controls relationship removed - use mappings instead
    
    model_config = {"from_attributes": True}


class MeasureResponseV2(BaseModel):
    """Measure response schema V2."""
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    order_index: int
    submeasures: List[SubmeasureResponseV2] = []
    
    model_config = {"from_attributes": True}


class ControlSearchResponseV2(BaseModel):
    """Control search response V2 with pagination."""
    controls: List[ControlResponseV2]
    total: int
    limit: int
    offset: int
    has_more: bool
    
    model_config = {"from_attributes": True}


class ControlDetailResponseV2(BaseModel):
    """Detailed control response V2 with all contexts."""
    id: UUID
    code: str
    name_hr: str
    description_hr: Optional[str] = None
    submeasure_contexts: List[dict] = Field(
        default_factory=list,
        description="List of submeasure contexts where this control appears"
    )
    
    model_config = {"from_attributes": True}


class ComplianceStructureResponseV2(BaseModel):
    """Complete compliance structure response V2."""
    version: Optional[dict] = None
    measures: List[MeasureResponseV2] = []
    summary: dict = {}
    
    model_config = {"from_attributes": True}


class ComplianceSummaryResponseV2(BaseModel):
    """Compliance summary statistics response V2."""
    version: Optional[dict] = None
    levels: Dict[str, dict] = {}
    total_controls: int = 0
    measures_count: int = 0
    
    model_config = {"from_attributes": True}


class QuestionnaireVersionResponseV2(BaseModel):
    """Questionnaire version response V2."""
    id: UUID
    version_number: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


# Update forward references for V2
ControlWithContextResponseV2.model_rebuild()
MeasureResponseV2.model_rebuild()
