"""
Repository for document generation related operations.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy import select, update, and_, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_generation import DocumentTemplate, DocumentGenerationJob
from app.repositories.base import BaseRepository


class DocumentTemplateRepository(BaseRepository[DocumentTemplate]):
    """Repository for document template operations."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, DocumentTemplate)
    
    async def get_active_template(
        self,
        template_key: str,
        version: Optional[str] = None,
        organization_id: Optional[UUID] = None
    ) -> Optional[DocumentTemplate]:
        """Get an active template by key and optional version."""
        
        query = select(self.model).where(
            and_(
                self.model.template_key == template_key,
                self.model.is_active == True
            )
        )
        
        if version and version != "latest":
            query = query.where(self.model.version == version)
        
        # Check for organization-specific template first
        if organization_id:
            org_query = query.where(self.model.organization_id == organization_id)
            result = await self.db.execute(
                org_query.order_by(self.model.version.desc()).limit(1)
            )
            template = result.scalar_one_or_none()
            if template:
                return template
        
        # Fall back to global template
        query = query.where(self.model.organization_id.is_(None))
        result = await self.db.execute(
            query.order_by(self.model.version.desc()).limit(1)
        )
        return result.scalar_one_or_none()
    
    async def get_all_active_templates(
        self,
        organization_id: Optional[UUID] = None
    ) -> List[DocumentTemplate]:
        """Get all active templates available to an organization."""
        
        # Get both global and organization-specific templates
        query = select(self.model).where(
            and_(
                self.model.is_active == True,
                or_(
                    self.model.organization_id.is_(None),
                    self.model.organization_id == organization_id
                ) if organization_id else self.model.organization_id.is_(None)
            )
        ).order_by(self.model.template_key, self.model.version.desc())
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def create_template(
        self,
        template_key: str,
        name: str,
        version: str,
        file_path: str,
        schema: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None,
        organization_id: Optional[UUID] = None,
        created_by: Optional[UUID] = None
    ) -> DocumentTemplate:
        """Create a new document template."""
        
        template = DocumentTemplate(
            template_key=template_key,
            name=name,
            version=version,
            file_path=file_path,
            schema=schema or {},
            description=description,
            organization_id=organization_id,
            created_by=created_by,
            is_active=True
        )
        
        self.db.add(template)
        await self.db.flush()
        return template
    
    async def deactivate_template(self, template_id: UUID) -> bool:
        """Deactivate a template."""
        
        stmt = (
            update(self.model)
            .where(self.model.id == template_id)
            .values(is_active=False, updated_at=datetime.utcnow())
        )
        
        result = await self.db.execute(stmt)
        return result.rowcount > 0


class DocumentGenerationRepository(BaseRepository[DocumentGenerationJob]):
    """Repository for document generation job operations."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, DocumentGenerationJob)
    
    async def create_job(
        self,
        document_id: UUID,
        assessment_id: UUID,
        document_type: str,
        template_id: Optional[UUID] = None,
        options: Optional[Dict[str, Any]] = None,
        organization_id: Optional[UUID] = None,
        created_by: Optional[UUID] = None
    ) -> DocumentGenerationJob:
        """Create a new document generation job."""
        
        job = DocumentGenerationJob(
            document_id=document_id,
            assessment_id=assessment_id,
            document_type=document_type,
            template_id=template_id,
            options=options or {},
            organization_id=organization_id,
            created_by=created_by,
            status="pending"
        )
        
        self.db.add(job)
        await self.db.flush()
        return job
    
    async def get_job_by_document_id(
        self,
        document_id: UUID
    ) -> Optional[DocumentGenerationJob]:
        """Get a generation job by document ID."""
        
        query = select(self.model).where(
            self.model.document_id == document_id
        ).options(
            selectinload(self.model.template),
            selectinload(self.model.assessment),
            selectinload(self.model.document)
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_job_status(
        self,
        job_id: UUID,
        status: str,
        job_id_rq: Optional[str] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        error_message: Optional[str] = None
    ) -> bool:
        """Update job status and related fields."""
        
        values = {"status": status}
        
        if job_id_rq:
            values["job_id"] = job_id_rq
        if started_at:
            values["started_at"] = started_at
        if completed_at:
            values["completed_at"] = completed_at
        if error_message:
            values["error_message"] = error_message
        
        stmt = (
            update(self.model)
            .where(self.model.id == job_id)
            .values(**values)
        )
        
        result = await self.db.execute(stmt)
        return result.rowcount > 0
    
    async def get_jobs_by_assessment(
        self,
        assessment_id: UUID,
        status: Optional[str] = None
    ) -> List[DocumentGenerationJob]:
        """Get all generation jobs for an assessment."""
        
        query = select(self.model).where(
            self.model.assessment_id == assessment_id
        ).options(
            selectinload(self.model.template),
            selectinload(self.model.document)
        )
        
        if status:
            query = query.where(self.model.status == status)
        
        query = query.order_by(self.model.created_at.desc())
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_recent_jobs(
        self,
        organization_id: UUID,
        limit: int = 10,
        status: Optional[str] = None
    ) -> List[DocumentGenerationJob]:
        """Get recent generation jobs for an organization."""
        
        query = select(self.model).where(
            self.model.organization_id == organization_id
        ).options(
            selectinload(self.model.assessment),
            selectinload(self.model.document)
        )
        
        if status:
            query = query.where(self.model.status == status)
        
        query = query.order_by(self.model.created_at.desc()).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()