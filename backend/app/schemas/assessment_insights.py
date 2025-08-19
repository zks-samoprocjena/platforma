from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AssessmentInsightsResponse(BaseModel):
    assessment_id: UUID
    computed_at: Optional[datetime]
    gaps: List[Dict[str, Any]] = Field(default_factory=list)
    roadmap: Dict[str, Any] = Field(default_factory=dict)
    ai_summary: Optional[str] = None
    measures_ai: Dict[str, Any] = Field(default_factory=dict)
    status: str = "ok"
    source_version: str = "v1"

    model_config = {"from_attributes": True} 