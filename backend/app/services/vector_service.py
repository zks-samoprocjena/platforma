"""Vector service with two-layer retrieval for enhanced RAG system."""

import re
import logging
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
from dataclasses import dataclass, field
from datetime import datetime
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain.schema import Document
from langdetect import detect

from app.core.config import settings
from app.repositories.document import DocumentChunkRepository, ProcessedDocumentRepository
from app.models.document import DocumentChunk, ProcessedDocument
from app.services.document_chunker import PageAwareChunker

logger = logging.getLogger(__name__)


@dataclass
class RetrievalConfig:
    """Configuration for two-layer retrieval system."""
    # RRF parameters
    rrf_k: int = 60
    tier1_weight: float = 0.6
    
    # Retrieval limits
    tier1_limit: int = 20
    tier2_limit: int = 30
    final_k: int = 8
    
    # Document type boost factors
    doc_type_boosts: Dict[str, float] = field(default_factory=lambda: {
        'ZKS': 1.2,
        'NIS2': 1.1,
        'UKS': 1.0,
        'PRILOG_B': 0.9,
        'PRILOG_C': 0.9,
        'ISO': 0.8,
        'NIST': 0.8,
        'standard': 0.7,
        'regulation': 0.85,
        'custom': 0.6,
    })


class VectorService:
    """Vector service with two-layer retrieval and multilingual embeddings."""
    
    def __init__(self, db: AsyncSession, config: Optional[RetrievalConfig] = None):
        self.db = db
        self.chunk_repository = DocumentChunkRepository(db)
        self.doc_repository = ProcessedDocumentRepository(db)
        
        # Configuration
        self.config = config or RetrievalConfig()
        
        # Initialize page-aware chunker
        self.page_chunker = PageAwareChunker()
        
        # Control ID pattern (XXX-NNN or XXXX-NNN)
        self.control_pattern = re.compile(r'\b[A-Z]{3,4}-\d{3}\b')
        
        # Initialize multilingual embedding model
        self.embedding_model = HuggingFaceEmbeddings(
            model_name=settings.PRIMARY_EMBEDDING_MODEL  # paraphrase-multilingual-mpnet-base-v2
        )
        
        logger.info(f"Initialized VectorService with multilingual model: {settings.PRIMARY_EMBEDDING_MODEL}")
    
    # ===== Language Detection =====
    
    def detect_language(self, text: str) -> str:
        """Detect the language of the text."""
        try:
            lang = detect(text)
            if lang in ['hr', 'en']:
                return lang
            else:
                logger.warning(f"Unsupported language detected: {lang}, defaulting to hr")
                return 'hr'
        except Exception as e:
            logger.error(f"Language detection failed: {e}")
            return 'hr'
    
    # ===== TIER 1: EXACT RETRIEVAL =====
    
    async def tier1_control_search(
        self,
        control_id: str,
        organization_id: UUID,
        limit: Optional[int] = None,
    ) -> List[Tuple[UUID, int, float, Dict]]:
        """
        Tier 1: Search for exact control ID matches using PostgreSQL JSONB.
        
        Returns: [(chunk_id, page_anchor, score, metadata), ...]
        """
        limit = limit or self.config.tier1_limit
        
        query = text("""
            SELECT 
                dc.id,
                dc.page_anchor,
                CASE 
                    WHEN dc.control_ids ? :control_id THEN 1.0
                    ELSE 0.5
                END as score,
                dc.chunk_metadata,
                dc.doc_type,
                dc.section_title,
                pd.title as doc_title,
                dc.control_ids,
                dc.page_start,
                dc.page_end
            FROM document_chunks dc
            JOIN processed_documents pd ON dc.processed_document_id = pd.id
            WHERE 
                dc.control_ids ? :control_id
                AND (pd.organization_id = :org_id OR pd.is_global = true)
            ORDER BY score DESC, dc.page_anchor ASC
            LIMIT :limit
        """)
        
        result = await self.db.execute(
            query,
            {
                'control_id': control_id,
                'org_id': str(organization_id),
                'limit': limit
            }
        )
        
        rows = result.fetchall()
        return [
            (
                row[0],  # chunk_id
                row[1],  # page_anchor
                row[2],  # score
                {
                    'chunk_metadata': row[3],
                    'doc_type': row[4],
                    'section_title': row[5],
                    'doc_title': row[6],
                    'control_ids': row[7],
                    'page_start': row[8],
                    'page_end': row[9],
                }
            )
            for row in rows
        ]
    
    async def tier1_fulltext_search(
        self,
        query_text: str,
        organization_id: UUID,
        limit: Optional[int] = None,
    ) -> List[Tuple[UUID, int, float, Dict]]:
        """
        Tier 1: Full-text search using PostgreSQL tsvector.
        
        Returns: [(chunk_id, page_anchor, score, metadata), ...]
        """
        limit = limit or self.config.tier1_limit
        
        query = text("""
            SELECT 
                dc.id,
                dc.page_anchor,
                ts_rank_cd(dc.content_tsvector, query, 32) as score,
                dc.chunk_metadata,
                dc.doc_type,
                dc.section_title,
                pd.title as doc_title,
                dc.control_ids,
                dc.page_start,
                dc.page_end
            FROM document_chunks dc
            JOIN processed_documents pd ON dc.processed_document_id = pd.id,
            plainto_tsquery('english', :query_text) query
            WHERE 
                dc.content_tsvector @@ query
                AND (pd.organization_id = :org_id OR pd.is_global = true)
            ORDER BY score DESC
            LIMIT :limit
        """)
        
        result = await self.db.execute(
            query,
            {
                'query_text': query_text,
                'org_id': str(organization_id),
                'limit': limit
            }
        )
        
        rows = result.fetchall()
        return [
            (
                row[0],  # chunk_id
                row[1],  # page_anchor
                row[2],  # score
                {
                    'chunk_metadata': row[3],
                    'doc_type': row[4],
                    'section_title': row[5],
                    'doc_title': row[6],
                    'control_ids': row[7],
                    'page_start': row[8],
                    'page_end': row[9],
                }
            )
            for row in rows
        ]
    
    # ===== TIER 2: SEMANTIC RETRIEVAL =====
    
    async def tier2_semantic_search(
        self,
        query_text: str,
        organization_id: UUID,
        doc_type_filter: Optional[str] = None,
        exclude_chunk_ids: Optional[List[UUID]] = None,
        limit: Optional[int] = None,
    ) -> List[Tuple[UUID, int, float, Dict]]:
        """
        Tier 2: Semantic vector search with multilingual embeddings and doc type boosting.
        
        Returns: [(chunk_id, page_anchor, score, metadata), ...]
        """
        limit = limit or self.config.tier2_limit
        
        # Generate query embedding using multilingual model
        query_embedding = self.embedding_model.embed_query(query_text)
        # Convert to PostgreSQL vector literal string (e.g., "[0.1,0.2,...]")
        embedding_str = f"[{','.join(map(str, query_embedding))}]"
        
        # Build query with optional filters
        exclude_clause = ""
        params = {
            'org_id': str(organization_id),
            'limit': limit,
            'embedding': embedding_str,
        }
        
        if exclude_chunk_ids:
            # Build a safe UUID list for NOT IN clause
            safe_ids = ", ".join([f"'{str(u)}'" for u in exclude_chunk_ids])
            if safe_ids:
                exclude_clause = exclude_clause + f" AND dc.id NOT IN ({safe_ids})"
        
        if doc_type_filter:
            exclude_clause += " AND dc.doc_type = :doc_type_filter"
            params['doc_type_filter'] = doc_type_filter
        
        # Query with cosine similarity (CAST bindparam to vector to avoid driver param parsing issues)
        query = text(f"""
            SELECT 
                dc.id,
                dc.page_anchor,
                1 - (dc.embedding <=> CAST(:embedding AS vector)) as similarity,
                dc.chunk_metadata,
                dc.doc_type,
                dc.section_title,
                pd.title as doc_title,
                dc.control_ids,
                dc.page_start,
                dc.page_end
            FROM document_chunks dc
            JOIN processed_documents pd ON dc.processed_document_id = pd.id
            WHERE 
                dc.embedding IS NOT NULL
                AND (pd.organization_id = :org_id OR pd.is_global = true)
                {exclude_clause}
            ORDER BY similarity DESC
            LIMIT :limit
        """)
        
        result = await self.db.execute(query, params)
        rows = result.fetchall()
        
        # Apply doc type boosting
        boosted_results = []
        for row in rows:
            chunk_id = row[0]
            page = row[1]
            similarity = row[2]
            metadata = {
                'chunk_metadata': row[3],
                'doc_type': row[4],
                'section_title': row[5],
                'doc_title': row[6],
                'control_ids': row[7],
                'page_start': row[8],
                'page_end': row[9],
            }
            
            # Apply boost factor based on document type
            doc_type = row[4]
            boost = self.config.doc_type_boosts.get(doc_type, 1.0)
            boosted_score = similarity * boost
            
            boosted_results.append((chunk_id, page, boosted_score, metadata))
        
        # Re-sort after boosting
        boosted_results.sort(key=lambda x: x[2], reverse=True)
        return boosted_results[:limit]
    
    # ===== RRF FUSION =====
    
    def rrf_fusion(
        self,
        tier1_results: List[Tuple[UUID, int, float, Dict]],
        tier2_results: List[Tuple[UUID, int, float, Dict]],
    ) -> List[Tuple[UUID, int, float, Dict]]:
        """
        Combine Tier 1 and Tier 2 results using Reciprocal Rank Fusion.
        
        RRF formula: score = 1 / (k + rank)
        Combined: final_score = w1 * rrf_tier1 + w2 * rrf_tier2
        
        Returns: [(chunk_id, page_anchor, combined_score, metadata), ...]
        """
        def rrf_score(rank: int) -> float:
            return 1.0 / (self.config.rrf_k + rank)
        
        # Track scores and metadata
        combined_scores = {}
        metadata_map = {}
        
        # Process Tier 1 results (exact matches)
        for rank, (chunk_id, page, score, meta) in enumerate(tier1_results):
            key = (chunk_id, page)
            combined_scores[key] = self.config.tier1_weight * rrf_score(rank)
            metadata_map[key] = meta.copy()
            metadata_map[key]['tier1_rank'] = rank
            metadata_map[key]['tier1_score'] = score
            metadata_map[key]['tier_source'] = 'tier1'
        
        # Process Tier 2 results (semantic matches)
        for rank, (chunk_id, page, score, meta) in enumerate(tier2_results):
            key = (chunk_id, page)
            
            if key in combined_scores:
                # Chunk appears in both tiers
                combined_scores[key] += (1 - self.config.tier1_weight) * rrf_score(rank)
                metadata_map[key]['tier2_rank'] = rank
                metadata_map[key]['tier2_score'] = score
                metadata_map[key]['tier_source'] = 'both'
            else:
                # Only in Tier 2
                combined_scores[key] = (1 - self.config.tier1_weight) * rrf_score(rank)
                metadata_map[key] = meta.copy()
                metadata_map[key]['tier2_rank'] = rank
                metadata_map[key]['tier2_score'] = score
                metadata_map[key]['tier_source'] = 'tier2'
        
        # Sort by combined score
        sorted_results = sorted(
            combined_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Format output with metadata
        return [
            (chunk_id, page, score, metadata_map[(chunk_id, page)])
            for (chunk_id, page), score in sorted_results
        ]
    
    # ===== MAIN RETRIEVAL PIPELINE =====
    
    async def similarity_search_with_score(
        self,
        query: str,
        organization_id: UUID,
        k: int = 10,
        control_id: Optional[str] = None,
    ) -> List[Tuple[Document, float]]:
        """
        Main two-layer retrieval pipeline.
        
        1. Extract control ID from query if not provided
        2. Run Tier 1 (exact/lexical search)
        3. Run Tier 2 (semantic search with multilingual embeddings)
        4. Combine with RRF fusion
        5. Return top-k chunks with full content
        
        Returns: List of formatted chunks with all metadata
        """
        # Extract control ID from query if not provided
        if not control_id:
            matches = self.control_pattern.findall(query)
            control_id = matches[0] if matches else None
        
        logger.info(f"Two-layer retrieval - Query: '{query[:50]}...', Control: {control_id}")
        
        # TIER 1: Exact retrieval
        tier1_results = []
        if control_id:
            tier1_results = await self.tier1_control_search(
                control_id=control_id,
                organization_id=organization_id,
            )
            logger.info(f"Tier 1 (control {control_id}): Found {len(tier1_results)} results")
        
        # Fallback to fulltext if no control results
        if not tier1_results:
            tier1_results = await self.tier1_fulltext_search(
                query_text=query,
                organization_id=organization_id,
            )
            logger.info(f"Tier 1 (fulltext): Found {len(tier1_results)} results")
        
        # TIER 2: Semantic retrieval with multilingual embeddings
        # Exclude top Tier 1 results to get diverse content
        tier1_chunk_ids = [r[0] for r in tier1_results[:10]]
        
        # If we have a control, prioritize framework docs (ZKS) for context
        doc_type_filter = None
        if control_id and len(tier1_results) > 3:
            # We have good exact matches, get contextual framework knowledge
            doc_type_filter = 'ZKS'
        
        tier2_results = await self.tier2_semantic_search(
            query_text=query,
            organization_id=organization_id,
            doc_type_filter=doc_type_filter,
            exclude_chunk_ids=tier1_chunk_ids,
        )
        logger.info(f"Tier 2 (semantic): Found {len(tier2_results)} results")
        
        # RRF FUSION
        fused_results = self.rrf_fusion(tier1_results, tier2_results)
        logger.info(f"RRF Fusion: {len(fused_results)} combined results")
        
        # Load full chunk content for top-k results and convert to (Document, score)
        results: List[Tuple[Document, float]] = []
        for chunk_id, page, score, metadata in fused_results[:k]:
            chunk = await self.db.get(DocumentChunk, chunk_id)
            if not chunk:
                logger.warning(f"Chunk {chunk_id} not found in database")
                continue
            # Prepare metadata for LangChain Document
            # Start with chunk's stored metadata (contains source, language, etc.)
            doc_metadata: Dict[str, Any] = chunk.chunk_metadata.copy() if chunk.chunk_metadata else {}
            
            # Add/override with retrieval-specific metadata
            doc_metadata.update({
                'chunk_id': str(chunk_id),
                'page': page,
                'page_start': chunk.page_start,
                'page_end': chunk.page_end,
                'page_anchor': chunk.page_anchor,
                'control_ids': chunk.control_ids or [],
                'doc_type': chunk.doc_type,
                'doc_title': metadata.get('doc_title', 'Unknown'),
                'section_title': chunk.section_title,
                'tier_source': metadata.get('tier_source', 'unknown'),
            })
            # Include original retrieval metadata under a namespaced key
            doc_metadata['retrieval_metadata'] = metadata
            # Build Document
            lc_doc = Document(page_content=chunk.content, metadata=doc_metadata)
            results.append((lc_doc, float(score)))

        logger.info(f"Final retrieval: Returning {len(results)} chunks")
        return results
    
    # ===== DOCUMENT PROCESSING =====
    
    async def process_document(
        self,
        document_id: UUID,
        file_path: str,
        mime_type: str,
        organization_id: Optional[UUID] = None,
        is_global: bool = False,
    ) -> Dict[str, Any]:
        """
        Process document with page-aware chunking and multilingual embeddings.
        
        Uses the PageAwareChunker to:
        1. Preserve page boundaries
        2. Extract control IDs
        3. Detect document type
        4. Extract section titles
        5. Handle spillovers
        6. Generate multilingual embeddings
        """
        processed_doc = None  # Initialize to avoid UnboundLocalError
        
        try:
            # Get document metadata first for better error reporting
            processed_doc = await self.db.get(ProcessedDocument, document_id)
            if not processed_doc:
                raise ValueError(f"Document {document_id} not found")
            
            # Validate file_path with context (attempt recovery if missing)
            if not file_path:
                logger.warning(
                    f"No file_path provided for document {document_id}. Attempting recovery using uploads directory."
                )
                recovered = self._recover_file_path(processed_doc)
                if recovered:
                    # Persist recovered path into metadata
                    existing_metadata = processed_doc.processing_metadata or {}
                    processed_doc.processing_metadata = {
                        **existing_metadata,
                        "file_path": recovered,
                        "file_path_recovered": True,
                        "file_path_recovered_at": datetime.utcnow().isoformat(),
                    }
                    await self.db.commit()
                    file_path = recovered
                    logger.info(f"Recovered file_path for document {document_id}: {file_path}")
                else:
                    logger.error(
                        f"Failed to recover file_path for document {document_id}. Processing metadata: {processed_doc.processing_metadata}"
                    )
                    raise ValueError(
                        f"File path is required for document processing. Document: {processed_doc.title}, Status: {processed_doc.status}"
                    )
            
            logger.info(f"Processing document {document_id} from path: {file_path}")
            
            # Load document using appropriate loader
            if mime_type == "application/pdf":
                loader = PyPDFLoader(file_path)
            elif mime_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"]:
                loader = Docx2txtLoader(file_path)
            elif mime_type == "text/plain":
                loader = TextLoader(file_path, encoding="utf-8")
            else:
                raise ValueError(f"Unsupported file type: {mime_type}")
            
            documents = loader.load()
            logger.info(f"Loaded {len(documents)} pages from document")
            
            # Process with page-aware chunker
            chunks_data = self.page_chunker.process_document(
                documents=documents,
                filename=processed_doc.file_name,
            )
            logger.info(f"Created {len(chunks_data)} page-aware chunks")
            
            # Generate embeddings and store chunks
            stored_count = 0
            control_ids_found = set()
            doc_types_found = set()
            
            # Process in batches for memory efficiency
            batch_size = 32
            for i in range(0, len(chunks_data), batch_size):
                batch = chunks_data[i:i + batch_size]
                
                # Generate multilingual embeddings for batch
                texts = [chunk['content'] for chunk in batch]
                embeddings = self.embedding_model.embed_documents(texts)
                
                # Create chunk records
                for chunk_data, embedding in zip(batch, embeddings):
                    # Ensure embedding is a list
                    if hasattr(embedding, 'tolist'):
                        embedding = embedding.tolist()
                    else:
                        embedding = list(embedding)
                    
                    # Detect language for each chunk
                    chunk_language = self.detect_language(chunk_data['content'])
                    
                    # Build metadata
                    metadata = {
                        **chunk_data['chunk_metadata'],
                        'source': processed_doc.title,
                        'organization_id': str(organization_id) if organization_id else None,
                        'is_global': is_global,
                        'language': chunk_language,
                        'scope': 'global' if is_global else 'organization',
                    }
                    
                    # Create chunk record
                    chunk = DocumentChunk(
                        processed_document_id=document_id,
                        chunk_index=stored_count,
                        content=chunk_data['content'],
                        embedding=embedding,
                        control_ids=chunk_data['control_ids'],
                        doc_type=chunk_data['doc_type'],
                        section_title=chunk_data['section_title'],
                        page_start=chunk_data['page_start'],
                        page_end=chunk_data['page_end'],
                        page_anchor=chunk_data['page_anchor'],
                        chunk_metadata=metadata,
                    )
                    
                    self.db.add(chunk)
                    stored_count += 1
                    control_ids_found.update(chunk_data['control_ids'])
                    doc_types_found.add(chunk_data['doc_type'])
                
                # Commit batch
                await self.db.commit()
                logger.info(f"Stored batch {i//batch_size + 1}, total chunks: {stored_count}")
            
            # Update document processing status
            processed_doc.status = 'completed'
            processed_doc.processing_metadata = {
                'chunks_created': stored_count,
                'control_ids_found': sorted(list(control_ids_found)),
                'doc_types_detected': sorted(list(doc_types_found)),
                'pages_processed': len(documents),
                'chunker_config': {
                    'max_chunk_size': self.page_chunker.max_chunk_size,
                    'min_chunk_size': self.page_chunker.min_chunk_size,
                },
                'embedding_model': settings.PRIMARY_EMBEDDING_MODEL,
            }
            await self.db.commit()
            
            logger.info(
                f"Processed document {document_id}: "
                f"{stored_count} chunks, "
                f"{len(control_ids_found)} unique control IDs, "
                f"doc types: {doc_types_found}"
            )
            
            return {
                'chunks_created': stored_count,
                'control_ids_found': sorted(list(control_ids_found)),
                'doc_types': sorted(list(doc_types_found)),
                'pages': len(documents),
                'status': 'success',
            }
            
        except Exception as e:
            logger.error(f"Document processing failed for {document_id}: {str(e)}")
            
            # Update document status to failed
            if processed_doc:
                processed_doc.status = 'failed'
                # Preserve existing metadata and add error info
                existing_metadata = processed_doc.processing_metadata or {}
                processed_doc.processing_metadata = {
                    **existing_metadata,  # Preserve original metadata including file_path
                    'error': str(e),
                    'error_type': type(e).__name__,
                    'processing_failed_at': datetime.utcnow().isoformat(),
                }
                await self.db.commit()
            
            raise Exception(f"Document processing failed: {str(e)}")

    def _recover_file_path(self, processed_doc: ProcessedDocument) -> Optional[str]:
        """Best-effort recovery of missing file path for an uploaded document.

        Strategy:
        - Search under /app/uploads (and subdirs) for files that match the original
          file extension and the stored file_size.
        - Prefer most recently modified match.
        Returns absolute path string if found, else None.
        """
        try:
            uploads_root = Path("/app/uploads")
            if not uploads_root.exists():
                return None

            target_size = getattr(processed_doc, "file_size", None)
            original_ext = Path(processed_doc.file_name).suffix.lower() if processed_doc.file_name else None

            candidates: list[tuple[float, Path]] = []  # (mtime, path)
            for root, _, files in os.walk(uploads_root):
                for fname in files:
                    fpath = Path(root) / fname
                    try:
                        # Extension check
                        if original_ext and fpath.suffix.lower() != original_ext:
                            continue
                        # Size check
                        if target_size is not None and fpath.stat().st_size != target_size:
                            continue
                        candidates.append((fpath.stat().st_mtime, fpath))
                    except Exception:
                        continue

            if not candidates:
                return None

            # Pick most recent candidate
            candidates.sort(key=lambda t: t[0], reverse=True)
            return str(candidates[0][1])
        except Exception:
            return None