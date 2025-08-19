"""
Compliance document generation API endpoints.
"""
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.core.database import get_async_session
from app.core.auth import get_current_active_user
from app.models.organization import User
from app.models.document_generation import DocumentType, DocumentGenerationJob
from app.services.document_generation_service import DocumentGenerationService
from app.services.background_jobs import enqueue_document_generation
from app.repositories.document_generation import (
    DocumentTemplateRepository,
    DocumentGenerationRepository
)
from app.repositories.assessment import AssessmentRepository
from app.models.organization import Document
from app.models.assessment import Assessment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance-documents", tags=["compliance-documents"])


# Pydantic schemas
class DocumentGenerationRequest(BaseModel):
    """Request model for document generation."""
    assessment_id: UUID = Field(..., description="Assessment ID to generate document for")
    template_version: Optional[str] = Field("latest", description="Template version to use")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Generation options")
    
    class Config:
        json_schema_extra = {
            "example": {
                "assessment_id": "123e4567-e89b-12d3-a456-426614174000",
                "template_version": "latest",
                "options": {
                    "include_ai_analysis": True,
                    "language": "hr",
                    "include_details": True,
                    "responsible_person": {
                        "name": "Ivan Horvat",
                        "title": "Direktor IT-a"
                    }
                }
            }
        }


class BatchGenerationRequest(BaseModel):
    """Request model for batch document generation."""
    assessment_id: UUID = Field(..., description="Assessment ID to generate documents for")
    document_types: List[str] = Field(..., description="List of document types to generate")
    template_version: Optional[str] = Field("latest", description="Template version to use")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Generation options")


class DocumentGenerationResponse(BaseModel):
    """Response model for document generation."""
    document_id: UUID
    job_id: str
    status: str
    status_url: str
    estimated_time_seconds: int
    document_type: str
    created_at: datetime


class DocumentTemplateResponse(BaseModel):
    """Response model for document template."""
    id: UUID
    template_key: str
    name: str
    description: Optional[str]
    version: str
    is_active: bool
    organization_id: Optional[UUID]
    created_at: datetime
    document_types: List[str]


class DocumentStatusResponse(BaseModel):
    """Response model for document generation status."""
    document_id: UUID
    job_id: Optional[str]
    status: str
    document_type: str
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    download_url: Optional[str]
    file_size: Optional[int] = None
    template_version: Optional[str] = "latest"


# Endpoints
@router.post(
    "/generate/{document_type}",
    response_model=DocumentGenerationResponse,
    status_code=http_status.HTTP_202_ACCEPTED,
    summary="Generate compliance document",
    description="Generate a specific compliance document for an assessment",
)
async def generate_compliance_document(
    document_type: str,
    request: DocumentGenerationRequest,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Generate a compliance document asynchronously."""
    
    # Validate document type
    if document_type not in DocumentType.get_all():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type. Valid types: {', '.join(DocumentType.get_all())}"
        )
    
    # Validate assessment access
    assessment_repo = AssessmentRepository(db)
    assessment = await assessment_repo.get_by_id(request.assessment_id)
    
    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found or access denied"
        )
    
    if assessment.status not in ["completed", "review"]:
        logger.warning(f"Assessment {assessment.id} is in status {assessment.status}, proceeding anyway")
    
    try:
        # Find template for the document type
        template_repo = DocumentTemplateRepository(db)
        template = await template_repo.get_active_template(
            template_key=document_type,
            organization_id=UUID(current_user.organization_id)
        )
        
        if not template:
            raise HTTPException(
                status_code=404,
                detail=f"No active template found for document type: {document_type}"
            )
        
        # Create document record
        document = Document(
            organization_id=UUID(current_user.organization_id),
            document_type=document_type,
            name=f"{DocumentType.get_display_name(document_type)} - {assessment.title}",
            description=f"Generated from assessment: {assessment.title}",
            status="pending",
            generation_metadata={
                "assessment_id": str(assessment.id),
                "requested_by": current_user.id,
                "requested_at": datetime.utcnow().isoformat(),
            }
        )
        db.add(document)
        await db.flush()
        
        # Create generation job record
        gen_repo = DocumentGenerationRepository(db)
        job_record = await gen_repo.create_job(
            document_id=document.id,
            assessment_id=assessment.id,
            document_type=document_type,
            template_id=template.id,
            options=request.options,
            organization_id=UUID(current_user.organization_id),
            created_by=UUID(current_user.id) if current_user.id else None
        )
        
        await db.commit()
        
        # Enqueue background job
        job_id = enqueue_document_generation(
            document_id=document.id,
            assessment_id=assessment.id,
            document_type=document_type,
            template_version=request.template_version,
            options=request.options
        )
        
        # Update job record with RQ job ID
        await gen_repo.update_job_status(job_record.id, "pending", job_id_rq=job_id)
        await db.commit()
        
        return DocumentGenerationResponse(
            document_id=document.id,
            job_id=job_id,
            status="pending",
            status_url=f"/api/v1/compliance-documents/{document.id}/status",
            estimated_time_seconds=30,
            document_type=document_type,
            created_at=document.created_at
        )
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to generate document: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate document generation: {str(e)}"
        )


@router.post(
    "/generate/batch",
    response_model=List[DocumentGenerationResponse],
    status_code=http_status.HTTP_202_ACCEPTED,
    summary="Generate multiple compliance documents",
    description="Generate multiple compliance documents for an assessment",
)
async def generate_multiple_documents(
    request: BatchGenerationRequest,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Generate multiple compliance documents asynchronously."""
    
    # Validate document types
    invalid_types = [dt for dt in request.document_types if dt not in DocumentType.get_all()]
    if invalid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document types: {', '.join(invalid_types)}"
        )
    
    # Validate assessment access
    assessment_repo = AssessmentRepository(db)
    assessment = await assessment_repo.get_by_id(request.assessment_id)
    
    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found or access denied"
        )
    
    responses = []
    
    try:
        template_repo = DocumentTemplateRepository(db)
        template_cache = {}
        
        for document_type in request.document_types:
            # Get template from cache or fetch it
            if document_type not in template_cache:
                template = await template_repo.get_active_template(
                    template_key=document_type,
                    organization_id=UUID(current_user.organization_id)
                )
                
                if not template:
                    raise HTTPException(
                        status_code=404,
                        detail=f"No active template found for document type: {document_type}"
                    )
                
                template_cache[document_type] = template
            else:
                template = template_cache[document_type]
            
            # Create document record
            document = Document(
                organization_id=UUID(current_user.organization_id),
                document_type=document_type,
                name=f"{DocumentType.get_display_name(document_type)} - {assessment.title}",
                description=f"Generated from assessment: {assessment.title}",
                status="pending",
                generation_metadata={
                    "assessment_id": str(assessment.id),
                    "requested_by": current_user.id,
                    "requested_at": datetime.utcnow().isoformat(),
                    "batch_generation": True,
                }
            )
            db.add(document)
            await db.flush()
            
            # Create generation job record
            gen_repo = DocumentGenerationRepository(db)
            job_record = await gen_repo.create_job(
                document_id=document.id,
                assessment_id=assessment.id,
                document_type=document_type,
                template_id=template.id,
                options=request.options,
                organization_id=UUID(current_user.organization_id),
                created_by=UUID(current_user.id) if current_user.id else None
            )
            
            # Enqueue background job
            job_id = enqueue_document_generation(
                document_id=document.id,
                assessment_id=assessment.id,
                document_type=document_type,
                template_version=request.template_version,
                options=request.options
            )
            
            # Update job record with RQ job ID
            await gen_repo.update_job_status(job_record.id, "pending", job_id_rq=job_id)
            
            responses.append(DocumentGenerationResponse(
                document_id=document.id,
                job_id=job_id,
                status="pending",
                status_url=f"/api/v1/compliance-documents/{document.id}/status",
                estimated_time_seconds=30,
                document_type=document_type,
                created_at=document.created_at
            ))
        
        await db.commit()
        return responses
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to generate batch documents: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate batch document generation: {str(e)}"
        )


@router.get(
    "/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Get document generation status",
    description="Get the status of a document generation job",
)
async def get_document_status(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Get the status of a document generation job."""
    
    # Get document
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == UUID(current_user.organization_id)
        )
    )
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found or access denied"
        )
    
    # Get generation job
    gen_repo = DocumentGenerationRepository(db)
    job = await gen_repo.get_job_by_document_id(document_id)
    
    if not job:
        # Document exists but no job - shouldn't happen
        return DocumentStatusResponse(
            document_id=document.id,
            job_id=None,
            status=document.status,
            document_type=document.document_type,
            created_at=document.created_at,
            started_at=None,
            completed_at=None,
            error_message=None,
            download_url=None
        )
    
    # Prepare download URL if completed
    download_url = None
    if job.status == "completed" and document.status == "completed":
        download_url = f"/api/v1/documents/{document.id}/download"
    
    return DocumentStatusResponse(
        document_id=document.id,
        job_id=job.job_id,
        status=job.status,
        document_type=job.document_type,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        download_url=download_url
    )


@router.get(
    "/templates",
    response_model=List[DocumentTemplateResponse],
    summary="List available document templates",
    description="Get all available document templates for the organization",
)
async def list_templates(
    active_only: bool = Query(True, description="Only return active templates"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """List all available document templates."""
    
    template_repo = DocumentTemplateRepository(db)
    
    if active_only:
        templates = await template_repo.get_all_active_templates(
            organization_id=UUID(current_user.organization_id)
        )
    else:
        # Get all templates (would need to implement this method)
        templates = await template_repo.get_all_active_templates(
            organization_id=UUID(current_user.organization_id)
        )
    
    # Group by template key to show available document types
    template_map = {}
    for template in templates:
        if template.template_key not in template_map:
            template_map[template.template_key] = template
    
    # Convert to response models
    response = []
    for template in template_map.values():
        # Determine which document types this template supports
        document_types = []
        if "compliance_declaration" in template.template_key:
            document_types.append(DocumentType.COMPLIANCE_DECLARATION)
        elif "self_assessment" in template.template_key:
            document_types.append(DocumentType.SELF_ASSESSMENT_REPORT)
        elif "internal_record" in template.template_key:
            document_types.append(DocumentType.INTERNAL_RECORD)
        elif "evaluation" in template.template_key:
            document_types.append(DocumentType.EVALUATION_REPORT)
        elif "action_plan" in template.template_key:
            document_types.append(DocumentType.ACTION_PLAN)
        
        response.append(DocumentTemplateResponse(
            id=template.id,
            template_key=template.template_key,
            name=template.name,
            description=template.description,
            version=template.version,
            is_active=template.is_active,
            organization_id=template.organization_id,
            created_at=template.created_at,
            document_types=document_types
        ))
    
    return response


@router.get(
    "/assessment/{assessment_id}/generated",
    response_model=List[DocumentStatusResponse],
    summary="List generated documents for assessment",
    description="Get all documents generated for a specific assessment",
)
async def list_assessment_documents(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """List all documents generated for an assessment."""
    
    # Validate assessment access
    assessment_repo = AssessmentRepository(db)
    assessment = await assessment_repo.get_by_id(
        assessment_id,
    )
    
    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found or access denied"
        )
    
    # Get all generation jobs for assessment
    gen_repo = DocumentGenerationRepository(db)
    jobs = await gen_repo.get_jobs_by_assessment(assessment_id)
    
    # Convert to response models
    responses = []
    for job in jobs:
        download_url = None
        file_size = 0
        
        if job.status == "completed" and job.document:
            download_url = f"/api/v1/documents/{job.document_id}/download"
            # Get file size from generation_metadata
            if job.document and job.document.generation_metadata:
                file_size = job.document.generation_metadata.get('file_size', 0)
        
        # Get template version if available
        template_version = "latest"
        if job.template and hasattr(job.template, 'version'):
            template_version = job.template.version
        
        responses.append(DocumentStatusResponse(
            document_id=job.document_id,
            job_id=job.job_id,
            status=job.status,
            document_type=job.document_type,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            download_url=download_url,
            file_size=file_size,
            template_version=template_version
        ))
    
    return responses


@router.delete(
    "/{document_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    summary="Delete a generated document",
    description="Delete a generated compliance document and its associated files",
)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a generated document."""
    
    # Get the document
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )
    
    # Check permission - only document owner or admin can delete
    if str(document.organization_id) != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to delete this document"
        )
    
    try:
        # Get the file path from generation metadata
        file_path = None
        if document.generation_metadata and 'file_path' in document.generation_metadata:
            file_path = document.generation_metadata['file_path']
        
        # Delete the physical file if it exists
        if file_path:
            import os
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Deleted file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete physical file {file_path}: {e}")
        
        # Delete related generation job if exists
        gen_job = await db.execute(
            select(DocumentGenerationJob).where(
                DocumentGenerationJob.document_id == document_id
            )
        )
        job = gen_job.scalar_one_or_none()
        if job:
            await db.delete(job)
        
        # Delete the document record
        await db.delete(document)
        await db.commit()
        
        logger.info(f"Successfully deleted document {document_id}")
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete document {document_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete document: {str(e)}"
        )