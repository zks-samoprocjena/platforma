"""Enhanced AI service with Ollama integration and Croatian prompt engineering."""

from typing import Dict, List, Any, Optional, Union
from uuid import UUID
import json
import asyncio
from datetime import datetime
import time
import aiohttp

from sqlalchemy.ext.asyncio import AsyncSession
from ollama import AsyncClient
import structlog

from app.core.config import settings
from app.models.assessment import Assessment
from app.parsers.excel_parser import SecurityLevel
from app.models.reference import Control, Measure
from app.repositories.assessment import AssessmentRepository
# AssessmentAnswerRepository import commented out - using direct imports when needed to avoid conflicts
from app.repositories.control_repository import ControlRepository
from app.repositories.measure import MeasureRepository
from app.services.rag_service import RAGService
from app.prompts import CROATIAN_PROMPTS, ENGLISH_PROMPTS


logger = structlog.get_logger()


# PromptTemplates class has been moved to app/prompts/
class AIService:
    """Advanced AI service with Croatian language support and compliance expertise."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.rag_service = RAGService(db)
        self.assessment_repo = AssessmentRepository(db)
        self.control_repo = ControlRepository(db)
        self.measure_repo = MeasureRepository(db)
        
        # Initialize Ollama client
        self.ollama_client = AsyncClient(host=settings.ollama_base_url)
        self.model = settings.OLLAMA_MODEL
        
        # Prompt templates
        self.croatian_prompts = CROATIAN_PROMPTS
        self.english_prompts = ENGLISH_PROMPTS
    
    async def check_ollama_health(self) -> Dict[str, Any]:
        """Check Ollama service health and model availability."""
        
        try:
            # Test connection
            models = await self.ollama_client.list()
            available_models = [model["name"] for model in models.get("models", [])]
            
            # Check if our model is available
            model_available = self.model in available_models
            
            if not model_available:
                # Try to pull the model
                logger.info("pulling_model", model=self.model)
                await self.ollama_client.pull(self.model)
                model_available = True
            
            return {
                "status": "healthy",
                "model": self.model,
                "model_available": model_available,
                "available_models": available_models,
                "base_url": settings.ollama_base_url,
            }
            
        except Exception as e:
            logger.error("ollama_health_check_failed", error=str(e))
            return {
                "status": "unhealthy",
                "error": str(e),
                "model": self.model,
                "base_url": settings.ollama_base_url,
            }
    
    async def generate_response(
        self,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate response using Ollama with enhanced error handling and monitoring.
        
        Args:
            prompt: The prompt to send to the model
            max_tokens: Maximum tokens to generate
            temperature: Temperature for response generation
            system_prompt: Optional system prompt for context
            
        Returns:
            Dictionary with response, status, and metadata
        """
        
        logger.info(
            "[AI Service] Generating response",
            prompt_length=len(prompt),
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt_length=len(system_prompt) if system_prompt else 0
        )
        
        start_time = time.time()
        
        try:
            # Prepare request payload with optimized settings for Llama 3.1
            payload = {
                "model": self.model,
                "prompt": prompt,
                "options": {
                    "temperature": temperature,
                    "num_ctx": 32768,  # Keep larger context for document processing
                    "num_predict": max_tokens,
                    "top_k": 40,  # Reduced for more focused generation
                    "top_p": 0.9,  # Reduced for better consistency
                    "repeat_penalty": 1.2,  # Increased to reduce repetition
                    # Removed seed for better natural variability
                },
                "stream": False,
            }
            
            # Add system prompt if provided
            if system_prompt:
                payload["system"] = system_prompt
            
            logger.info(
                "[AI Service] Ollama request prepared",
                model=self.model,
                stream=False,
                options=payload["options"]
            )
            
            # Make request to Ollama using explicit session and context on request
            session = aiohttp.ClientSession()
            try:
                async with session.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300)  # Increased to 5 minutes
                ) as response:
                    if response.status != 200:
                        # Get error text safely when mocked
                        error_text = await response.text() if hasattr(response, "text") else ""
                        logger.error(
                            "[AI Service] Ollama request failed",
                            status=response.status,
                            error=(error_text or "")[:500]
                        )
                        return {
                            "status": "error",
                            "error": f"Ollama request failed: {response.status}",
                            "response": "",
                            "generation_time": time.time() - start_time,
                        }

                    result = await response.json()

                    generation_time = time.time() - start_time

                    logger.info(
                        "[AI Service] Ollama response received",
                        response_length=len(result.get("response", "")),
                        generation_time=generation_time,
                        model=self.model,
                        done=result.get("done", False)
                    )

                    # Validate response
                    if not result.get("response"):
                        logger.warning(
                            "[AI Service] Empty response from Ollama",
                            model=self.model,
                            prompt_length=len(prompt)
                        )
                        return {
                            "status": "error",
                            "error": "Empty response from AI model",
                            "response": "",
                            "generation_time": generation_time,
                        }

                    return {
                        "status": "success",
                        "response": result["response"],
                        "generation_time": generation_time,
                        "model": self.model,
                        "prompt_eval_count": result.get("prompt_eval_count", 0),
                        "eval_count": result.get("eval_count", 0),
                        "total_duration": result.get("total_duration", 0),
                        "load_duration": result.get("load_duration", 0),
                        "prompt_eval_duration": result.get("prompt_eval_duration", 0),
                        "eval_duration": result.get("eval_duration", 0),
                    }
            finally:
                # Ensure session is closed in both real and mocked scenarios
                try:
                    await session.close()
                except Exception:
                    pass
                    
        except asyncio.TimeoutError:
            generation_time = time.time() - start_time
            logger.error(
                "[AI Service] Request timeout",
                timeout=120,
                generation_time=generation_time
            )
            return {
                "status": "error",
                "error": "Request timeout",
                "response": "",
                "generation_time": generation_time,
            }
        except Exception as e:
            generation_time = time.time() - start_time
            logger.error(
                "[AI Service] Response generation failed",
                error=str(e),
                generation_time=generation_time
            )
            return {
                "status": "error",
                "error": str(e),
                "response": "",
                "generation_time": generation_time,
            }
    
    async def generate_response_stream(
        self,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ):
        """Generate streaming AI response for real-time display.
        
        Yields dictionaries with chunk information as the response is generated.
        Each chunk contains either content, metadata, or error information.
        """
        
        try:
            # Prepare messages
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            # Track generation progress
            start_time = datetime.utcnow()
            full_response = ""
            chunk_count = 0
            
            # Use Ollama streaming API
            stream = await self.ollama_client.chat(
                model=self.model,
                messages=messages,
                stream=True,
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens,
                    "num_ctx": 32768,
                    "top_k": 40,
                    "top_p": 0.9,
                    "repeat_penalty": 1.2,
                    "repeat_last_n": 256,
                    "stop": ["</answer>", "[END]"],
                }
            )
            
            # Yield chunks as they arrive
            async for chunk in stream:
                if chunk.get("done", False):
                    # Final chunk with metadata
                    end_time = datetime.utcnow()
                    generation_time = (end_time - start_time).total_seconds()
                    
                    yield {
                        "type": "done",
                        "full_response": full_response,
                        "generation_time": generation_time,
                        "chunk_count": chunk_count,
                        "model": self.model,
                        "tokens": len(full_response.split()),
                    }
                else:
                    # Content chunk
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        full_response += content
                        chunk_count += 1
                        
                        yield {
                            "type": "content",
                            "content": content,
                            "chunk_number": chunk_count,
                        }
                        
        except Exception as e:
            logger.error("ai_streaming_failed", error=str(e), prompt_length=len(prompt))
            yield {
                "type": "error",
                "error": str(e),
                "message": "Streaming generation failed. Please try again.",
            }
    
    async def answer_question_with_ai(
        self,
        question: str,
        organization_id: UUID,
        assessment_id: Optional[UUID] = None,
        control_id: Optional[UUID] = None,
        context: Optional[str] = None,
        language: str = "hr",
    ) -> Dict[str, Any]:
        """
        Answer a question using AI with enhanced context from assessment and documents.
        
        Args:
            question: The question to answer
            organization_id: Organization ID for context
            assessment_id: Optional assessment ID for context
            control_id: Optional control ID for context
            context: Optional additional context
            language: Language for response ("hr" or "en")
            
        Returns:
            Dictionary with answer, sources, confidence, and metadata
        """
        
        logger.info(
            "[AI Service] Question answering request",
            question=question[:100],
            organization_id=str(organization_id),
            assessment_id=str(assessment_id) if assessment_id else None,
            control_id=str(control_id) if control_id else None,
            language=language,
            context_length=len(context) if context else 0
        )
        
        try:
            # Get RAG context
            rag_context = await self.rag_service.retrieve_context(
                query=question,
                organization_id=organization_id,
                k=5,
            )
            
            logger.info(
                "[AI Service] RAG context retrieved",
                context_length=len(rag_context) if rag_context else 0,
                language=language
            )
            
            # Build combined context
            combined_context = ""
            if context:
                combined_context += f"Dodani kontekst: {context}\n\n"
            if rag_context:
                combined_context += f"Dokumenti: {rag_context}"
            
            # Handle empty context
            if not combined_context.strip():
                logger.warning(
                    "[AI Service] No context available for question",
                    question=question[:100],
                    language=language
                )
                return {
                    "answer": "Nema dostupnog konteksta za odgovor na ovo pitanje." 
                             if language == "hr" 
                             else "No available context to answer this question.",
                    "sources": [],
                    "confidence": 0.0,
                }
            
            # Select prompt template
            if language == "hr":
                prompt = self.croatian_prompts["context_qa"].format(
                    context=combined_context,
                    question=question,
                )
                system_prompt = self.croatian_prompts["system_unstructured"]
                logger.info(
                    "[AI Service] Using Croatian template",
                    prompt_length=len(prompt),
                    system_prompt_length=len(system_prompt)
                )
            else:
                prompt = self.english_prompts["context_qa"].format(
                    context=combined_context,
                    question=question,
                )
                system_prompt = self.english_prompts["system_unstructured"]
                logger.info(
                    "[AI Service] Using English template",
                    prompt_length=len(prompt),
                    system_prompt_length=len(system_prompt)
                )
            
            # Generate AI response
            logger.info(
                "[AI Service] Generating AI response",
                language=language,
                temperature=0.3
            )
            
            ai_result = await self.generate_response(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.3,  # Lower temperature for factual answers
            )
            
            if ai_result["status"] == "error":
                logger.error(
                    "[AI Service] AI response generation failed",
                    error=ai_result["error"],
                    language=language
                )
                return {
                    "answer": "Greška pri generiranju odgovora." if language == "hr" else "Error generating answer.",
                    "error": ai_result["error"],
                    "confidence": 0.0,
                }
            
            logger.info(
                "[AI Service] AI response generated successfully",
                response_length=len(ai_result["response"]),
                generation_time=ai_result["generation_time"],
                language=language
            )
            
            # Get sources from context
            search_results = await self.rag_service.search_similar_content(
                query=question,
                organization_id=organization_id,
                k=3,
            )
            
            sources = []
            for doc, score in search_results:
                if "source" in doc.metadata:
                    sources.append({
                        "source": doc.metadata["source"],
                        "relevance_score": float(score),
                    })
            
            logger.info(
                "[AI Service] Sources retrieved",
                sources_count=len(sources),
                language=language
            )
            
            result = {
                "answer": ai_result["response"],
                "sources": sources,
                "confidence": min(0.9, len(sources) * 0.2 + 0.5),  # Basic confidence scoring
                "generation_time": ai_result["generation_time"],
                "context_length": len(combined_context),
                "language": language,
            }
            
            logger.info(
                "[AI Service] Question answered successfully",
                answer_length=len(result["answer"]),
                confidence=result["confidence"],
                language=language,
                sources_count=len(sources)
            )
            
            return result
            
        except Exception as e:
            logger.error(
                "[AI Service] Question answering failed",
                error=str(e),
                question=question[:100],
                language=language
            )
            return {
                "answer": "Greška pri obradi pitanja." if language == "hr" else "Error processing question.",
                "error": str(e),
                "confidence": 0.0,
            }
    
    async def generate_control_recommendations(
        self,
        control_id: UUID,
        organization_id: UUID,
        assessment_id: UUID,
        current_score: float,
        target_score: float = 4.0,
        language: str = "hr",
        structured_output: bool = False,
    ) -> Dict[str, Any]:
        """Generate AI-powered recommendations for improving a control."""
        
        logger.info(
            "[AI Service] Starting control recommendations generation",
            control_id=str(control_id),
            assessment_id=str(assessment_id),
            current_score=current_score,
            target_score=target_score,
            language=language
        )
        
        try:
            # Get control details (support different repository APIs in tests)
            control_fetch = None
            if hasattr(self.control_repo, "get"):
                control_fetch = self.control_repo.get(control_id)
            elif hasattr(self.control_repo, "get_by_id"):
                control_fetch = self.control_repo.get_by_id(control_id)
            else:
                control_fetch = None

            if asyncio.iscoroutine(control_fetch):
                control = await control_fetch
            else:
                control = control_fetch

            if not control:
                return {"error": "Control not found"}
            
            logger.info(
                "[AI Service] Control found",
                control_name=control.name_hr,
                control_id=str(control_id)
            )
            
            # Get assessment details (support different repository APIs in tests)
            assessment_fetch = None
            if hasattr(self.assessment_repo, "get"):
                assessment_fetch = self.assessment_repo.get(assessment_id)
            elif hasattr(self.assessment_repo, "get_by_id"):
                assessment_fetch = self.assessment_repo.get_by_id(assessment_id)
            else:
                assessment_fetch = None

            if asyncio.iscoroutine(assessment_fetch):
                assessment = await assessment_fetch
            else:
                assessment = assessment_fetch
            # Handle both enum and string types for security_level
            if assessment and assessment.security_level:
                security_level = assessment.security_level.value if hasattr(assessment.security_level, 'value') else assessment.security_level
            else:
                security_level = "srednja"
            
            logger.info(
                "[AI Service] Assessment found",
                assessment_id=str(assessment_id),
                security_level=security_level
            )
            
            # Get relevant context from documents (fallback to generic attributes for tests)
            def _first_string_attr(obj: Any, candidates: List[str], default: str = "") -> str:
                for attr in candidates:
                    if hasattr(obj, attr):
                        value = getattr(obj, attr)
                        if isinstance(value, str) and value.strip():
                            return value
                return default

            control_name = _first_string_attr(control, ["name_hr", "name"], default="")
            control_desc = _first_string_attr(control, ["description_hr", "description"], default="")
            search_query = f"{control_name} {control_desc} best practices implementation"
            
            logger.info(
                "[AI Service] Starting RAG context retrieval",
                search_query=search_query[:100],
                organization_id=str(organization_id)
            )
            
            # Prefer method that returns sources, but fall back gracefully for tests
            try:
                context, source_references = await self.rag_service.retrieve_context_with_sources(
                    query=search_query,
                    organization_id=organization_id,
                    assessment_id=assessment_id,
                    k=10,
                )
            except Exception:
                # Fallback to simple context retrieval without sources
                try:
                    context = await self.rag_service.retrieve_context(
                        query=search_query,
                        organization_id=organization_id,
                        k=10,
                    )
                except Exception:
                    context = ""
                source_references = []
            
            logger.info(
                "[AI Service] RAG context retrieved",
                context_length=len(context) if context else 0,
                context_preview=context[:200] if context else "No context",
                search_query=search_query,
                sources_count=len(source_references),
                sources=source_references[:3]
            )
            
            # Get assessment answer for comments
            # TODO: Update to use V3 repository after testing
            # from app.repositories.assessment import AssessmentAnswerRepository_OLD
            # answer_repo = AssessmentAnswerRepository_OLD(self.db)
            # answer = await answer_repo.get_by_assessment_and_control(assessment_id, control_id)
            # comments = answer.reviewer_comments if answer else ""
            
            # TEMPORARY: Skip comment retrieval to avoid repository conflicts
            comments = ""
            
            # ALWAYS use Croatian template to ensure Croatian responses
            is_mandatory = False  # TODO: Query ControlRequirement for actual mandatory status
            template = self.croatian_prompts["recommendations_structured"] if structured_output else self.croatian_prompts["recommendations"]
            prompt = template.format(
                control_name=control_name,
                current_score=current_score,
                target_score=target_score,
                security_level=security_level,
                is_mandatory_text="Da" if is_mandatory else "Ne",
                gap_size=target_score - current_score,
                context=context or "Nema dostupnog konteksta",
                comments=comments or "Nema komentara",
            )
            # Always use Croatian system prompt to ensure Croatian responses
            if structured_output:
                system_prompt = self.croatian_prompts["system_structured"]
            else:
                system_prompt = self.croatian_prompts["system_unstructured"]
            
            logger.info(
                "[AI Service] Prompt prepared for recommendations",
                prompt_length=len(prompt),
                system_prompt_length=len(system_prompt),
                control_id=str(control_id),
                control_name=control_name,
                prompt_preview=prompt[:500]  # Log first 500 chars of prompt
            )
            
            # Generate recommendations using Ollama chat API (aligns with tests' mocking)
            start_time = time.time()
            try:
                chat_result = await self.ollama_client.chat(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    stream=False,
                    options={
                        "temperature": 0.7,
                        "num_predict": 3000,
                        "num_ctx": 32768,
                        "top_k": 40,
                        "top_p": 0.9,
                        "repeat_penalty": 1.2,
                    }
                )
                response_text = chat_result.get("message", {}).get("content", "")
                generation_time = time.time() - start_time
                if not response_text:
                    return {"error": "Empty response from AI model"}
                ai_result = {"status": "success", "response": response_text, "generation_time": generation_time}
            except Exception as e:
                logger.error("ai_chat_failed", error=str(e))
                return {"error": str(e)}
            
            logger.info(
                "[AI Service] AI response received",
                status=ai_result.get("status"),
                response_length=len(ai_result.get("response", "")),
                generation_time=ai_result.get("generation_time", 0),
                control_id=str(control_id),
                response_preview=ai_result.get("response", "")[:200]
            )
            
            # Handle structured output
            if structured_output:
                result = await self._parse_structured_recommendation(
                    ai_result["response"], control_id, control_name, current_score, 
                    target_score, language, ai_result["generation_time"]
                )
                # Add source references to result
                result["sources"] = source_references
                return result
            
            # Determine priority; treat mandatory controls with low scores as high priority
            is_mandatory = bool(getattr(control, "is_mandatory", False))
            priority = self._calculate_priority(current_score, is_mandatory)
            if is_mandatory and current_score <= 2.0:
                priority = "high"

            return {
                "control_id": str(control_id),
                "control_name": control_name,
                "current_score": current_score,
                "target_score": target_score,
                "recommendation": ai_result["response"],
                "sources": source_references,  # Add source references
                "priority": priority,
                "effort_estimate": self._calculate_effort_estimate(current_score, target_score, is_mandatory),
                "generated_at": datetime.utcnow().isoformat(),
                "generation_time": ai_result["generation_time"],
                "language": language,
            }
            
        except Exception as e:
            logger.error("control_recommendation_failed", error=str(e), control_id=str(control_id))
            return {"error": str(e)}
    
    async def generate_improvement_roadmap_ai(
        self,
        assessment_id: UUID,
        organization_id: UUID,
        gaps: List[Dict[str, Any]],
        language: str = "hr",
    ) -> Dict[str, Any]:
        """Generate comprehensive improvement roadmap using AI."""
        
        try:
            # Get assessment details
            assessment = await self.assessment_repo.get_by_id(assessment_id)
            if not assessment:
                return {"error": "Assessment not found"}
            
            # Prepare gaps summary
            gaps_summary = []
            for gap in gaps[:5]:  # Top 5 gaps
                gap_text = f"- {gap['control_name']}: {gap['current_score']:.1f}/5 (nedostaje {gap['gap']:.1f})"
                if gap['is_mandatory']:
                    gap_text += " [OBAVEZNO]"
                gaps_summary.append(gap_text)
            
            gaps_text = "\n".join(gaps_summary)
            
            # Get regulatory context
            regulatory_query = f"ZKS NIS2 {assessment.security_level} sigurnost zahtjevi"
            regulatory_context = await self.rag_service.retrieve_context(
                query=regulatory_query,
                organization_id=organization_id,
                k=2,
            )
            
            # Generate roadmap
            if language == "hr":
                prompt = self.croatian_prompts["roadmap"].format(
                    assessment_title=assessment.title,
                    security_level=assessment.security_level,
                    total_gaps=len(gaps),
                    mandatory_gaps=sum(1 for g in gaps if g['is_mandatory']),
                    gaps_summary=gaps_text,
                    regulatory_context=regulatory_context or "Nema dostupnog regulatornog konteksta",
                )
                system_prompt = self.croatian_prompts["system_unstructured"]
            else:
                # English version would be similar but in English
                prompt = f"""Create a comprehensive security improvement plan based on compliance assessment analysis.

Assessment: {assessment.title}
Security level: {assessment.security_level}
Total gaps identified: {len(gaps)}
Mandatory controls with gaps: {sum(1 for g in gaps if g['is_mandatory'])}

Top gaps:
{gaps_text}

Generate a structured improvement plan."""
                system_prompt = self.english_prompts["system_unstructured"]
            
            # Generate AI roadmap
            ai_result = await self.generate_response(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.4,
                max_tokens=2000,
            )
            
            if ai_result["status"] == "error":
                return {"error": ai_result["error"]}
            
            return {
                "assessment_id": str(assessment_id),
                "roadmap_text": ai_result["response"],
                "total_gaps": len(gaps),
                "mandatory_gaps": sum(1 for g in gaps if g['is_mandatory']),
                "generated_at": datetime.utcnow().isoformat(),
                "generation_time": ai_result["generation_time"],
                "language": language,
            }
            
        except Exception as e:
            logger.error("roadmap_generation_failed", 
                error=str(e), 
                error_type=type(e).__name__,
                assessment_id=str(assessment_id),
                gaps_count=len(gaps) if gaps else 0
            )
            return {
                "roadmap": "",
                "generation_time": 0.0,
                "error": str(e)
            }
    
    def _calculate_priority(self, score: float, is_mandatory: bool) -> str:
        """Calculate priority based on score and mandatory status."""
        
        if is_mandatory and score < 2.0:
            return "high"
        elif is_mandatory and score < 3.0:
            return "medium"
        elif not is_mandatory and score < 2.0:
            return "medium"
        else:
            return "low"
    
    def _calculate_effort_estimate(self, current_score: float, target_score: float, is_mandatory: bool) -> str:
        """Calculate effort estimate based on score gap and mandatory status."""
        gap = target_score - current_score
        
        if gap >= 2.0 or (is_mandatory and gap >= 1.5):
            return "high"
        elif gap >= 1.0 or (is_mandatory and gap >= 0.5):
            return "medium"
        else:
            return "low"
    
    async def _parse_structured_recommendation(
        self, 
        ai_response: str, 
        control_id: UUID, 
        control_name: str, 
        current_score: float, 
        target_score: float, 
        language: str, 
        generation_time: float
    ) -> Dict[str, Any]:
        """Parse structured JSON recommendation response."""
        import json
        
        try:
            # Clean the response - AI might return markdown with JSON
            cleaned_response = ai_response.strip()
            
            # If response contains markdown code blocks, extract JSON from them
            if "```json" in cleaned_response.lower() or "```" in cleaned_response:
                import re
                # Extract content between ``` blocks
                json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', cleaned_response, re.DOTALL)
                if json_match:
                    cleaned_response = json_match.group(1).strip()
                else:
                    # Try to find JSON object without code blocks
                    json_match = re.search(r'\{.*\}', cleaned_response, re.DOTALL)
                    if json_match:
                        cleaned_response = json_match.group(0)
            
            # Remove any text before the first {
            if '{' in cleaned_response:
                cleaned_response = cleaned_response[cleaned_response.index('{'):]
            
            # Try to parse JSON response - first attempt with original
            try:
                json_response = json.loads(cleaned_response)
            except json.JSONDecodeError as e:
                logger.warning(f"Initial JSON parse failed: {e}, attempting to fix...")
                # If that fails, try to fix common issues
                # Use a more robust approach - parse line by line and fix issues
                import re
                
                # First, try simple replacement of control characters
                fixed_response = cleaned_response
                # Replace actual newlines that are within quoted strings
                # This pattern finds content between quotes and replaces newlines
                def fix_string_content(match):
                    content = match.group(1)
                    content = content.replace('\n', '\\n')
                    content = content.replace('\r', '\\r')
                    content = content.replace('\t', '\\t')
                    return f'"{content}"'
                
                # Apply fix to all quoted strings
                fixed_response = re.sub(r'"([^"]*)"', fix_string_content, fixed_response)
                
                # Try parsing again with fixed response
                json_response = json.loads(fixed_response)
            
            # Validate required fields (title removed as we generate it from DB)
            required_fields = ["description", "implementation_steps", "timeline_weeks", "compliance_impact"]
            for field in required_fields:
                if field not in json_response:
                    logger.warning(f"Missing required field: {field}")
                    return {"error": f"Missing required field: {field}"}
            
            # Fix implementation_steps if they're objects instead of strings
            if isinstance(json_response.get("implementation_steps"), list):
                fixed_steps = []
                for step in json_response["implementation_steps"]:
                    if isinstance(step, str):
                        fixed_steps.append(step)
                    elif isinstance(step, dict):
                        # Extract text from object - try different keys
                        if "step" in step:
                            fixed_steps.append(step["step"])
                        elif "action" in step:
                            fixed_steps.append(step["action"])
                        elif "description" in step:
                            fixed_steps.append(step["description"])
                        else:
                            # Use first string value found
                            for value in step.values():
                                if isinstance(value, str):
                                    fixed_steps.append(value)
                                    break
                json_response["implementation_steps"] = fixed_steps
            
            # Ensure consistent title format: always use control code + Croatian name from DB
            control = await self.control_repo.get_by_id(control_id)
            if control and control.code:
                consistent_title = f"{control.code}: {control.name_hr}"
            else:
                consistent_title = control_name
            
            return {
                "control_id": str(control_id),
                "control_name": control_name,
                "current_score": current_score,
                "target_score": target_score,
                "title": consistent_title,  # Use consistent format from DB, not AI-generated
                "description": json_response.get("description", ""),
                "implementation_steps": json_response.get("implementation_steps", []),
                "timeline_weeks": json_response.get("timeline_weeks", 8),
                "compliance_impact": json_response.get("compliance_impact", 10),
                "source_references": json_response.get("source_references", []),
                "priority": self._calculate_priority(current_score, False),
                "effort_estimate": self._calculate_effort_estimate(current_score, target_score, False),
                "generated_at": datetime.utcnow().isoformat(),
                "generation_time": generation_time,
                "language": language,
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON recommendation: {e}")
            logger.error(f"AI Response: {ai_response[:500]}...")
            
            # Try to extract data from non-JSON response as fallback
            return {
                "control_id": str(control_id),
                "control_name": control_name,
                "current_score": current_score,
                "target_score": target_score,
                "title": f"Poboljšanje kontrole: {control_name[:50]}",
                "description": ai_response[:300] if ai_response else "Generirajte novu preporuku",
                "implementation_steps": ["Analizirajte trenutno stanje", "Implementirajte poboljšanja", "Validirajte rezultate"],
                "timeline_weeks": 8,
                "compliance_impact": 20,
                "source_references": [],
                "priority": self._calculate_priority(current_score, False),
                "effort_estimate": self._calculate_effort_estimate(current_score, target_score, False),
                "generated_at": datetime.utcnow().isoformat(),
                "generation_time": generation_time,
                "language": language,
                "error": f"JSON parsing failed: {str(e)}",
                "raw_response": ai_response[:500]
            }
    
    async def validate_response_quality(self, response: str, language: str = "hr") -> Dict[str, Any]:
        """Validate generated response quality and provide metrics."""
        
        try:
            # Basic quality checks
            word_count = len(response.split())
            sentence_count = response.count('.') + response.count('!') + response.count('?')
            
            # Croatian-specific checks
            if language == "hr":
                croatian_chars = sum(1 for c in response if c in "čćđšž")
                has_croatian = croatian_chars > 0
                
                # Check for Croatian phrases
                croatian_phrases = ["mora", "treba", "preporučuje", "implementirati", "sigurnost"]
                phrase_count = sum(1 for phrase in croatian_phrases if phrase in response.lower())
            else:
                has_croatian = False
                phrase_count = 0
            
            # Quality scoring
            quality_score = 0.0
            
            # Length scoring
            if 50 <= word_count <= 500:
                quality_score += 0.3
            elif word_count > 500:
                quality_score += 0.2
            
            # Structure scoring
            if sentence_count >= 3:
                quality_score += 0.2
            
            # Language appropriateness
            if language == "hr" and has_croatian:
                quality_score += 0.2
            elif language == "en" and not has_croatian:
                quality_score += 0.2
            
            # Content relevance (basic)
            if phrase_count > 0:
                quality_score += 0.3
            
            return {
                "quality_score": min(1.0, quality_score),
                "word_count": word_count,
                "sentence_count": sentence_count,
                "language_appropriate": (language == "hr" and has_croatian) or (language == "en" and not has_croatian),
                "validation_passed": quality_score >= 0.6,
            }
            
        except Exception as e:
            logger.error("response_validation_failed", error=str(e))
            return {
                "quality_score": 0.0,
                "validation_passed": False,
                "error": str(e),
            }

    async def store_feedback(
        self,
        interaction_id: str,
        rating: int,
        helpful: bool,
        comment: Optional[str] = None,
        interaction_type: str = "question",
        response_quality: Optional[str] = None,
    ) -> UUID:
        """Store user feedback on AI responses."""
        
        # For now, we'll create a simple feedback log entry
        # In a full implementation, this would create a proper feedback table
        feedback_data = {
            "interaction_id": interaction_id,
            "rating": rating,
            "helpful": helpful,
            "comment": comment,
            "interaction_type": interaction_type,
            "response_quality": response_quality,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        logger.info("ai_feedback_received", **feedback_data)
        
        # Generate a mock feedback ID for now
        # In a full implementation, this would be the actual database ID
        import uuid
        feedback_id = uuid.uuid4()
        
        return feedback_id

    async def log_feedback_analytics(
        self,
        interaction_type: str,
        rating: int,
        helpful: bool,
    ) -> None:
        """Log feedback analytics for performance monitoring."""
        
        analytics_data = {
            "interaction_type": interaction_type,
            "rating": rating,
            "helpful": helpful,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        logger.info("ai_feedback_analytics", **analytics_data)
        
        # In a full implementation, this would update analytics tables
        # or send data to monitoring services