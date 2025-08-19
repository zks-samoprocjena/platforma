import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.assessment import AssessmentRepository
from app.repositories.assessment_insights_repository import AssessmentInsightsRepository
from app.repositories.control_repository import ControlRepository
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.document import AIRecommendationRepository
from app.services.ai_service import AIService
from app.services.assessment_service import AssessmentService
from app.models.assessment import AssessmentAnswer

logger = logging.getLogger(__name__)


class AssessmentInsightsService:
    """Service to manage persisted assessment insights and computation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.insights_repo = AssessmentInsightsRepository(db)
        self.assessment_service = AssessmentService(db)
        self.control_repo = ControlRepository(db)
        self.answer_repo = AssessmentAnswerRepository(db)
        self.ai_rec_repo = AIRecommendationRepository(db)

    async def get(self, assessment_id: UUID) -> Optional[Dict[str, Any]]:
        record = await self.insights_repo.get_by_assessment_id(assessment_id)
        if not record:
            return None
        return self._serialize(record)

    async def compute(self, assessment_id: UUID) -> Dict[str, Any]:
        """Compute insights structure from existing services.
        Produces normalized snapshot matching the data contract.
        """
        assessment = await self.assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found")

        # Load compliance data
        compliance = await self.assessment_service.get_assessment_compliance(assessment_id)

        # Preload controls for this version and mandatory requirements for level
        controls = await self.control_repo.get_by_version_id(assessment.version_id)
        code_to_control = {c.code: c for c in controls}

        mandatory_reqs = await self.control_repo.get_mandatory_requirements_for_level(assessment.security_level)
        mandatory_control_ids = {req.control_id for req in mandatory_reqs}

        # Helper to compute current control average score across answers for this assessment
        async def get_control_current_score(control_id: UUID) -> Optional[float]:
            query = (
                select(
                    func.avg((AssessmentAnswer.documentation_score + AssessmentAnswer.implementation_score) / 2.0)
                )
                .where(
                    and_(
                        AssessmentAnswer.assessment_id == assessment_id,
                        AssessmentAnswer.control_id == control_id,
                        AssessmentAnswer.documentation_score.isnot(None),
                        AssessmentAnswer.implementation_score.isnot(None),
                    )
                )
            )
            result = await self.db.execute(query)
            avg_val = result.scalar()
            return float(round(avg_val, 2)) if avg_val is not None else None

        # Build gaps from failed_controls
        gaps: List[Dict[str, Any]] = []
        seen_controls: set[str] = set()
        critical_count = 0
        for measure in compliance.get("measures", []):
            measure_code = measure.get("measure_code") or measure.get("code")
            for sub in measure.get("submeasures", []):
                failed_codes = sub.get("failed_controls") or []
                for code in failed_codes:
                    control = code_to_control.get(code)
                    if not control:
                        continue
                    if str(control.id) in seen_controls:
                        continue
                    seen_controls.add(str(control.id))

                    is_mandatory = control.id in mandatory_control_ids

                    current_score = await get_control_current_score(control.id)
                    # Conservative target score baseline; can be replaced with requirement minimums if available
                    target_score = 3.0 if is_mandatory else 2.5
                    # Gap magnitude (treat missing current as 0)
                    gap_score = float(max(0.0, (target_score - (current_score or 0.0))))

                    # Priority derived from gap magnitude and mandatory flag
                    if is_mandatory:
                        if gap_score >= 1.0:
                            priority = "critical"
                        elif gap_score >= 0.5:
                            priority = "high"
                        else:
                            priority = "medium"
                    else:
                        if gap_score >= 1.0:
                            priority = "high"
                        elif gap_score >= 0.5:
                            priority = "medium"
                        else:
                            priority = "low"
                    if priority == "critical":
                        critical_count += 1

                    # Effort and rough timeline derived from priority
                    effort_map = {"critical": "high", "high": "high", "medium": "medium", "low": "low"}
                    timeline_map = {"critical": 4, "high": 6, "medium": 8, "low": 12}

                    # Get latest recommendation for this control (if stored)
                    recs = await self.ai_rec_repo.get_by_control(control.id, assessment_id=assessment_id, limit=1)
                    recommendation = recs[0].content if recs else None

                    gaps.append(
                        {
                            "control_id": str(control.id),
                            "control_code": control.code,
                            "control_name": getattr(control, "name_hr", None) or getattr(control, "name", None) or control.code,
                            "measure_code": measure_code,
                            "measure_title": measure_code,
                            "priority": priority,
                            "is_mandatory": is_mandatory,
                            "current_score": current_score,
                            "target_score": target_score,
                            "gap_score": gap_score,
                            "effort_estimate": effort_map[priority],
                            "timeline_weeks": timeline_map[priority],
                            "impact_description": (
                                "Obavezna kontrola ne zadovoljava minimalni prag." if is_mandatory else "Kontrola zahtijeva poboljšanje za višu usklađenost."
                            ),
                            "control_description": getattr(control, "description_hr", None) or getattr(control, "description", None),
                            "recommendation": recommendation,
                        }
                    )

        # Build roadmap phases from gaps
        def to_item(g: Dict[str, Any]) -> Dict[str, Any]:
            return {
                "control_id": g["control_id"],
                "control_name": g["control_name"],
                "priority": g["priority"],
                "recommendation": g.get("recommendation"),
                "description": g.get("recommendation") or g.get("impact_description"),
                "timeline_weeks": g.get("timeline_weeks"),
                "effort_estimate": g.get("effort_estimate"),
            }

        short_items = [to_item(g) for g in gaps if g["priority"] in ("critical", "high")]
        medium_items = [to_item(g) for g in gaps if g["priority"] == "medium"]
        long_items = [to_item(g) for g in gaps if g["priority"] == "low"]

        roadmap = {
            "summary": f"Total gaps: {len(gaps)}; critical: {critical_count}",
            "total_items": len(gaps),
            "phases": [
                {
                    "name": "short-term",
                    "duration": "1-3 months",
                    "description": "Address critical and high-priority mandatory gaps",
                    "items": short_items,
                },
                {
                    "name": "medium-term",
                    "duration": "3-6 months",
                    "description": "Resolve medium-priority improvements",
                    "items": medium_items,
                },
                {
                    "name": "long-term",
                    "duration": "6-12 months",
                    "description": "Plan for low-priority optimizations",
                    "items": long_items,
                },
            ],
        }

        # Measures AI aggregation (stored recs)
        measures_ai = {"measures": []}
        for measure in compliance.get("measures", []):
            measure_code = measure.get("measure_code") or measure.get("code")
            measure_name = measure_code
            measure_entry = {"code": measure_code, "name": measure_name, "controls": []}
            # Attach recommendations for controls present in gaps of this measure
            measure_gap_controls = {g["control_id"] for g in gaps if g["control_code"].startswith(measure_code.split(".")[0] + ".")}
            for g in gaps:
                if g["control_id"] in measure_gap_controls:
                    measure_entry["controls"].append(
                        {
                            "control_id": g["control_id"],
                            "control_code": g["control_code"],
                            "control_name": g["control_name"],
                            "ai_recommendation": g["recommendation"],
                        }
                    )
            measures_ai["measures"].append(measure_entry)

        # Executive AI summary (try AI; fallback deterministic summary)
        overall = compliance.get("overall", {})
        comp_pct = overall.get("compliance_percentage")
        ai_summary: str | None = None
        try:
            ai_service = AIService(self.db)
            # Build a concise prompt for exec summary
            top_gaps = [g for g in gaps if g.get("priority") in ("critical", "high")][:5]
            top_list = "\n".join(
                f"- {g['control_code']}: {g['control_name']} (current {g.get('current_score') or 0}/target {g.get('target_score')})"
                for g in top_gaps
            )
            prompt = (
                "Write a concise executive summary (6-10 sentences) of a cybersecurity compliance self-assessment on CROATIAN language. "
                f"Overall compliance: {comp_pct}%. Total gaps: {len(gaps)}. Critical gaps: {critical_count}.\n"
                "Highlight key weaknesses and a high-level improvement plan by phases (short, medium, long term).\n"
                f"Key gaps: \n{top_list}"
            )
            ai_result = await ai_service.generate_response(prompt=prompt, max_tokens=1000, temperature=0.4)
            if ai_result.get("status") == "success" and ai_result.get("response"):
                ai_summary = ai_result["response"].strip()
        except Exception as e:
            logger.warning(f"AI exec summary generation failed: {e}")
        if not ai_summary:
            ai_summary = (
                f"Assessment compliance is {comp_pct}% with {len(gaps)} gaps identified, including {critical_count} critical. "
                "See roadmap for phase-wise execution."
            )

        return {
            "assessment_id": assessment.id,
            "organization_id": assessment.organization_id,
            "computed_at": datetime.now(timezone.utc),
            "gaps": gaps,
            "roadmap": roadmap,
            "ai_summary": ai_summary,
            "measures_ai": measures_ai,
            "status": "ok",
            "source_version": "v1",
            "error_message": None,
            "computed_by": None,
        }

    async def compute_and_persist(self, assessment_id: UUID, force: bool = False) -> Dict[str, Any]:
        existing = await self.insights_repo.get_by_assessment_id(assessment_id)
        if existing and not force and existing.status == "ok":
            return self._serialize(existing)

        snapshot = await self.compute(assessment_id)
        saved = await self.insights_repo.upsert(
            assessment_id=snapshot["assessment_id"],
            organization_id=snapshot["organization_id"],
            computed_at=snapshot["computed_at"],
            gaps=snapshot["gaps"],
            roadmap=snapshot["roadmap"],
            ai_summary=snapshot["ai_summary"],
            measures_ai=snapshot["measures_ai"],
            status=snapshot["status"],
            source_version=snapshot["source_version"],
            error_message=snapshot["error_message"],
            computed_by=snapshot["computed_by"],
        )
        return self._serialize(saved)

    async def refresh(self, assessment_id: UUID) -> Dict[str, Any]:
        return await self.compute_and_persist(assessment_id, force=True)

    async def mark_stale(self, assessment_id: UUID) -> bool:
        return await self.insights_repo.mark_stale(assessment_id)

    def _serialize(self, record) -> Dict[str, Any]:
        return {
            "assessment_id": str(record.assessment_id),
            "computed_at": record.computed_at.isoformat() if record.computed_at else None,
            "gaps": record.gaps or [],
            "roadmap": record.roadmap or {},
            "ai_summary": record.ai_summary,
            "measures_ai": record.measures_ai or {},
            "status": record.status,
            "source_version": record.source_version,
        } 