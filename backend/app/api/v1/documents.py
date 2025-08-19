"""Document management API endpoints for Sprint 3."""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.auth import get_current_active_user
from app.models.organization import User

# Configure logging
logger = logging.getLogger(__name__)
from app.schemas.document import (
    ProcessedDocumentCreate,
    ProcessedDocumentResponse,
    ProcessedDocumentWithChunks,
    ProcessedDocumentListResponse,
    DocumentStatsResponse,
    DocumentProcessingRequest,
    DocumentProcessingJobResponse,
    DocumentProcessingStatusResponse,
    ErrorResponse,
    OperationResponse,
)
from app.services.document_service import DocumentService
from app.services.background_jobs import DocumentJobService

router = APIRouter(prefix="/documents", tags=["documents"])



@router.post(
    "/upload",
    response_model=ProcessedDocumentResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Upload compliance document",
    description="Upload a compliance document (PDF, DOCX, TXT) for processing.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid file or request"},
        413: {"model": ErrorResponse, "description": "File too large"},
        500: {"model": ErrorResponse, "description": "Upload failed"},
    },
)
async def upload_document(
    file: UploadFile = File(..., description="Document file to upload"),
    title: str = Form(..., description="Document title"),
    tags: Optional[str] = Form(None, description="Comma-separated tags"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a compliance document for processing."""
    
    logger.info(f"Starting document upload - title: {title}, filename: {file.filename}, content_type: {file.content_type}")
    
    try:
        # Parse tags
        tag_list = []
        if tags:
            tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
            logger.debug(f"Parsed tags: {tag_list}")
        
        # Create document data
        document_data = ProcessedDocumentCreate(
            title=title,
            tags=tag_list
        )
        
        # Upload document
        logger.info(f"Creating DocumentService and uploading for org_id: {current_user.organization_id}")
        document_service = DocumentService(db)
        document = await document_service.upload_document(
            file=file,
            document_data=document_data,
            organization_id=UUID(current_user.organization_id),
        )
        
        logger.info(f"Document uploaded successfully with ID: {document.id}")
        return ProcessedDocumentResponse.model_validate(document)
        
    except HTTPException as he:
        logger.error(f"HTTP Exception during upload: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during document upload: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload document: {str(e)}"
        )


@router.get(
    "/",
    response_model=ProcessedDocumentListResponse,
    summary="List documents",
    description="List uploaded documents with filtering and pagination.",
)
async def list_documents(
    status: Optional[str] = Query(
        None, 
        description="Filter by status (pending, processing, completed, failed, deleted)"
    ),
    search: Optional[str] = Query(None, description="Search in title and filename"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    include_global: bool = Query(False, description="Include global documents (defaults to false for security)"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """List uploaded documents with optional filtering."""
    import logging
    logger = logging.getLogger(__name__)
    
    org_id = UUID(current_user.organization_id)
    
    logger.info(f"[DOCUMENTS_API] List request from user {current_user.id} for org {org_id}")
    logger.info(f"[DOCUMENTS_API] Parameters: status={status}, search={search}, include_global={include_global}")
    
    document_service = DocumentService(db)
    documents, total = await document_service.get_documents(
        organization_id=org_id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
        include_global=include_global,  # Explicitly pass the parameter
    )
    
    logger.info(f"[DOCUMENTS_API] Returning {len(documents)} documents, total: {total}")
    
    return ProcessedDocumentListResponse(
        documents=[ProcessedDocumentResponse.model_validate(doc) for doc in documents],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/stats",
    response_model=DocumentStatsResponse,
    summary="Get document statistics",
    description="Get organization's document processing statistics.",
)
async def get_document_stats(
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Get document processing statistics for the organization."""
    import logging
    logger = logging.getLogger(__name__)
    
    org_id = UUID(current_user.organization_id)
    logger.info(f"[DOCUMENTS_STATS] Stats request from user {current_user.id} for org {org_id}")
    
    document_service = DocumentService(db)
    stats = await document_service.get_document_stats(org_id)
    
    logger.info(f"[DOCUMENTS_STATS] Returning stats: total={stats.total_documents}, size={stats.total_size_bytes}")
    
    return stats


@router.get(
    "/{document_id}",
    response_model=ProcessedDocumentWithChunks,
    summary="Get document details",
    description="Get detailed information about a specific document.",
    responses={
        404: {"model": ErrorResponse, "description": "Document not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_document(
    document_id: UUID,
    include_chunks: bool = Query(False, description="Include document chunks in response"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Get detailed information about a specific document."""
    
    document_service = DocumentService(db)
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=UUID(current_user.organization_id),
        include_chunks=include_chunks,
    )
    
    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Document with ID {document_id} not found"
        )
    
    # Count chunks
    chunk_count = len(document.chunks) if hasattr(document, 'chunks') and document.chunks else 0
    
    response_data = ProcessedDocumentResponse.model_validate(document)
    return ProcessedDocumentWithChunks(
        **response_data.model_dump(),
        chunk_count=chunk_count,
        chunks=None,  # TODO: Add chunk responses when needed
    )


@router.post(
    "/{document_id}/process",
    response_model=DocumentProcessingJobResponse,
    summary="Process document",
    description="Trigger document processing and embedding generation.",
    responses={
        404: {"model": ErrorResponse, "description": "Document not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def process_document(
    document_id: UUID,
    request: DocumentProcessingRequest = DocumentProcessingRequest(),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Trigger document processing and embedding generation."""
    
    document_service = DocumentService(db)
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=UUID(current_user.organization_id),
    )
    
    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Document with ID {document_id} not found"
        )
    
    # Enqueue document for background processing
    job_service = DocumentJobService(db)
    job_id = job_service.enqueue_processing_job(document_id)
    
    return DocumentProcessingJobResponse(
        job_id=job_id,
        status="queued",
        estimated_time=300,  # 5 minutes estimate
        message="Document processing queued successfully"
    )


@router.get(
    "/{document_id}/status",
    response_model=DocumentProcessingStatusResponse,
    summary="Get processing status",
    description="Check document processing progress.",
    responses={
        404: {"model": ErrorResponse, "description": "Document not found"},
    },
)
async def get_processing_status(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Check document processing progress."""
    
    document_service = DocumentService(db)
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=UUID(current_user.organization_id),
    )
    
    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Document with ID {document_id} not found"
        )
    
    # Mock progress data
    progress = {
        "pages_processed": 0,
        "total_pages": 0,
        "chunks_created": 0,
        "embeddings_generated": 0,
        "percentage": 0 if document.status == "pending" else 100,
    }
    
    return DocumentProcessingStatusResponse(
        document_id=document_id,
        status=document.status,
        progress=progress,
        started_at=document.created_at,
        estimated_completion=None,
    )


@router.get(
    "/{document_id}/download",
    summary="Download document",
    description="Download a generated compliance document.",
    responses={
        404: {"model": ErrorResponse, "description": "Document not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def download_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Download a generated compliance document."""
    from fastapi.responses import FileResponse
    from pathlib import Path
    from app.models.organization import Document
    from sqlalchemy import select
    
    # Get document from database
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
            detail=f"Document with ID {document_id} not found"
        )
    
    # Check if document has been generated
    if document.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Document is not ready for download. Status: {document.status}"
        )
    
    # Get file path from generation metadata
    if not document.generation_metadata or "file_path" not in document.generation_metadata:
        raise HTTPException(
            status_code=500,
            detail="Document file path not found in metadata"
        )
    
    file_path = Path(document.generation_metadata["file_path"])
    
    # Check if file exists
    if not file_path.exists():
        logger.error(f"Generated file not found at: {file_path}")
        raise HTTPException(
            status_code=500,
            detail="Generated document file not found on server"
        )
    
    # Determine content type based on file extension
    content_type = "application/pdf"
    if file_path.suffix.lower() == ".html":
        content_type = "text/html"
    
    # Return file
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_path.name}"'
        }
    )


@router.delete(
    "/{document_id}",
    response_model=OperationResponse,
    summary="Delete document",
    description="Delete a document and its associated data.",
    responses={
        404: {"model": ErrorResponse, "description": "Document not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a document and its associated data."""
    
    document_service = DocumentService(db)
    success = await document_service.delete_document(
        document_id=document_id,
        organization_id=UUID(current_user.organization_id),
    )
    
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Document with ID {document_id} not found"
        )
    
    return OperationResponse(
        success=True,
        message="Document deleted successfully"
    )