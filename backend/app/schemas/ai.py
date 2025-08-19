"""AI and RAG schemas."""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    """Search request schema."""
    
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    organization_id: UUID = Field(..., description="Organization ID")
    limit: int = Field(10, ge=1, le=50, description="Maximum results to return")
    score_threshold: float = Field(0.7, ge=0.0, le=1.0, description="Minimum relevance score")
    language: str = Field("hr", pattern="^(hr|en)$", description="Language for search")
    filter_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional filters")
    content_preview_length: int = Field(200, ge=50, le=500, description="Preview length")
    control_id: Optional[str] = Field(None, pattern="^[A-Z]{3,4}-\\d{3}$", description="Specific control ID to focus on")


class SearchResult(BaseModel):
    """Individual search result."""
    
    content: str = Field(..., description="Content preview")
    content_full: str = Field(..., description="Full content")
    score: float = Field(..., description="Relevance score (0-1)")
    metadata: Dict[str, Any] = Field(..., description="Chunk metadata")
    document_name: Optional[str] = Field(None, description="Source document name")
    document_type: Optional[str] = Field(None, description="Document type")
    tier_source: Optional[str] = Field(None, description="Retrieval tier (tier1/tier2/both)")
    page: Optional[int] = Field(None, description="Page number")
    control_ids: Optional[List[str]] = Field(None, description="Control IDs found in chunk")


class SearchResponse(BaseModel):
    """Search response schema."""
    
    query: str = Field(..., description="Original query")
    results: List[SearchResult] = Field(..., description="Search results")
    total_results: int = Field(..., description="Total results found")
    language: str = Field(..., description="Language used")


class QuestionRequest(BaseModel):
    """Question request schema."""
    
    question: str = Field(..., min_length=1, max_length=1000, description="Question to answer")
    organization_id: UUID = Field(..., description="Organization ID")
    assessment_id: Optional[UUID] = Field(None, description="Assessment context")
    control_id: Optional[UUID] = Field(None, description="Control context")
    context: Optional[str] = Field(None, max_length=2000, description="Additional context")
    language: str = Field("hr", pattern="^(hr|en)$", description="Language for answer")


class SourceInfo(BaseModel):
    """Source information for answers."""
    
    source: str = Field(..., description="Source document or reference")
    relevance_score: float = Field(..., description="Source relevance score")
    page: Optional[int] = Field(None, description="Page number reference")
    control_ids: Optional[List[str]] = Field(None, description="Related control IDs")
    excerpt: Optional[str] = Field(None, description="Content excerpt")


class QuestionResponse(BaseModel):
    """Question response schema."""
    
    question: str = Field(..., description="Original question")
    answer: str = Field(..., description="Generated answer")
    sources: List[SourceInfo] = Field(..., description="Sources used")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Answer confidence")
    context_length: Optional[int] = Field(None, description="Context size used")
    generation_time: Optional[float] = Field(None, description="AI generation time in seconds")
    language: str = Field(..., description="Language used")
    context_used: Optional[bool] = Field(None, description="Whether assessment context was used")
    assessment_context: Optional[Dict[str, Any]] = Field(None, description="Assessment context summary")
    tier_analysis: Optional[Dict[str, Any]] = Field(None, description="Two-layer retrieval analysis")
    validation_status: Optional[str] = Field(None, description="Citation validation status")


class RecommendationRequest(BaseModel):
    """Recommendation request schema."""
    
    assessment_id: UUID = Field(..., description="Assessment to analyze")
    organization_id: UUID = Field(..., description="Organization ID")
    control_ids: Optional[List[UUID]] = Field(None, description="Specific controls to analyze")
    max_recommendations: int = Field(3, ge=1, le=20, description="Maximum recommendations to generate")
    language: str = Field("hr", pattern="^(hr|en)$", description="Language for recommendations")
    offset: int = Field(0, ge=0, description="Starting position for pagination")
    exclude_control_ids: Optional[List[UUID]] = Field(None, description="Control IDs to exclude from recommendations")


class RecommendationItem(BaseModel):
    """Individual recommendation."""
    
    control_id: UUID = Field(..., description="Control ID")
    control_name: str = Field(..., description="Control name")
    current_score: float = Field(..., ge=0.0, le=5.0, description="Current score")
    target_score: float = Field(..., ge=0.0, le=5.0, description="Target score")
    recommendation: str = Field(..., description="AI-generated recommendation")
    priority: str = Field(..., pattern="^(critical|high|medium|low)$", description="Priority level")
    generated_at: str = Field(..., description="Generation timestamp")
    implementation_steps: Optional[List[str]] = Field(None, description="Implementation steps")
    estimated_effort: Optional[str] = Field(None, description="Estimated effort")
    sources: Optional[List[SourceInfo]] = Field(None, description="Sources used")


class RecommendationResponse(BaseModel):
    """Recommendation response schema."""
    
    assessment_id: UUID = Field(..., description="Assessment ID")
    recommendations: List[RecommendationItem] = Field(..., description="Generated recommendations")
    total_recommendations: int = Field(..., description="Total recommendations")
    summary: Optional[str] = Field(None, description="Summary of recommendations")
    total_gaps: Optional[int] = Field(None, description="Total gaps identified")
    mandatory_gaps: Optional[int] = Field(None, description="Mandatory gaps identified")


class ControlGuidanceRequest(BaseModel):
    """Control guidance request schema."""
    
    control_id: UUID = Field(..., description="Control ID")
    organization_id: UUID = Field(..., description="Organization ID")
    assessment_id: Optional[UUID] = Field(None, description="Assessment context")
    language: str = Field("hr", pattern="^(hr|en)$", description="Language for guidance")


class RoadmapRequest(BaseModel):
    """Roadmap generation request."""
    
    assessment_id: UUID = Field(..., description="Assessment ID")
    organization_id: UUID = Field(..., description="Organization ID")
    language: str = Field("hr", pattern="^(hr|en)$", description="Language for roadmap")
    max_recommendations: int = Field(3, ge=1, le=20, description="Maximum recommendations")


class RoadmapResponse(BaseModel):
    """Roadmap generation response."""
    
    assessment_id: UUID = Field(..., description="Assessment ID")
    roadmap: str = Field(..., description="AI-generated roadmap text")
    total_gaps: int = Field(..., description="Total gaps identified")
    mandatory_gaps: int = Field(..., description="Mandatory gaps identified")
    generated_at: str = Field(..., description="Generation timestamp")
    generation_time: float = Field(..., description="AI generation time")
    language: str = Field(..., description="Language used")


class FeedbackRequest(BaseModel):
    """AI feedback request schema."""
    
    interaction_id: str = Field(..., description="Unique interaction identifier")
    rating: int = Field(..., ge=1, le=5, description="Rating from 1-5")
    helpful: bool = Field(..., description="Whether response was helpful")
    comment: Optional[str] = Field(None, max_length=1000, description="Optional feedback comment")
    interaction_type: str = Field(..., description="Type of AI interaction (search, question, recommendation)")
    response_quality: Optional[str] = Field(None, description="Quality assessment")


class FeedbackResponse(BaseModel):
    """AI feedback response schema."""
    
    success: bool = Field(..., description="Whether feedback was saved")
    message: str = Field(..., description="Response message")
    feedback_id: Optional[str] = Field(None, description="Feedback record ID")


class HealthResponse(BaseModel):
    """AI health check response."""
    
    status: str = Field(..., description="Service status")
    capabilities: Dict[str, bool] = Field(..., description="Available capabilities")
    ollama: Optional[Dict[str, Any]] = Field(None, description="Ollama service status")
    cache_stats: Optional[Dict[str, Any]] = Field(None, description="Cache statistics")
    error: Optional[str] = Field(None, description="Error message if any")