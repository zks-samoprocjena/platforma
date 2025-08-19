"""Document repository for RAG document processing."""

import logging
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ProcessedDocument, DocumentChunk, AIRecommendation
from app.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class ProcessedDocumentRepository(BaseRepository[ProcessedDocument]):
    """Repository for ProcessedDocument operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, ProcessedDocument)

    async def get_by_organization(
        self,
        organization_id: UUID,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        include_global: bool = False,
    ) -> List[ProcessedDocument]:
        """Get documents by organization with optional status filter.
        
        Args:
            organization_id: Organization ID
            status: Optional status filter
            limit: Maximum number of results
            offset: Offset for pagination
            include_global: Whether to include global documents in results
        """
        if include_global:
            # Include both organization documents and global documents
            query = select(self.model).where(
                or_(
                    self.model.organization_id == organization_id,
                    self.model.scope == "global"
                )
            )
        else:
            # Only organization documents
            query = select(self.model).where(self.model.organization_id == organization_id)
        
        if status:
            query = query.where(self.model.status == status)
        
        query = query.order_by(desc(self.model.upload_date))
        
        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_global_documents(
        self,
        status: Optional[str] = None,
        document_type: Optional[str] = None,
        source: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[ProcessedDocument]:
        """Get all global documents with optional filters."""
        query = select(self.model).where(self.model.scope == "global")
        
        if status:
            query = query.where(self.model.status == status)
        
        if document_type:
            query = query.where(self.model.document_type == document_type)
            
        if source:
            query = query.where(self.model.source == source)
        
        query = query.order_by(desc(self.model.upload_date))
        
        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def create_global_document(
        self,
        title: str,
        file_name: str,
        file_size: int,
        uploaded_by: str,
        document_type: Optional[str] = None,
        source: Optional[str] = None,
        mime_type: Optional[str] = None,
        processing_metadata: Optional[dict] = None,
    ) -> ProcessedDocument:
        """Create a global document."""
        document = ProcessedDocument(
            organization_id=None,  # Global documents have no organization
            scope="global",
            is_global=True,
            title=title,
            file_name=file_name,
            file_size=file_size,
            uploaded_by=uploaded_by,
            document_type=document_type,
            source=source,
            mime_type=mime_type,
            upload_date=datetime.utcnow(),
            status="pending",
            processing_metadata=processing_metadata or {}
        )
        
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def get_with_chunks(self, document_id: UUID) -> Optional[ProcessedDocument]:
        """Get document with all its chunks loaded."""
        query = select(self.model).options(
            selectinload(self.model.chunks)
        ).where(self.model.id == document_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def search_by_title(
        self,
        organization_id: UUID,
        search_term: str,
        limit: Optional[int] = None,
    ) -> List[ProcessedDocument]:
        """Search documents by title."""
        query = select(self.model).where(
            and_(
                self.model.organization_id == organization_id,
                self.model.title.ilike(f"%{search_term}%")
            )
        ).order_by(desc(self.model.upload_date))
        
        if limit:
            query = query.limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_processing_stats(self, organization_id: UUID) -> dict:
        """Get processing statistics for an organization."""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[DOC_REPO] Getting processing stats for organization {organization_id}")
        
        # Count by status - ONLY organization documents (exclude global)
        status_query = select(
            self.model.status,
            func.count(self.model.id).label('count')
        ).where(
            and_(
                self.model.organization_id == organization_id,
                self.model.scope == "organization"  # Explicit organization scope only
            )
        ).group_by(self.model.status)
        
        status_result = await self.db.execute(status_query)
        status_breakdown = {row.status: row.count for row in status_result}
        
        # Total documents and size - ONLY organization documents
        totals_query = select(
            func.count(self.model.id).label('total_documents'),
            func.coalesce(func.sum(self.model.file_size), 0).label('total_size_bytes')
        ).where(
            and_(
                self.model.organization_id == organization_id,
                self.model.scope == "organization"  # Explicit organization scope only
            )
        )
        
        totals_result = await self.db.execute(totals_query)
        totals = totals_result.first()
        
        # Handle case where no documents exist (totals can be None)
        total_documents = totals.total_documents if totals and totals.total_documents is not None else 0
        total_size_bytes = totals.total_size_bytes if totals and totals.total_size_bytes is not None else 0
        
        logger.info(f"[DOC_REPO] Organization {organization_id} has {total_documents} documents, {total_size_bytes} bytes")
        
        return {
            "total_documents": total_documents,
            "total_size_bytes": total_size_bytes,
            "status_breakdown": status_breakdown or {},
        }
    
    async def count_by_organization(self, organization_id: UUID) -> int:
        """Count documents for a specific organization (excluding global documents)."""
        query = select(func.count(self.model.id)).where(
            and_(
                self.model.organization_id == organization_id,
                self.model.scope == "organization"
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_failed_documents(self, organization_id: UUID) -> List[ProcessedDocument]:
        """Get all failed documents for reprocessing."""
        query = select(self.model).where(
            and_(
                self.model.organization_id == organization_id,
                self.model.status == "failed"
            )
        ).order_by(desc(self.model.upload_date))
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_processing_status(
        self,
        document_id: UUID,
        status: str,
        processed_date: Optional[datetime] = None,
        processing_metadata: Optional[dict] = None,
    ) -> Optional[ProcessedDocument]:
        """Update document processing status and metadata."""
        # Get existing document to preserve metadata
        doc = await self.get_by_id(document_id)
        if not doc:
            return None
            
        update_data = {"status": status}
        
        if processed_date:
            update_data["processed_date"] = processed_date
        
        if processing_metadata:
            # Merge with existing metadata instead of replacing
            existing_metadata = doc.processing_metadata or {}
            merged_metadata = {**existing_metadata, **processing_metadata}
            update_data["processing_metadata"] = merged_metadata
        
        return await self.update(document_id, **update_data)


class DocumentChunkRepository(BaseRepository[DocumentChunk]):
    """Repository for DocumentChunk operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, DocumentChunk)

    async def get_by_document(
        self,
        document_id: UUID,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[DocumentChunk]:
        """Get chunks for a specific document."""
        query = select(self.model).where(
            self.model.processed_document_id == document_id
        ).order_by(self.model.chunk_index)
        
        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_batch(self, chunks_data: List[dict]) -> List[DocumentChunk]:
        """Create multiple chunks in batch."""
        # Ensure embeddings are proper lists, not strings
        import json
        import numpy as np
        
        for chunk_data in chunks_data:
            if 'embedding' in chunk_data and chunk_data['embedding'] is not None:
                embedding = chunk_data['embedding']
                
                # Handle different embedding formats
                if isinstance(embedding, str):
                    # If embedding is a string representation, parse it
                    try:
                        # Try parsing as JSON first
                        embedding = json.loads(embedding)
                    except json.JSONDecodeError:
                        # Try ast.literal_eval for Python string representation
                        import ast
                        embedding = ast.literal_eval(embedding)
                
                # Convert numpy array to list if needed
                if isinstance(embedding, np.ndarray):
                    embedding = embedding.tolist()
                elif hasattr(embedding, 'tolist'):
                    embedding = embedding.tolist()
                
                # Ensure all values are native Python floats
                if isinstance(embedding, list):
                    # Convert to list of floats
                    float_list = [float(x) for x in embedding]
                    # For pgvector with async, we need to ensure the embedding is properly formatted
                    # Convert to string format that pgvector expects: '[1.0,2.0,3.0]'
                    chunk_data['embedding'] = float_list
                else:
                    logger.warning(f"Unexpected embedding type: {type(embedding)}")
                    chunk_data['embedding'] = None
                
                # Debug log
                if chunk_data['chunk_index'] == 0:  # Only log first chunk
                    logger.info(f"First chunk embedding type: {type(chunk_data['embedding'])}")
                    if chunk_data['embedding'] and isinstance(chunk_data['embedding'], list):
                        logger.info(f"First chunk embedding length: {len(chunk_data['embedding'])}")
                        logger.info(f"First chunk embedding sample: {chunk_data['embedding'][:3]}")
        
        # Create chunks - embeddings are already proper Python lists
        chunks = []
        for i, chunk_data in enumerate(chunks_data):
            if i == 0:
                logger.info(f"Creating first chunk with embedding type: {type(chunk_data.get('embedding'))}")
                if chunk_data.get('embedding'):
                    logger.info(f"First chunk embedding is list: {isinstance(chunk_data['embedding'], list)}")
            
            chunk = self.model(**chunk_data)
            chunks.append(chunk)
        
        self.db.add_all(chunks)
        await self.db.flush()
        
        # Refresh all chunks to get their IDs
        for chunk in chunks:
            await self.db.refresh(chunk)
        
        return chunks

    async def search_similar(
        self,
        query_embedding: List[float],
        organization_id: UUID,
        limit: int = 10,
        min_similarity: float = 0.7,
        document_ids: Optional[List[UUID]] = None,
    ) -> List[tuple[DocumentChunk, float]]:
        """Search for similar chunks using vector similarity."""
        from sqlalchemy import text
        
        # Base similarity search query
        similarity_query = text("""
            SELECT 
                dc.*,
                1 - (dc.embedding <=> :query_embedding) as similarity
            FROM document_chunks dc
            JOIN processed_documents pd ON dc.processed_document_id = pd.id
            WHERE pd.organization_id = :organization_id
            AND dc.embedding IS NOT NULL
            AND 1 - (dc.embedding <=> :query_embedding) >= :min_similarity
        """)
        
        # Convert embedding to PostgreSQL array format
        embedding_str = f"[{','.join(map(str, query_embedding))}]"
        
        params = {
            "query_embedding": embedding_str,
            "organization_id": str(organization_id),
            "min_similarity": min_similarity,
        }
        
        # Add document filter if specified
        if document_ids:
            similarity_query = text(similarity_query.text + """
                AND pd.id = ANY(:document_ids)
            """)
            params["document_ids"] = [str(doc_id) for doc_id in document_ids]
        
        # Add ordering and limit
        similarity_query = text(similarity_query.text + """
            ORDER BY similarity DESC
            LIMIT :limit
        """)
        params["limit"] = limit
        
        result = await self.db.execute(similarity_query, params)
        
        # Convert raw results to model instances with similarity scores
        chunks_with_similarity = []
        for row in result:
            chunk = DocumentChunk(
                id=row.id,
                processed_document_id=row.processed_document_id,
                chunk_index=row.chunk_index,
                content=row.content,
                embedding=row.embedding,
                chunk_metadata=row.chunk_metadata,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            chunks_with_similarity.append((chunk, row.similarity))
        
        return chunks_with_similarity

    async def get_chunk_count(self, document_id: UUID) -> int:
        """Get total number of chunks for a document."""
        query = select(func.count(self.model.id)).where(
            self.model.processed_document_id == document_id
        )
        result = await self.db.execute(query)
        return result.scalar()

    async def delete_by_document(self, document_id: UUID) -> int:
        """Delete all chunks for a document."""
        from sqlalchemy import delete
        
        query = delete(self.model).where(
            self.model.processed_document_id == document_id
        )
        result = await self.db.execute(query)
        return result.rowcount


class AIRecommendationRepository(BaseRepository[AIRecommendation]):
    """Repository for AI recommendations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AIRecommendation)

    async def get_by_assessment(
        self,
        assessment_id: UUID,
        recommendation_type: Optional[str] = None,
        control_id: Optional[UUID] = None,
    ) -> List[AIRecommendation]:
        """Get recommendations for an assessment."""
        query = select(self.model).where(self.model.assessment_id == assessment_id)
        
        if recommendation_type:
            query = query.where(self.model.recommendation_type == recommendation_type)
        
        if control_id:
            query = query.where(self.model.control_id == control_id)
        
        query = query.order_by(desc(self.model.created_at))
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_control(
        self,
        control_id: UUID,
        assessment_id: Optional[UUID] = None,
        limit: Optional[int] = None,
    ) -> List[AIRecommendation]:
        """Get recommendations for a specific control."""
        query = select(self.model).where(self.model.control_id == control_id)
        
        if assessment_id:
            query = query.where(self.model.assessment_id == assessment_id)
        
        query = query.order_by(desc(self.model.created_at))
        
        if limit:
            query = query.limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_batch(self, recommendations_data: List[dict]) -> List[AIRecommendation]:
        """Create multiple recommendations in batch."""
        recommendations = [self.model(**rec_data) for rec_data in recommendations_data]
        self.db.add_all(recommendations)
        await self.db.flush()
        
        # Refresh all recommendations to get their IDs
        for rec in recommendations:
            await self.db.refresh(rec)
        
        return recommendations

    async def get_latest_by_assessment(
        self,
        assessment_id: UUID,
        recommendation_type: Optional[str] = None,
    ) -> Optional[AIRecommendation]:
        """Get the most recent recommendation for an assessment."""
        query = select(self.model).where(
            self.model.assessment_id == assessment_id
        )
        
        if recommendation_type:
            query = query.where(self.model.recommendation_type == recommendation_type)
        
        query = query.order_by(desc(self.model.created_at)).limit(1)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def delete_by_assessment(self, assessment_id: UUID) -> int:
        """Delete all recommendations for an assessment."""
        from sqlalchemy import delete
        
        query = delete(self.model).where(
            self.model.assessment_id == assessment_id
        )
        result = await self.db.execute(query)
        return result.rowcount