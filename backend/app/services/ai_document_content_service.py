"""
AI-powered content generation service for compliance documents.
"""
import json
import logging
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.services.ai_service import AIService, PromptTemplates
from app.services.search_cache_service import SearchCacheService
from app.repositories.assessment_v2 import AssessmentRepositoryV2
from app.models.assessment import Assessment

logger = structlog.get_logger(__name__)


class AIDocumentContentService:
    """Service for generating AI-powered content for compliance documents."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ai_service = AIService(db)
        self.cache_service = SearchCacheService()
        self.assessment_repo = AssessmentRepositoryV2(db)
    
    async def generate_executive_summary(
        self,
        assessment_data: Dict[str, Any],
        language: str = "hr"
    ) -> str:
        """Generate AI-powered executive summary for assessment report."""
        
        # Check cache first
        cache_key = f"exec_summary_{assessment_data['assessment']['id']}_{language}"
        cached = await self.cache_service.get_cached_search(
            cache_key, 
            UUID(assessment_data['organization']['id'])
        )
        if cached:
            return cached
        
        # Prepare prompt
        prompt = self._create_executive_summary_prompt(assessment_data, language)
        
        try:
            # Generate summary
            response = await self.ai_service.generate_response(
                prompt=prompt,
                temperature=0.7,
                max_tokens=1000
            )
            
            if response["status"] == "success":
                summary = response["response"]
                
                # Cache the result
                await self.cache_service.cache_search_result(
                    cache_key,
                    UUID(assessment_data['organization']['id']),
                    summary,
                    ttl=3600  # 1 hour cache
                )
                
                return summary
            else:
                logger.error(f"AI generation failed: {response.get('error')}")
                return self._get_fallback_executive_summary(assessment_data, language)
                
        except Exception as e:
            logger.error(f"Executive summary generation failed: {str(e)}")
            return self._get_fallback_executive_summary(assessment_data, language)
    
    async def generate_measure_analysis(
        self,
        measure_data: Dict[str, Any],
        assessment_id: UUID,
        organization_id: UUID,
        language: str = "hr"
    ) -> str:
        """Generate detailed analysis for a specific measure."""
        
        # Check cache
        cache_key = f"measure_analysis_{assessment_id}_{measure_data['code']}_{language}"
        cached = await self.cache_service.get_cached_search(cache_key, organization_id)
        if cached:
            return cached
        
        # Prepare context-aware prompt
        prompt = self._create_measure_analysis_prompt(measure_data, language)
        
        try:
            # Get context from similar measures
            context = await self.ai_service.rag_service.search_similar_content(
                query=f"{measure_data['name']} implementacija najbolje prakse",
                organization_id=organization_id,
                limit=3
            )
            
            # Generate analysis with context
            response = await self.ai_service.generate_response_with_context(
                prompt=prompt,
                context=[{"text": doc["content"]} for doc in context["results"]],
                temperature=0.6,
                max_tokens=800
            )
            
            if response["status"] == "success":
                analysis = response["response"]
                
                # Cache result
                await self.cache_service.cache_search_result(
                    cache_key, organization_id, analysis, ttl=3600
                )
                
                return analysis
            else:
                return self._get_fallback_measure_analysis(measure_data, language)
                
        except Exception as e:
            logger.error(f"Measure analysis generation failed: {str(e)}")
            return self._get_fallback_measure_analysis(measure_data, language)
    
    async def generate_action_items(
        self,
        gaps: List[Dict[str, Any]],
        assessment_data: Dict[str, Any],
        language: str = "hr"
    ) -> List[Dict[str, Any]]:
        """Generate prioritized action items based on gaps."""
        
        # Limit to top gaps for AI processing
        top_gaps = sorted(
            gaps, 
            key=lambda x: (5 - x.get('current_score', 0)) * (1 if x.get('is_mandatory') else 0.5),
            reverse=True
        )[:10]
        
        prompt = self._create_action_items_prompt(top_gaps, assessment_data, language)
        
        try:
            response = await self.ai_service.generate_response(
                prompt=prompt,
                temperature=0.6,
                max_tokens=1500,
                system_prompt="You are a cybersecurity compliance expert. Generate actionable recommendations in JSON format."
            )
            
            if response["status"] == "success":
                try:
                    # Parse JSON response
                    action_items = json.loads(response["response"])
                    return action_items.get("action_items", [])
                except json.JSONDecodeError:
                    # Try to extract structured data from text
                    return self._parse_action_items_from_text(response["response"])
            else:
                return self._get_fallback_action_items(top_gaps, language)
                
        except Exception as e:
            logger.error(f"Action items generation failed: {str(e)}")
            return self._get_fallback_action_items(top_gaps, language)
    
    async def generate_gap_narrative(
        self,
        gap: Dict[str, Any],
        context: Optional[str] = None,
        language: str = "hr"
    ) -> str:
        """Generate narrative explanation for a specific gap."""
        
        prompt = self._create_gap_narrative_prompt(gap, context, language)
        
        try:
            response = await self.ai_service.generate_response(
                prompt=prompt,
                temperature=0.7,
                max_tokens=500
            )
            
            if response["status"] == "success":
                return response["response"]
            else:
                return self._get_fallback_gap_narrative(gap, language)
                
        except Exception as e:
            logger.error(f"Gap narrative generation failed: {str(e)}")
            return self._get_fallback_gap_narrative(gap, language)
    
    async def generate_recommendations_batch(
        self,
        measures: List[Dict[str, Any]],
        assessment_id: UUID,
        organization_id: UUID,
        language: str = "hr"
    ) -> Dict[str, str]:
        """Generate recommendations for multiple measures in batch."""
        
        recommendations = {}
        
        # Process in parallel with limited concurrency
        import asyncio
        semaphore = asyncio.Semaphore(3)  # Limit concurrent AI calls
        
        async def process_measure(measure):
            async with semaphore:
                rec = await self.generate_measure_analysis(
                    measure, assessment_id, organization_id, language
                )
                return measure['code'], rec
        
        tasks = [process_measure(m) for m in measures[:10]]  # Limit to top 10
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, tuple):
                code, recommendation = result
                recommendations[code] = recommendation
            else:
                logger.error(f"Batch recommendation failed: {result}")
        
        return recommendations
    
    # Prompt creation methods
    
    def _create_executive_summary_prompt(
        self, 
        assessment_data: Dict[str, Any], 
        language: str
    ) -> str:
        """Create prompt for executive summary generation."""
        
        if language == "hr":
            return f"""Generirajte izvršni sažetak za izvještaj o samoprocjeni kibernetičke sigurnosti.

Organizacija: {assessment_data['organization']['name']}
Tip organizacije: {assessment_data['organization']['type']}
Razina sigurnosti: {assessment_data['assessment']['security_level']}
Ukupna sukladnost: {assessment_data['assessment']['compliance_percentage']}%
Ukupna ocjena: {assessment_data['assessment']['total_score']}/5.0

Statistike:
- Broj mjera: {len(assessment_data['results']['measures']) if assessment_data.get('results') else 13}
- Broj kritičnih nedostataka: {len([g for g in assessment_data.get('gap_analysis', {}).get('gaps', []) if g.get('priority') == 'KRITIČAN'])}
- Broj visokih prioriteta: {len([g for g in assessment_data.get('gap_analysis', {}).get('gaps', []) if g.get('priority') == 'VISOK'])}

Generirajte sažetak od 3-4 paragrafa koji uključuje:
1. Opći pregled stanja kibernetičke sigurnosti
2. Ključne snage i postignuća
3. Glavni nedostaci i rizici
4. Preporučene prioritetne akcije

Sažetak mora biti profesionalan, koncizan i usmjeren na menadžment."""
        else:
            return f"""Generate an executive summary for the cybersecurity self-assessment report.

Organization: {assessment_data['organization']['name']}
Organization type: {assessment_data['organization']['type']}
Security level: {assessment_data['assessment']['security_level']}
Overall compliance: {assessment_data['assessment']['compliance_percentage']}%
Overall score: {assessment_data['assessment']['total_score']}/5.0

Generate a 3-4 paragraph summary including:
1. Overall cybersecurity posture
2. Key strengths and achievements
3. Main gaps and risks
4. Recommended priority actions"""
    
    def _create_measure_analysis_prompt(
        self, 
        measure_data: Dict[str, Any], 
        language: str
    ) -> str:
        """Create prompt for measure analysis."""
        
        if language == "hr":
            return f"""Analizirajte mjeru kibernetičke sigurnosti i generirajte preporuke.

Mjera: {measure_data['name']}
Trenutna ocjena: {measure_data.get('total_score', 0)}/5.0
Dokumentiranost: {measure_data.get('documentation_score', 0)}/5.0
Implementacija: {measure_data.get('implementation_score', 0)}/5.0
Sukladnost: {measure_data.get('compliance_percentage', 0)}%

Generirajte analizu koja uključuje:
1. Trenutno stanje i razloge za ocjenu
2. Specifične nedostatke koji trebaju poboljšanje
3. Konkretne korake za postizanje potpune sukladnosti
4. Očekivane rokove i prioritete

Budite konkretni i praktični u preporukama."""
        else:
            return f"""Analyze the cybersecurity measure and generate recommendations.

Measure: {measure_data['name']}
Current score: {measure_data.get('total_score', 0)}/5.0
Documentation: {measure_data.get('documentation_score', 0)}/5.0
Implementation: {measure_data.get('implementation_score', 0)}/5.0

Generate analysis including specific improvement steps."""
    
    def _create_action_items_prompt(
        self,
        gaps: List[Dict[str, Any]],
        assessment_data: Dict[str, Any],
        language: str
    ) -> str:
        """Create prompt for action items generation."""
        
        gaps_text = "\n".join([
            f"- {g['control_name']}: {g['current_score']}/5 (Prioritet: {g['priority']})"
            for g in gaps[:5]
        ])
        
        if language == "hr":
            return f"""Generirajte akcijski plan za otklanjanje nedostataka u kibernetičkoj sigurnosti.

Organizacija: {assessment_data['organization']['name']}
Trenutna sukladnost: {assessment_data['assessment']['compliance_percentage']}%

Top 5 nedostataka:
{gaps_text}

Generirajte JSON s akcijskim stavkama:
{{
    "action_items": [
        {{
            "title": "Naziv akcije",
            "description": "Detaljan opis",
            "priority": "KRITIČAN|VISOK|SREDNJI",
            "timeline_weeks": 4,
            "responsible_role": "Uloga odgovorne osobe",
            "success_criteria": "Kriteriji uspjeha",
            "resources_needed": ["Resurs 1", "Resurs 2"]
        }}
    ]
}}"""
        else:
            return f"""Generate action plan for cybersecurity gaps.

Current compliance: {assessment_data['assessment']['compliance_percentage']}%

Top gaps:
{gaps_text}

Generate JSON with prioritized action items."""
    
    def _create_gap_narrative_prompt(
        self,
        gap: Dict[str, Any],
        context: Optional[str],
        language: str
    ) -> str:
        """Create prompt for gap narrative."""
        
        if language == "hr":
            prompt = f"""Objasnite nedostatak u kibernetičkoj sigurnosti.

Kontrola: {gap['control_name']}
Trenutna ocjena: {gap['current_score']}/5
Ciljna ocjena: {gap['target_score']}/5
Prioritet: {gap['priority']}

Generirajte kratko objašnjenje (2-3 rečenice) koje:
1. Objašnjava zašto je ova kontrola važna
2. Opisuje trenutne nedostatke
3. Naglašava posljedice neusklađenosti"""
        else:
            prompt = f"""Explain the cybersecurity gap.

Control: {gap['control_name']}
Current: {gap['current_score']}/5
Target: {gap['target_score']}/5

Generate brief explanation (2-3 sentences)."""
        
        if context:
            prompt += f"\n\nKontekst:\n{context}"
        
        return prompt
    
    # Fallback methods for when AI generation fails
    
    def _get_fallback_executive_summary(
        self, 
        assessment_data: Dict[str, Any], 
        language: str
    ) -> str:
        """Provide fallback executive summary."""
        
        if language == "hr":
            return f"""Organizacija {assessment_data['organization']['name']} provela je samoprocjenu kibernetičke sigurnosti u skladu sa zahtjevima ZKS/NIS2 direktive. 
            
Ukupna razina sukladnosti iznosi {assessment_data['assessment']['compliance_percentage']}% s prosječnom ocjenom {assessment_data['assessment']['total_score']}/5.0. 
            
Preporučuje se fokusiranje na identificirane nedostatke i implementaciju prioritetnih mjera poboljšanja u skladu s akcijskim planom."""
        else:
            return f"""Organization {assessment_data['organization']['name']} has completed a cybersecurity self-assessment. 
            
Overall compliance level is {assessment_data['assessment']['compliance_percentage']}% with an average score of {assessment_data['assessment']['total_score']}/5.0."""
    
    def _get_fallback_measure_analysis(
        self, 
        measure_data: Dict[str, Any], 
        language: str
    ) -> str:
        """Provide fallback measure analysis."""
        
        if language == "hr":
            return f"""Mjera '{measure_data['name']}' trenutno ima ocjenu {measure_data.get('total_score', 0)}/5.0. 
            
Za poboljšanje sukladnosti preporučuje se:
- Pregled i ažuriranje dokumentacije
- Potpuna implementacija kontrola
- Redovito testiranje i održavanje
- Kontinuirano praćenje učinkovitosti"""
        else:
            return f"""Measure '{measure_data['name']}' currently scores {measure_data.get('total_score', 0)}/5.0. 
            
Improvement recommendations include documentation updates and full implementation."""
    
    def _get_fallback_action_items(
        self, 
        gaps: List[Dict[str, Any]], 
        language: str
    ) -> List[Dict[str, Any]]:
        """Provide fallback action items."""
        
        action_items = []
        
        for i, gap in enumerate(gaps[:5]):
            if language == "hr":
                action_items.append({
                    "title": f"Poboljšanje kontrole: {gap['control_name']}",
                    "description": f"Podizanje razine s {gap['current_score']} na {gap['target_score']}",
                    "priority": gap['priority'],
                    "timeline_weeks": 4 if gap['priority'] == 'KRITIČAN' else 8,
                    "responsible_role": "Tim za kibernetičku sigurnost",
                    "success_criteria": f"Postizanje ocjene {gap['target_score']}/5"
                })
            else:
                action_items.append({
                    "title": f"Improve: {gap['control_name']}",
                    "description": f"Raise score from {gap['current_score']} to {gap['target_score']}",
                    "priority": gap['priority'],
                    "timeline_weeks": 4 if gap['priority'] == 'CRITICAL' else 8
                })
        
        return action_items
    
    def _get_fallback_gap_narrative(
        self, 
        gap: Dict[str, Any], 
        language: str
    ) -> str:
        """Provide fallback gap narrative."""
        
        if language == "hr":
            return f"""Kontrola '{gap['control_name']}' trenutno ne zadovoljava ciljnu razinu. 
Potrebno je podići razinu s {gap['current_score']} na {gap['target_score']} kako bi se osigurala potpuna sukladnost."""
        else:
            return f"""Control '{gap['control_name']}' currently does not meet the target level. 
Score needs to be raised from {gap['current_score']} to {gap['target_score']}."""
    
    def _parse_action_items_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Try to extract structured action items from unstructured text."""
        
        # Simple fallback parser
        action_items = []
        lines = text.split('\n')
        
        current_item = {}
        for line in lines:
            line = line.strip()
            if line.startswith(('1.', '2.', '3.', '-', '*')):
                if current_item:
                    action_items.append(current_item)
                current_item = {
                    "title": line.lstrip('0123456789.-* '),
                    "description": "",
                    "priority": "SREDNJI",
                    "timeline_weeks": 8
                }
            elif current_item and line:
                current_item["description"] += " " + line
        
        if current_item:
            action_items.append(current_item)
        
        return action_items[:5]  # Limit to 5 items