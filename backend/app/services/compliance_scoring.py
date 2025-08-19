"""
Compliance Scoring Service - Official ZKS/NIS2 scoring implementation.

This module implements the official ZKS/NIS2 scoring methodology with full
submeasure context support, providing comprehensive compliance assessment.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assessment import Assessment
from app.models.assessment import AssessmentAnswer
from app.models.reference import (
    Control, 
    ControlRequirement,
    ControlSubmeasureMapping,
    Measure, 
    Submeasure
)
from app.models.compliance_scoring_v2 import (
    SubmeasureScore as SubmeasureScoreModel,
    MeasureScore as MeasureScoreModel,
    ComplianceScore as ComplianceScoreModel,
)
import logging

logger = logging.getLogger(__name__)


@dataclass
class ControlScore:
    """Individual control scoring data with context."""
    control_id: uuid.UUID
    control_code: str
    submeasure_id: uuid.UUID
    documentation_score: Optional[int]
    implementation_score: Optional[int]
    overall_score: Optional[Decimal]
    minimum_required: Optional[Decimal]
    is_mandatory: bool
    is_applicable: bool
    passes_threshold: bool
    has_answer: bool


@dataclass
class SubmeasureCompliance:
    """Submeasure-level compliance data."""
    submeasure_id: uuid.UUID
    submeasure_code: str
    controls: List[ControlScore]
    documentation_avg: Optional[Decimal]
    implementation_avg: Optional[Decimal]
    overall_score: Optional[Decimal]
    passes_individual_threshold: bool  # All Oi ≥ Pi
    passes_average_threshold: bool     # Σ(Oi)/n ≥ T
    passes_overall: bool               # Both conditions met
    total_controls: int
    answered_controls: int
    mandatory_controls: int
    mandatory_answered: int
    failed_controls: List[str]


@dataclass
class MeasureCompliance:
    """Measure-level compliance data."""
    measure_id: uuid.UUID
    measure_code: str
    submeasures: List[SubmeasureCompliance]
    documentation_avg: Optional[Decimal]
    implementation_avg: Optional[Decimal]
    overall_score: Optional[Decimal]
    passes_compliance: bool
    total_submeasures: int
    passed_submeasures: int
    critical_failures: List[str]


@dataclass
class OverallCompliance:
    """Overall assessment compliance result."""
    assessment_id: uuid.UUID
    security_level: str
    measures: List[MeasureCompliance]
    overall_score: Optional[Decimal]
    compliance_percentage: Decimal
    passes_compliance: bool
    total_measures: int
    passed_measures: int
    maturity_score: int
    maturity_threshold: int
    meets_maturity_trend: bool
    individual_threshold: Decimal
    average_threshold: Decimal
    calculated_at: datetime


class ComplianceScoringService:
    """
    Unified compliance scoring engine with submeasure context support.
    
    Implements official ZKS/NIS2 methodology:
    - Control Score: K = (DK + IK) / 2
    - Pass Criteria: (Oi ≥ Pi, ∀i) ∧ (Σ(Oi)/n ≥ T)
    - Compliance Score: U = Σ(Mi) / n
    """
    
    # Thresholds by security level (Pi and T values)
    THRESHOLDS = {
        "osnovna": {
            "individual": Decimal("2.0"),  # Pi
            "average": Decimal("2.5")      # T
        },
        "srednja": {
            "individual": Decimal("2.5"),  # Pi
            "average": Decimal("3.0")      # T
        },
        "napredna": {
            "individual": Decimal("3.0"),  # Pi
            "average": Decimal("3.5")      # T
        }
    }
    
    # Maturity trend thresholds
    MATURITY_THRESHOLDS = {
        "osnovna": 109,
        "srednja": 58,
        "napredna": 15
    }

    def __init__(self, db_session: AsyncSession):
        """Initialize with database session."""
        self.db = db_session

    def _get_thresholds(self, security_level: str) -> Dict[str, Decimal]:
        """Get thresholds for security level."""
        level = security_level.lower()
        if level not in self.THRESHOLDS:
            raise ValueError(f"Invalid security level: {security_level}")
        return self.THRESHOLDS[level]

    def _get_maturity_threshold(self, security_level: str) -> int:
        """Get maturity threshold for security level."""
        level = security_level.lower()
        return self.MATURITY_THRESHOLDS.get(level, 0)

    async def calculate_control_score(
        self,
        assessment_id: uuid.UUID,
        control_id: uuid.UUID,
        submeasure_id: uuid.UUID,
        security_level: str
    ) -> ControlScore:
        """
        Calculate control score within submeasure context.
        
        Retrieves answer from AssessmentAnswer and requirement from
        control_requirements table, then calculates score with threshold check.
        """
        # Get the answer for this control in this submeasure context
        answer_query = select(AssessmentAnswer).where(
            and_(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.control_id == control_id,
                AssessmentAnswer.submeasure_id == submeasure_id
            )
        )
        answer_result = await self.db.execute(answer_query)
        answer = answer_result.scalar_one_or_none()

        # Get control details
        control_query = select(Control).where(Control.id == control_id)
        control_result = await self.db.execute(control_query)
        control = control_result.scalar_one()

        # Get requirement for this control-submeasure-level combination
        req_query = select(ControlRequirement).where(
            and_(
                ControlRequirement.control_id == control_id,
                ControlRequirement.submeasure_id == submeasure_id,
                ControlRequirement.level == security_level.lower()
            )
        )
        req_result = await self.db.execute(req_query)
        requirement = req_result.scalar_one_or_none()

        # Default values if no requirement found
        is_mandatory = False
        is_applicable = True
        minimum_required = None

        if requirement:
            is_mandatory = requirement.is_mandatory
            is_applicable = requirement.is_applicable
            minimum_required = Decimal(str(requirement.minimum_score)) if requirement.minimum_score else None

        # Calculate score if answer exists
        overall_score = None
        passes_threshold = True
        has_answer = False

        if answer and answer.documentation_score is not None and answer.implementation_score is not None:
            has_answer = True
            # Calculate: K = (DK + IK) / 2
            doc_score = Decimal(str(answer.documentation_score))
            impl_score = Decimal(str(answer.implementation_score))
            overall_score = (doc_score + impl_score) / Decimal("2")
            overall_score = overall_score.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            # Check against minimum required score
            if minimum_required is not None:
                passes_threshold = overall_score >= minimum_required

        return ControlScore(
            control_id=control_id,
            control_code=control.code,
            submeasure_id=submeasure_id,
            documentation_score=answer.documentation_score if answer else None,
            implementation_score=answer.implementation_score if answer else None,
            overall_score=overall_score,
            minimum_required=minimum_required,
            is_mandatory=is_mandatory,
            is_applicable=is_applicable,
            passes_threshold=passes_threshold,
            has_answer=has_answer
        )

    async def calculate_submeasure_compliance(
        self,
        assessment_id: uuid.UUID,
        submeasure_id: uuid.UUID,
        security_level: str
    ) -> SubmeasureCompliance:
        """
        Calculate submeasure compliance with dual-condition check.
        
        Pass criteria: (Oi ≥ Pi, ∀i) ∧ (Σ(Oi)/n ≥ T)
        - All individual controls must meet their minimum scores
        - Average of all controls must meet security level threshold
        """
        thresholds = self._get_thresholds(security_level)
        
        # Get submeasure details
        submeasure_query = select(Submeasure).where(Submeasure.id == submeasure_id)
        submeasure_result = await self.db.execute(submeasure_query)
        submeasure = submeasure_result.scalar_one()

        # Get all controls for this submeasure
        mapping_query = (
            select(ControlSubmeasureMapping)
            .where(ControlSubmeasureMapping.submeasure_id == submeasure_id)
            .options(selectinload(ControlSubmeasureMapping.control))
        )
        mapping_result = await self.db.execute(mapping_query)
        mappings = list(mapping_result.scalars().all())

        # Calculate score for each control
        control_scores = []
        for mapping in mappings:
            control_score = await self.calculate_control_score(
                assessment_id,
                mapping.control_id,
                submeasure_id,
                security_level
            )
            if control_score.is_applicable:
                control_scores.append(control_score)

        # Count statistics
        total_controls = len(control_scores)
        answered_controls = sum(1 for cs in control_scores if cs.has_answer)
        mandatory_controls = sum(1 for cs in control_scores if cs.is_mandatory)
        mandatory_answered = sum(1 for cs in control_scores if cs.is_mandatory and cs.has_answer)

        # Calculate averages for answered controls
        documentation_avg = None
        implementation_avg = None
        overall_score = None
        passes_individual_threshold = True
        passes_average_threshold = False
        passes_overall = False
        failed_controls = []

        if answered_controls > 0:
            # Calculate averages only for answered controls
            answered_scores = [cs for cs in control_scores if cs.has_answer]
            
            total_doc = sum(Decimal(str(cs.documentation_score)) for cs in answered_scores)
            total_impl = sum(Decimal(str(cs.implementation_score)) for cs in answered_scores)
            total_overall = sum(cs.overall_score for cs in answered_scores)
            
            n = Decimal(str(answered_controls))
            documentation_avg = (total_doc / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            implementation_avg = (total_impl / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            overall_score = (total_overall / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            # Check individual threshold: All answered controls must pass
            for cs in answered_scores:
                if not cs.passes_threshold:
                    passes_individual_threshold = False
                    failed_controls.append(cs.control_code)

            # Check average threshold
            passes_average_threshold = overall_score >= thresholds["average"]

            # Both conditions must be met
            passes_overall = passes_individual_threshold and passes_average_threshold

        return SubmeasureCompliance(
            submeasure_id=submeasure_id,
            submeasure_code=submeasure.code,
            controls=control_scores,
            documentation_avg=documentation_avg,
            implementation_avg=implementation_avg,
            overall_score=overall_score,
            passes_individual_threshold=passes_individual_threshold,
            passes_average_threshold=passes_average_threshold,
            passes_overall=passes_overall,
            total_controls=total_controls,
            answered_controls=answered_controls,
            mandatory_controls=mandatory_controls,
            mandatory_answered=mandatory_answered,
            failed_controls=failed_controls
        )

    async def calculate_measure_compliance(
        self,
        assessment_id: uuid.UUID,
        measure_id: uuid.UUID,
        security_level: str
    ) -> MeasureCompliance:
        """
        Calculate measure compliance.
        
        A measure passes only if ALL its submeasures pass.
        """
        # Get measure details
        measure_query = select(Measure).where(Measure.id == measure_id)
        measure_result = await self.db.execute(measure_query)
        measure = measure_result.scalar_one()

        # Get all submeasures for this measure
        submeasures_query = (
            select(Submeasure)
            .where(Submeasure.measure_id == measure_id)
            .order_by(Submeasure.order_index)
        )
        submeasures_result = await self.db.execute(submeasures_query)
        submeasures = list(submeasures_result.scalars().all())

        # Calculate compliance for each submeasure
        submeasure_compliances = []
        for submeasure in submeasures:
            compliance = await self.calculate_submeasure_compliance(
                assessment_id,
                submeasure.id,
                security_level
            )
            # Only include submeasures that have applicable controls for this security level
            if compliance.total_controls > 0:
                submeasure_compliances.append(compliance)

        # Calculate measure score (average of submeasure scores)
        scored_submeasures = [sc for sc in submeasure_compliances if sc.overall_score is not None]
        overall_score = None
        documentation_avg = None
        implementation_avg = None
        
        if scored_submeasures:
            # Calculate overall score average
            total_score = sum(sc.overall_score for sc in scored_submeasures)
            n = Decimal(str(len(scored_submeasures)))
            overall_score = (total_score / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            
            # Calculate documentation average (only from submeasures with documentation scores)
            doc_submeasures = [sc for sc in submeasure_compliances if sc.documentation_avg is not None]
            if doc_submeasures:
                total_doc = sum(sc.documentation_avg for sc in doc_submeasures)
                n_doc = Decimal(str(len(doc_submeasures)))
                documentation_avg = (total_doc / n_doc).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            
            # Calculate implementation average (only from submeasures with implementation scores)
            impl_submeasures = [sc for sc in submeasure_compliances if sc.implementation_avg is not None]
            if impl_submeasures:
                total_impl = sum(sc.implementation_avg for sc in impl_submeasures)
                n_impl = Decimal(str(len(impl_submeasures)))
                implementation_avg = (total_impl / n_impl).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Count passed submeasures
        passed_submeasures = sum(1 for sc in submeasure_compliances if sc.passes_overall)
        
        # Measure passes only if ALL submeasures pass
        passes_compliance = all(sc.passes_overall for sc in submeasure_compliances if sc.answered_controls > 0)
        
        # Identify critical failures
        critical_failures = [sc.submeasure_code for sc in submeasure_compliances if not sc.passes_overall and sc.answered_controls > 0]

        return MeasureCompliance(
            measure_id=measure_id,
            measure_code=measure.code,
            submeasures=submeasure_compliances,
            documentation_avg=documentation_avg,
            implementation_avg=implementation_avg,
            overall_score=overall_score,
            passes_compliance=passes_compliance,
            total_submeasures=len(submeasure_compliances),
            passed_submeasures=passed_submeasures,
            critical_failures=critical_failures
        )

    async def calculate_overall_compliance(
        self,
        assessment_id: uuid.UUID
    ) -> OverallCompliance:
        """
        Calculate overall compliance score: U = Σ(Mi) / n
        
        Assessment passes only if ALL measures pass.
        """
        # Get assessment details
        assessment_query = select(Assessment).where(Assessment.id == assessment_id)
        assessment_result = await self.db.execute(assessment_query)
        assessment = assessment_result.scalar_one()
        
        security_level = assessment.security_level.lower()
        thresholds = self._get_thresholds(security_level)
        maturity_threshold = self._get_maturity_threshold(security_level)

        # Get all measures
        measures_query = select(Measure).order_by(Measure.order_index)
        measures_result = await self.db.execute(measures_query)
        measures = list(measures_result.scalars().all())

        # Calculate compliance for each measure
        measure_compliances = []
        for measure in measures:
            compliance = await self.calculate_measure_compliance(
                assessment_id,
                measure.id,
                security_level
            )
            measure_compliances.append(compliance)

        # Calculate overall score
        scored_measures = [mc for mc in measure_compliances if mc.overall_score is not None]
        overall_score = None
        
        if scored_measures:
            total_score = sum(mc.overall_score for mc in scored_measures)
            n = Decimal(str(len(scored_measures)))
            overall_score = (total_score / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Count passed measures
        passed_measures = sum(1 for mc in measure_compliances if mc.passes_compliance)
        
        # Overall compliance requires ALL measures to pass
        passes_compliance = all(mc.passes_compliance for mc in measure_compliances if any(sc.answered_controls > 0 for sc in mc.submeasures))
        
        # Calculate compliance percentage
        total_measures = len(measure_compliances)
        compliance_percentage = Decimal("0")
        if total_measures > 0:
            compliance_percentage = (Decimal(str(passed_measures)) / Decimal(str(total_measures)) * Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        # Calculate maturity score (total passed submeasures)
        maturity_score = sum(mc.passed_submeasures for mc in measure_compliances)
        meets_maturity_trend = maturity_score >= maturity_threshold

        return OverallCompliance(
            assessment_id=assessment_id,
            security_level=security_level,
            measures=measure_compliances,
            overall_score=overall_score,
            compliance_percentage=compliance_percentage,
            passes_compliance=passes_compliance,
            total_measures=total_measures,
            passed_measures=passed_measures,
            maturity_score=maturity_score,
            maturity_threshold=maturity_threshold,
            meets_maturity_trend=meets_maturity_trend,
            individual_threshold=thresholds["individual"],
            average_threshold=thresholds["average"],
            calculated_at=datetime.now(timezone.utc)
        )

    async def store_compliance_results(self, compliance: OverallCompliance) -> None:
        """Store compliance results in database."""
        # Store submeasure scores
        for measure in compliance.measures:
            for submeasure in measure.submeasures:
                if submeasure.overall_score is not None:
                    await self._store_submeasure_score(
                        compliance.assessment_id,
                        submeasure
                    )
            
            # Store measure score
            if measure.overall_score is not None:
                await self._store_measure_score(
                    compliance.assessment_id,
                    measure
                )

        # Store overall compliance score
        await self._store_compliance_score(compliance)

        # Commit all changes
        await self.db.commit()

    async def _store_submeasure_score(
        self,
        assessment_id: uuid.UUID,
        compliance: SubmeasureCompliance
    ) -> None:
        """Store or update submeasure score."""
        existing_query = select(SubmeasureScoreModel).where(
            and_(
                SubmeasureScoreModel.assessment_id == assessment_id,
                SubmeasureScoreModel.submeasure_id == compliance.submeasure_id
            )
        )
        result = await self.db.execute(existing_query)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.documentation_avg = compliance.documentation_avg
            existing.implementation_avg = compliance.implementation_avg
            existing.overall_score = compliance.overall_score
            existing.passes_individual_threshold = compliance.passes_individual_threshold
            existing.passes_average_threshold = compliance.passes_average_threshold
            existing.passes_overall = compliance.passes_overall
            existing.total_controls = compliance.total_controls
            existing.answered_controls = compliance.answered_controls
            existing.mandatory_controls = compliance.mandatory_controls
            existing.mandatory_answered = compliance.mandatory_answered
            existing.failed_controls = compliance.failed_controls
            existing.updated_at = datetime.now(timezone.utc)
        else:
            # Create new
            new_score = SubmeasureScoreModel(
                assessment_id=assessment_id,
                submeasure_id=compliance.submeasure_id,
                documentation_avg=compliance.documentation_avg,
                implementation_avg=compliance.implementation_avg,
                overall_score=compliance.overall_score,
                passes_individual_threshold=compliance.passes_individual_threshold,
                passes_average_threshold=compliance.passes_average_threshold,
                passes_overall=compliance.passes_overall,
                total_controls=compliance.total_controls,
                answered_controls=compliance.answered_controls,
                mandatory_controls=compliance.mandatory_controls,
                mandatory_answered=compliance.mandatory_answered,
                failed_controls=compliance.failed_controls
            )
            self.db.add(new_score)

    async def _get_measure_distinct_control_counts(
        self,
        assessment_id: uuid.UUID,
        measure_id: uuid.UUID
    ) -> Dict[str, int]:
        """Get accurate control counts for a measure using DISTINCT to avoid double-counting."""
        
        # Get assessment details
        assessment_query = select(Assessment).where(Assessment.id == assessment_id)
        assessment_result = await self.db.execute(assessment_query)
        assessment = assessment_result.scalar_one()
        
        security_level = assessment.security_level
        version_id = assessment.version_id
        
        # Get total distinct controls for this measure
        total_controls_query = (
            select(func.count(func.distinct(Control.id)))
            .select_from(Control)
            .join(ControlRequirement, Control.id == ControlRequirement.control_id)
            .join(ControlSubmeasureMapping, Control.id == ControlSubmeasureMapping.control_id)
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(
                and_(
                    Submeasure.measure_id == measure_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.is_applicable == True,
                    Measure.version_id == version_id
                )
            )
        )
        total_controls = await self.db.scalar(total_controls_query) or 0
        
        # Get answered distinct controls for this measure
        answered_controls_query = (
            select(func.count(func.distinct(AssessmentAnswer.control_id)))
            .select_from(AssessmentAnswer)
            .join(Control, AssessmentAnswer.control_id == Control.id)
            .join(ControlSubmeasureMapping, and_(
                ControlSubmeasureMapping.control_id == Control.id,
                ControlSubmeasureMapping.submeasure_id == AssessmentAnswer.submeasure_id
            ))
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    Submeasure.measure_id == measure_id
                )
            )
        )
        answered_controls = await self.db.scalar(answered_controls_query) or 0
        
        # Get mandatory distinct controls for this measure
        mandatory_controls_query = (
            select(func.count(func.distinct(Control.id)))
            .select_from(Control)
            .join(ControlRequirement, Control.id == ControlRequirement.control_id)
            .join(ControlSubmeasureMapping, Control.id == ControlSubmeasureMapping.control_id)
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .join(Measure, Submeasure.measure_id == Measure.id)
            .where(
                and_(
                    Submeasure.measure_id == measure_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.is_applicable == True,
                    ControlRequirement.is_mandatory == True,
                    Measure.version_id == version_id
                )
            )
        )
        mandatory_controls = await self.db.scalar(mandatory_controls_query) or 0
        
        # Get answered mandatory distinct controls for this measure
        mandatory_answered_query = (
            select(func.count(func.distinct(AssessmentAnswer.control_id)))
            .select_from(AssessmentAnswer)
            .join(Control, AssessmentAnswer.control_id == Control.id)
            .join(ControlRequirement, Control.id == ControlRequirement.control_id)
            .join(ControlSubmeasureMapping, and_(
                ControlSubmeasureMapping.control_id == Control.id,
                ControlSubmeasureMapping.submeasure_id == AssessmentAnswer.submeasure_id
            ))
            .join(Submeasure, ControlSubmeasureMapping.submeasure_id == Submeasure.id)
            .where(
                and_(
                    AssessmentAnswer.assessment_id == assessment_id,
                    Submeasure.measure_id == measure_id,
                    ControlRequirement.level == security_level,
                    ControlRequirement.is_mandatory == True
                )
            )
        )
        mandatory_answered = await self.db.scalar(mandatory_answered_query) or 0
        
        return {
            "total_controls": total_controls,
            "answered_controls": answered_controls,
            "mandatory_controls": mandatory_controls,
            "mandatory_answered": mandatory_answered
        }

    async def _store_measure_score(
        self,
        assessment_id: uuid.UUID,
        compliance: MeasureCompliance
    ) -> None:
        """Store or update measure score."""
        existing_query = select(MeasureScoreModel).where(
            and_(
                MeasureScoreModel.assessment_id == assessment_id,
                MeasureScoreModel.measure_id == compliance.measure_id
            )
        )
        result = await self.db.execute(existing_query)
        existing = result.scalar_one_or_none()

        # Get accurate control counts using DISTINCT to avoid double-counting
        # controls that appear in multiple submeasures
        control_counts = await self._get_measure_distinct_control_counts(
            assessment_id, compliance.measure_id
        )
        
        total_controls = control_counts["total_controls"]
        answered_controls = control_counts["answered_controls"]
        mandatory_controls = control_counts["mandatory_controls"]
        mandatory_answered = control_counts["mandatory_answered"]

        if existing:
            # Update existing
            existing.documentation_avg = compliance.documentation_avg
            existing.implementation_avg = compliance.implementation_avg
            existing.overall_score = compliance.overall_score
            existing.passes_compliance = compliance.passes_compliance
            existing.total_submeasures = compliance.total_submeasures
            existing.passed_submeasures = compliance.passed_submeasures
            existing.critical_failures = compliance.critical_failures
            existing.total_controls = total_controls
            existing.answered_controls = answered_controls
            existing.mandatory_controls = mandatory_controls
            existing.mandatory_answered = mandatory_answered
            existing.updated_at = datetime.now(timezone.utc)
        else:
            # Create new
            new_score = MeasureScoreModel(
                assessment_id=assessment_id,
                measure_id=compliance.measure_id,
                documentation_avg=compliance.documentation_avg,
                implementation_avg=compliance.implementation_avg,
                overall_score=compliance.overall_score,
                passes_compliance=compliance.passes_compliance,
                total_submeasures=compliance.total_submeasures,
                passed_submeasures=compliance.passed_submeasures,
                critical_failures=compliance.critical_failures,
                total_controls=total_controls,
                answered_controls=answered_controls,
                mandatory_controls=mandatory_controls,
                mandatory_answered=mandatory_answered
            )
            self.db.add(new_score)

    async def _store_compliance_score(self, compliance: OverallCompliance) -> None:
        """Store or update overall compliance score."""
        existing_query = select(ComplianceScoreModel).where(
            ComplianceScoreModel.assessment_id == compliance.assessment_id
        )
        result = await self.db.execute(existing_query)
        existing = result.scalar_one_or_none()

        # Get accurate control counts from the assessment answer repository
        # This already uses DISTINCT to avoid double-counting
        from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
        answer_repo = AssessmentAnswerRepository(self.db)
        control_stats = await answer_repo.get_completion_stats(compliance.assessment_id)
        
        total_controls = control_stats["total_controls"]
        answered_controls = control_stats["answered_controls"]

        if existing:
            # Update existing
            existing.overall_compliance_score = compliance.overall_score
            existing.compliance_percentage = compliance.compliance_percentage
            existing.passes_compliance = compliance.passes_compliance
            existing.total_measures = compliance.total_measures
            existing.passed_measures = compliance.passed_measures
            existing.maturity_score = compliance.maturity_score
            existing.maturity_threshold = compliance.maturity_threshold
            existing.meets_maturity_trend = compliance.meets_maturity_trend
            existing.security_level = compliance.security_level
            existing.individual_threshold = compliance.individual_threshold
            existing.average_threshold = compliance.average_threshold
            existing.detailed_results = {
                "total_controls": total_controls,
                "answered_controls": answered_controls,
                "measures": [
                    {
                        "code": m.measure_code,
                        "score": float(m.overall_score) if m.overall_score else None,
                        "passes": m.passes_compliance,
                        "submeasures": [
                            {
                                "code": s.submeasure_code,
                                "score": float(s.overall_score) if s.overall_score else None,
                                "passes": s.passes_overall,
                                "failed_controls": s.failed_controls
                            }
                            for s in m.submeasures
                        ]
                    }
                    for m in compliance.measures
                ]
            }
            existing.updated_at = datetime.now(timezone.utc)
        else:
            # Create new
            new_score = ComplianceScoreModel(
                assessment_id=compliance.assessment_id,
                overall_compliance_score=compliance.overall_score,
                compliance_percentage=compliance.compliance_percentage,
                passes_compliance=compliance.passes_compliance,
                total_measures=compliance.total_measures,
                passed_measures=compliance.passed_measures,
                maturity_score=compliance.maturity_score,
                maturity_threshold=compliance.maturity_threshold,
                meets_maturity_trend=compliance.meets_maturity_trend,
                security_level=compliance.security_level,
                individual_threshold=compliance.individual_threshold,
                average_threshold=compliance.average_threshold,
                detailed_results={
                    "total_controls": total_controls,
                    "answered_controls": answered_controls,
                    "measures": [
                        {
                            "code": m.measure_code,
                            "score": float(m.overall_score) if m.overall_score else None,
                            "passes": m.passes_compliance,
                            "submeasures": [
                                {
                                    "code": s.submeasure_code,
                                    "score": float(s.overall_score) if s.overall_score else None,
                                    "passes": s.passes_overall,
                                    "failed_controls": s.failed_controls
                                }
                                for s in m.submeasures
                            ]
                        }
                        for m in compliance.measures
                    ]
                }
            )
            self.db.add(new_score)