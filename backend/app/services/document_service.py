"""Document service for handling document upload and processing."""

import logging
import mimetypes
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, BinaryIO

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ProcessedDocument
from app.repositories.document import ProcessedDocumentRepository
from app.schemas.document import ProcessedDocumentCreate, DocumentStatsResponse

# Configure logging
logger = logging.getLogger(__name__)


class DocumentService:
    """Service for document operations."""

    # Configuration
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
    ALLOWED_MIME_TYPES = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    }
    UPLOAD_DIR = Path("/app/uploads")

    def __init__(self, db: AsyncSession):
        self.db = db
        self.document_repo = ProcessedDocumentRepository(db)
        
        # Ensure upload directory exists
        try:
            self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            logger.info(f"Upload directory ensured at: {self.UPLOAD_DIR}")
        except Exception as e:
            logger.error(f"Failed to create upload directory: {e}")
            raise

    async def upload_document(
        self,
        file: UploadFile,
        document_data: ProcessedDocumentCreate,
        organization_id: uuid.UUID,
    ) -> ProcessedDocument:
        """Upload and store a document for processing."""
        
        logger.info(f"Starting document upload for org {organization_id}")
        
        # Validate file
        self._validate_file(file)
        logger.info(f"File validation passed for {file.filename}")
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = self.UPLOAD_DIR / unique_filename
        logger.info(f"Generated file path: {file_path}")
        
        # Save file to disk
        try:
            content = await file.read()
            logger.info(f"Read {len(content)} bytes from uploaded file")
            
            with open(file_path, "wb") as buffer:
                buffer.write(content)
                logger.info(f"File saved successfully to {file_path}")
        except Exception as e:
            logger.error(f"Failed to save file: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save file: {str(e)}"
            )
        
        # Create document record
        try:
            logger.info("Creating document record in database")
            document = await self.document_repo.create(
                organization_id=organization_id,
                scope="organization",
                is_global=False,
                title=document_data.title,
                file_name=file.filename,
                file_size=len(content),
                mime_type=file.content_type,
                status="pending",
                upload_date=datetime.now(),
                processing_metadata={
                    "file_path": str(file_path),
                    "tags": document_data.tags,
                    "upload_source": "api",
                }
            )
            logger.info(f"Document record created with ID: {document.id}")
            
            await self.db.commit()
            logger.info("Transaction committed successfully")
            
            # Enqueue document for background processing
            try:
                from app.services.background_jobs import enqueue_document_processing
                job_id = enqueue_document_processing(
                    document_id=document.id,
                    organization_id=organization_id,
                    is_global=False
                )
                logger.info(f"Document {document.id} enqueued for processing with job ID: {job_id}")
            except Exception as e:
                logger.error(f"Failed to enqueue document for processing: {e}")
                # Don't fail the upload if enqueueing fails
                
            return document
        except Exception as e:
            logger.error(f"Failed to create document record: {str(e)}", exc_info=True)
            # Try to clean up the file if database creation failed
            try:
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Cleaned up file {file_path} after database error")
            except Exception as cleanup_error:
                logger.error(f"Failed to clean up file: {cleanup_error}")
            raise
    
    async def upload_global_document(
        self,
        file: UploadFile,
        document_data: ProcessedDocumentCreate,
        uploaded_by: str,
        document_type: Optional[str] = None,
        source: Optional[str] = None,
    ) -> ProcessedDocument:
        """Upload a global document accessible to all organizations."""
        
        # Validate file
        self._validate_file(file)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix.lower()
        unique_filename = f"global_{uuid.uuid4()}{file_extension}"
        file_path = self.UPLOAD_DIR / "global" / unique_filename
        
        # Ensure global directory exists
        file_path.parent.mkdir(exist_ok=True)
        
        # Save file to disk
        try:
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save file: {str(e)}"
            )
        
        # Create global document record
        document = await self.document_repo.create_global_document(
            title=document_data.title,
            file_name=file.filename,
            file_size=len(content),
            uploaded_by=uploaded_by,
            document_type=document_type,
            source=source,
            mime_type=file.content_type,
            processing_metadata={
                "file_path": str(file_path),
                "tags": document_data.tags,
                "upload_source": "admin_api",
            }
        )
        
        await self.db.commit()
        
        # Enqueue document for background processing
        try:
            from app.services.background_jobs import enqueue_document_processing
            job_id = enqueue_document_processing(
                document_id=document.id,
                organization_id=None,
                is_global=True
            )
            logger.info(f"Global document {document.id} enqueued for processing with job ID: {job_id}")
        except Exception as e:
            logger.error(f"Failed to enqueue global document for processing: {e}")
            # Don't fail the upload if enqueueing fails
            
        return document

    async def get_documents(
        self,
        organization_id: uuid.UUID,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        include_global: bool = False,  # ❌ CHANGED: Default to FALSE for tenant isolation
    ) -> tuple[List[ProcessedDocument], int]:
        """Get documents with optional filtering.
        
        Args:
            organization_id: Organization ID
            status: Optional status filter
            search: Optional search term
            limit: Maximum number of results
            offset: Offset for pagination
            include_global: Whether to include global documents (defaults to False for security)
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[DOCUMENT_SERVICE] Getting documents for org {organization_id}, include_global: {include_global}")
        
        if search:
            # TODO: Update search_by_title to support global documents
            documents = await self.document_repo.search_by_title(
                organization_id=organization_id,
                search_term=search,
                limit=limit,
            )
            total = len(documents)
        else:
            documents = await self.document_repo.get_by_organization(
                organization_id=organization_id,
                status=status,
                limit=limit,
                offset=offset,
                include_global=include_global,
            )
            
            # Get total count for pagination
            all_docs = await self.document_repo.get_by_organization(
                organization_id=organization_id,
                status=status,
                include_global=include_global,
            )
            total = len(all_docs)
        
        logger.info(f"[DOCUMENT_SERVICE] Found {total} documents (include_global: {include_global})")
        return documents, total
    
    async def get_global_documents(
        self,
        status: Optional[str] = None,
        document_type: Optional[str] = None,
        source: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> tuple[List[ProcessedDocument], int]:
        """Get global documents with optional filtering."""
        
        documents = await self.document_repo.get_global_documents(
            status=status,
            document_type=document_type,
            source=source,
            limit=limit,
            offset=offset,
        )
        
        # Get total count
        all_docs = await self.document_repo.get_global_documents(
            status=status,
            document_type=document_type,
            source=source,
        )
        total = len(all_docs)
        
        return documents, total

    async def get_document_by_id(
        self,
        document_id: uuid.UUID,
        organization_id: uuid.UUID,
        include_chunks: bool = False,
    ) -> Optional[ProcessedDocument]:
        """Get a specific document by ID."""
        
        if include_chunks:
            document = await self.document_repo.get_with_chunks(document_id)
        else:
            document = await self.document_repo.get_by_id(document_id)
        
        if not document:
            return None
            
        # Check access permissions
        if document.is_global:
            # Global documents are accessible to all
            return document
        elif document.organization_id != organization_id:
            # Organization documents require ownership
            raise HTTPException(
                status_code=403,
                detail="Access denied: Document belongs to different organization"
            )
        
        return document

    async def get_document_stats(
        self,
        organization_id: uuid.UUID,
    ) -> DocumentStatsResponse:
        """Get document processing statistics."""
        
        stats = await self.document_repo.get_processing_stats(organization_id)
        
        # Add language distribution (placeholder for now)
        stats["language_distribution"] = {"hr": 0, "en": 0}
        
        # Add processing stats (placeholder for now)
        stats["processing_stats"] = {
            "avg_processing_time": 0.0,
            "total_chunks": 0,
            "avg_chunks_per_doc": 0,
        }
        
        return DocumentStatsResponse(**stats)

    async def delete_document(
        self,
        document_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> bool:
        """Delete a document and its associated files."""
        
        # Get document to verify ownership and get file path
        document = await self.get_document_by_id(document_id, organization_id)
        if not document:
            return False
        
        # Delete physical file
        if document.processing_metadata and "file_path" in document.processing_metadata:
            file_path = Path(document.processing_metadata["file_path"])
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception:
                    pass  # Log error but continue with database deletion
        
        # Delete embeddings from PGVector first
        from app.services.vector_service import VectorService
        vector_service = VectorService(self.db)
        try:
            await vector_service.delete_documents(
                document_id=document_id,
                organization_id=organization_id
            )
        except Exception as e:
            # Log error but continue - embeddings might not exist
            pass
        
        # Delete database record (cascade will handle chunks)
        success = await self.document_repo.delete(document_id)
        
        if success:
            await self.db.commit()
        
        return success

    async def get_failed_documents(
        self,
        organization_id: uuid.UUID,
    ) -> List[ProcessedDocument]:
        """Get all failed documents for reprocessing."""
        return await self.document_repo.get_failed_documents(organization_id)

    def _validate_file(self, file: UploadFile) -> None:
        """Validate uploaded file."""
        
        # Check file size
        if hasattr(file, 'size') and file.size > self.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {self.MAX_FILE_SIZE / 1024 / 1024:.1f}MB"
            )
        
        # Check file extension
        if file.filename:
            file_extension = Path(file.filename).suffix.lower()
            if file_extension not in self.ALLOWED_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"File type not allowed. Allowed types: {', '.join(self.ALLOWED_EXTENSIONS)}"
                )
        
        # Check MIME type
        if file.content_type and file.content_type not in self.ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"MIME type not allowed: {file.content_type}"
            )
        
        # Security check: ensure filename doesn't contain path traversal
        if file.filename and (".." in file.filename or "/" in file.filename or "\\" in file.filename):
            raise HTTPException(
                status_code=400,
                detail="Invalid filename: path traversal detected"
            )

    def _extract_metadata(self, file_path: Path, content: bytes) -> dict:
        """Extract basic metadata from file."""
        
        metadata = {
            "file_size": len(content),
            "file_extension": file_path.suffix.lower(),
        }
        
        # Add MIME type detection
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type:
            metadata["detected_mime_type"] = mime_type
        
        return metadata