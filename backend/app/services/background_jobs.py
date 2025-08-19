"""Background job processing for document workflows."""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from uuid import UUID

import redis
from rq import Queue, Worker
from rq.job import Job
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.repositories.document import ProcessedDocumentRepository
from app.services.vector_service import VectorService


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis connection
redis_conn = redis.Redis(host='redis', port=6379, db=0)
document_queue = Queue('document_processing', connection=redis_conn)
generation_queue = Queue('document_generation', connection=redis_conn)
recommendation_queue = Queue('recommendations', connection=redis_conn)


class DocumentJobService:
    """Service for managing document processing jobs."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.document_repo = ProcessedDocumentRepository(db)
    
    def enqueue_processing_job(self, document_id: UUID) -> str:
        """Enqueue a document for background processing."""
        
        job = document_queue.enqueue(
            process_document_job,
            document_id=str(document_id),
            job_timeout='10m',  # 10 minute timeout
            result_ttl='1h',    # Keep results for 1 hour
        )
        
        logger.info(f"Enqueued document processing job {job.id} for document {document_id}")
        return job.id
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get status of a background job."""
        
        try:
            job = Job.fetch(job_id, connection=redis_conn)
            
            status_info = {
                "id": job.id,
                "status": job.get_status(),
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "ended_at": job.ended_at.isoformat() if job.ended_at else None,
                "result": job.result,
                "exc_info": job.exc_info,
            }
            
            # Add progress information if available
            if hasattr(job, 'meta') and job.meta:
                status_info["progress"] = job.meta
            
            return status_info
            
        except Exception as e:
            logger.error(f"Failed to get job status for {job_id}: {e}")
            return {
                "id": job_id,
                "status": "unknown",
                "error": str(e),
            }
    
    async def update_document_status(
        self, 
        document_id: UUID, 
        status: str, 
        processing_metadata: Optional[Dict[str, Any]] = None
    ):
        """Update document processing status."""
        
        update_data = {"status": status}
        
        if status == "processing":
            update_data["processing_started_at"] = datetime.now()
        elif status in ["completed", "failed"]:
            update_data["processed_date"] = datetime.now()
        
        if processing_metadata:
            existing_doc = await self.document_repo.get_by_id(document_id)
            if existing_doc and existing_doc.processing_metadata:
                # Merge with existing metadata
                merged_metadata = existing_doc.processing_metadata.copy()
                merged_metadata.update(processing_metadata)
                update_data["processing_metadata"] = merged_metadata
            else:
                update_data["processing_metadata"] = processing_metadata
        
        await self.document_repo.update(document_id, **update_data)
        await self.db.commit()


def process_document_job(document_id: str) -> Dict[str, Any]:
    """Background job to process a document."""
    
    logger.info(f"Starting document processing for {document_id}")
    
    try:
        # Create async event loop for job
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the processing
        result = loop.run_until_complete(_process_document_async(UUID(document_id)))
        
        logger.info(f"Successfully processed document {document_id}")
        return result
        
    except Exception as e:
        logger.error(f"Failed to process document {document_id}: {e}")
        
        # Update document status to failed
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_mark_document_failed(UUID(document_id), str(e)))
        except Exception as update_error:
            logger.error(f"Failed to update document status: {update_error}")
        
        raise e
    
    finally:
        loop.close()


async def _process_document_async(document_id: UUID) -> Dict[str, Any]:
    """Async function to process document with database session."""
    
    async with async_session_maker() as db:
        try:
            # Initialize services
            job_service = DocumentJobService(db)
            vector_service = VectorService(db)
            doc_repo = ProcessedDocumentRepository(db)
            
            # Get document
            document = await doc_repo.get_by_id(document_id)
            if not document:
                raise ValueError(f"Document {document_id} not found")
            
            # Update status to processing
            await job_service.update_document_status(
                document_id, 
                "processing",
                {"processing_started_at": datetime.now().isoformat()}
            )
            
            # Get file path from metadata
            file_path = document.processing_metadata.get("file_path")
            if not file_path:
                raise ValueError("File path not found in document metadata")
            
            # Process with LangChain - determine if global from document
            is_global = document.organization_id is None
            processing_result = await vector_service.process_document(
                document_id=document_id,
                file_path=file_path,
                mime_type=document.mime_type,
                organization_id=document.organization_id,
                is_global=is_global
            )
            
            # Update status to completed
            await job_service.update_document_status(
                document_id,
                "completed",
                {
                    "processing_completed_at": datetime.now().isoformat(),
                    "processing_result": processing_result,
                }
            )
            
            return {
                "success": True,
                "document_id": str(document_id),
                "processing_result": processing_result,
            }
            
        except Exception as e:
            # Update status to failed
            await job_service.update_document_status(
                document_id,
                "failed",
                {
                    "processing_failed_at": datetime.now().isoformat(),
                    "error_message": str(e),
                }
            )
            raise


async def _mark_document_failed(document_id: UUID, error: str):
    """Mark document as failed in database."""
    
    async with async_session_maker() as db:
        job_service = DocumentJobService(db)
        await job_service.update_document_status(
            document_id,
            "failed",
            {
                "processing_failed_at": datetime.now().isoformat(),
                "error_message": error,
            }
        )


def enqueue_document_processing(
    document_id: UUID,
    organization_id: Optional[UUID] = None,
    is_global: bool = False
) -> str:
    """
    Enqueue a document for background processing.
    
    Args:
        document_id: The document ID to process
        organization_id: Organization ID (None for global documents)
        is_global: Whether this is a global document
        
    Returns:
        Job ID
    """
    job = document_queue.enqueue(
        process_document_job_with_context,
        document_id=str(document_id),
        organization_id=str(organization_id) if organization_id else None,
        is_global=is_global,
        job_timeout='10m',
        result_ttl='1h',
    )
    
    logger.info(f"Enqueued {'global' if is_global else 'organization'} document processing job {job.id} for document {document_id}")
    return job.id


def process_document_job_with_context(
    document_id: str,
    organization_id: Optional[str] = None,
    is_global: bool = False
) -> Dict[str, Any]:
    """Background job to process a document with context."""
    
    logger.info(f"Starting {'global' if is_global else 'organization'} document processing for {document_id}")
    
    try:
        # Create async event loop for job
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the processing with context
        result = loop.run_until_complete(
            _process_document_async_with_context(
                UUID(document_id),
                UUID(organization_id) if organization_id else None,
                is_global
            )
        )
        
        logger.info(f"Successfully processed document {document_id}")
        return result
        
    except Exception as e:
        logger.error(f"Failed to process document {document_id}: {e}")
        
        # Update document status to failed
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_mark_document_failed(UUID(document_id), str(e)))
        except Exception as update_error:
            logger.error(f"Failed to update document status: {update_error}")
        
        raise e
    
    finally:
        loop.close()


async def _process_document_async_with_context(
    document_id: UUID,
    organization_id: Optional[UUID],
    is_global: bool
) -> Dict[str, Any]:
    """Async function to process document with context."""
    
    async with async_session_maker() as db:
        try:
            # Initialize services
            vector_service = VectorService(db)
            doc_repo = ProcessedDocumentRepository(db)
            
            # Get document
            document = await doc_repo.get_with_chunks(document_id)
            if not document:
                raise ValueError(f"Document {document_id} not found")
            
            # Update status to processing
            await doc_repo.update_processing_status(
                document_id,
                "processing",
                processing_metadata={"started_at": datetime.now().isoformat()}
            )
            await db.commit()
            
            # Process document with context
            result = await vector_service.process_document(
                document_id=document_id,
                file_path=document.processing_metadata.get("file_path"),
                mime_type=document.mime_type,
                organization_id=organization_id,
                is_global=is_global
            )
            
            # Update status to completed
            await doc_repo.update_processing_status(
                document_id,
                "completed",
                processed_date=datetime.now(),
                processing_metadata={
                    **result,
                    "completed_at": datetime.now().isoformat(),
                    "is_global": is_global,
                }
            )
            await db.commit()
            
            return result
            
        except Exception as e:
            await db.rollback()
            raise


# Document Generation Jobs

def enqueue_document_generation(
    document_id: UUID,
    assessment_id: UUID,
    document_type: str,
    template_version: str = "latest",
    options: Optional[Dict[str, Any]] = None
) -> str:
    """
    Enqueue a compliance document generation job.
    
    Args:
        document_id: The document record ID
        assessment_id: The assessment to generate document for
        document_type: Type of document to generate
        template_version: Template version to use
        options: Generation options (include_ai, language, etc.)
        
    Returns:
        Job ID
    """
    job = generation_queue.enqueue(
        generate_compliance_document_job,
        document_id=str(document_id),
        assessment_id=str(assessment_id),
        document_type=document_type,
        template_version=template_version,
        options=options or {},
        job_timeout='10m',
        result_ttl='1h',
    )
    
    logger.info(f"Enqueued document generation job {job.id} for {document_type}")
    return job.id


def generate_compliance_document_job(
    document_id: str,
    assessment_id: str,
    document_type: str,
    template_version: str,
    options: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Background job to generate a compliance document.
    
    Args:
        document_id: The document record ID
        assessment_id: The assessment ID
        document_type: Type of document to generate
        template_version: Template version to use
        options: Generation options
        
    Returns:
        Generation result
    """
    logger.info(f"Starting document generation for {document_type} (assessment: {assessment_id})")
    
    # Import sync components
    from app.core.sync_database import get_sync_db
    from app.services.sync_document_generation_service import SyncDocumentGenerationService
    from app.models.document_generation import DocumentGenerationJob
    from app.models.organization import Document
    from sqlalchemy import update
    
    try:
        # Use sync database session
        with next(get_sync_db()) as db:
            # Get generation job record
            job = db.query(DocumentGenerationJob).filter(
                DocumentGenerationJob.document_id == UUID(document_id)
            ).first()
            
            if not job:
                raise ValueError(f"Generation job for document {document_id} not found")
            
            # Update status to processing
            job.status = "processing"
            job.started_at = datetime.now()
            db.commit()
            
            # Always use sync generator by design
            generation_service = SyncDocumentGenerationService(db)
            result = generation_service.generate_document(
                assessment_id=UUID(assessment_id),
                document_type=document_type,
                template_version=template_version,
                options=options,
            )
            generation_mode = "sync"
             
            # Update document record with result
            # Get file size from the generated file
            import os
            file_size = os.path.getsize(result["file_path"]) if os.path.exists(result["file_path"]) else 0
             
            # Log diagnostics from metadata if present
            meta = result.get("metadata", {})
            logger.info(
                f"[DOC_JOB] Completed mode={generation_mode} "
                f"template={meta.get('template_name')} "
                f"ai_control={meta.get('ai_control_recommendations')} "
                f"ai_measures={meta.get('ai_measures_with_ai')} "
                f"roadmap_items={meta.get('roadmap_items')}"
            )
            
            stmt = update(Document).where(Document.id == UUID(document_id)).values(
                status="completed",
                generation_metadata={
                    "generated_at": datetime.now().isoformat(),
                    "template_version": template_version,
                    "file_path": result["file_path"],
                    "file_size": file_size,
                    "options": options,
                    "generation_mode": generation_mode,
                    **result.get("metadata", {})
                }
            )
            db.execute(stmt)
            
            # Update job status
            job.status = "completed"
            job.completed_at = datetime.now()
            db.commit()

            logger.info(f"Successfully generated {document_type} for assessment {assessment_id}")
            return {
                "success": True,
                "document_id": document_id,
                "file_path": result["file_path"],
                "metadata": result.get("metadata", {})
            }
        
    except Exception as e:
        logger.error(f"Failed to generate document {document_id}: {str(e)}", exc_info=True)
        
        # Update document status to failed
        try:
            with next(get_sync_db()) as db:
                # Update document
                stmt = update(Document).where(Document.id == UUID(document_id)).values(
                    status="failed",
                    generation_metadata={
                        "failed_at": datetime.now().isoformat(),
                        "error_message": str(e)
                    }
                )
                db.execute(stmt)
                
                # Update job
                job = db.query(DocumentGenerationJob).filter(
                    DocumentGenerationJob.document_id == UUID(document_id)
                ).first()
                if job:
                    job.status = "failed"
                    job.completed_at = datetime.now()
                    job.error_message = str(e)
                
                db.commit()
        except Exception as update_error:
            logger.error(f"Failed to update generation status: {update_error}")
        
        raise e


# Note: The async versions below are kept for reference but are no longer used
# Background jobs must use sync database connections to avoid greenlet issues

# Commenting out the entire async implementation
"""
async def _generate_document_async(
    document_id: UUID,
    assessment_id: UUID,
    document_type: str,
    template_version: str,
    options: Dict[str, Any]
) -> Dict[str, Any]:
    # Async function to generate document with database session.
    
    async with async_session_maker() as db:
        try:
            from app.repositories.document_generation import DocumentGenerationRepository
            from app.services.document_generation_service import DocumentGenerationService
            
            # Initialize services
            generation_repo = DocumentGenerationRepository(db)
            generation_service = DocumentGenerationService(db)
            
            # Get generation job record
            job = await generation_repo.get_job_by_document_id(document_id)
            if not job:
                raise ValueError(f"Generation job for document {document_id} not found")
            
            # Update status to processing
            await generation_repo.update_job_status(
                job.id,
                status="processing",
                started_at=datetime.now()
            )
            await db.commit()
            
            # Generate the document
            result = await generation_service.generate_document(
                assessment_id=assessment_id,
                document_type=document_type,
                template_version=template_version,
                options=options
            )
            
            # Save generated document
            file_path = result["file_path"]
            
            # Update document record directly
            from sqlalchemy import update
            from app.models.organization import Document
            
            stmt = update(Document).where(Document.id == document_id).values(
                status="completed",
                generation_metadata={
                    "generated_at": datetime.now().isoformat(),
                    "template_version": template_version,
                    "file_path": file_path,
                    "options": options,
                    **result.get("metadata", {})
                }
            )
            await db.execute(stmt)
            
            # Update job status
            await generation_repo.update_job_status(
                job.id,
                status="completed",
                completed_at=datetime.now()
            )
            await db.commit()
            
            return {
                "success": True,
                "document_id": str(document_id),
                "file_path": file_path,
                "document_type": document_type,
                "metadata": result.get("metadata", {})
            }
            
        except Exception as e:
            await db.rollback()
            
            # Update job status to failed
            if 'job' in locals():
                await generation_repo.update_job_status(
                    job.id,
                    status="failed",
                    error_message=str(e)
                )
                await db.commit()
            
            raise


async def _mark_generation_failed(document_id: UUID, error: str):
    # Mark document generation as failed in database.
    
    async with async_session_maker() as db:
        from sqlalchemy import update
        from app.models.organization import Document
        
        stmt = update(Document).where(Document.id == document_id).values(
            status="failed",
            generation_metadata={
                "failed_at": datetime.now().isoformat(),
                "error_message": error
            }
        )
        await db.execute(stmt)
        await db.commit()
"""


def start_worker():
    """Start background worker process."""
    
    logger.info("Starting document processing worker...")
    
    # Use hostname and timestamp to make worker name unique
    import socket
    from datetime import datetime
    worker_name = f"document-processor-{socket.gethostname()}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    worker = Worker(
        queues=[document_queue, generation_queue, recommendation_queue],
        connection=redis_conn,
        name=worker_name,
    )
    
    worker.work(with_scheduler=True)


# Recommendation Generation Jobs

def enqueue_recommendation_generation(
    assessment_id: UUID,
    organization_id: UUID,
    gaps: list,
    language: str = "hr",
    batch_id: Optional[str] = None
) -> str:
    """
    Enqueue recommendations generation job for remaining gaps.
    
    Args:
        assessment_id: The assessment ID
        organization_id: The organization ID  
        gaps: List of gaps to generate recommendations for
        language: Language for recommendations
        batch_id: Optional batch ID to track related recommendations
        
    Returns:
        Job ID
    """
    job = recommendation_queue.enqueue(
        generate_recommendations_job,
        assessment_id=str(assessment_id),
        organization_id=str(organization_id),
        gaps=gaps,
        language=language,
        batch_id=batch_id,
        job_timeout='15m',
        result_ttl='1h',
    )
    
    logger.info(f"Enqueued recommendation generation job {job.id} for {len(gaps)} gaps")
    return job.id


def generate_recommendations_job(
    assessment_id: str,
    organization_id: str,
    gaps: list,
    language: str,
    batch_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Background job to generate recommendations for gaps.
    
    Args:
        assessment_id: The assessment ID
        organization_id: The organization ID
        gaps: List of gaps to process
        language: Language for recommendations
        batch_id: Optional batch ID
        
    Returns:
        Generation result
    """
    logger.info(f"Starting recommendation generation for {len(gaps)} gaps (batch: {batch_id})")
    
    try:
        # Create async event loop for job
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the processing
        result = loop.run_until_complete(
            _generate_recommendations_async(
                UUID(assessment_id),
                UUID(organization_id),
                gaps,
                language,
                batch_id
            )
        )
        
        logger.info(f"Successfully generated {result['generated_count']} recommendations")
        return result
        
    except Exception as e:
        logger.error(f"Failed to generate recommendations: {e}")
        raise e
    
    finally:
        loop.close()


async def _generate_recommendations_async(
    assessment_id: UUID,
    organization_id: UUID,
    gaps: list,
    language: str,
    batch_id: Optional[str] = None
) -> Dict[str, Any]:
    """Async function to generate recommendations."""
    
    async with async_session_maker() as db:
        from app.services.ai_service import AIService
        from app.repositories.ai_recommendation import AIRecommendationRepository
        
        ai_service = AIService(db)
        rec_repo = AIRecommendationRepository(db)
        
        generated_recommendations = []
        failed_count = 0
        
        for i, gap in enumerate(gaps):
            try:
                logger.info(
                    f"Generating recommendation {i+1}/{len(gaps)} for control {gap['control_id']}"
                )
                
                # Generate recommendation
                rec = await ai_service.generate_control_recommendations(
                    control_id=UUID(gap["control_id"]),
                    organization_id=organization_id,
                    assessment_id=assessment_id,
                    current_score=gap["current_score"],
                    target_score=gap["target_score"],
                    language=language,
                    structured_output=True,
                )
                
                if "error" not in rec:
                    # Build content from structured output
                    content_text = rec.get("description", "")
                    if rec.get("implementation_steps"):
                        steps_text = "\n\nKoraci implementacije:\n"
                        for j, step in enumerate(rec.get("implementation_steps", []), 1):
                            if isinstance(step, str):
                                steps_text += f"{j}. {step}\n"
                            elif isinstance(step, dict):
                                if "action" in step:
                                    steps_text += f"{j}. {step['action']}\n"
                                elif "step" in step:
                                    steps_text += f"{j}. {step['step']}\n"
                        content_text += steps_text
                    
                    # Save recommendation to database
                    db_rec_data = {
                        "assessment_id": assessment_id,
                        "organization_id": organization_id,
                        "control_id": UUID(gap["control_id"]),
                        "title": rec.get("title", gap.get("control_name", "")),
                        "content": content_text or rec.get("recommendation", ""),
                        "description": rec.get("description", ""),
                        "priority": gap.get("priority", "medium"),
                        "effort_estimate": rec.get("effort_estimate", "medium"),
                        "impact_score": gap.get("impact_score", gap["gap"]),
                        "current_score": gap["current_score"],
                        "target_score": gap["target_score"],
                        "recommendation_type": "improvement",
                        "language": language,
                        "source_chunks": rec.get("sources", {}),  # This should be a dict for JSONB
                        "implementation_metadata": {
                            "steps": rec.get("implementation_steps", []),
                            "batch_id": batch_id,
                            "generated_at": datetime.now().isoformat()
                        }
                    }
                    
                    saved_rec = await rec_repo.create_or_update(db_rec_data)
                    generated_recommendations.append(str(saved_rec.id))
                    
                else:
                    logger.error(f"Failed to generate recommendation for control {gap['control_id']}: {rec.get('error')}")
                    # Recover DB session if prior SQL error aborted the transaction
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    failed_count += 1
                    
            except Exception as e:
                logger.error(f"Error generating recommendation for control {gap['control_id']}: {e}")
                # Ensure the transaction is reset so subsequent gaps can proceed
                try:
                    await db.rollback()
                except Exception:
                    pass
                failed_count += 1
        
        await db.commit()
        
        return {
            "success": True,
            "assessment_id": str(assessment_id),
            "batch_id": batch_id,
            "generated_count": len(generated_recommendations),
            "failed_count": failed_count,
            "recommendation_ids": generated_recommendations
        }


if __name__ == "__main__":
    start_worker()