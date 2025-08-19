"""
Document generation service for compliance documents.
Uses Jinja2 for templating and WeasyPrint for PDF generation.
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


from app.services.assessment_service import AssessmentService
from app.services.rag_service import RAGService
from app.models.document_generation import DocumentType
from app.models.organization import Organization
from app.services.assessment_insights_service import AssessmentInsightsService

logger = logging.getLogger(__name__)


class DocumentGenerationService:
    """Service for generating compliance documents from templates."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.assessment_service = AssessmentService(db)
        self.insights_service = AssessmentInsightsService(db)
        
        # Setup Jinja2 environment
        template_dir = Path(__file__).parent.parent / "templates" / "documents"
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(['html', 'xml']),
            enable_async=True  # Enable async template rendering
        )
        
        # Add custom filters
        self.env.filters['datetime'] = self._format_datetime
        self.env.filters['number'] = self._format_number
        self.env.filters['percentage'] = self._format_percentage
        
        # Add global functions/objects
        from datetime import timedelta
        self.env.globals['timedelta'] = timedelta
        
        # Output directory for generated documents
        self.output_dir = Path("/app/uploads/generated")
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    async def generate_document(
        self,
        assessment_id: UUID,
        document_type: str,
        template_version: str = "latest",
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate a compliance document for an assessment.
        
        Args:
            assessment_id: The assessment to generate document for
            document_type: Type of document to generate
            template_version: Template version to use
            options: Generation options (include_ai, language, etc.)
            
        Returns:
            Dict with file_path and metadata
        """
        options = options or {}
        
        # Validate document type
        if document_type not in DocumentType.get_all():
            raise ValueError(f"Invalid document type: {document_type}")
        
        # Load data with insights
        data = await self._load_assessment_data(assessment_id)
        
        # Enrich with AI content if requested
        if options.get("include_ai_analysis", False):
            data = await self._enrich_with_ai_content(
                data,
                document_type,
                options.get("language", "hr"),
            )
        
        # Generate document based on type
        if document_type == DocumentType.COMPLIANCE_DECLARATION:
            return await self._generate_compliance_declaration(
                data, template_version, options
            )
        elif document_type == DocumentType.SELF_ASSESSMENT_REPORT:
            return await self._generate_self_assessment_report(
                data, template_version, options
            )
        elif document_type == DocumentType.INTERNAL_RECORD:
            return await self._generate_internal_record(
                data, template_version, options
            )
        elif document_type == DocumentType.EVALUATION_REPORT:
            return await self._generate_evaluation_report(
                data, template_version, options
            )
        elif document_type == DocumentType.ACTION_PLAN:
            return await self._generate_action_plan(
                data, template_version, options
            )
        else:
            raise ValueError(f"Document type not implemented: {document_type}")
    
    async def _load_assessment_data(self, assessment_id: UUID) -> Dict[str, Any]:
        """Load comprehensive assessment data for document generation."""
        # Load insights (compute-and-persist if missing)
        insights = await self.insights_service.compute_and_persist(assessment_id)

        # Get comprehensive report data from V3 service (for overview/compliance)
        report_data = await self.assessment_service.get_assessment_report_data(assessment_id)

        # Extract assessment object
        assessment = await self.assessment_service.get_assessment(assessment_id)
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found")

        # Structure results similar to previous implementation
        compliance_data = report_data.get("compliance", {})
        results = {
            "measures": compliance_data.get("measures", []),
            "overall": compliance_data.get("overall", {}),
            "total_measures": len(compliance_data.get("measures", [])),
        }

        # Get organization details without triggering lazy load
        organization_id = assessment.organization_id
        org = None
        try:
            result = await self.db.execute(
                select(Organization).where(Organization.id == organization_id)
            )
            org = result.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"Failed to load organization {organization_id}: {e}")

        return {
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "security_level": assessment.security_level,
                "status": assessment.status,
                "created_at": assessment.created_at.isoformat() if assessment.created_at else None,
                "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else None,
                "organization_id": str(organization_id),
                "organization_name": getattr(org, "name", None),
            },
            "results": results,
            "insights": insights,
        }
    
    async def _enrich_with_ai_content(
        self,
        assessment_data: Dict[str, Any],
        document_type: str,
        language: str = "hr",
    ) -> Dict[str, Any]:
        """Enrich assessment data with AI-generated content."""
        
        from app.services.ai_document_content_service import AIDocumentContentService
        
        logger.info(f"Starting AI enrichment for {document_type}")
        ai_service = AIDocumentContentService(self.db)
        
        enriched_data = assessment_data.copy()
        
        try:
            # Generate executive summary for reports
            if document_type in [DocumentType.SELF_ASSESSMENT_REPORT, DocumentType.EVALUATION_REPORT]:
                logger.info("Generating executive summary")
                summary = await ai_service.generate_executive_summary(
                    assessment_data,
                    language=language,
                )
                logger.info(f"Executive summary generated: {len(summary) if summary else 0} chars")
                enriched_data["ai_executive_summary"] = summary
            
            # Generate action items for action plan
            if document_type == DocumentType.ACTION_PLAN:
                logger.info("Generating AI action items")
                if assessment_data.get("gap_analysis") and assessment_data["gap_analysis"].get("gaps"):
                    enriched_data["ai_action_items"] = await ai_service.generate_action_items(
                        assessment_data["gap_analysis"]["gaps"],
                        assessment_data,
                        language=language,
                    )
            
            # Generate measure-specific recommendations
            if document_type in [DocumentType.EVALUATION_REPORT, DocumentType.SELF_ASSESSMENT_REPORT]:
                logger.info("Generating measure recommendations")
                if assessment_data.get("results") and assessment_data["results"].get("measures"):
                    # Limit to measures with low scores
                    low_score_measures = [
                        m for m in assessment_data["results"]["measures"]
                        if m.get("total_score", 5) < 3.5
                    ][:5]  # Top 5 low-scoring measures
                    
                    logger.info(f"Found {len(low_score_measures)} low-scoring measures for AI recommendations")
                    if low_score_measures:
                        logger.info(f"Measure codes: {[m.get('code', 'NO_CODE') for m in low_score_measures]}")
                    
                    recommendations = await ai_service.generate_recommendations_batch(
                        low_score_measures,
                        UUID(assessment_data["assessment"]["id"]),
                        UUID(assessment_data["organization"]["id"]),
                        language=language,
                    )
                    
                    logger.info(f"Generated {len(recommendations)} recommendations for measures")
                    
                    # Add recommendations to measures
                    for measure in assessment_data["results"]["measures"]:
                        if measure["code"] in recommendations:
                            measure["ai_recommendation"] = recommendations[measure["code"]]
                            logger.info(f"Added AI recommendation for measure {measure['code']}")
                        
                    # Also add to enriched_data results
                    enriched_data["results"]["measures"] = assessment_data["results"]["measures"]
            
            # Generate gap narratives for critical gaps
            if document_type in [DocumentType.INTERNAL_RECORD, DocumentType.ACTION_PLAN]:
                logger.info("Generating gap narratives")
                if assessment_data.get("gap_analysis") and assessment_data["gap_analysis"].get("gaps"):
                    critical_gaps = [
                        g for g in assessment_data["gap_analysis"]["gaps"]
                        if g.get("priority") in ["KRITIČAN", "CRITICAL"]
                    ][:3]  # Top 3 critical gaps
                    
                    for gap in critical_gaps:
                        gap["ai_narrative"] = await ai_service.generate_gap_narrative(
                            gap,
                            language=language,
                        )
            
            logger.info(f"AI enrichment completed for {document_type}")
            
        except Exception as e:
            logger.error(f"AI enrichment failed: {str(e)}, continuing without AI content")
            # Return original data if AI enrichment fails
        
        return enriched_data
    
    async def _generate_compliance_declaration(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate Izjava o sukladnosti (Compliance Declaration)."""
        
        # Load template
        template = self.env.get_template("compliance_declaration/template_v1.html")
        
        # Prepare context
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "declaration_date": datetime.now(),
            "compliance_level": self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            ),
            "responsible_person": options.get("responsible_person", {
                "name": "___________________",
                "title": "___________________"
            }),
            "include_details": options.get("include_details", False),
            "language": options.get("language", "hr"),
            "place": options.get("place", "Zagreb"),
            "assessment_version": data["assessment"].get("id", ""),  # Assessment UUID
            "platform_version": "1.0.3",  # Could be loaded from config
        }
        
        # Render HTML
        html_content = await template.render_async(**context)
        
        # Generate PDF
        output_filename = f"izjava_o_sukladnosti_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.output_dir / output_filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None
        
        # Convert to PDF
        HTML(string=html_content).write_pdf(
            str(output_path),
            stylesheets=[css] if css else None
        )
        
        return {
            "file_path": str(output_path),
            "filename": output_filename,
            "metadata": {
                "document_type": DocumentType.COMPLIANCE_DECLARATION,
                "template_version": template_version,
                "pages": 1,  # Will be calculated later
                "size_bytes": output_path.stat().st_size,
            }
        }
    
    async def _generate_self_assessment_report(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate Izvještaj o samoprocjeni (Self-Assessment Report)."""
        
        # Load template (use v2 by default)
        tpl_name = "self_assessment_report/template_v2.html" if template_version in ("latest", "v2", None) else "self_assessment_report/template_v1.html"
        template = self.env.get_template(tpl_name)
        logger.info("[DOC_GEN] Using template", template=tpl_name)
        
        # Prepare context with full assessment data
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "roadmap": data["roadmap"] if options.get("include_roadmap", True) else None,
            "generation_date": datetime.now(),
            "include_charts": options.get("include_charts", True),
            "include_recommendations": options.get("include_recommendations", True),
            "language": options.get("language", "hr"),
            # Add AI-generated content if present
            "ai_executive_summary": data.get("ai_executive_summary") or (data.get("roadmap", {}) or {}).get("summary"),
            "ai_action_items": data.get("ai_action_items"),
            "compliance_level": self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            ),
        }
        
        # Compute diagnostics
        try:
            measures = (data.get("results") or {}).get("measures") or []
            control_ai = sum(1 for m in measures for c in (m.get("controls") or []) if c.get("ai_recommendation"))
            measures_with_ai = sum(1 for m in measures if m.get("ai_recommendation"))
            roadmap_items = len(((data.get("roadmap") or {}).get("items") or []))
            logger.info("[DOC_GEN] Content diagnostics", control_ai=control_ai, measures_with_ai=measures_with_ai, roadmap_items=roadmap_items)
        except Exception as e:
            logger.warning(f"[DOC_GEN] Diagnostics failed: {e}")

        # Render HTML
        html_content = await template.render_async(**context)
        
        # Generate PDF
        output_filename = f"izvjestaj_samoprocjene_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.output_dir / output_filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None
        
        # Convert to PDF
        HTML(string=html_content).write_pdf(
            str(output_path),
            stylesheets=[css] if css else None
        )
        
        return {
            "file_path": str(output_path),
            "filename": output_filename,
            "metadata": {
                "document_type": DocumentType.SELF_ASSESSMENT_REPORT,
                "template_version": template_version,
                "template_name": tpl_name,
                "ai_control_recommendations": control_ai if 'control_ai' in locals() else 0,
                "ai_measures_with_ai": measures_with_ai if 'measures_with_ai' in locals() else 0,
                "roadmap_items": roadmap_items if 'roadmap_items' in locals() else 0,
                "size_bytes": output_path.stat().st_size,
            }
        }
    
    async def _generate_internal_record(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate Interni zapisnik o samoprocjeni (Internal Record)."""
        
        # Load template
        template = self.env.get_template("internal_record/template_v1.html")
        
        # Prepare context
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "generation_date": datetime.now(),
            "compliance_level": self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            ),
            "participants": options.get("participants", []),
            "meeting_date": options.get("meeting_date"),
            "meeting_time": options.get("meeting_time"),
            "meeting_location": options.get("meeting_location"),
            "meeting_end_time": options.get("meeting_end_time"),
            "record_number": options.get("record_number"),
            "language": options.get("language", "hr"),
        }
        
        # Render HTML
        html_content = await template.render_async(**context)
        
        # Generate PDF
        output_filename = f"interni_zapisnik_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.output_dir / output_filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None
        
        # Convert to PDF
        HTML(string=html_content).write_pdf(
            str(output_path),
            stylesheets=[css] if css else None
        )
        
        return {
            "file_path": str(output_path),
            "filename": output_filename,
            "metadata": {
                "document_type": DocumentType.INTERNAL_RECORD,
                "template_version": template_version,
                "size_bytes": output_path.stat().st_size,
            }
        }
    
    async def _generate_evaluation_report(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate Evaluacijski izvještaj po mjerama (Evaluation Report)."""
        
        # Load template
        template = self.env.get_template("evaluation_report/template_v1.html")
        
        # Prepare context with detailed measure evaluation
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "generation_date": datetime.now(),
            "compliance_level": self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            ),
            "include_recommendations": options.get("include_recommendations", True),
            "include_statistics": options.get("include_statistics", True),
            "language": options.get("language", "hr"),
        }
        
        # Render HTML
        html_content = await template.render_async(**context)
        
        # Generate PDF
        output_filename = f"evaluacijski_izvjestaj_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.output_dir / output_filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None
        
        # Convert to PDF
        HTML(string=html_content).write_pdf(
            str(output_path),
            stylesheets=[css] if css else None
        )
        
        return {
            "file_path": str(output_path),
            "filename": output_filename,
            "metadata": {
                "document_type": DocumentType.EVALUATION_REPORT,
                "template_version": template_version,
                "size_bytes": output_path.stat().st_size,
            }
        }
    
    async def _generate_action_plan(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate Akcijski plan za poboljšanja (Action Plan)."""
        
        # Load template
        template = self.env.get_template("action_plan/template_v1.html")
        
        # Prepare context with action items and timeline
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "roadmap": data["roadmap"],
            "generation_date": datetime.now(),
            "compliance_level": self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            ),
            "target_compliance": options.get("target_compliance", "90%"),
            "budget": options.get("budget", {}),
            "responsible_persons": options.get("responsible_persons", {}),
            "timeline": options.get("timeline", "12 mjeseci"),
            "language": options.get("language", "hr"),
        }
        
        # Render HTML
        html_content = await template.render_async(**context)
        
        # Generate PDF
        output_filename = f"akcijski_plan_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = self.output_dir / output_filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None
        
        # Convert to PDF
        HTML(string=html_content).write_pdf(
            str(output_path),
            stylesheets=[css] if css else None
        )
        
        return {
            "file_path": str(output_path),
            "filename": output_filename,
            "metadata": {
                "document_type": DocumentType.ACTION_PLAN,
                "template_version": template_version,
                "size_bytes": output_path.stat().st_size,
            }
        }
    
    # Helper methods
    
    def _format_datetime(self, dt: datetime, format: str = "%d.%m.%Y") -> str:
        """Format datetime for display."""
        if not dt:
            return ""
        return dt.strftime(format)
    
    def _format_number(self, value: float, decimals: int = 2) -> str:
        """Format number for display."""
        if value is None:
            return "0"
        return f"{value:.{decimals}f}"
    
    def _format_percentage(self, value: float) -> str:
        """Format percentage for display."""
        if value is None:
            return "0%"
        return f"{value:.1f}%"
    
    def _get_compliance_level_text(self, percentage: float) -> str:
        """Get compliance level text based on percentage."""
        if percentage >= 90:
            return "Visoka razina sukladnosti"
        elif percentage >= 70:
            return "Dobra razina sukladnosti"
        elif percentage >= 50:
            return "Djelomična sukladnost"
        else:
            return "Niska razina sukladnosti"
    
    def _organize_roadmap_phases(self, roadmap_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Organize roadmap items into phases based on priority and effort."""
        if not roadmap_items:
            return []
        
        # Group items by priority into phases
        phases = []
        
        # Phase 1: Critical and mandatory items
        critical_items = [
            item for item in roadmap_items 
            if item.get("priority") == "critical" or item.get("is_mandatory", False)
        ]
        if critical_items:
            phases.append({
                "name": "Faza 1: Kritični nedostaci",
                "duration": "0-3 mjeseca",
                "items": critical_items,
                "description": "Rješavanje kritičnih i obveznih sigurnosnih kontrola"
            })
        
        # Phase 2: High priority items
        high_priority_items = [
            item for item in roadmap_items 
            if item.get("priority") == "high" and not item.get("is_mandatory", False)
        ]
        if high_priority_items:
            phases.append({
                "name": "Faza 2: Visoki prioritet",
                "duration": "3-6 mjeseci",
                "items": high_priority_items,
                "description": "Implementacija kontrola visokog prioriteta"
            })
        
        # Phase 3: Medium priority items
        medium_priority_items = [
            item for item in roadmap_items 
            if item.get("priority") == "medium"
        ]
        if medium_priority_items:
            phases.append({
                "name": "Faza 3: Srednji prioritet",
                "duration": "6-12 mjeseci",
                "items": medium_priority_items,
                "description": "Poboljšanje kontrola srednjeg prioriteta"
            })
        
        return phases