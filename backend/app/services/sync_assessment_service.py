"""
Synchronous assessment service for use in background workers.
"""
import logging
from typing import Dict, Any, Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, case, and_, or_

from app.models.assessment import (
    Assessment, AssessmentAnswer, AssessmentResult, 
    AssessmentProgress
)
from app.models.reference import Measure, Submeasure, Control

logger = logging.getLogger(__name__)


class SyncAssessmentService:
    """Synchronous version of assessment service for background jobs."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_assessment(self, assessment_id: UUID) -> Optional[Assessment]:
        """Get assessment by ID with all relationships loaded."""
        return self.db.query(Assessment).options(
            joinedload(Assessment.organization),
            selectinload(Assessment.answers).selectinload(AssessmentAnswer.control),
            selectinload(Assessment.answers).selectinload(AssessmentAnswer.submeasure)
        ).filter(Assessment.id == assessment_id).first()
    
    def get_assessment_report_data(self, assessment_id: UUID) -> Dict[str, Any]:
        """
        Get comprehensive assessment data for report generation.
        Sync version of AssessmentService.get_assessment_report_data
        """
        logger.info(f"[SYNC_SERVICE] Getting report data for assessment {assessment_id}")
        
        # Get assessment with organization info
        assessment = self.get_assessment(assessment_id)
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found")
        
        # Get organization details
        from app.models.organization import Organization
        org = self.db.query(Organization).filter(
            Organization.id == assessment.organization_id
        ).first()
        org_name = org.name if org else str(assessment.organization_id)
        
        # Get all answers with related data
        answers = self.db.query(AssessmentAnswer).options(
            joinedload(AssessmentAnswer.control),
            joinedload(AssessmentAnswer.submeasure).joinedload(Submeasure.measure)
        ).filter(
            AssessmentAnswer.assessment_id == assessment_id
        ).all()
        
        # Group answers by measure
        measure_map = {}
        for answer in answers:
            if answer.submeasure and answer.submeasure.measure:
                measure = answer.submeasure.measure
                if measure.id not in measure_map:
                    measure_map[measure.id] = {
                        "measure": measure,
                        "submeasures": {},
                        "controls": []
                    }
                
                # Add submeasure if not exists
                if answer.submeasure.id not in measure_map[measure.id]["submeasures"]:
                    measure_map[measure.id]["submeasures"][answer.submeasure.id] = {
                        "submeasure": answer.submeasure,
                        "controls": []
                    }
                
                # Add control with answer
                if answer.control:
                    control_data = {
                        "control": answer.control,
                        "answer": answer
                    }
                    measure_map[measure.id]["submeasures"][answer.submeasure.id]["controls"].append(control_data)
                    measure_map[measure.id]["controls"].append(control_data)
        
        # Calculate scores and compliance
        measures_detail = []
        total_doc_score = 0
        total_impl_score = 0
        total_controls = 0
        
        for measure_data in measure_map.values():
            measure = measure_data["measure"]
            
            # Calculate measure scores
            measure_doc_sum = 0
            measure_impl_sum = 0
            measure_control_count = 0
            
            for control_data in measure_data["controls"]:
                answer = control_data["answer"]
                if answer.documentation_score is not None:
                    measure_doc_sum += answer.documentation_score
                    measure_control_count += 1
                if answer.implementation_score is not None:
                    measure_impl_sum += answer.implementation_score
            
            if measure_control_count > 0:
                measure_doc_avg = measure_doc_sum / measure_control_count
                measure_impl_avg = measure_impl_sum / measure_control_count
                measure_total_avg = (measure_doc_avg + measure_impl_avg) / 2
                measure_compliance = (measure_total_avg / 5.0) * 100
            else:
                measure_doc_avg = 0
                measure_impl_avg = 0
                measure_total_avg = 0
                measure_compliance = 0
            
            measures_detail.append({
                "measure_code": measure.code,  # Add measure_code for template compatibility
                "code": measure.code,
                "name": measure.name_hr,
                "documentation_score": round(measure_doc_avg, 2),
                "implementation_score": round(measure_impl_avg, 2),
                "total_score": round(measure_total_avg, 2),
                "compliance_percentage": round(measure_compliance, 1),
                "control_count": measure_control_count,
                "controls": [
                    {
                        "control_name": cd["control"].name_hr if hasattr(cd["control"], "name_hr") else str(cd["control"].id),  # Use control_name
                        "name": cd["control"].name_hr if hasattr(cd["control"], "name_hr") else str(cd["control"].id),
                        "documentation_score": cd["answer"].documentation_score,
                        "implementation_score": cd["answer"].implementation_score,
                        "total_score": (
                            (cd["answer"].documentation_score + cd["answer"].implementation_score) / 2
                            if cd["answer"].documentation_score is not None 
                            and cd["answer"].implementation_score is not None
                            else 0
                        ),
                        "average_score": (  # Add average_score for template
                            (cd["answer"].documentation_score + cd["answer"].implementation_score) / 2
                            if cd["answer"].documentation_score is not None 
                            and cd["answer"].implementation_score is not None
                            else 0
                        )
                    }
                    for cd in measure_data["controls"][:3]  # Top 3 controls
                ]
            })
            
            total_doc_score += measure_doc_sum
            total_impl_score += measure_impl_sum
            total_controls += measure_control_count
        
        # Calculate overall scores
        if total_controls > 0:
            overall_doc_avg = total_doc_score / total_controls
            overall_impl_avg = total_impl_score / total_controls
            overall_total_avg = (overall_doc_avg + overall_impl_avg) / 2
            overall_compliance = (overall_total_avg / 5.0) * 100
        else:
            overall_doc_avg = 0
            overall_impl_avg = 0
            overall_total_avg = 0
            overall_compliance = 0
        
        # Determine compliance level
        if overall_compliance >= 80:
            compliance_level = "visoku razinu sukladnosti"
        elif overall_compliance >= 60:
            compliance_level = "srednju razinu sukladnosti"
        elif overall_compliance >= 40:
            compliance_level = "osnovnu razinu sukladnosti"
        else:
            compliance_level = "nisku razinu sukladnosti"
        
        # Sort measures by code (1-13)
        measures_detail.sort(key=lambda m: int(m["code"].split('.')[0]))
        
        return {
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "security_level": assessment.security_level,
                "status": assessment.status,
                "created_at": assessment.created_at,
                "completed_at": assessment.completed_at,
                "total_score": round(overall_total_avg, 2),
                "compliance_percentage": round(overall_compliance, 1)
            },
            "organization": {
                "id": str(assessment.organization_id),
                "name": org_name,
                "code": org.code if org else "",
                "type": org.type if org else "Unknown",
                "size": org.size if org else "Unknown"
            },
            "compliance_data": {
                "overall_documentation_score": round(overall_doc_avg, 2),
                "overall_implementation_score": round(overall_impl_avg, 2),
                "overall_total_score": round(overall_total_avg, 2),
                "compliance_percentage": round(overall_compliance, 1),
                "compliance_level": compliance_level,
                "total_measures": len(measures_detail),
                "total_controls": total_controls,
                "measures": measures_detail
            },
            "generation_date": assessment.completed_at or assessment.created_at
        }