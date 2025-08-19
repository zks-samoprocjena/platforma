"""Enhanced RAG (Retrieval-Augmented Generation) service with multilingual support and assessment context."""

from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
from datetime import datetime
from dataclasses import dataclass
import numpy as np

from langchain.chains import RetrievalQA
from langchain.chains.question_answering import load_qa_chain
from langchain.prompts import PromptTemplate
from langchain.schema import Document
from langchain_community.llms import Ollama
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.config import settings
from app.services.vector_service import VectorService
from app.services.search_cache_service import SearchCacheService
# Moved import to avoid circular dependency - imported in property method
from app.repositories.assessment import AssessmentRepository
from app.repositories.control_repository import ControlRepository
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.measure import MeasureRepository
from app.repositories.submeasure import SubmeasureRepository
from app.models.assessment import Assessment, AssessmentAnswer
from app.models.organization import Organization
from app.models.reference import Control, Measure


logger = structlog.get_logger()


@dataclass
class Citation:
    """Represents a citation with page reference."""
    source_id: str
    document_title: str
    page: int
    control_ids: List[str]
    confidence: float
    content_excerpt: str


class CitationValidator:
    """Validates citations and ensures accurate page references."""
    
    def __init__(self, page_tolerance: int = 1):
        """
        Initialize citation validator.
        
        Args:
            page_tolerance: Allowed page variance (±1 page by default)
        """
        self.page_tolerance = page_tolerance
    
    def validate_citation(
        self,
        citation: Citation,
        source_chunks: List[Dict[str, Any]],
    ) -> Tuple[bool, Optional[int], str]:
        """
        Validate that a citation points to the correct page.
        
        Args:
            citation: The citation to validate
            source_chunks: List of chunks from the source document
            
        Returns:
            (is_valid, corrected_page, validation_message)
        """
        # Find chunks that match the cited document
        matching_chunks = [
            chunk for chunk in source_chunks
            if chunk.get('doc_title', '') == citation.document_title
        ]
        
        if not matching_chunks:
            return False, None, f"Document '{citation.document_title}' not found in sources"
        
        # Check if any chunk contains the cited content near the specified page
        cited_page = citation.page
        valid_pages = []
        
        for chunk in matching_chunks:
            page_start = chunk.get('page_start', 0)
            page_end = chunk.get('page_end', 0)
            page_anchor = chunk.get('page_anchor', 0)
            
            # Check if the chunk's page range is within tolerance of the cited page
            if (page_start - self.page_tolerance <= cited_page <= page_end + self.page_tolerance):
                valid_pages.append(page_anchor)
                
                # Check if control IDs match
                chunk_control_ids = chunk.get('control_ids', [])
                if citation.control_ids:
                    matching_controls = set(citation.control_ids) & set(chunk_control_ids)
                    if matching_controls:
                        return True, page_anchor, f"Valid citation at page {page_anchor}"
        
        # If we found valid pages but no control match, suggest correction
        if valid_pages:
            corrected_page = min(valid_pages, key=lambda p: abs(p - cited_page))
            return True, corrected_page, f"Citation adjusted from page {cited_page} to {corrected_page}"
        
        # Look for the content in other pages
        for chunk in matching_chunks:
            chunk_control_ids = chunk.get('control_ids', [])
            if citation.control_ids and set(citation.control_ids) & set(chunk_control_ids):
                page_anchor = chunk.get('page_anchor', 0)
                return False, page_anchor, f"Content found at page {page_anchor}, not page {cited_page}"
        
        return False, None, f"Content not found near page {cited_page}"
    
    def extract_citations_from_response(
        self,
        response: str,
        source_chunks: List[Dict[str, Any]],
    ) -> List[Citation]:
        """
        Extract and validate citations from an AI response.
        
        Args:
            response: The AI-generated response text
            source_chunks: List of source chunks used for generation
            
        Returns:
            List of validated citations
        """
        citations = []
        
        # Pattern to match citations like [Source: doc_name, p. 123]
        import re
        citation_pattern = re.compile(
            r'\[(?:Izvor|Source|Ref):\s*([^,\]]+)(?:,\s*(?:str\.|p\.)\s*(\d+))?\]'
        )
        
        matches = citation_pattern.findall(response)
        
        for match in matches:
            doc_title = match[0].strip()
            page = int(match[1]) if match[1] else None
            
            # Find the source chunk for this citation
            source_chunk = None
            for chunk in source_chunks:
                if doc_title in chunk.get('doc_title', ''):
                    source_chunk = chunk
                    break
            
            if source_chunk:
                citation = Citation(
                    source_id=source_chunk.get('chunk_id', ''),
                    document_title=doc_title,
                    page=page or source_chunk.get('page_anchor', 0),
                    control_ids=source_chunk.get('control_ids', []),
                    confidence=source_chunk.get('score', 0.0),
                    content_excerpt=source_chunk.get('content', '')[:200],
                )
                
                # Validate the citation
                is_valid, corrected_page, message = self.validate_citation(
                    citation, source_chunks
                )
                
                if corrected_page and corrected_page != citation.page:
                    logger.info(
                        "citation_corrected",
                        original_page=citation.page,
                        corrected_page=corrected_page,
                        document=doc_title,
                    )
                    citation.page = corrected_page
                
                citations.append(citation)
        
        return citations
    
    def format_validated_citations(
        self,
        citations: List[Citation],
        language: str = "hr",
    ) -> str:
        """
        Format validated citations for display.
        
        Args:
            citations: List of validated citations
            language: Output language (hr/en)
            
        Returns:
            Formatted citation text
        """
        if not citations:
            return ""
        
        header = "Izvori:" if language == "hr" else "Sources:"
        formatted = [header]
        
        for i, citation in enumerate(citations, 1):
            page_text = f"str. {citation.page}" if language == "hr" else f"p. {citation.page}"
            confidence_text = f"({citation.confidence:.0%})" if citation.confidence > 0 else ""
            
            formatted.append(
                f"{i}. {citation.document_title}, {page_text} {confidence_text}"
            )
            
            if citation.control_ids:
                controls_text = ", ".join(citation.control_ids[:3])
                if len(citation.control_ids) > 3:
                    controls_text += "..."
                formatted.append(f"   Kontrole: {controls_text}")
        
        return "\n".join(formatted)


class AssessmentContextBuilder:
    """Builds comprehensive context for assessment-related AI queries."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.answer_repo = AssessmentAnswerRepository(db)
        self.org_repo = OrganizationRepository(db)
        self.control_repo = ControlRepository(db)
        self.measure_repo = MeasureRepository(db)
        self.submeasure_repo = SubmeasureRepository(db)
    
    async def build_assessment_context(
        self,
        assessment_id: UUID,
        include_answers: bool = True,
        include_organization: bool = True,
        include_hierarchy: bool = True,
    ) -> Dict[str, Any]:
        """Build comprehensive assessment context for AI queries."""
        
        try:
            # Get assessment details
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {}
            
            context = {
                "assessment": {
                    "id": str(assessment.id),
                    "title": assessment.title,
                    "security_level": assessment.security_level.value,
                    "status": assessment.status.value,
                    "created_at": assessment.created_at.isoformat(),
                    "target_score": 4.0,  # Default target
                },
            }
            
            # Add organization context
            if include_organization and assessment.organization_id:
                org = await self.org_repo.get(assessment.organization_id)
                if org:
                    context["organization"] = {
                        "id": str(org.id),
                        "name": org.name,
                        "sector": getattr(org, "sector", "Unknown"),
                        "size": getattr(org, "size", "Unknown"),
                    }
            
            # Add assessment progress and answers
            if include_answers:
                answers = await self.answer_repo.get_all_for_assessment(assessment_id)
                
                # Calculate progress
                total_controls = len(answers)
                answered_controls = sum(1 for a in answers if a.documentation_score is not None)
                
                context["progress"] = {
                    "total_controls": total_controls,
                    "answered_controls": answered_controls,
                    "completion_percentage": (answered_controls / total_controls * 100) if total_controls > 0 else 0,
                    "average_score": self._calculate_average_score(answers),
                }
                
                # Add recent answers for context
                recent_answers = []
                for answer in sorted(answers, key=lambda a: a.updated_at or a.created_at, reverse=True)[:5]:
                    control = await self.control_repo.get(answer.control_id)
                    if control:
                        recent_answers.append({
                            "control_name": control.name,
                            "documentation_score": answer.documentation_score,
                            "implementation_score": answer.implementation_score,
                            "overall_score": answer.overall_score,
                            "comments": answer.reviewer_comments,
                        })
                
                context["recent_answers"] = recent_answers
            
            # Add control hierarchy context
            if include_hierarchy:
                # Get all controls for this security level
                controls = await self.control_repo.get_by_security_level(assessment.security_level)
                
                # Group by measure
                hierarchy = {}
                for control in controls:
                    measure = await self.measure_repo.get_by_id(control.measure_id)
                    if measure:
                        if measure.name not in hierarchy:
                            hierarchy[measure.name] = {
                                "measure_code": measure.code,
                                "controls": [],
                            }
                        hierarchy[measure.name]["controls"].append({
                            "name": control.name,
                            "is_mandatory": control.is_mandatory,
                        })
                
                context["control_hierarchy"] = hierarchy
            
            return context
            
        except Exception as e:
            logger.error("failed_to_build_assessment_context", error=str(e), assessment_id=str(assessment_id))
            return {}
    
    def _calculate_average_score(self, answers: List[AssessmentAnswer]) -> float:
        """Calculate average overall score from answers."""
        valid_scores = [a.overall_score for a in answers if a.overall_score is not None]
        return sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
    
    def format_context_for_prompt(self, context: Dict[str, Any], language: str = "hr") -> str:
        """Format assessment context for inclusion in AI prompts."""
        
        if not context:
            return ""
        
        formatted_parts = []
        
        # Assessment info
        if "assessment" in context:
            assessment = context["assessment"]
            if language == "hr":
                formatted_parts.append(
                    f"Procjena: {assessment['title']}\n"
                    f"Razina sigurnosti: {assessment['security_level']}\n"
                    f"Status: {assessment['status']}"
                )
            else:
                formatted_parts.append(
                    f"Assessment: {assessment['title']}\n"
                    f"Security level: {assessment['security_level']}\n"
                    f"Status: {assessment['status']}"
                )
        
        # Organization info
        if "organization" in context:
            org = context["organization"]
            if language == "hr":
                formatted_parts.append(
                    f"\nOrganizacija: {org['name']}\n"
                    f"Sektor: {org['sector']}\n"
                    f"Veličina: {org['size']}"
                )
            else:
                formatted_parts.append(
                    f"\nOrganization: {org['name']}\n"
                    f"Sector: {org['sector']}\n"
                    f"Size: {org['size']}"
                )
        
        # Progress info
        if "progress" in context:
            progress = context["progress"]
            if language == "hr":
                formatted_parts.append(
                    f"\nNapredak procjene:\n"
                    f"- Ukupno kontrola: {progress['total_controls']}\n"
                    f"- Odgovoreno: {progress['answered_controls']} ({progress['completion_percentage']:.1f}%)\n"
                    f"- Prosječna ocjena: {progress['average_score']:.2f}/5"
                )
            else:
                formatted_parts.append(
                    f"\nAssessment progress:\n"
                    f"- Total controls: {progress['total_controls']}\n"
                    f"- Answered: {progress['answered_controls']} ({progress['completion_percentage']:.1f}%)\n"
                    f"- Average score: {progress['average_score']:.2f}/5"
                )
        
        # Recent answers
        if "recent_answers" in context and context["recent_answers"]:
            if language == "hr":
                formatted_parts.append("\nNedavno ocijenjene kontrole:")
                for answer in context["recent_answers"][:3]:
                    formatted_parts.append(
                        f"- {answer['control_name']}: {answer['overall_score']:.1f}/5"
                    )
            else:
                formatted_parts.append("\nRecently assessed controls:")
                for answer in context["recent_answers"][:3]:
                    formatted_parts.append(
                        f"- {answer['control_name']}: {answer['overall_score']:.1f}/5"
                    )
        
        return "\n".join(formatted_parts)


class RAGService:
    """Enhanced service for RAG operations with multilingual support and assessment context."""
    
    def __init__(self, db: AsyncSession, rerank_top_n: int = 30, final_k: int = 8):
        self.db = db
        self.vector_service = VectorService(db)
        self.cache_service = SearchCacheService()
        
        # Reranking configuration
        self.rerank_top_n = rerank_top_n  # Keep top-N after RRF for reranking
        self.final_k = final_k  # Final number of chunks for context
        # Lazy init heavy services to avoid unnecessary model loads on DB-only paths
        self._ai_service = None
        self.assessment_repo = AssessmentRepository(db)
        self.control_repo = ControlRepository(db)
        self.answer_repo = AssessmentAnswerRepository(db)
        self.org_repo = OrganizationRepository(db)
        self.measure_repo = MeasureRepository(db)
        self.submeasure_repo = SubmeasureRepository(db)
        self.context_builder = AssessmentContextBuilder(db)
        self.citation_validator = CitationValidator(page_tolerance=1)
        
        # Initialize Ollama LLM
        self.llm = Ollama(
            base_url=settings.ollama_base_url,
            model=settings.OLLAMA_MODEL,
            temperature=0.7,
            top_k=40,
            top_p=0.9,
        )
    
    @property
    def ai_service(self):
        if self._ai_service is None:
            from app.services.ai_service import AIService
            self._ai_service = AIService(self.db)
        return self._ai_service
        
        # Multilingual context prompt templates
        self.context_prompts = {
            'hr': PromptTemplate(
                input_variables=["context", "question"],
                template="""Koristite sljedeći kontekst da odgovorite na pitanje.
Kontekst može biti na različitim jezicima - koristite sve informacije.

Kontekst:
{context}

Pitanje: {question}
Odgovor na hrvatskom:"""),
            'en': PromptTemplate(
                input_variables=["context", "question"],
                template="""Use the following context to answer the question.
Context may be in different languages - use all information.

Context:
{context}

Question: {question}
Answer in English:""")
        }
        
        # Recommendation prompt template (Croatian)
        self.recommendation_prompt = PromptTemplate(
            input_variables=["context", "gap_analysis", "security_level"],
            template="""Na temelju sljedećih informacija, generirajte preporuke za poboljšanje usklađenosti.

Kontekst iz dokumenata:
{context}

Analiza nedostataka:
{gap_analysis}

Razina sigurnosti: {security_level}

Generirajte konkretne, akcijske preporuke na hrvatskom jeziku koje će pomoći organizaciji 
poboljšati svoju usklađenost. Svaka preporuka treba biti:
1. Specifična i mjerljiva
2. Realistična za implementaciju
3. Vezana uz konkretne kontrole
4. Prioritizirana po važnosti

Preporuke:"""
        )
    
    async def search_similar_content(
        self,
        query: str,
        organization_id: UUID,
        k: Optional[int] = None,
        score_threshold: Optional[float] = None,  # Deprecated, kept for compatibility
        filter_metadata: Optional[Dict[str, Any]] = None,
        control_id: Optional[str] = None,
    ) -> List[Tuple[Document, float]]:
        """Search for similar content using two-layer retrieval with reranking.
        
        Pipeline:
        1. Two-layer retrieval (Tier 1 + Tier 2) with RRF fusion
        2. Keep top-N candidates (rerank_top_n)
        3. Rerank candidates
        4. Return final-k results
        """
        # Use configured defaults if not specified
        if k is None:
            k = self.final_k
            
        try:
            # Check cache first
            cached_results = await self.cache_service.get_cached_results(
                query=query,
                organization_id=organization_id,
                k=self.rerank_top_n,  # Cache more results for reranking
                filter_metadata=filter_metadata,
            )
            
            if cached_results is not None:
                # Rerank cached results
                reranked = await self._rerank_results(query, cached_results, k)
                return reranked
            
            # Get two-layer retrieval results with RRF fusion
            # Request more results for reranking pool
            results = await self.vector_service.similarity_search_with_score(
                query=query,
                organization_id=organization_id,
                k=self.rerank_top_n,  # Get top-N for reranking
                control_id=control_id,
            )
            
            # Cache the raw results
            await self.cache_service.cache_results(
                query=query,
                organization_id=organization_id,
                k=self.rerank_top_n,
                results=results,
                filter_metadata=filter_metadata,
            )
            
            # Rerank and select final-k
            reranked_results = await self._rerank_results(query, results, k)
            
            logger.info(
                "similarity_search_completed",
                query=query[:50],
                initial_results=len(results),
                final_results=len(reranked_results),
                organization_id=str(organization_id),
            )
            
            return reranked_results
            
        except Exception as e:
            logger.error(
                "similarity_search_failed",
                error=str(e),
                query=query[:50],
            )
            # Ensure DB session is usable after a failed SQL execution
            try:
                await self.db.rollback()
            except Exception:
                pass
            return []
    
    async def _rerank_results(
        self,
        query: str,
        results: List[Tuple[Document, float]],
        k: int
    ) -> List[Tuple[Document, float]]:
        """Rerank results using semantic similarity or cross-encoder.
        
        Currently uses simple semantic similarity reranking.
        Can be enhanced with cross-encoder models.
        """
        if not results:
            return []
            
        # If we have fewer results than k, return all
        if len(results) <= k:
            return results
            
        # Simple reranking based on content relevance
        # For now, we'll use a combination of:
        # 1. Original RRF score (from two-layer retrieval)
        # 2. Query-document semantic similarity  
        # 3. Control ID match bonus
        
        reranked = []
        for doc, rrf_score in results:
            # Calculate relevance score
            relevance_score = rrf_score
            
            # Boost if control IDs match query
            control_ids = doc.metadata.get('control_ids', [])
            if control_ids:
                # Check if any control ID is mentioned in query
                query_upper = query.upper()
                for control_id in control_ids:
                    if control_id in query_upper:
                        relevance_score *= 2.0  # Boost for exact control match
                        break
            
            # Boost based on tier source
            tier_source = doc.metadata.get('tier_source', 'unknown')
            if tier_source == 'tier1':
                relevance_score *= 1.5  # Boost Tier 1 (exact) matches
            elif tier_source == 'both':
                relevance_score *= 1.3  # Boost chunks found in both tiers
            
            # Document type relevance
            doc_type = doc.metadata.get('doc_type', '')
            if doc_type:
                # Boost framework documents for general queries
                if doc_type in ['ZKS', 'NIS2'] and 'framework' in query.lower():
                    relevance_score *= 1.2
                # Boost control catalogs for control-specific queries
                elif doc_type in ['PRILOG_B', 'PRILOG_C'] and any(kw in query.lower() for kw in ['kontrola', 'control', 'mjera', 'measure']):
                    relevance_score *= 1.2
            
            reranked.append((doc, relevance_score))
        
        # Sort by reranked score and return top-k
        reranked.sort(key=lambda x: x[1], reverse=True)
        return reranked[:k]
    
    async def retrieve_context(
        self,
        query: str,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
        k: int = 5,
    ) -> str:
        """Retrieve and assemble context for a query."""
        
        filter_metadata = {}
        
        # If assessment provided, we could filter by security level
        # but documents don't have security_level in metadata, so skip this
        # if assessment_id:
        #     assessment = await self.assessment_repo.get_by_id(assessment_id)
        #     if assessment and assessment.security_level:
        #         # Handle both enum and string types for security_level
        #         security_level = assessment.security_level.value if hasattr(assessment.security_level, 'value') else assessment.security_level
        #         filter_metadata["security_level"] = security_level
        
        # Search for relevant documents using reranking pipeline
        results = await self.search_similar_content(
            query=query,
            organization_id=organization_id,
            k=k,  # Will be reranked from larger pool
            filter_metadata=filter_metadata,
        )
        
        if not results:
            return ""
        
        # Assemble context from top results
        context_parts = []
        seen_content = set()  # Avoid duplicate content
        
        for doc, score in results:
            content = doc.page_content.strip()
            
            # Skip if we've seen very similar content
            if content[:100] in seen_content:
                continue
                
            seen_content.add(content[:100])
            
            # Add source information if available
            source_info = ""
            if "source" in doc.metadata:
                source_info = f"\n[Izvor: {doc.metadata['source']}]"
            
            context_parts.append(f"{content}{source_info}")
        
        # Join with clear separation
        context = "\n\n---\n\n".join(context_parts)
        
        logger.info(
            "context_retrieved",
            query=query[:50],
            context_length=len(context),
            num_chunks=len(context_parts),
        )
        
        return context
    
    async def retrieve_context_with_sources(
        self,
        query: str,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
        k: int = 5,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Retrieve context and source references for a query."""
        
        filter_metadata = {}
        
        # If assessment provided, we could filter by security level
        # but documents don't have security_level in metadata, so skip this
        # if assessment_id:
        #     assessment = await self.assessment_repo.get_by_id(assessment_id)
        #     if assessment and assessment.security_level:
        #         # Handle both enum and string types for security_level
        #         security_level = assessment.security_level.value if hasattr(assessment.security_level, 'value') else assessment.security_level
        #         filter_metadata["security_level"] = security_level
        
        # Search for relevant documents using reranking pipeline
        results = await self.search_similar_content(
            query=query,
            organization_id=organization_id,
            k=k,  # Will be reranked from larger pool
            filter_metadata=filter_metadata,
        )
        
        if not results:
            return "", []
        
        # Assemble context from top results
        context_parts = []
        sources = []
        seen_content = set()  # Avoid duplicate content
        seen_sources = set()  # Track unique sources
        
        for doc, score in results:
            content = doc.page_content.strip()
            
            # Skip if we've seen very similar content
            if content[:100] in seen_content:
                continue
                
            seen_content.add(content[:100])
            
            # Add source information if available
            # Check both 'source' (from chunk_metadata) and 'doc_title' (from retrieval metadata)
            source_info = ""
            source_name = doc.metadata.get("source") or doc.metadata.get("doc_title")
            
            if source_name:
                source_info = f"\n[Izvor: {source_name}]"
                
                # Extract page/section info if available
                # Check multiple possible page fields
                page_info = doc.metadata.get("page") or doc.metadata.get("page_anchor") or doc.metadata.get("page_start")
                if page_info and page_info != 0:
                    source_with_page = f"{source_name}, str. {page_info}"
                else:
                    source_with_page = source_name
                
                # Track unique sources (by document name, not page)
                if source_name not in seen_sources:
                    seen_sources.add(source_name)
                    sources.append(source_with_page)
                elif len(sources) < 5:  # Still add if we don't have many sources yet
                    # Check if this exact source+page combo isn't already there
                    if source_with_page not in sources:
                        sources.append(source_with_page)
            
            context_parts.append(f"{content}{source_info}")
        
        # Join with clear separation
        context = "\n\n---\n\n".join(context_parts)
        
        logger.info(
            "context_with_sources_retrieved",
            query=query[:50],
            context_length=len(context),
            num_chunks=len(context_parts),
            num_sources=len(sources),
            sources=sources[:3],  # Log first 3 sources
        )
        
        return context, sources
    
    # Cross-Language RAG Methods
    async def cross_language_search(
        self,
        query: str,
        organization_id: UUID,
        user_language: str,
        k: int = 10,
        include_metadata: bool = True
    ) -> Dict[str, Any]:
        """Perform cross-language search and return structured results.
        
        Args:
            query: User's search query
            organization_id: Organization ID for scoping
            user_language: User's preferred language (hr/en)
            k: Number of results to return
            include_metadata: Whether to include document metadata
            
        Returns:
            Dictionary with search results and metadata
        """
        # Detect query language
        query_language = self.vector_service.detect_language(query)
        logger.info(f"Query language: {query_language}, User language: {user_language}")
        
        # Perform similarity search
        results = await self.vector_service.similarity_search_with_score(
            query=query,
            organization_id=organization_id,
            k=k,
            user_language=user_language
        )
        
        # Structure results with language information
        structured_results = []
        languages_found = set()
        
        for doc, score in results:
            doc_language = doc.metadata.get('language', 'unknown')
            languages_found.add(doc_language)
            
            result = {
                'content': doc.page_content,
                'score': float(score),
                'language': doc_language,
                'cross_language': doc_language != query_language,
            }
            
            if include_metadata:
                result['metadata'] = {
                    'document_id': doc.metadata.get('document_id'),
                    'page': doc.metadata.get('page', 0),
                    'source': doc.metadata.get('source', ''),
                }
            
            structured_results.append(result)
        
        return {
            'query': query,
            'query_language': query_language,
            'user_language': user_language,
            'results': structured_results,
            'total_results': len(structured_results),
            'languages_found': list(languages_found),
            'cross_language_enabled': settings.CROSS_LANGUAGE_SEARCH_ENABLED
        }
    
    async def generate_multilingual_response(
        self,
        query: str,
        search_results: Dict[str, Any],
        user_language: str,
        system_prompt: Optional[str] = None,
        include_citations: bool = True
    ) -> Dict[str, Any]:
        """Generate a response in the user's language using multilingual context.
        
        Args:
            query: User's original query
            search_results: Results from cross_language_search
            user_language: Target language for response
            system_prompt: Optional custom system prompt
            include_citations: Whether to include source citations
            
        Returns:
            Dictionary with generated response and metadata
        """
        # Prepare context from search results
        context = self.vector_service.get_cross_language_context(
            query=query,
            retrieved_docs=[{
                'content': r['content'],
                'metadata': r.get('metadata', {}) | {'language': r['language']}
            } for r in search_results['results']],
            user_language=user_language
        )
        
        # Format prompt for multilingual generation
        prompt = self.vector_service.format_multilingual_prompt(
            query=query,
            context=context,
            user_language=user_language
        )
        
        # Add system prompt if provided
        if system_prompt:
            prompt = f"{system_prompt}\n\n{prompt}"
        
        # Generate response using AI service
        try:
            response = await self.ai_service.generate_completion(
                prompt=prompt,
                temperature=0.3,  # Lower temperature for factual responses
                max_tokens=1000
            )
            
            # Format response with citations if requested
            if include_citations:
                citations = self._format_citations(
                    search_results['results'],
                    user_language
                )
                response_with_citations = f"{response}\n\n{citations}"
            else:
                response_with_citations = response
            
            return {
                'response': response_with_citations,
                'user_language': user_language,
                'source_languages': search_results['languages_found'],
                'cross_language_sources': any(r['cross_language'] for r in search_results['results']),
                'metadata': {
                    'query_language': search_results['query_language'],
                    'total_sources': search_results['total_results'],
                    'model': settings.OLLAMA_MODEL
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to generate multilingual response: {e}")
            raise
    
    def _format_citations(
        self,
        results: List[Dict[str, Any]],
        user_language: str
    ) -> str:
        """Format citations for the response.
        
        Args:
            results: Search results with metadata
            user_language: User's language for citation formatting
            
        Returns:
            Formatted citations string
        """
        if not results:
            return ""
        
        # Language-specific citation headers
        citation_headers = {
            'hr': "Izvori:",
            'en': "Sources:"
        }
        
        # Language indicators
        lang_indicators = {
            'hr': {'hr': '(hrvatski)', 'en': '(engleski)'},
            'en': {'hr': '(Croatian)', 'en': '(English)'}
        }
        
        header = citation_headers.get(user_language, "Sources:")
        citations = [header]
        
        # Group by document
        docs_seen = set()
        for i, result in enumerate(results):
            doc_id = result.get('metadata', {}).get('document_id', 'Unknown')
            if doc_id not in docs_seen:
                docs_seen.add(doc_id)
                source = result.get('metadata', {}).get('source', f'Document {i+1}')
                lang = result.get('language', 'unknown')
                lang_indicator = lang_indicators.get(user_language, {}).get(lang, f'({lang})')
                
                citations.append(f"- {source} {lang_indicator}")
        
        return '\n'.join(citations)
    
    def _extract_standards(self, results: List[Dict[str, Any]]) -> List[str]:
        """Extract referenced standards from search results."""
        standards = set()
        standard_patterns = ['ISO', 'NIST', 'ZKS', 'NIS2', 'IEC']
        
        for result in results:
            content = result['content'].upper()
            for pattern in standard_patterns:
                if pattern in content:
                    # Simple extraction - could be enhanced with regex
                    standards.add(pattern)
        
        return sorted(list(standards))
    
    async def answer_compliance_question(
        self,
        query: str,
        organization_id: UUID,
        user_language: str,
        compliance_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Answer a compliance-specific question with cross-language support.
        
        Args:
            query: Compliance question
            organization_id: Organization ID
            user_language: User's preferred language
            compliance_context: Optional compliance-specific context
            
        Returns:
            Compliance-focused response with sources
        """
        # Perform cross-language search
        search_results = await self.cross_language_search(
            query=query,
            organization_id=organization_id,
            user_language=user_language,
            k=15  # Get more results for compliance questions
        )
        
        # Prepare compliance-specific system prompt
        compliance_prompts = {
            'hr': """Vi ste stručnjak za usklađenost koji pomaže s ZKS/NIS2 i međunarodnim standardima.
Koristite informacije iz svih izvora bez obzira na jezik.
Budite precizni i referirajte se na specifične zahtjeve kada je to moguće.""",
            'en': """You are a compliance expert helping with ZKS/NIS2 and international standards.
Use information from all sources regardless of language.
Be precise and reference specific requirements when possible."""
        }
        
        system_prompt = compliance_prompts.get(user_language, compliance_prompts['en'])
        
        # Add compliance context if provided
        if compliance_context:
            context_info = f"\nContext: Security Level: {compliance_context.get('security_level', 'N/A')}"
            system_prompt += context_info
        
        # Generate compliance-focused response
        response = await self.generate_multilingual_response(
            query=query,
            search_results=search_results,
            user_language=user_language,
            system_prompt=system_prompt,
            include_citations=True
        )
        
        # Add compliance-specific metadata
        response['compliance_metadata'] = {
            'standards_referenced': self._extract_standards(search_results['results']),
            'security_levels': compliance_context.get('security_level') if compliance_context else None,
            'cross_standard_analysis': len(search_results['languages_found']) > 1
        }
        
        return response
    
    async def generate_response_with_validated_citations(
        self,
        query: str,
        organization_id: UUID,
        language: str = "hr",
        max_sources: int = 5,
        include_citations: bool = True,
        control_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI response with validated citations using two-layer retrieval.
        
        Args:
            query: User's question
            organization_id: Organization ID
            language: Response language (hr/en)
            max_sources: Maximum number of sources to use
            include_citations: Whether to include validated citations
            control_id: Optional control ID for focused retrieval
            
        Returns:
            Response with validated citations and metadata
        """
        try:
            # Perform two-layer retrieval
            source_chunks = await self.vector_service.similarity_search_with_score(
                query=query,
                organization_id=organization_id,
                k=max_sources * 2,  # Get more for better selection
                control_id=control_id,
            )
            
            if not source_chunks:
                return {
                    "response": "Nažalost, nisam pronašao relevantne informacije." 
                               if language == "hr" 
                               else "Unfortunately, I couldn't find relevant information.",
                    "citations": [],
                    "source_chunks": [],
                    "validation_status": "no_sources",
                }
            
            # Limit to top sources
            source_chunks = source_chunks[:max_sources]
            
            # Build context from chunks
            context_parts = []
            for chunk in source_chunks:
                content = chunk.get('content', '')
                doc_title = chunk.get('doc_title', 'Unknown')
                page = chunk.get('page_anchor', 0)
                
                # Include source reference in context
                context_parts.append(
                    f"[Izvor: {doc_title}, str. {page}]\n{content}"
                )
            
            context = "\n\n---\n\n".join(context_parts)
            
            # Generate response with context
            if language == "hr":
                prompt = f"""Koristite sljedeći kontekst da odgovorite na pitanje.
Kada citirate izvore, koristite format [Izvor: naziv_dokumenta, str. broj_stranice].

Kontekst:
{context}

Pitanje: {query}

Odgovor s citiranjem izvora:"""
            else:
                prompt = f"""Use the following context to answer the question.
When citing sources, use the format [Source: document_name, p. page_number].

Context:
{context}

Question: {query}

Answer with source citations:"""
            
            # Generate AI response
            response_result = await self.ai_service.generate_response(
                prompt=prompt,
                temperature=0.3,
                max_tokens=1500,
            )
            
            if response_result["status"] == "error":
                return {
                    "response": response_result.get("error", "Generation error"),
                    "citations": [],
                    "source_chunks": source_chunks,
                    "validation_status": "generation_error",
                }
            
            response_text = response_result["response"]
            
            # Extract and validate citations if requested
            validated_citations = []
            if include_citations:
                extracted_citations = self.citation_validator.extract_citations_from_response(
                    response_text, source_chunks
                )
                
                # Format validated citations
                if extracted_citations:
                    citation_text = self.citation_validator.format_validated_citations(
                        extracted_citations, language
                    )
                    
                    # Append citations to response if not already included
                    if citation_text and "[Izvor:" not in response_text and "[Source:" not in response_text:
                        response_text += f"\n\n{citation_text}"
                    
                    # Convert to dict format for API response
                    validated_citations = [
                        {
                            "source_id": c.source_id,
                            "document": c.document_title,
                            "page": c.page,
                            "control_ids": c.control_ids,
                            "confidence": c.confidence,
                            "excerpt": c.content_excerpt,
                        }
                        for c in extracted_citations
                    ]
            
            # Analyze retrieval tiers
            tier_analysis = {
                "tier1_used": any(chunk.get('tier_source') in ['tier1', 'both'] 
                                 for chunk in source_chunks),
                "tier2_used": any(chunk.get('tier_source') in ['tier2', 'both'] 
                                 for chunk in source_chunks),
                "control_focused": control_id is not None,
            }
            
            return {
                "response": response_text,
                "citations": validated_citations,
                "source_chunks": [
                    {
                        "chunk_id": c.get('chunk_id'),
                        "doc_title": c.get('doc_title'),
                        "page": c.get('page_anchor'),
                        "score": c.get('score'),
                        "tier": c.get('tier_source', 'unknown'),
                        "control_ids": c.get('control_ids', []),
                    }
                    for c in source_chunks
                ],
                "validation_status": "validated",
                "tier_analysis": tier_analysis,
                "language": language,
                "generation_time": response_result.get("generation_time", 0),
            }
            
        except Exception as e:
            logger.error(
                "generate_response_with_citations_failed",
                error=str(e),
                query=query[:50],
            )
            return {
                "response": "Dogodila se greška." if language == "hr" else "An error occurred.",
                "citations": [],
                "source_chunks": [],
                "validation_status": "error",
                "error": str(e),
            }
    
    async def answer_question(
        self,
        question: str,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
        language: str = "hr",
    ) -> Dict[str, Any]:
        """Answer a question using multilingual RAG with two-layer retrieval and citation validation."""
        
        try:
            # Check if cross-language search is enabled
            if settings.CROSS_LANGUAGE_SEARCH_ENABLED:
                # Use cross-language functionality for better multilingual support
                compliance_context = None
                if assessment_id:
                    assessment = await self.assessment_repo.get_by_id(assessment_id)
                    if assessment:
                        # Handle both enum and string types for security_level
                        security_level = None
                        if assessment.security_level:
                            security_level = assessment.security_level.value if hasattr(assessment.security_level, 'value') else assessment.security_level
                        compliance_context = {
                            'security_level': security_level
                        }
                
                result = await self.answer_compliance_question(
                    query=question,
                    organization_id=organization_id,
                    user_language=language,
                    compliance_context=compliance_context
                )
                
                return {
                    "answer": result['response'],
                    "sources": result.get('compliance_metadata', {}).get('standards_referenced', []),
                    "confidence": 0.85,  # Higher confidence with cross-language search
                    "cross_language_sources": result.get('cross_language_sources', False),
                    "source_languages": result.get('source_languages', [])
                }
            
            # Fallback to original implementation
            # Retrieve context
            context = await self.retrieve_context(
                query=question,
                organization_id=organization_id,
                assessment_id=assessment_id,
                k=5,
            )
            
            if not context:
                return {
                    "answer": "Nažalost, nisam pronašao relevantne informacije za odgovor na vaše pitanje." 
                             if language == "hr" 
                             else "Unfortunately, I couldn't find relevant information to answer your question.",
                    "sources": [],
                    "confidence": 0.0,
                }
            
            # Select appropriate prompt template
            prompt = self.context_prompts.get(language, self.context_prompts['hr'])
            
            # Create QA chain
            qa_chain = load_qa_chain(
                llm=self.llm,
                chain_type="stuff",
                prompt=prompt,
            )
            
            # Get answer
            result = await qa_chain.ainvoke({
                "input_documents": [Document(page_content=context)],
                "question": question,
            })
            
            # Extract source information
            sources = []
            search_results = await self.search_similar_content(
                query=question,
                organization_id=organization_id,
                k=3,
            )
            
            for doc, score in search_results:
                if "source" in doc.metadata:
                    sources.append({
                        "source": doc.metadata["source"],
                        "relevance_score": float(score),
                    })
            
            return {
                "answer": result.get("output_text", ""),
                "sources": sources,
                "confidence": float(sum(s["relevance_score"] for s in sources) / len(sources)) if sources else 0.0,
                "context_length": len(context),
            }
            
        except Exception as e:
            logger.error(
                "answer_question_failed",
                error=str(e),
                question=question[:50],
            )
            return {
                "answer": "Dogodila se greška prilikom generiranja odgovora." 
                         if language == "hr" 
                         else "An error occurred while generating the answer.",
                "sources": [],
                "confidence": 0.0,
                "error": str(e),
            }
    
    async def generate_recommendations(
        self,
        assessment_id: UUID,
        organization_id: UUID,
        control_ids: Optional[List[UUID]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate AI recommendations for assessment gaps."""
        
        try:
            # Get assessment details
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return []
            
            # Get gap analysis (controls with low scores)
            gap_analysis = await self._analyze_assessment_gaps(
                assessment_id=assessment_id,
                control_ids=control_ids,
            )
            
            if not gap_analysis:
                return []
            
            recommendations = []
            
            # Generate recommendations for each gap
            for gap in gap_analysis[:5]:  # Limit to top 5 gaps
                # Get relevant context from documents
                context = await self.retrieve_context(
                    query=gap["control_description"],
                    organization_id=organization_id,
                    assessment_id=assessment_id,
                    k=3,
                )
                
                # Generate recommendation
                recommendation_chain = load_qa_chain(
                    llm=self.llm,
                    chain_type="stuff",
                    prompt=self.recommendation_prompt,
                )
                
                result = await recommendation_chain.ainvoke({
                    "input_documents": [Document(page_content=context)],
                    "gap_analysis": self._format_gap_for_prompt(gap),
                    "security_level": assessment.security_level.value if hasattr(assessment.security_level, 'value') else assessment.security_level,
                })
                
                recommendation = {
                    "control_id": str(gap["control_id"]),
                    "control_name": gap["control_name"],
                    "current_score": gap["current_score"],
                    "target_score": gap["target_score"],
                    "recommendation": result.get("output_text", ""),
                    "priority": gap["priority"],
                    "generated_at": datetime.utcnow().isoformat(),
                }
                
                recommendations.append(recommendation)
            
            logger.info(
                "recommendations_generated",
                assessment_id=str(assessment_id),
                num_recommendations=len(recommendations),
            )
            
            return recommendations
            
        except Exception as e:
            logger.error(
                "generate_recommendations_failed",
                error=str(e),
                assessment_id=str(assessment_id),
            )
            return []
    
    async def _analyze_assessment_gaps(
        self,
        assessment_id: UUID,
        control_ids: Optional[List[UUID]] = None,
    ) -> List[Dict[str, Any]]:
        """Analyze assessment to identify gaps."""
        
        # This would integrate with assessment service to get actual scores
        # For now, returning mock data structure
        gaps = []
        
        # Get controls that need improvement (score < 3)
        # This is placeholder - would get real data from assessment service
        mock_gaps = [
            {
                "control_id": UUID("12345678-1234-5678-1234-567812345678"),
                "control_name": "Politika sigurnosti informacija",
                "control_description": "Organizacija mora definirati i održavati politiku sigurnosti informacija",
                "current_score": 2.0,
                "target_score": 4.0,
                "gap": 2.0,
                "priority": "high",
            },
            {
                "control_id": UUID("23456789-2345-6789-2345-678923456789"),
                "control_name": "Upravljanje pristupom",
                "control_description": "Kontrola pristupa korisnika informacijskim sustavima",
                "current_score": 2.5,
                "target_score": 4.0,
                "gap": 1.5,
                "priority": "medium",
            },
        ]
        
        if control_ids:
            gaps = [g for g in mock_gaps if UUID(g["control_id"]) in control_ids]
        else:
            gaps = mock_gaps
        
        # Sort by gap size (descending)
        gaps.sort(key=lambda x: x["gap"], reverse=True)
        
        return gaps
    
    def _format_gap_for_prompt(self, gap: Dict[str, Any]) -> str:
        """Format gap analysis for prompt."""
        
        return f"""
Kontrola: {gap['control_name']}
Trenutna ocjena: {gap['current_score']}/5
Ciljna ocjena: {gap['target_score']}/5
Nedostatak: {gap['gap']} bodova
Prioritet: {gap['priority']}
"""
    
    async def create_retrieval_qa_chain(
        self,
        organization_id: UUID,
        chain_type: str = "stuff",
    ) -> RetrievalQA:
        """Create a RetrievalQA chain for the organization."""
        
        # Get vector store as retriever
        vectorstore = self.vector_service.get_vectorstore(organization_id)
        retriever = vectorstore.as_retriever(
            search_kwargs={"k": 5}
        )
        
        # Create RetrievalQA chain
        qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type=chain_type,
            retriever=retriever,
            return_source_documents=True,
            chain_type_kwargs={
                "prompt": self.context_prompt,
            }
        )
        
        return qa_chain
    
    # Assessment-Specific RAG Methods
    async def search_for_control(
        self,
        control_id: UUID,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
    ) -> List[Tuple[Document, float]]:
        """Search for documents relevant to a specific control."""
        
        try:
            # Get control details
            control = await self.control_repo.get_by_id(control_id)
            if not control:
                logger.warning("control_not_found", control_id=str(control_id))
                return []
            
            # Build search query from control description
            search_query = f"{control.name} {control.description}"
            if control.implementation_guidance:
                search_query += f" {control.implementation_guidance}"
            
            # Add security level filter if assessment provided
            filter_metadata = {}
            if assessment_id:
                assessment = await self.assessment_repo.get_by_id(assessment_id)
                if assessment and assessment.security_level:
                    filter_metadata["security_level"] = assessment.security_level.value
            
            # Search for relevant content
            results = await self.search_similar_content(
                query=search_query,
                organization_id=organization_id,
                k=10,
                score_threshold=0.6,  # Lower threshold for control-specific search
                filter_metadata=filter_metadata,
            )
            
            logger.info(
                "control_search_completed",
                control_id=str(control_id),
                results_found=len(results),
            )
            
            return results
            
        except Exception as e:
            logger.error(
                "control_search_failed",
                error=str(e),
                control_id=str(control_id),
            )
            return []
    
    async def get_control_guidance(
        self,
        control_id: UUID,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Get AI-powered guidance for implementing a specific control."""
        
        logger.info(
            "[Enhanced RAG Service] Control guidance request",
            control_id=str(control_id),
            organization_id=str(organization_id),
            assessment_id=str(assessment_id) if assessment_id else None
        )
        
        try:
            # Get control details
            control = await self.control_repo.get_by_id(control_id)
            if not control:
                logger.warning(
                    "[Enhanced RAG Service] Control not found",
                    control_id=str(control_id)
                )
                return {"error": "Control not found"}
            
            # Get relevant documents
            search_results = await self.search_for_control(
                control_id=control_id,
                organization_id=organization_id,
                assessment_id=assessment_id,
            )
            
            # Build context from search results
            context_parts = []
            for doc, score in search_results[:3]:
                context_parts.append(f"[Relevance: {score:.2f}] {doc.page_content[:300]}...")
            
            context = "\n\n".join(context_parts) if context_parts else "No relevant documents found"
            
            # Get assessment context if available
            assessment_context = ""
            if assessment_id:
                assessment_ctx = await self.context_builder.build_assessment_context(
                    assessment_id=assessment_id,
                    include_answers=True,
                    include_organization=True,
                    include_hierarchy=False,
                )
                assessment_context = self.context_builder.format_context_for_prompt(
                    assessment_ctx, 
                    "hr"  # Default to Croatian
                )
            
            # Create guidance prompt
            prompt = f"""Dajte detaljne smjernice za implementaciju sigurnosne kontrole:

Kontrola: {control.name_hr}
Opis: {control.description_hr}

Kontekst procjene:
{assessment_context}

Relevantni dokumenti:
{context}

Molim dajte:
1. Konkretne korake za implementaciju
2. Najbolje prakse
3. Moguće izazove i kako ih riješiti
4. Resurse potrebne za implementaciju
5. Načine mjerenja uspješnosti

Odgovor:"""
            
            system_prompt = (
                "Vi ste stručnjak za implementaciju sigurnosnih kontrola prema ZKS/NIS2 regulativi. "
                "Dajte praktične i konkretne smjernice prilagođene hrvatskoj regulatornoj sredini."
            )
            
            # Generate AI response
            ai_result = await self.ai_service.generate_response(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.3,
                max_tokens=1500,
            )
            
            if ai_result["status"] == "error":
                return {
                    "error": ai_result.get("error"),
                    "control_id": str(control_id),
                }
            
            # Prepare sources
            sources = []
            for doc, score in search_results[:3]:
                if "source" in doc.metadata:
                    sources.append({
                        "source": doc.metadata["source"],
                        "relevance_score": float(score),
                        "excerpt": doc.page_content[:100] + "...",
                    })
            
            result = {
                "control_id": str(control_id),
                "control_name": control.name,
                "guidance": ai_result["response"],
                "sources": sources,
                "generation_time": ai_result["generation_time"],
                "context_used": bool(context_parts),
                "assessment_context_used": bool(assessment_context),
            }
            
            return result
            
        except Exception as e:
            logger.error(
                "[Enhanced RAG Service] Control guidance failed",
                error=str(e),
                control_id=str(control_id)
            )
            return {
                "error": str(e),
                "control_id": str(control_id),
            }
    
    async def analyze_assessment_gaps(
        self,
        assessment_id: UUID,
        organization_id: UUID,
    ) -> List[Dict[str, Any]]:
        """Analyze assessment to identify gaps and areas for improvement."""
        
        try:
            # Get assessment and answers
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return []
            
            # Get all answers for the assessment
            answers = await self.answer_repo.get_all_for_assessment(assessment_id)
            
            gaps = []
            for answer in answers:
                # Skip if scores are not set
                if answer.documentation_score is None or answer.implementation_score is None:
                    continue
                    
                # Calculate average score
                avg_score = (answer.documentation_score + answer.implementation_score) / 2
                
                # Get control info
                control = await self.control_repo.get_by_id(answer.control_id)
                if not control:
                    continue
                
                # Define what constitutes a gap
                ACCEPTABLE_SCORE_THRESHOLD = 3.0
                MANDATORY_SCORE_THRESHOLD = 4.0
                
                # Check if control is mandatory for this security level and submeasure
                requirement = await self.control_repo.get_requirement_by_control_submeasure_level(
                    answer.control_id,
                    answer.submeasure_id,
                    assessment.security_level
                )
                is_mandatory = requirement.is_mandatory if requirement else False
                
                # Determine if this is a gap
                is_gap = False
                if is_mandatory and avg_score < MANDATORY_SCORE_THRESHOLD:
                    is_gap = True
                elif avg_score < ACCEPTABLE_SCORE_THRESHOLD:
                    is_gap = True
                
                if is_gap:
                    gap = {
                        "control_id": str(answer.control_id),
                        "control_name": control.name_hr,
                        "control_description": control.description_hr,
                        "current_score": float(avg_score),
                        "documentation_score": float(answer.documentation_score),
                        "implementation_score": float(answer.implementation_score),
                        "target_score": MANDATORY_SCORE_THRESHOLD if is_mandatory else ACCEPTABLE_SCORE_THRESHOLD,
                        "gap": (MANDATORY_SCORE_THRESHOLD if is_mandatory else ACCEPTABLE_SCORE_THRESHOLD) - avg_score,
                        "priority": self._calculate_priority(avg_score, is_mandatory),
                        "is_mandatory": is_mandatory,
                        "comments": answer.comments,
                    }
                    
                    gaps.append(gap)
            
            # Sort by gap size (highest first)
            gaps.sort(key=lambda x: x["gap"], reverse=True)
            
            return gaps
            
        except Exception as e:
            logger.error(
                "assessment_gap_analysis_failed",
                error=str(e),
                assessment_id=str(assessment_id),
            )
            return []
    
    async def generate_improvement_roadmap(
        self,
        assessment_id: UUID,
        organization_id: UUID,
        max_recommendations: int = 10,
    ) -> Dict[str, Any]:
        """Generate a prioritized improvement roadmap based on assessment gaps."""
        
        try:
            # Get assessment gaps
            gaps = await self.analyze_assessment_gaps(assessment_id, organization_id)
            
            if not gaps:
                return {
                    "assessment_id": str(assessment_id),
                    "roadmap": [],
                    "summary": "No significant gaps identified.",
                }
            
            # Generate recommendations for top gaps
            roadmap = []
            
            for gap in gaps[:max_recommendations]:
                # Get specific guidance for this control
                guidance = await self.get_control_guidance(
                    control_id=UUID(gap["control_id"]),
                    organization_id=organization_id,
                    assessment_id=assessment_id,
                )
                
                roadmap_item = {
                    "control_id": gap["control_id"],
                    "control_name": gap["control_name"],
                    "current_score": gap["current_score"],
                    "target_score": gap["target_score"],
                    "priority": gap["priority"],
                    "is_mandatory": gap["is_mandatory"],
                    "recommendation": guidance.get("guidance", ""),
                    "estimated_effort": self._estimate_effort(gap),
                    "sources": guidance.get("sources", []),
                }
                
                roadmap.append(roadmap_item)
            
            # Generate summary
            mandatory_gaps = sum(1 for g in gaps if g["is_mandatory"])
            avg_gap = sum(g["gap"] for g in gaps) / len(gaps) if gaps else 0
            
            summary = f"Identified {len(gaps)} areas for improvement ({mandatory_gaps} mandatory). " \
                     f"Average gap: {avg_gap:.1f} points. " \
                     f"Focus on high-priority mandatory controls first."
            
            return {
                "assessment_id": str(assessment_id),
                "roadmap": roadmap,
                "total_gaps": len(gaps),
                "mandatory_gaps": mandatory_gaps,
                "average_gap": float(avg_gap),
                "summary": summary,
                "generated_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            logger.error(
                "improvement_roadmap_failed",
                error=str(e),
                assessment_id=str(assessment_id),
            )
            return {
                "assessment_id": str(assessment_id),
                "roadmap": [],
                "summary": f"Error generating roadmap: {str(e)}",
                "error": str(e),
            }
    
    async def answer_assessment_question(
        self,
        question: str,
        assessment_id: UUID,
        organization_id: UUID,
        control_id: Optional[UUID] = None,
        include_assessment_context: bool = True,
        language: str = "hr",
    ) -> Dict[str, Any]:
        """Answer question with full assessment context injection."""
        
        try:
            # Build assessment context
            assessment_context = {}
            if include_assessment_context:
                assessment_context = await self.context_builder.build_assessment_context(
                    assessment_id=assessment_id,
                    include_answers=True,
                    include_organization=True,
                    include_hierarchy=False,  # Too verbose for Q&A
                )
            
            # Format assessment context for prompt
            formatted_context = self.context_builder.format_context_for_prompt(
                assessment_context, 
                language
            )
            
            # Get relevant documents from RAG
            rag_results = await self.search_similar_content(
                query=question,
                organization_id=organization_id,
                k=5,
                score_threshold=0.3,
            )
            
            # Build comprehensive context
            full_context = ""
            
            # Add assessment context first
            if formatted_context:
                full_context += f"{formatted_context}\n\n"
            
            # Add document context
            if rag_results:
                if language == "hr":
                    full_context += "Relevantni dokumenti:\n"
                else:
                    full_context += "Relevant documents:\n"
                
                for doc, score in rag_results[:3]:
                    full_context += f"- {doc.page_content[:200]}...\n"
                    if "source" in doc.metadata:
                        full_context += f"  Izvor: {doc.metadata['source']}\n"
            
            # Create enhanced prompt
            if language == "hr":
                system_prompt = (
                    "Vi ste stručnjak za sigurnost informacijskih sustava koji pomaže u procjeni "
                    "compliance-a prema ZKS/NIS2 regulativi. Koristite kontekst procjene i organizacije "
                    "za davanje preciznih i relevantnih odgovora."
                )
                prompt = f"""Kontekst procjene i organizacije:
{full_context}

Pitanje: {question}

Molim odgovorite uzimajući u obzir:
1. Trenutni status i napredak procjene
2. Specifičnosti organizacije
3. Razinu sigurnosti ({assessment_context.get('assessment', {}).get('security_level', 'nepoznato')})
4. Relevantne dokumente i smjernice

Odgovor:"""
            else:
                system_prompt = (
                    "You are an information security expert helping with compliance assessment "
                    "according to ZKS/NIS2 regulations. Use the assessment and organization context "
                    "to provide precise and relevant answers."
                )
                prompt = f"""Assessment and organization context:
{full_context}

Question: {question}

Please answer considering:
1. Current assessment status and progress
2. Organization specifics
3. Security level ({assessment_context.get('assessment', {}).get('security_level', 'unknown')})
4. Relevant documents and guidelines

Answer:"""
            
            # Generate AI response
            ai_result = await self.ai_service.generate_response(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.3,
                max_tokens=1500,
            )
            
            if ai_result["status"] == "error":
                return {
                    "answer": "Greška pri generiranju odgovora." if language == "hr" else "Error generating answer.",
                    "error": ai_result.get("error"),
                    "context_used": False,
                }
            
            # Prepare sources
            sources = []
            for doc, score in rag_results[:3]:
                if "source" in doc.metadata:
                    sources.append({
                        "source": doc.metadata["source"],
                        "relevance_score": float(score),
                        "excerpt": doc.page_content[:100] + "...",
                    })
            
            result = {
                "answer": ai_result["response"],
                "sources": sources,
                "context_used": True,
                "assessment_context": {
                    "security_level": assessment_context.get("assessment", {}).get("security_level"),
                    "completion": assessment_context.get("progress", {}).get("completion_percentage", 0),
                    "average_score": assessment_context.get("progress", {}).get("average_score", 0),
                },
                "generation_time": ai_result["generation_time"],
                "language": language,
            }
            
            return result
            
        except Exception as e:
            logger.error(
                "[Enhanced RAG Service] Assessment question failed",
                error=str(e),
                assessment_id=str(assessment_id),
                question=question[:100],
                language=language
            )
            return {
                "answer": "Greška pri obradi pitanja." if language == "hr" else "Error processing question.",
                "error": str(e),
                "context_used": False,
            }
    
    def _calculate_priority(self, score: float, is_mandatory: bool) -> str:
        """Calculate priority based on score and mandatory status."""
        
        if is_mandatory:
            if score < 2.0:
                return "critical"
            elif score < 3.0:
                return "high"
            elif score < 4.0:
                return "medium"
            else:
                return "low"
        else:
            if score < 2.0:
                return "high"
            elif score < 3.0:
                return "medium"
            else:
                return "low"
    
    def _estimate_effort(self, gap: Dict[str, Any]) -> str:
        """Estimate implementation effort."""
        
        if gap["gap"] > 3.0:
            return "high"
        elif gap["gap"] > 2.0:
            return "medium"
        else:
            return "low"
    
    async def get_service_info(self) -> Dict[str, Any]:
        """Get information about the enhanced RAG service."""
        embedding_info = self.vector_service.get_embedding_info()
        
        return {
            'service': 'Enhanced RAG Service',
            'capabilities': [
                'Basic RAG functionality',
                'Cross-language document search',
                'Multilingual response generation',
                'Assessment context building',
                'Control-specific guidance',
                'Gap analysis and improvement roadmaps',
                'Compliance question answering',
                'Source citation with language indicators'
            ],
            'embedding_info': embedding_info,
            'supported_languages': settings.SUPPORTED_LANGUAGES,
            'cross_language_enabled': settings.CROSS_LANGUAGE_SEARCH_ENABLED
        }