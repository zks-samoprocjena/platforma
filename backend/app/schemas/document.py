"""Document processing Pydantic schemas for Sprint 3."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.core.utils import to_camel


class DocumentMetadata(BaseModel):
    """Metadata for document processing."""
    page_count: Optional[int] = None
    word_count: Optional[int] = None
    language: Optional[str] = None
    processing_time: Optional[float] = None
    tags: List[str] = Field(default_factory=list)


class ChunkMetadata(BaseModel):
    """Metadata for document chunks."""
    page_number: Optional[int] = None
    section: Optional[str] = None
    heading: Optional[str] = None


class ProcessedDocumentCreate(BaseModel):
    """Schema for creating a new processed document."""
    title: str = Field(..., min_length=1, max_length=255)
    tags: List[str] = Field(default_factory=list, max_length=10)


class GlobalDocumentCreate(ProcessedDocumentCreate):
    """Schema for creating a global document (admin only)."""
    document_type: str = Field(..., description="Type: standard, regulation, guideline, best_practice")
    source: str = Field(..., description="Source: ISO, NIST, ZKS, NIS2, other")


class ProcessedDocumentResponse(BaseModel):
    """Schema for processed document response."""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    id: UUID
    organization_id: Optional[UUID]  # Nullable for global documents
    scope: str = "organization"
    is_global: bool = False
    document_type: Optional[str] = None
    source: Optional[str] = None
    uploaded_by: Optional[UUID] = None
    title: str
    file_name: str
    file_size: int
    mime_type: Optional[str]
    status: str
    upload_date: datetime
    processed_date: Optional[datetime]
    processing_metadata: Optional[DocumentMetadata]
    created_at: datetime
    updated_at: datetime


class ProcessedDocumentWithChunks(ProcessedDocumentResponse):
    """Schema for document with chunks."""
    chunk_count: int
    chunks: Optional[List["DocumentChunkResponse"]] = None


class ProcessedDocumentListResponse(BaseModel):
    """Schema for paginated document list."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    documents: List[ProcessedDocumentResponse]
    total: int
    limit: int
    offset: int


# Alias for consistency with admin API
class DocumentListResponse(BaseModel):
    """Schema for paginated document list (alias)."""
    items: List[ProcessedDocumentResponse]
    total: int
    limit: int
    offset: int


class DocumentChunkResponse(BaseModel):
    """Schema for document chunk response."""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    id: UUID
    processed_document_id: UUID
    chunk_index: int
    content: str
    chunk_metadata: Optional[ChunkMetadata]
    created_at: datetime


class DocumentChunkWithSimilarity(DocumentChunkResponse):
    """Schema for chunk with similarity score."""
    similarity_score: float
    document_title: str


class DocumentProcessingRequest(BaseModel):
    """Schema for triggering document processing."""
    force_reprocess: bool = False
    chunk_size: int = Field(default=512, ge=100, le=2000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)


class DocumentProcessingJobResponse(BaseModel):
    """Schema for processing job response."""
    job_id: str
    status: str
    estimated_time: int
    message: str


class DocumentProcessingStatusResponse(BaseModel):
    """Schema for processing status response."""
    document_id: UUID
    status: str
    progress: dict
    started_at: Optional[datetime]
    estimated_completion: Optional[datetime]


class DocumentStatsResponse(BaseModel):
    """Schema for document statistics."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    total_documents: int
    total_size_bytes: int
    status_breakdown: dict
    language_distribution: Optional[dict] = None
    processing_stats: Optional[dict] = None


class GlobalDocumentStats(BaseModel):
    """Schema for global document statistics (admin only)."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    total_documents: int
    total_size_bytes: int
    status_breakdown: dict  # Record<DocumentStatus, number>
    type_distribution: dict  # Record<DocumentType, number>
    source_distribution: dict  # Record<DocumentSource, number>
    supported_languages: List[str]


class AIRecommendationResponse(BaseModel):
    """Schema for AI recommendation response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    assessment_id: UUID
    control_id: Optional[UUID]
    control_name: Optional[str] = None
    recommendation_type: str
    content: str
    confidence_score: Optional[float]
    priority: Optional[str] = None
    estimated_effort: Optional[str] = None
    sources: List[dict] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)
    created_at: datetime


class AIRecommendationRequest(BaseModel):
    """Schema for requesting AI recommendations."""
    assessment_id: UUID
    control_ids: Optional[List[UUID]] = None
    recommendation_types: List[str] = Field(default=["improvement"])
    context: Optional[dict] = None
    use_uploaded_documents: bool = True
    language: str = "hr"


class AIRecommendationListResponse(BaseModel):
    """Schema for recommendation list response."""
    assessment_id: UUID
    recommendations: List[AIRecommendationResponse]
    generated_at: datetime
    processing_time: float


class DocumentSearchRequest(BaseModel):
    """Schema for document search request."""
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.7, ge=0.0, le=1.0)
    filters: Optional[dict] = None


class DocumentSearchResponse(BaseModel):
    """Schema for search results."""
    query: str
    results: List[DocumentChunkWithSimilarity]
    total_results: int
    processing_time: float


class DocumentReprocessRequest(BaseModel):
    """Schema for reprocessing failed documents."""
    document_ids: Optional[List[UUID]] = None  # If None, reprocess all failed


class DocumentReprocessResponse(BaseModel):
    """Schema for reprocess response."""
    reprocessed_count: int
    job_ids: List[str]
    estimated_total_time: int


class ErrorResponse(BaseModel):
    """Standard error response schema."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    error: dict
    timestamp: datetime = Field(default_factory=datetime.now)


class OperationResponse(BaseModel):
    """Standard operation response schema."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel
    )
    
    success: bool
    message: str
    data: Optional[dict] = None


# Forward reference resolution for recursive schemas
ProcessedDocumentWithChunks.model_rebuild()