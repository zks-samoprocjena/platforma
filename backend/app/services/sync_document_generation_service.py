"""
Synchronous document generation service for background workers.
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from sqlalchemy.orm import Session

from app.services.sync_assessment_service import SyncAssessmentService
from app.services.assessment_insights_service import AssessmentInsightsService
from app.models.assessment_insights import AssessmentInsights

import json
import requests
from app.models.document_generation import DocumentType
from app.models.document import AIRecommendation
from app.models.reference import Control

logger = logging.getLogger(__name__)


class SyncDocumentGenerationService:
    """Synchronous version of document generation service for background jobs."""
    
    def __init__(self, db: Session):
        self.db = db
        self.assessment_service = SyncAssessmentService(db)
        self.insights_service = AssessmentInsightsService(db)
        
        # Setup Jinja2 environment (sync mode)
        template_dir = Path(__file__).parent.parent / "templates" / "documents"
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(['html', 'xml']),
            enable_async=False  # Sync mode
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
    
    def generate_document(
        self,
        assessment_id: UUID,
        document_type: str,
        template_version: str = "latest",
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate a compliance document synchronously."""
        logger.info(f"[SYNC_DOC_GEN] Generating document type={document_type} for assessment={assessment_id}")
        
        if document_type in ("executive_summary", "assessment_report"):
            data = self._load_assessment_data(assessment_id)
            return {
                "document_type": document_type,
                "template_version": template_version,
                "data": data,
            }
        elif document_type == "self_assessment_report":
            base = self._load_assessment_data(assessment_id)
            # Map insights into legacy fields expected by templates (gap_analysis, roadmap)
            insights = base.get("insights") or {}
            gaps = insights.get("gaps") or []
            roadmap = insights.get("roadmap") or {"summary": "", "total_items": 0, "phases": []}
            gap_analysis = {
                "total_gaps": len(gaps),
                "gaps": gaps,
            }
            # Enrich measure results with AI control recommendations from insights
            results = (base.get("results") or {}).copy()
            measures = list((results.get("measures") or []))
            insights_measures = ((insights.get("measures_ai") or {}).get("measures") or [])
            ins_map = { (m.get("code") or m.get("measure_code")): m for m in insights_measures }
            # Map control_id -> gap for fallback text
            gap_by_control_id = {}
            for g in gaps:
                cid = str(g.get("control_id")) if g.get("control_id") is not None else None
                if cid:
                    gap_by_control_id[cid] = g
            for m in measures:
                code = m.get("code") or m.get("measure_code")
                ins_m = ins_map.get(code)
                if ins_m:
                    # Attach AI control recommendations list under controls
                    controls = []
                    for ctrl in list(ins_m.get("controls") or []):
                        rec = ctrl.get("ai_recommendation")
                        if not rec:
                            # Fallback: derive from gaps meta
                            g = gap_by_control_id.get(str(ctrl.get("control_id")))
                            if g:
                                current = g.get("current_score") or 0
                                target = g.get("target_score") or 0
                                impact = g.get("impact_description") or ""
                                rec = f"Poboljšati kontrolu podizanjem rezultata s {current} na {target}. {impact}"
                                ctrl["ai_recommendation"] = rec
                        controls.append(ctrl)
                    m["controls"] = controls
                    # Optional summary field at measure level (if present later)
                    if ins_m.get("ai_summary"):
                        m["ai_recommendation"] = ins_m.get("ai_summary")
            results["measures"] = measures
            data = {
                "organization": { "name": "" },  # Fill via SyncAssessmentService if available
                "assessment": {
                    **base["assessment"],
                    "compliance_percentage": (base.get("results", {}).get("overall", {}) or {}).get("compliance_percentage", 0)
                },
                "results": results,
                "gap_analysis": gap_analysis,
                "roadmap": roadmap,
                "generation_date": datetime.now(),
                "compliance_level": self._get_compliance_level_text((base.get("results", {}).get("overall", {}) or {}).get("compliance_percentage", 0)),
            }
            return self._generate_self_assessment_report(data, template_version, options or {})

        else:
            raise ValueError(f"Document type not implemented: {document_type}")
    
    def _load_assessment_data(self, assessment_id: UUID) -> Dict[str, Any]:
        """Load comprehensive assessment data for document generation."""
        
        # Get comprehensive report data
        report_data = self.assessment_service.get_assessment_report_data(assessment_id)
        
        # Load insights synchronously from DB or via internal API
        insights = self._get_or_compute_insights_sync(assessment_id)

        # Extract and restructure compliance data
        assessment = self.assessment_service.get_assessment(assessment_id)
        compliance_data = report_data["compliance_data"]
        results = {
            "measures": compliance_data.get("measures", []),
            "overall": {
                "documentation_score": compliance_data.get("overall_documentation_score", 0),
                "implementation_score": compliance_data.get("overall_implementation_score", 0),
                "total_score": compliance_data.get("overall_total_score", 0),
                "compliance_percentage": compliance_data.get("compliance_percentage", 0),
            },
            "total_measures": compliance_data.get("total_measures", 0),
            "total_controls": compliance_data.get("total_controls", 0),
        }

        return {
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "security_level": assessment.security_level,
                "status": assessment.status,
                "created_at": str(assessment.created_at) if assessment.created_at else None,
                "completed_at": str(assessment.completed_at) if assessment.completed_at else None,
            },
            "results": results,
            "insights": insights,
        }

    def _get_or_compute_insights_sync(self, assessment_id: UUID) -> Dict[str, Any]:
        """Fetch persisted insights using sync DB. If missing, call internal API to compute."""
        try:
            record: Optional[AssessmentInsights] = (
                self.db.query(AssessmentInsights)
                .filter(AssessmentInsights.assessment_id == assessment_id)
                .first()
            )
            if record:
                return {
                    "assessment_id": str(record.assessment_id),
                    "computed_at": record.computed_at.isoformat() if record.computed_at else None,
                    "gaps": record.gaps or [],
                    "roadmap": record.roadmap or {},
                    "ai_summary": record.ai_summary,
                    "measures_ai": record.measures_ai or {"measures": []},
                    "status": record.status,
                    "source_version": record.source_version,
                }
        except Exception as e:
            logger.warning(f"[SYNC_DOC_GEN] Failed to load insights from DB: {e}")
        # Compute via internal API
        try:
            base_url = "http://assessment-api:8000"
            url = f"{base_url}/api/v1/assessments/v2/{assessment_id}/insights"
            resp = requests.get(url, params={"refresh_if_stale": "true"}, timeout=15)
            if resp.ok:
                return resp.json()
            else:
                logger.warning(f"[SYNC_DOC_GEN] Insights API returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"[SYNC_DOC_GEN] Failed to fetch insights via API: {e}")
        # Fallback empty structure
        return {
            "assessment_id": str(assessment_id),
            "computed_at": None,
            "gaps": [],
            "roadmap": {"summary": "", "total_items": 0, "phases": []},
            "ai_summary": None,
            "measures_ai": {"measures": []},
            "status": "error",
            "source_version": "v1",
        }
    
    def _generate_self_assessment_report(
        self,
        data: Dict[str, Any],
        template_version: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate self-assessment report."""
        logger.info("[SYNC] Generating self-assessment report")
        
        # Prepare template context to match async service
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "roadmap": data["roadmap"],
            "generation_date": data["generation_date"],
            "compliance_level": data.get("compliance_level", self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            )),
            "include_charts": options.get("include_charts", True),
            "include_recommendations": options.get("include_recommendations", True),
            "language": options.get("language", "hr"),
            # AI content placeholders for sync mode
            "ai_executive_summary": self._build_exec_summary_fallback(data),
            "ai_action_items": None,
        }
        try:
            measures = (data.get("results") or {}).get("measures") or []
            control_ai = sum(1 for m in measures for c in (m.get("controls") or []) if (c.get("ai_recommendation") or "").strip())
            measures_with_ai = sum(1 for m in measures if m.get("ai_recommendation"))
            roadmap_items = len(((data.get("roadmap") or {}).get("items") or []))
            logger.info("[SYNC][DOC_GEN] Content diagnostics", control_ai=control_ai, measures_with_ai=measures_with_ai, roadmap_items=roadmap_items)
        except Exception as e:
            logger.warning(f"[SYNC][DOC_GEN] Diagnostics failed: {e}")
        
        # Render template (use v2 by default for latest/v2)
        tpl_name = (
            "self_assessment_report/template_v2.html"
            if template_version in ("latest", "v2", None)
            else "self_assessment_report/template_v1.html"
        )
        logger.info(f"[SYNC][DOC_GEN] Using template {tpl_name}")
        template = self.env.get_template(tpl_name)
        # Enrich context with appendix visibility flag
        context["has_ai_details"] = (locals().get("control_ai", 0) or 0) > 0
        html_content = template.render(**context)
        
        # Generate PDF
        filename = f"self_assessment_report_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = self.output_dir / filename
        
        # Load CSS
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        
        # Generate PDF with WeasyPrint
        html = HTML(string=html_content)
        if css_path.exists():
            css = CSS(filename=str(css_path))
            html.write_pdf(str(file_path), stylesheets=[css])
        else:
            html.write_pdf(str(file_path))
        
        return {
            "file_path": str(file_path),
            "filename": filename,
            "content_type": "application/pdf",
            "metadata": {
                "pages": 1,  # Would need to calculate actual pages
                "generation_time": datetime.now().isoformat(),
                "size_bytes": self._get_file_size(file_path),
                "ai_control_recommendations": control_ai if 'control_ai' in locals() else 0,
                "ai_measures_with_ai": measures_with_ai if 'measures_with_ai' in locals() else 0,
                "roadmap_items": roadmap_items if 'roadmap_items' in locals() else 0,
                "template_name": tpl_name,
            }
        }
    
    def _generate_compliance_declaration(
        self, 
        data: Dict[str, Any], 
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate compliance declaration."""
        logger.info("[SYNC] Generating compliance declaration")
        
        # Prepare context to match async service
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "declaration_date": datetime.now(),
            "generation_date": data.get("generation_date", datetime.now()),
            "compliance_level": data.get("compliance_level", self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            )),
            "responsible_person": options.get("responsible_person", {
                "name": "___________________",
                "title": "___________________"
            }),
            "include_details": options.get("include_details", False),
            "language": options.get("language", "hr"),
        }
        
        template = self.env.get_template("compliance_declaration/template_v1.html")
        html_content = template.render(**context)
        
        filename = f"compliance_declaration_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = self.output_dir / filename
        
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        
        HTML(string=html_content).write_pdf(
            file_path,
            stylesheets=[CSS(filename=str(css_path))] if css_path.exists() else []
        )
        
        return {
            "file_path": str(file_path),
            "filename": filename,
            "content_type": "application/pdf",
            "metadata": {
                "pages": 1,
                "generation_time": datetime.now().isoformat(),
                "size_bytes": self._get_file_size(file_path)
            }
        }
    
    def _generate_internal_record(
        self, 
        data: Dict[str, Any], 
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate internal record."""
        logger.info("[SYNC] Generating internal record")
        
        # Prepare context
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "generation_date": data.get("generation_date", datetime.now()),
            "compliance_level": data.get("compliance_level", self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            )),
            "participants": options.get("participants", []),
            "meeting_date": options.get("meeting_date"),
            "meeting_time": options.get("meeting_time"),
            "meeting_location": options.get("meeting_location"),
            "meeting_end_time": options.get("meeting_end_time"),
            "record_number": options.get("record_number"),
            "language": options.get("language", "hr"),
        }
        
        template = self.env.get_template("internal_record/template_v1.html")
        html_content = template.render(**context)
        
        filename = f"internal_record_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = self.output_dir / filename
        
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        
        HTML(string=html_content).write_pdf(
            file_path,
            stylesheets=[CSS(filename=str(css_path))] if css_path.exists() else []
        )
        
        return {
            "file_path": str(file_path),
            "filename": filename,
            "content_type": "application/pdf",
            "metadata": {
                "pages": 1,
                "generation_time": datetime.now().isoformat(),
                "size_bytes": self._get_file_size(file_path)
            }
        }
    
    def _generate_evaluation_report(
        self, 
        data: Dict[str, Any], 
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate evaluation report."""
        logger.info("[SYNC] Generating evaluation report")
        
        # Prepare context
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "generation_date": data.get("generation_date", datetime.now()),
            "compliance_level": data.get("compliance_level", self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            )),
            "include_recommendations": options.get("include_recommendations", True),
            "include_statistics": options.get("include_statistics", True),
            "language": options.get("language", "hr"),
        }
        
        template = self.env.get_template("evaluation_report/template_v1.html")
        html_content = template.render(**context)
        
        filename = f"evaluation_report_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = self.output_dir / filename
        
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        
        HTML(string=html_content).write_pdf(
            file_path,
            stylesheets=[CSS(filename=str(css_path))] if css_path.exists() else []
        )
        
        return {
            "file_path": str(file_path),
            "filename": filename,
            "content_type": "application/pdf",
            "metadata": {
                "pages": 1,
                "generation_time": datetime.now().isoformat(),
                "size_bytes": self._get_file_size(file_path)
            }
        }
    
    def _generate_action_plan(
        self, 
        data: Dict[str, Any], 
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate action plan."""
        logger.info("[SYNC] Generating action plan")
        
        # Prepare context
        context = {
            "organization": data["organization"],
            "assessment": data["assessment"],
            "results": data["results"],
            "gap_analysis": data["gap_analysis"],
            "roadmap": data["roadmap"],
            "generation_date": data.get("generation_date", datetime.now()),
            "compliance_level": data.get("compliance_level", self._get_compliance_level_text(
                data["assessment"]["compliance_percentage"]
            )),
            "target_compliance": options.get("target_compliance", "90%"),
            "budget": options.get("budget", {}),
            "responsible_persons": options.get("responsible_persons", {}),
            "timeline": options.get("timeline", "12 mjeseci"),
            "language": options.get("language", "hr"),
        }
        
        template = self.env.get_template("action_plan/template_v1.html")
        html_content = template.render(**context)
        
        filename = f"action_plan_{data['assessment']['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = self.output_dir / filename
        
        css_path = Path(__file__).parent.parent / "templates" / "documents" / "base" / "styles.css"
        
        HTML(string=html_content).write_pdf(
            file_path,
            stylesheets=[CSS(filename=str(css_path))] if css_path.exists() else []
        )
        
        return {
            "file_path": str(file_path),
            "filename": filename,
            "content_type": "application/pdf",
            "metadata": {
                "pages": 1,
                "generation_time": datetime.now().isoformat(),
                "size_bytes": self._get_file_size(file_path)
            }
        }
    
    def _get_file_size(self, file_path: Path) -> int:
        """Get file size in bytes."""
        import os
        if file_path.exists():
            return os.path.getsize(file_path)
        return 0

    def _build_exec_summary_fallback(self, data: Dict[str, Any]) -> str:
        try:
            org_name = data["organization"].get("name")
            compliance_pct = data["assessment"].get("compliance_percentage", 0)
            total_measures = len((data.get("results", {}).get("measures") or []))
            roadmap_items = (data.get("roadmap", {}) or {}).get("total_items", 0)
            gaps = (data.get("gap_analysis", {}) or {}).get("total_gaps", 0)
            parts: list[str] = []
            parts.append(
                f"Organizacija {org_name} provela je samoprocjenu kibernetičke sigurnosti."
            )
            parts.append(
                f"Ukupna sukladnost iznosi {compliance_pct:.1f}% uz {total_measures} mjera."
            )
            if gaps:
                parts.append(f"Identificirano je {gaps} nedostataka koji zahtijevaju prioritetno djelovanje.")
            if roadmap_items:
                parts.append(f"Predložen je plan poboljšanja s {roadmap_items} preporuka raspoređenih po fazama.")
            parts.append("Preporuka je fokusirati se na kritične i visoke prioritete u prvih 0–3 mjeseca.")
            return "\n".join(parts)
        except Exception:
            return ""
    
    @staticmethod
    def _format_datetime(value, format_str='%d.%m.%Y'):
        """Format datetime for templates."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return value.strftime(format_str)
    
    @staticmethod
    def _format_number(value, decimals=2):
        """Format number for templates."""
        if value is None:
            return "0"
        return f"{float(value):.{decimals}f}"
    
    @staticmethod
    def _format_percentage(value):
        """Format percentage for templates."""
        if value is None:
            return "0%"
        return f"{float(value):.1f}%"
    
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