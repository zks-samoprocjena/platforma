"""AI and RAG endpoints."""

from typing import Optional, List
from uuid import UUID
import json
import structlog
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session, get_db
from app.api.deps import get_current_user
from app.models.document import AIRecommendation
from app.schemas.ai import (
    SearchRequest,
    SearchResponse,
    QuestionRequest,
    QuestionResponse,
    RecommendationRequest,
    RecommendationResponse,
    RecommendationItem,
    FeedbackRequest,
    ControlGuidanceRequest,
    FeedbackResponse,
    HealthResponse,
    RoadmapRequest,
    RoadmapResponse,
)
from app.services.rag_service import RAGService
from app.services.ai_service import AIService
# AssessmentRAGService functionality now consolidated into RAGService
from app.repositories.document import ProcessedDocumentRepository
from app.repositories.ai_recommendation import AIRecommendationRepository

logger = structlog.get_logger()
router = APIRouter(prefix="/ai", tags=["AI & RAG"])


@router.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest,
    db: AsyncSession = Depends(get_async_session),
) -> SearchResponse:
    """
    Search for relevant content in documents using two-layer retrieval.
    
    Combines exact control matching (Tier 1) with semantic similarity (Tier 2)
    for improved relevance and accuracy.
    
    Returns ranked results with relevance scores and tier information.
    """
    
    logger.info(
        "[AI API] Document search request with two-layer retrieval",
        query=request.query,
        organization_id=str(request.organization_id),
        language=request.language,
        limit=request.limit,
        score_threshold=request.score_threshold,
        control_id=getattr(request, 'control_id', None)
    )
    
    rag_service = RAGService(db)
    
    try:
        # Extract control ID from query if present
        import re
        control_pattern = re.compile(r'\b[A-Z]{3,4}-\d{3}\b')
        control_matches = control_pattern.findall(request.query)
        control_id = control_matches[0] if control_matches else getattr(request, 'control_id', None)
        
        # Perform two-layer similarity search
        results = await rag_service.search_similar_content(
            query=request.query,
            organization_id=request.organization_id,
            k=request.limit,
            score_threshold=request.score_threshold,
            filter_metadata=request.filter_metadata,
            control_id=control_id,
        )
        
        # Format results
        search_results = []
        for doc, score in results:
            result = {
                "content": doc.page_content[:request.content_preview_length],
                "content_full": doc.page_content,
                "score": float(score),
                "metadata": doc.metadata,
            }
            
            # Add document info if available
            if "document_id" in doc.metadata:
                doc_repo = ProcessedDocumentRepository(db)
                document = await doc_repo.get_by_id(UUID(doc.metadata["document_id"]))
                if document:
                    result["document_name"] = document.file_name
                    result["document_type"] = document.mime_type
            
            search_results.append(result)
        
        logger.info(
            "[AI API] Search completed",
            results_count=len(search_results),
            language=request.language,
            query_length=len(request.query)
        )
        
        return SearchResponse(
            query=request.query,
            results=search_results,
            total_results=len(search_results),
            language=request.language,
        )
        
    except Exception as e:
        logger.error(
            "[AI API] Search failed",
            error=str(e),
            query=request.query[:100],
            language=request.language
        )
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/question/validated", response_model=QuestionResponse)
async def answer_question_with_validated_citations(
    request: QuestionRequest,
    db: AsyncSession = Depends(get_async_session),
) -> QuestionResponse:
    """
    Answer a question using two-layer RAG with validated citations.
    
    Features:
    - Two-layer retrieval (exact control matching + semantic search)
    - Automatic citation extraction and validation
    - Page-accurate references with ±1 page tolerance
    - Control ID tracking for compliance traceability
    """
    
    logger.info(
        "[AI API] Question with validated citations",
        question=request.question[:100],
        organization_id=str(request.organization_id),
        language=request.language,
    )
    
    rag_service = RAGService(db)
    
    try:
        # Extract control ID if present in question
        import re
        control_pattern = re.compile(r'\b[A-Z]{3,4}-\d{3}\b')
        control_matches = control_pattern.findall(request.question)
        control_id = control_matches[0] if control_matches else None
        
        # Generate response with validated citations
        result = await rag_service.generate_response_with_validated_citations(
            query=request.question,
            organization_id=request.organization_id,
            language=request.language,
            max_sources=5,
            include_citations=True,
            control_id=control_id,
        )
        
        logger.info(
            "[AI API] Response generated with citations",
            citations_count=len(result.get("citations", [])),
            tier1_used=result.get("tier_analysis", {}).get("tier1_used", False),
            tier2_used=result.get("tier_analysis", {}).get("tier2_used", False),
            validation_status=result.get("validation_status", "unknown"),
        )
        
        return QuestionResponse(
            question=request.question,
            answer=result["response"],
            sources=[{
                "source": c["document"],
                "page": c["page"],
                "control_ids": c["control_ids"],
                "relevance_score": c["confidence"],
                "excerpt": c["excerpt"],
            } for c in result.get("citations", [])],
            confidence=0.85 if result.get("citations") else 0.5,
            generation_time=result.get("generation_time", 0.0),
            language=request.language,
            context_used=True,
            tier_analysis=result.get("tier_analysis", {}),
            validation_status=result.get("validation_status", "unknown"),
        )
        
    except Exception as e:
        logger.error(
            "[AI API] Validated question answering failed",
            error=str(e),
            question=request.question[:100],
        )
        raise HTTPException(
            status_code=500,
            detail=f"Question answering failed: {str(e)}"
        )


@router.post("/question", response_model=QuestionResponse)
async def answer_question(
    request: QuestionRequest,
    db: AsyncSession = Depends(get_async_session),
) -> QuestionResponse:
    """
    Answer a question using enhanced AI with RAG context.
    
    When assessment_id is provided, uses full assessment context injection
    for more relevant and contextualized answers.
    Now includes two-layer retrieval for improved accuracy.
    """
    
    logger.info(
        "[AI API] Question answering request",
        question=request.question[:100],
        organization_id=str(request.organization_id),
        assessment_id=str(request.assessment_id) if request.assessment_id else None,
        control_id=str(request.control_id) if request.control_id else None,
        language=request.language,
        context_length=len(request.context or "")
    )
    
    # Use assessment-specific service if assessment_id is provided
    if request.assessment_id:
        logger.info(
            "[AI API] Using assessment-specific service",
            assessment_id=str(request.assessment_id),
            language=request.language
        )
        
        rag_service = RAGService(db)
        
        try:
            # Get answer with full assessment context
            result = await rag_service.answer_assessment_question(
                question=request.question,
                assessment_id=request.assessment_id,
                organization_id=request.organization_id,
                control_id=request.control_id,
                include_assessment_context=True,
                language=request.language,
            )
            
            logger.info(
                "[AI API] Assessment question answered",
                answer_length=len(result.get("answer", "")),
                language=request.language,
                sources_count=len(result.get("sources", [])),
                confidence=result.get("confidence", 0.0),
                context_used=result.get("context_used", False)
            )
            
            return QuestionResponse(
                question=request.question,
                answer=result["answer"],
                sources=result.get("sources", []),
                confidence=result.get("confidence", 0.0),
                context_length=result.get("context_length", 0),
                generation_time=result.get("generation_time", 0.0),
                language=request.language,
                context_used=result.get("context_used", False),
                assessment_context=result.get("assessment_context", {}),
            )
            
        except Exception as e:
            logger.error(
                "[AI API] Assessment question answering failed",
                error=str(e),
                assessment_id=str(request.assessment_id),
                language=request.language,
                question=request.question[:100]
            )
            raise HTTPException(
                status_code=500,
                detail=f"Assessment question answering failed: {str(e)}"
            )
    
    # Otherwise use standard AI service
    else:
        logger.info(
            "[AI API] Using standard AI service",
            language=request.language
        )
        
        ai_service = AIService(db)
        
        try:
            # Get answer using enhanced AI service
            result = await ai_service.answer_question_with_ai(
                question=request.question,
                organization_id=request.organization_id,
                assessment_id=request.assessment_id,
                control_id=request.control_id,
                context=request.context,
                language=request.language,
            )
            
            logger.info(
                "[AI API] Standard question answered",
                answer_length=len(result.get("answer", "")),
                language=request.language,
                sources_count=len(result.get("sources", [])),
                confidence=result.get("confidence", 0.0),
                generation_time=result.get("generation_time", 0.0)
            )
            
            return QuestionResponse(
                question=request.question,
                answer=result["answer"],
                sources=result.get("sources", []),
                confidence=result.get("confidence", 0.0),
                context_length=result.get("context_length", 0),
                generation_time=result.get("generation_time", 0.0),
                language=request.language,
            )
            
        except Exception as e:
            logger.error(
                "[AI API] Standard question answering failed",
                error=str(e),
                language=request.language,
                question=request.question[:100]
            )
            raise HTTPException(
                status_code=500,
                detail=f"Question answering failed: {str(e)}"
            )


@router.post("/question/stream")
async def answer_question_stream(
    request: QuestionRequest,
    db: AsyncSession = Depends(get_async_session),
):
    """
    Answer a question using AI with streaming response.
    
    Returns a Server-Sent Events (SSE) stream for real-time display of the answer
    as it's being generated. Perfect for long responses and better UX.
    """
    
    logger.info(
        "[AI API] Streaming question request",
        question=request.question[:100],
        organization_id=str(request.organization_id),
        assessment_id=str(request.assessment_id) if request.assessment_id else None,
        control_id=str(request.control_id) if request.control_id else None,
        language=request.language,
        context_length=len(request.context or "")
    )
    
    async def generate_sse_stream():
        """Generate SSE formatted stream."""
        try:
            # Use assessment-specific service if assessment_id is provided
            if request.assessment_id:
                logger.info(
                    "[AI API] Using assessment-specific streaming service",
                    assessment_id=str(request.assessment_id),
                    language=request.language
                )
                
                rag_service = RAGService(db)
                
                # First, get the context (non-streaming part)
                context = await rag_service.context_builder.build_assessment_context(
                    assessment_id=request.assessment_id,
                    include_answers=True,
                    include_organization=True,
                    include_hierarchy=False,
                )
                
                formatted_context = rag_service.context_builder.format_context_for_prompt(
                    context, 
                    request.language
                )
                
                # Get RAG results
                rag_results = await rag_service.rag_service.search_similar_content(
                    query=request.question,
                    organization_id=request.organization_id,
                    k=5,
                )
                
                # Combine contexts
                rag_context = ""
                for doc, score in rag_results:
                    rag_context += f"[Score: {score:.3f}] {doc.page_content[:400]}...\n\n"
                
                full_context = formatted_context + "\n\n" + rag_context
                
                # Generate streaming response
                async for chunk in rag_service.ai_service.generate_response_stream(
                    prompt=rag_service.ai_service.croatian_prompts["context_qa"].format(
                        context=full_context,
                        question=request.question,
                    ) if request.language == "hr" else rag_service.ai_service.english_prompts["context_qa"].format(
                        context=full_context,
                        question=request.question,
                    ),
                    system_prompt="Vi ste ekspert za sigurnost informacijskih sustava i hrvatsko zakonodavstvo (ZKS/NIS2). Odgovarajte precizno na hrvatskom jeziku." if request.language == "hr" else "You are an information security expert with knowledge of Croatian regulations (ZKS/NIS2). Answer precisely in English.",
                    temperature=0.3,
                    max_tokens=1500,
                ):
                    if chunk.get("type") == "content":
                        logger.debug(
                            "[AI API] Streaming chunk generated",
                            chunk_length=len(chunk.get("content", "")),
                            language=request.language
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                    elif chunk.get("type") == "metadata":
                        logger.debug(
                            "[AI API] Streaming metadata",
                            metadata=chunk.get("metadata", {}),
                            language=request.language
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                    elif chunk.get("type") == "error":
                        logger.error(
                            "[AI API] Streaming error",
                            error=chunk.get("error"),
                            language=request.language
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                    elif chunk.get("type") == "done":
                        logger.info(
                            "[AI API] Streaming completed",
                            language=request.language,
                            generation_time=chunk.get("generation_time", 0.0)
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                        
            else:
                logger.info(
                    "[AI API] Using standard streaming service",
                    language=request.language
                )
                
                # Use standard service for streaming
                ai_service = AIService(db)
                
                # Get RAG context
                rag_context = await ai_service.rag_service.retrieve_context(
                    query=request.question,
                    organization_id=request.organization_id,
                    k=5,
                )
                
                combined_context = ""
                if request.context:
                    combined_context += f"Dodatni kontekst: {request.context}\n\n"
                if rag_context:
                    combined_context += f"Dokumenti: {rag_context}"
                
                # Generate streaming response
                async for chunk in ai_service.generate_response_stream(
                    prompt=ai_service.croatian_prompts["context_qa"].format(
                        context=combined_context,
                        question=request.question,
                    ) if request.language == "hr" else ai_service.english_prompts["context_qa"].format(
                        context=combined_context,
                        question=request.question,
                    ),
                    system_prompt="Vi ste ekspert za sigurnost informacijskih sustava i hrvatsko zakonodavstvo (ZKS/NIS2). Odgovarajte precizno na hrvatskom jeziku." if request.language == "hr" else "You are an information security expert with knowledge of Croatian regulations (ZKS/NIS2). Answer precisely in English.",
                    temperature=0.3,
                    max_tokens=1500,
                ):
                    if chunk.get("type") == "content":
                        logger.debug(
                            "[AI API] Standard streaming chunk generated",
                            chunk_length=len(chunk.get("content", "")),
                            language=request.language
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                    elif chunk.get("type") == "error":
                        logger.error(
                            "[AI API] Standard streaming error",
                            error=chunk.get("error"),
                            language=request.language
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                    elif chunk.get("type") == "done":
                        logger.info(
                            "[AI API] Standard streaming completed",
                            language=request.language,
                            generation_time=chunk.get("generation_time", 0.0)
                        )
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                        
            # Send final done signal
            yield f"data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(
                "[AI API] Streaming failed",
                error=str(e),
                language=request.language,
                question=request.question[:100]
            )
            error_chunk = {
                "type": "error",
                "error": str(e),
                "language": request.language
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"

    return StreamingResponse(
        generate_sse_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )


@router.post("/recommendations")
async def generate_recommendations(
    request: RecommendationRequest,
    db: AsyncSession = Depends(get_async_session),
):
    """Generate AI-powered recommendations for assessment improvement."""
    
    logger.info(
        "[AI API] Recommendations request",
        assessment_id=str(request.assessment_id),
        organization_id=str(request.organization_id),
        max_recommendations=request.max_recommendations,
        language=request.language
    )
    
    ai_service = AIService(db)
    rec_repo = AIRecommendationRepository(db)
    
    try:
        # Get assessment details
        assessment = await ai_service.assessment_repo.get_by_id(request.assessment_id)
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        # Load existing recommendations from DB
        existing_recommendations = await rec_repo.get_by_assessment_id(
            assessment_id=request.assessment_id,
            include_superseded=False
        )
        
        logger.info(
            "[AI API] Loaded existing recommendations",
            assessment_id=str(request.assessment_id),
            existing_count=len(existing_recommendations)
        )
        
        # Get control IDs that already have recommendations
        existing_control_ids = {str(rec.control_id) for rec in existing_recommendations if rec.control_id}
        
        # Use enhanced RAGService for gap analysis
        rag_service = RAGService(db)
        
        # Analyze gaps in the assessment
        all_gaps = await rag_service.analyze_assessment_gaps(
            assessment_id=request.assessment_id,
            organization_id=request.organization_id
        )
        
        # Filter out gaps that already have recommendations in DB
        gaps = [gap for gap in all_gaps if gap["control_id"] not in existing_control_ids]
        
        logger.info(
            "[AI API] Filtered gaps after DB check",
            total_gaps=len(all_gaps),
            already_recommended=len(existing_control_ids),
            remaining_gaps=len(gaps)
        )
        
        logger.info(
            "[AI API] Gap analysis completed",
            assessment_id=str(request.assessment_id),
            gaps_found=len(gaps),
            language=request.language
        )
        
        if not gaps:
            logger.warning(
                "[AI API] No gaps found in assessment",
                assessment_id=str(request.assessment_id)
            )
            return {
                "assessment_id": str(request.assessment_id),
                "recommendations": [],
                "total_recommendations": 0,
                "summary": "No gaps identified. All controls meet target scores." if request.language == "en" else "Nema identificiranih nedostataka. Sve kontrole zadovoljavaju ciljne rezultate.",
                "total_gaps": 0,
                "language": request.language,
                "generated_at": str(datetime.utcnow()),
            }
        
        # Filter out already recommended controls if specified
        if request.exclude_control_ids:
            exclude_ids = set(str(cid) for cid in request.exclude_control_ids)
            gaps = [gap for gap in gaps if gap["control_id"] not in exclude_ids]
            
            logger.info(
                "[AI API] Filtered gaps after exclusion",
                original_count=len(gaps) + len(exclude_ids),
                filtered_count=len(gaps),
                excluded_count=len(exclude_ids)
            )
        
        # Apply offset and limit for pagination
        start_idx = request.offset
        end_idx = start_idx + request.max_recommendations
        top_gaps = gaps[start_idx:end_idx]
        
        logger.info(
            "[AI API] Applied pagination",
            total_gaps=len(gaps),
            offset=request.offset,
            limit=request.max_recommendations,
            selected_gaps=len(top_gaps)
        )
        
        # Check if we should use progressive generation
        use_progressive = request.max_recommendations > 1 and len(top_gaps) > 1
        
        # Generate batch ID for tracking if using progressive mode
        import uuid as uuid_lib
        batch_id = str(uuid_lib.uuid4()) if use_progressive else None
        
        if use_progressive:
            logger.info(
                "[AI API] Using progressive generation mode",
                batch_id=batch_id,
                total_gaps=len(top_gaps),
                immediate_count=1,
                background_count=len(top_gaps) - 1
            )
        
        # Generate AI recommendations
        recommendations = []
        gaps_to_process = top_gaps[:1] if use_progressive else top_gaps  # Process only first if progressive
        
        for i, gap in enumerate(gaps_to_process):
            logger.info(
                "[AI API] Generating recommendation",
                index=i+1,
                control_id=gap["control_id"],
                gap_size=gap["gap"],
                language=request.language
            )
            
            try:
                rec = await ai_service.generate_control_recommendations(
                    control_id=UUID(gap["control_id"]),
                    organization_id=request.organization_id,
                    assessment_id=request.assessment_id,
                    current_score=gap["current_score"],
                    target_score=gap["target_score"],
                    language=request.language,
                    structured_output=True,  # Use structured output for results page
                )
                
                if "error" not in rec:
                    # Build content from structured output (description + implementation steps)
                    content_text = rec.get("description", "")
                    if rec.get("implementation_steps"):
                        steps_text = "\n\nKoraci implementacije:\n"
                        for i, step in enumerate(rec.get("implementation_steps", []), 1):
                            if isinstance(step, str):
                                steps_text += f"{i}. {step}\n"
                            elif isinstance(step, dict):
                                # Handle different step formats
                                if "action" in step:
                                    steps_text += f"{i}. {step['action']}\n"
                                elif "step" in step:
                                    steps_text += f"{i}. {step['step']}\n"
                        content_text += steps_text
                    
                    # Save recommendation to database
                    db_rec_data = {
                        "assessment_id": request.assessment_id,
                        "organization_id": request.organization_id,
                        "control_id": UUID(gap["control_id"]),
                        "title": rec.get("title", gap.get("control_name", "")),
                        "content": content_text or rec.get("recommendation", ""),  # Use built content or fallback
                        "description": rec.get("description", ""),
                        "priority": gap.get("priority", "medium"),
                        "effort_estimate": rec.get("effort_estimate", "medium"),
                        "impact_score": gap.get("impact_score", gap["gap"]),
                        "current_score": gap["current_score"],
                        "target_score": gap["target_score"],
                        "recommendation_type": "improvement",
                        "language": request.language,
                        "confidence_score": rec.get("confidence", 0.8),
                        "implementation_metadata": {
                            "steps": rec.get("implementation_steps", []),
                            "timeline_weeks": rec.get("timeline_weeks", 4),
                            "resources_needed": rec.get("resources_needed", []),
                            "batch_id": batch_id if batch_id else None
                        },
                        "source_chunks": rec.get("sources", [])
                    }
                    
                    saved_rec = await rec_repo.create_or_update(db_rec_data)
                    
                    # Ensure frontend compatibility by adding required fields
                    rec.update({
                        "id": str(saved_rec.id),
                        "control_name": gap.get("control_name", ""),
                        "measure_name": gap.get("measure_name", ""),
                        "current_score": gap["current_score"],
                        "target_score": gap["target_score"],
                        "gap": gap["gap"],
                        "is_mandatory": gap.get("is_mandatory", False),
                        "documentation_score": gap.get("documentation_score", 0),
                        "implementation_score": gap.get("implementation_score", 0),
                        "comments": gap.get("comments", ""),
                        "effort_estimate": rec.get("effort_estimate", "medium"),
                        "priority": gap.get("priority", "medium"),
                        "impact_score": gap.get("impact_score", gap["gap"])
                    })
                    recommendations.append(rec)
                else:
                    logger.error(
                        "[AI API] Failed to generate recommendation",
                        control_id=gap["control_id"],
                        error=rec.get("error")
                    )
            except Exception as e:
                logger.error(
                    "[AI API] Exception generating recommendation",
                    control_id=gap["control_id"],
                    error=str(e)
                )
                continue
        
        # Enqueue remaining recommendations for background generation if progressive mode
        background_job_id = None
        if use_progressive and len(top_gaps) > 1:
            from app.services.background_jobs import enqueue_recommendation_generation
            
            remaining_gaps = top_gaps[1:]
            background_job_id = enqueue_recommendation_generation(
                assessment_id=request.assessment_id,
                organization_id=request.organization_id,
                gaps=remaining_gaps,
                language=request.language,
                batch_id=batch_id
            )
            
            logger.info(
                "[AI API] Enqueued background job for remaining recommendations",
                job_id=background_job_id,
                batch_id=batch_id,
                remaining_count=len(remaining_gaps)
            )
        
        # Generate summary
        mandatory_gaps = len([g for g in gaps if g.get("is_mandatory", False)])
        summary = f"Found {len(gaps)} gaps ({mandatory_gaps} mandatory). Generated {len(recommendations)} recommendations."
        if request.language == "hr":
            summary = f"Pronađeno {len(gaps)} nedostataka ({mandatory_gaps} obveznih). Generirano {len(recommendations)} preporuka."
        
        logger.info(
            "[AI API] Recommendations generation completed",
            assessment_id=str(request.assessment_id),
            total_gaps=len(gaps),
            mandatory_gaps=mandatory_gaps,
            recommendations_generated=len(recommendations),
            language=request.language
        )
        
        # Commit database changes
        await db.commit()
        
        # Combine existing recommendations from DB with newly generated ones
        all_recommendations = []
        
        # Add existing recommendations (if offset is 0, include them)
        if request.offset == 0:
            for db_rec in existing_recommendations:
                # Get measure name from gaps
                measure_name = next((gap.get("measure_name", "") for gap in all_gaps if gap["control_id"] == str(db_rec.control_id)), "")
                
                all_recommendations.append({
                    "id": str(db_rec.id),
                    "control_id": str(db_rec.control_id) if db_rec.control_id else None,
                    "control_name": db_rec.control.name_hr if db_rec.control else db_rec.title,
                    "measure_name": measure_name,
                    "title": db_rec.title,
                    "description": db_rec.description or db_rec.content,
                    "recommendation": db_rec.content,
                    "priority": db_rec.priority,
                    "effort_estimate": db_rec.effort_estimate,
                    "impact_score": float(db_rec.impact_score),
                    "current_score": float(db_rec.current_score),
                    "target_score": float(db_rec.target_score),
                    "gap": float(db_rec.target_score) - float(db_rec.current_score),
                    "is_mandatory": next((gap.get("is_mandatory", False) for gap in all_gaps if gap["control_id"] == str(db_rec.control_id)), False),
                    "is_implemented": db_rec.is_implemented,
                    "implementation_steps": db_rec.implementation_metadata.get("steps", []) if db_rec.implementation_metadata else [],
                    "timeline_weeks": db_rec.implementation_metadata.get("timeline_weeks", 8) if db_rec.implementation_metadata else 8,
                    "source_references": db_rec.source_chunks if hasattr(db_rec, 'source_chunks') else [],
                })
        
        # Add newly generated recommendations
        all_recommendations.extend(recommendations)
        
        # Calculate metadata for progressive loading
        total_gaps_count = len(all_gaps)
        total_recommendations_count = len(existing_recommendations) + len(recommendations)
        has_more = total_recommendations_count < total_gaps_count
        remaining_gaps = max(0, total_gaps_count - total_recommendations_count)
        
        # Update summary
        summary = f"Total {total_gaps_count} gaps identified. {total_recommendations_count} recommendations available."
        if request.language == "hr":
            summary = f"Ukupno {total_gaps_count} nedostataka identificirano. {total_recommendations_count} preporuka dostupno."
        
        return {
            "assessment_id": str(request.assessment_id),
            "recommendations": all_recommendations,
            "total_recommendations": len(all_recommendations),
            "summary": summary,
            "total_gaps": total_gaps_count,
            "mandatory_gaps": len([g for g in all_gaps if g.get("is_mandatory", False)]),
            "language": request.language,
            "generated_at": str(datetime.utcnow()),
            "metadata": {
                "offset": request.offset,
                "limit": request.max_recommendations,
                "has_more": has_more,
                "remaining_gaps": remaining_gaps,
                "total_available": total_gaps_count,
                "stored_count": len(existing_recommendations),
                "generated_count": len(recommendations),
                "batch_id": batch_id,
                "background_job_id": background_job_id,
                "progressive_mode": use_progressive
            }
        }
        
    except Exception as e:
        logger.error(
            "[AI API] Recommendations generation failed",
            error=str(e),
            assessment_id=str(request.assessment_id),
            language=request.language
        )
        raise HTTPException(
            status_code=500,
            detail=f"Recommendations generation failed: {str(e)}"
        )


@router.get("/recommendations/{assessment_id}", response_model=RecommendationResponse)
async def get_recommendations(
    assessment_id: UUID,
    organization_id: UUID = Query(..., description="Organization ID for security"),
    control_id: Optional[UUID] = Query(None, description="Filter by specific control"),
    max_recommendations: int = Query(3, ge=1, le=20, description="Maximum recommendations"),
    language: str = Query("hr", pattern="^(hr|en)$", description="Language for recommendations"),
    db: AsyncSession = Depends(get_async_session),
) -> RecommendationResponse:
    """
    Get existing recommendations for an assessment.
    
    Returns previously generated recommendations.
    """
    
    # Generate recommendations on demand using refactored logic
    request = RecommendationRequest(
        assessment_id=assessment_id,
        organization_id=organization_id,
        control_ids=[control_id] if control_id else None,
        max_recommendations=max_recommendations,
        language=language,
    )
    
    return await generate_recommendations(request, db)


@router.get("/recommendations/{assessment_id}/list")
async def list_recommendations(
    assessment_id: UUID,
    organization_id: UUID = Query(..., description="Organization ID for security"),
    priority: Optional[str] = Query(None, description="Filter by priority (high/medium/low)"),
    effort_estimate: Optional[str] = Query(None, description="Filter by effort (high/medium/low)"),
    is_implemented: Optional[bool] = Query(None, description="Filter by implementation status"),
    sort_by: str = Query("impact_score", description="Sort field (impact_score/priority/effort/created_at)"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(20, ge=1, le=100, description="Pagination limit"),
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    List all stored recommendations for an assessment with filtering and sorting.
    
    This endpoint returns recommendations that have been previously generated
    and stored in the database.
    """
    logger.info(
        "[AI API] List recommendations request",
        assessment_id=str(assessment_id),
        organization_id=str(organization_id),
        filters={
            "priority": priority,
            "effort_estimate": effort_estimate,
            "is_implemented": is_implemented
        },
        sort_by=sort_by,
        sort_order=sort_order,
        pagination={"offset": offset, "limit": limit}
    )
    
    rec_repo = AIRecommendationRepository(db)
    
    try:
        # Build filters
        filters = {}
        if priority:
            filters["priority"] = priority
        if effort_estimate:
            filters["effort_estimate"] = effort_estimate
        if is_implemented is not None:
            filters["is_implemented"] = is_implemented
        
        # Get recommendations from DB
        recommendations = await rec_repo.get_by_assessment_id(
            assessment_id=assessment_id,
            include_superseded=False,
            filters=filters
        )
        
        # Apply sorting
        if sort_by == "priority":
            priority_order = {"high": 3, "medium": 2, "low": 1}
            recommendations.sort(
                key=lambda r: priority_order.get(r.priority, 0),
                reverse=(sort_order == "desc")
            )
        elif sort_by == "effort":
            effort_order = {"low": 3, "medium": 2, "high": 1}  # Low effort is better
            recommendations.sort(
                key=lambda r: effort_order.get(r.effort_estimate, 0),
                reverse=(sort_order == "desc")
            )
        elif sort_by == "created_at":
            recommendations.sort(
                key=lambda r: r.created_at,
                reverse=(sort_order == "desc")
            )
        # Default is already sorted by impact_score in repository
        
        # Apply pagination
        total_count = len(recommendations)
        paginated_recs = recommendations[offset:offset + limit]
        
        # Format response
        formatted_recommendations = []
        for rec in paginated_recs:
            # Get measure name through control's submeasure mappings
            measure_name = ""
            if rec.control and hasattr(rec.control, 'submeasure_mappings') and rec.control.submeasure_mappings:
                first_mapping = rec.control.submeasure_mappings[0]
                if first_mapping.submeasure and hasattr(first_mapping.submeasure, 'measure'):
                    measure_name = first_mapping.submeasure.measure.name_hr
            
            formatted_recommendations.append({
                "id": str(rec.id),
                "control_id": str(rec.control_id) if rec.control_id else None,
                "control_name": rec.control.name_hr if rec.control else rec.title,
                "measure_name": measure_name,
                "title": rec.title,
                "description": rec.description or rec.content,
                "recommendation": rec.content,
                "priority": rec.priority,
                "effort_estimate": rec.effort_estimate,
                "impact_score": float(rec.impact_score),
                "current_score": float(rec.current_score),
                "target_score": float(rec.target_score),
                "gap": float(rec.target_score) - float(rec.current_score),
                "is_implemented": rec.is_implemented,
                "implemented_at": str(rec.implemented_at) if rec.implemented_at else None,
                "implementation_steps": rec.implementation_metadata.get("steps", []) if rec.implementation_metadata else [],
                "timeline_weeks": rec.implementation_metadata.get("timeline_weeks", 8) if rec.implementation_metadata else 8,
                "source_references": rec.source_chunks if hasattr(rec, 'source_chunks') else [],
                "created_at": str(rec.created_at),
                "updated_at": str(rec.updated_at),
            })
        
        # Get counts
        counts = await rec_repo.get_recommendations_count(assessment_id)
        
        return {
            "assessment_id": str(assessment_id),
            "recommendations": formatted_recommendations,
            "total_count": total_count,
            "counts": counts,
            "filters_applied": filters,
            "sort": {
                "field": sort_by,
                "order": sort_order
            },
            "pagination": {
                "offset": offset,
                "limit": limit,
                "has_more": (offset + limit) < total_count,
                "total_pages": (total_count + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(
            "[AI API] List recommendations failed",
            error=str(e),
            assessment_id=str(assessment_id)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list recommendations: {str(e)}"
        )


@router.post("/recommendations/{recommendation_id}/regenerate")
async def regenerate_recommendation(
    recommendation_id: UUID,
    organization_id: UUID = Query(..., description="Organization ID for security"),
    language: str = Query("hr", pattern="^(hr|en)$", description="Language for regeneration"),
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Regenerate a specific recommendation.
    
    This will mark the old recommendation as superseded and generate a new one
    for the same control.
    """
    logger.info(
        "[AI API] Regenerate recommendation request",
        recommendation_id=str(recommendation_id),
        organization_id=str(organization_id),
        language=language
    )
    
    rec_repo = AIRecommendationRepository(db)
    ai_service = AIService(db)
    
    try:
        # Get existing recommendation with control relationship
        from sqlalchemy.orm import selectinload
        from app.models.reference import Control, ControlSubmeasureMapping, Submeasure
        query = select(AIRecommendation).where(AIRecommendation.id == recommendation_id).options(
            selectinload(AIRecommendation.control)
                .selectinload(Control.submeasure_mappings)
                .selectinload(ControlSubmeasureMapping.submeasure)
                .selectinload(Submeasure.measure)
        )
        result = await db.execute(query)
        existing_rec = result.scalar_one_or_none()
        
        if not existing_rec:
            raise HTTPException(status_code=404, detail="Recommendation not found")
        
        # Verify organization access
        if existing_rec.organization_id != organization_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get the control and assessment details
        control_id = existing_rec.control_id
        assessment_id = existing_rec.assessment_id
        
        if not control_id:
            raise HTTPException(status_code=400, detail="Cannot regenerate recommendation without control")
        
        # Mark existing as superseded
        await rec_repo.mark_as_superseded(recommendation_id)
        
        # Generate new recommendation
        new_rec_response = await ai_service.generate_control_recommendations(
            control_id=control_id,
            organization_id=organization_id,
            assessment_id=assessment_id,
            current_score=float(existing_rec.current_score),
            target_score=float(existing_rec.target_score),
            language=language,
            structured_output=True,
        )
        
        if "error" in new_rec_response:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate new recommendation: {new_rec_response['error']}"
            )
        
        # Save new recommendation to database
        new_rec_data = {
            "assessment_id": assessment_id,
            "organization_id": organization_id,
            "control_id": control_id,
            "title": existing_rec.title,  # Keep original title when regenerating
            "content": new_rec_response.get("recommendation", ""),
            "description": new_rec_response.get("description", ""),
            "priority": existing_rec.priority,  # Keep same priority
            "effort_estimate": new_rec_response.get("effort_estimate", existing_rec.effort_estimate),
            "impact_score": float(existing_rec.impact_score),  # Keep same impact
            "current_score": float(existing_rec.current_score),
            "target_score": float(existing_rec.target_score),
            "recommendation_type": "improvement",
            "language": language,
            "confidence_score": new_rec_response.get("confidence", 0.8),
            "implementation_metadata": {
                "steps": new_rec_response.get("implementation_steps", []),
                "timeline_weeks": new_rec_response.get("timeline_weeks", 4),
                "resources_needed": new_rec_response.get("resources_needed", [])
            },
            "source_chunks": new_rec_response.get("sources", [])
        }
        
        new_rec = await rec_repo.create_or_update(new_rec_data)
        
        # Update the old recommendation to point to the new one
        existing_rec.superseded_by_id = new_rec.id
        existing_rec.is_active = False
        
        await db.commit()
        
        logger.info(
            "[AI API] Recommendation regenerated",
            old_id=str(recommendation_id),
            new_id=str(new_rec.id),
            control_id=str(control_id)
        )
        
        # Get measure name if available
        measure_name = ""
        control_name = existing_rec.control.name_hr if existing_rec.control else new_rec.title
        if existing_rec.control and hasattr(existing_rec.control, 'submeasure_mappings') and existing_rec.control.submeasure_mappings:
            first_mapping = existing_rec.control.submeasure_mappings[0]
            if first_mapping.submeasure and hasattr(first_mapping.submeasure, 'measure'):
                measure_name = first_mapping.submeasure.measure.name_hr
        
        # Return in frontend-compatible format
        return {
            "id": str(new_rec.id),
            "control_id": str(control_id),
            "control_name": control_name,
            "measure_name": measure_name,
            "title": new_rec.title,
            "description": new_rec.description or new_rec.content,
            "recommendation": new_rec.content,
            "priority": new_rec.priority,
            "effort_estimate": new_rec.effort_estimate,
            "impact_score": float(new_rec.impact_score),
            "current_score": float(new_rec.current_score),
            "target_score": float(new_rec.target_score),
            "gap": float(new_rec.target_score) - float(new_rec.current_score),
            "is_implemented": False,  # New recommendation is not implemented
            "implementation_steps": new_rec.implementation_metadata.get("steps", []) if new_rec.implementation_metadata else [],
            "timeline_weeks": new_rec.implementation_metadata.get("timeline_weeks", 8) if new_rec.implementation_metadata else 8,
            "source_references": new_rec_response.get("source_references", []),
            "regenerated": True,
            "previous_id": str(recommendation_id),
            "generated_at": str(new_rec.created_at)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "[AI API] Recommendation regeneration failed",
            error=str(e),
            recommendation_id=str(recommendation_id)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Regeneration failed: {str(e)}"
        )


@router.get("/recommendations/batch/{batch_id}", response_model=dict)
async def get_batch_recommendations(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get recommendations for a specific batch ID.
    Used for polling to check if background recommendations are ready.
    """
    logger.info(
        "[AI API] Fetching recommendations for batch",
        batch_id=batch_id
    )
    
    from app.repositories.ai_recommendation import AIRecommendationRepository
    
    rec_repo = AIRecommendationRepository(db)
    
    # Query recommendations with this batch_id in metadata
    from sqlalchemy import select, and_, cast, String, func
    from sqlalchemy.dialects.postgresql import JSONB
    from app.models.document import AIRecommendation
    
    # Use JSON operator to access implementation_metadata field
    query = select(AIRecommendation).where(
        and_(
            AIRecommendation.is_active == True,
            func.jsonb_extract_path_text(AIRecommendation.implementation_metadata, 'batch_id') == batch_id
        )
    )
    
    result = await db.execute(query)
    recommendations = result.scalars().all()
    
    # Transform to API response format
    batch_recommendations = []
    for rec in recommendations:
        batch_recommendations.append({
            "id": str(rec.id),
            "control_id": str(rec.control_id) if rec.control_id else None,
            "title": rec.title,
            "description": rec.description or rec.content,
            "priority": rec.priority,
            "effort_estimate": rec.effort_estimate,
            "impact_score": float(rec.impact_score),
            "current_score": float(rec.current_score),
            "target_score": float(rec.target_score),
            "is_implemented": rec.is_implemented,
            "created_at": rec.created_at.isoformat() if rec.created_at else None
        })
    
    # Check job status if we have access to Redis
    job_status = None
    try:
        from app.services.background_jobs import redis_conn
        from rq.job import Job
        from rq import Queue
        
        # Check if there are any pending/running jobs with this batch_id
        # We need to check the recommendation queue for jobs
        recommendation_queue = Queue('recommendations', connection=redis_conn)
        
        # For now, use a heuristic: if we have 5 recommendations, it's likely complete
        # In production, you'd track the job_id with the batch_id
        if len(recommendations) >= 5:
            job_status = "completed"
        elif len(recommendations) > 0:
            job_status = "processing"
        else:
            job_status = "pending"
            
        logger.info(
            "[AI API] Batch status check",
            batch_id=batch_id,
            recommendation_count=len(recommendations),
            status=job_status
        )
    except Exception as e:
        logger.warning(f"Could not check job status: {e}")
        # Fallback: assume completed if we have 5 or more recommendations
        job_status = "completed" if len(recommendations) >= 5 else "processing"
    
    return {
        "batch_id": batch_id,
        "recommendations": batch_recommendations,
        "count": len(batch_recommendations),
        "status": job_status or ("completed" if len(recommendations) > 0 else "unknown")
    }


@router.post("/control/guidance")
async def get_control_guidance(
    request: ControlGuidanceRequest,
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """Get AI guidance for a specific control."""
    
    logger.info(
        "[AI API] Control guidance request",
        control_id=str(request.control_id),
        organization_id=str(request.organization_id),
        language=request.language
    )
    
    ai_service = AIService(db)
    
    try:
        # Get control details
        control = await ai_service.control_repo.get_by_id(request.control_id)
        if not control:
            raise HTTPException(status_code=404, detail="Control not found")
        
        # Generate guidance question
        guidance_question = f"Kako implementirati kontrolu '{control.name_hr}'? Opišite najbolje prakse i preporuke."
        if request.language == "en":
            guidance_question = f"How to implement control '{control.name_en}'? Describe best practices and recommendations."
        
        # Get AI guidance
        result = await ai_service.answer_question_with_ai(
            question=guidance_question,
            organization_id=request.organization_id,
            control_id=request.control_id,
            context=f"Kontrola: {control.name_hr if request.language == 'hr' else control.name_en}. Opis: {control.description_hr if request.language == 'hr' else control.description_en}",
            language=request.language,
        )
        
        logger.info(
            "[AI API] Control guidance generated",
            control_id=str(request.control_id),
            language=request.language,
            answer_length=len(result.get("answer", "")),
            confidence=result.get("confidence", 0.0)
        )
        
        return {
            "control_id": str(request.control_id),
            "control_name": control.name_hr if request.language == 'hr' else control.name_en,
            "question": guidance_question,
            "answer": result["answer"],
            "sources": result.get("sources", []),
            "confidence": result.get("confidence", 0.0),
            "generation_time": result.get("generation_time", 0.0),
            "language": request.language,
        }
        
    except Exception as e:
        logger.error(
            "[AI API] Control guidance failed",
            error=str(e),
            control_id=str(request.control_id),
            language=request.language
        )
        raise HTTPException(
            status_code=500,
            detail=f"Control guidance failed: {str(e)}"
        )


@router.post("/roadmap", response_model=RoadmapResponse)
async def generate_improvement_roadmap(
    request: RoadmapRequest,
    db: AsyncSession = Depends(get_async_session),
) -> RoadmapResponse:
    """Generate comprehensive improvement roadmap for an assessment."""
    
    logger.info(
        "[AI API] Roadmap generation request",
        assessment_id=str(request.assessment_id),
        organization_id=str(request.organization_id),
        language=request.language,
        max_recommendations=request.max_recommendations
    )
    
    ai_service = AIService(db)
    
    try:
        # Get assessment details
        assessment = await ai_service.assessment_repo.get_by_id(request.assessment_id)
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        # Use enhanced RAGService for gap analysis
        rag_service = RAGService(db)
        
        # Get gaps analysis
        gaps = await rag_service.analyze_assessment_gaps(
            assessment_id=request.assessment_id,
            organization_id=request.organization_id
        )
        
        logger.info(
            "[AI API] Roadmap gap analysis completed",
            assessment_id=str(request.assessment_id),
            gaps_found=len(gaps),
            language=request.language
        )
        
        # Generate roadmap
        roadmap_result = await ai_service.generate_improvement_roadmap_ai(
            assessment_id=request.assessment_id,
            organization_id=request.organization_id,
            gaps=gaps,
            language=request.language,
        )
        
        logger.info(
            "[AI API] Roadmap generated",
            assessment_id=str(request.assessment_id),
            language=request.language,
            roadmap_length=len(roadmap_result.get("roadmap", "")),
            gaps_count=len(gaps)
        )
        
        return RoadmapResponse(
            assessment_id=request.assessment_id,
            roadmap=roadmap_result.get("roadmap", ""),
            total_gaps=len(gaps),
            mandatory_gaps=sum(1 for gap in gaps if gap.get("is_mandatory", False)),
            generated_at=str(datetime.utcnow()),
            generation_time=roadmap_result.get("generation_time", 0.0),
            language=request.language
        )
        
    except Exception as e:
        logger.error(
            "[AI API] Roadmap generation failed",
            error=str(e),
            assessment_id=str(request.assessment_id),
            language=request.language
        )
        raise HTTPException(
            status_code=500,
            detail=f"Roadmap generation failed: {str(e)}"
        )


@router.get("/health")
async def get_ai_health(
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """Get AI service health status."""
    
    logger.info("[AI API] Health check request")
    
    ai_service = AIService(db)
    
    try:
        health_status = await ai_service.check_ollama_health()
        
        logger.info(
            "[AI API] Health check completed",
            status=health_status.get("status"),
            model=health_status.get("model"),
            model_available=health_status.get("model_available")
        )
        
        return {
            "status": health_status.get("status"),
            "model": health_status.get("model"),
            "model_available": health_status.get("model_available"),
            "capabilities": [
                "Croatian language support",
                "Document search",
                "Question answering",
                "Recommendations generation",
                "Control guidance",
                "Improvement roadmaps",
                "Streaming responses"
            ],
            "supported_languages": ["hr", "en"],
            "base_url": health_status.get("base_url"),
        }
        
    except Exception as e:
        logger.error(
            "[AI API] Health check failed",
            error=str(e)
        )
        raise HTTPException(
            status_code=503,
            detail=f"AI service health check failed: {str(e)}"
        )


@router.get("/search/stats")
async def get_search_stats(
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """Get search and cache statistics."""
    
    rag_service = RAGService(db)
    
    try:
        cache_stats = await rag_service.cache_service.get_cache_stats()
        
        return {
            "status": "operational",
            "cache_stats": cache_stats,
            "llm_status": "connected",
            "vector_store_status": "connected",
        }
        
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e),
            "cache_stats": {},
            "llm_status": "unknown",
            "vector_store_status": "unknown",
        }


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_ai_feedback(
    request: FeedbackRequest,
    db: AsyncSession = Depends(get_async_session),
) -> FeedbackResponse:
    """
    Submit feedback on AI response quality.
    
    This helps improve AI service quality and user experience.
    """
    
    try:
        ai_service = AIService(db)
        
        # Store feedback in database
        feedback_id = await ai_service.store_feedback(
            interaction_id=request.interaction_id,
            rating=request.rating,
            helpful=request.helpful,
            comment=request.comment,
            interaction_type=request.interaction_type,
            response_quality=request.response_quality,
        )
        
        # Log feedback for analytics
        await ai_service.log_feedback_analytics(
            interaction_type=request.interaction_type,
            rating=request.rating,
            helpful=request.helpful,
        )
        
        return FeedbackResponse(
            success=True,
            message="Feedback submitted successfully",
            feedback_id=str(feedback_id),
        )
        
    except Exception as e:
        return FeedbackResponse(
            success=False,
            message=f"Failed to submit feedback: {str(e)}",
            feedback_id=None,
        )


@router.get("/capabilities", response_model=HealthResponse)
async def get_ai_capabilities(
    db: AsyncSession = Depends(get_async_session),
) -> HealthResponse:
    """
    Get AI service capabilities and availability.
    
    Returns information about available AI features and their status.
    """
    
    try:
        ai_service = AIService(db)
        rag_service = RAGService(db)
        
        # Check Ollama health
        ollama_health = await ai_service.check_ollama_health()
        
        # Check cache stats
        cache_stats = await rag_service.cache_service.get_cache_stats()
        
        # Determine overall status
        status = "operational" if ollama_health["status"] == "healthy" else "degraded"
        
        return HealthResponse(
            status=status,
            capabilities={
                "croatian_language": True,
                "document_search": True,
                "question_answering": True,
                "assessment_recommendations": True,
                "roadmap_generation": True,
                "prompt_engineering": True,
                "quality_validation": True,
                "semantic_search": True,
                "context_aware_responses": True,
                "multi_language_support": True,
            },
            ollama=ollama_health,
            cache_stats=cache_stats,
        )
        
    except Exception as e:
        return HealthResponse(
            status="error",
            capabilities={},
            error=str(e),
        )