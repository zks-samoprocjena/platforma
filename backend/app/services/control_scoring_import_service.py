"""Service for importing control scoring requirements with submeasure context."""
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from sqlalchemy.orm import selectinload
import uuid

from app.models import (
    Control,
    ControlRequirement,
    ControlRatingGuidance,
    SubmeasureThreshold,
    Submeasure,
    ControlSubmeasureMapping
)


logger = logging.getLogger(__name__)


class ControlScoringImportService:
    """Import control scoring requirements with submeasure-specific context."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.stats = {
            "controls_processed": 0,
            "requirements_created": 0,
            "requirements_updated": 0,
            "rating_guidance_created": 0,
            "submeasure_requirements_created": 0,
            "control_submeasure_mappings_created": 0,
            "errors": [],
            "warnings": []
        }
    
    async def import_all_data(self, data_dir: str) -> Dict:
        """Import all control scoring data with submeasure context."""
        data_path = Path(data_dir)
        
        try:
            # 1. Import control minimum scores with submeasure context
            context_file = data_path / "prilog_b_context_aware.json"
            if context_file.exists():
                await self._import_control_scores_with_context(context_file)
            else:
                # Fallback to old format
                prilog_b_file = data_path / "prilog_b_parsed.json"
                if prilog_b_file.exists():
                    await self._import_control_scores_legacy(prilog_b_file)
                else:
                    self.stats["errors"].append(f"No Prilog B data found")
            
            # 2. Import control rating guidance
            prilog_c_file = data_path / "prilog_c_parsed.json"
            if prilog_c_file.exists():
                await self._import_rating_guidance(prilog_c_file)
            else:
                self.stats["errors"].append(f"Prilog C file not found: {prilog_c_file}")
            
            # 3. Import submeasure requirements (A/B/C)
            submeasure_req_file = data_path / "submeasure_requirements_lookup.json"
            if submeasure_req_file.exists():
                await self._import_submeasure_requirements(submeasure_req_file)
            else:
                self.stats["errors"].append(f"Submeasure requirements file not found: {submeasure_req_file}")
            
            # Commit all changes
            await self.session.commit()
            
            logger.info(f"Import completed: {self.stats}")
            return self.stats
            
        except Exception as e:
            await self.session.rollback()
            logger.error(f"Import failed: {str(e)}")
            self.stats["errors"].append(f"Import failed: {str(e)}")
            raise
    
    async def _import_control_scores_with_context(self, file_path: Path) -> None:
        """Import control minimum scores with submeasure context."""
        logger.info(f"Importing control scores with submeasure context from {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Get all controls from database
        controls_result = await self.session.execute(select(Control))
        controls_by_code = {c.code: c for c in controls_result.scalars().all()}
        
        # Get all submeasures
        submeasures_result = await self.session.execute(select(Submeasure))
        submeasures_by_number = {s.code: s for s in submeasures_result.scalars().all()}
        
        # Define security levels
        security_levels = ['osnovna', 'srednja', 'napredna']
        levels_by_name = {level: level for level in security_levels}
        
        # Track which control-submeasure mappings we've created
        created_mappings = set()
        
        # Process control-submeasure scores
        control_submeasure_scores = data.get("control_submeasure_scores", {})
        
        for control_code, submeasure_scores in control_submeasure_scores.items():
            if control_code not in controls_by_code:
                self.stats["errors"].append(f"Control {control_code} not found in database")
                continue
            
            control = controls_by_code[control_code]
            self.stats["controls_processed"] += 1
            
            # Process each submeasure
            for submeasure_num, scores in submeasure_scores.items():
                if submeasure_num not in submeasures_by_number:
                    self.stats["warnings"].append(f"Submeasure {submeasure_num} not found in database")
                    continue
                
                submeasure = submeasures_by_number[submeasure_num]
                
                # Create control-submeasure mapping if not exists
                mapping_key = (control.id, submeasure.id)
                if mapping_key not in created_mappings:
                    # Check if mapping already exists
                    existing_mapping = await self.session.execute(
                        select(ControlSubmeasureMapping).where(
                            and_(
                                ControlSubmeasureMapping.control_id == control.id,
                                ControlSubmeasureMapping.submeasure_id == submeasure.id
                            )
                        )
                    )
                    
                    if not existing_mapping.scalar_one_or_none():
                        mapping = ControlSubmeasureMapping(
                            control_id=control.id,
                            submeasure_id=submeasure.id
                        )
                        self.session.add(mapping)
                        self.stats["control_submeasure_mappings_created"] += 1
                    
                    created_mappings.add(mapping_key)
                
                # Process each security level
                for level_name, score_value in scores.items():
                    if level_name in ["page", "table"]:  # Skip metadata
                        continue
                    
                    level = levels_by_name.get(level_name.lower())
                    if not level:
                        self.stats["warnings"].append(f"Security level {level_name} not found")
                        continue
                    
                    # Check if requirement already exists for this control-submeasure-level combination
                    existing = await self.session.execute(
                        select(ControlRequirement).where(
                            and_(
                                ControlRequirement.control_id == control.id,
                                ControlRequirement.level == level,
                                ControlRequirement.submeasure_id == submeasure.id
                            )
                        )
                    )
                    requirement = existing.scalar_one_or_none()
                    
                    if requirement:
                        # Update existing
                        requirement.minimum_score = score_value
                        requirement.is_required = score_value is not None
                        requirement.is_applicable = score_value is not None
                        self.stats["requirements_updated"] += 1
                    else:
                        # Create new
                        requirement = ControlRequirement(
                            control_id=control.id,
                            level=level,
                            submeasure_id=submeasure.id,
                            is_mandatory=score_value is not None,
                            is_applicable=score_value is not None,
                            minimum_score=score_value
                        )
                        self.session.add(requirement)
                        self.stats["requirements_created"] += 1
    
    async def _import_control_scores_legacy(self, file_path: Path) -> None:
        """Import control minimum scores without submeasure context (legacy format)."""
        logger.info(f"Importing control scores from legacy format {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Get all controls from database
        controls_result = await self.session.execute(select(Control))
        controls_by_code = {c.code: c for c in controls_result.scalars().all()}
        
        # Define security levels
        security_levels = ['osnovna', 'srednja', 'napredna']
        levels_by_name = {level: level for level in security_levels}
        
        # Process each control's scores
        for control_code, scores in data.get("controls", {}).items():
            if control_code not in controls_by_code:
                self.stats["errors"].append(f"Control {control_code} not found in database")
                continue
            
            control = controls_by_code[control_code]
            self.stats["controls_processed"] += 1
            
            # Process each security level (without submeasure context)
            for level_name, score_value in scores.items():
                if level_name == "page":  # Skip metadata
                    continue
                
                level = levels_by_name.get(level_name.lower())
                if not level:
                    self.stats["errors"].append(f"Security level {level_name} not found")
                    continue
                
                # Check if requirement already exists
                existing = await self.session.execute(
                    select(ControlRequirement).where(
                        and_(
                            ControlRequirement.control_id == control.id,
                            ControlRequirement.level == level,
                            ControlRequirement.submeasure_id.is_(None)  # Legacy: no submeasure
                        )
                    )
                )
                requirement = existing.scalar_one_or_none()
                
                if requirement:
                    # Update existing
                    requirement.minimum_score = score_value
                    requirement.is_required = score_value is not None
                    requirement.is_applicable = score_value is not None
                    self.stats["requirements_updated"] += 1
                else:
                    # Create new
                    requirement = ControlRequirement(
                        control_id=control.id,
                        security_level_id=level.id,
                        submeasure_id=None,  # Legacy: no submeasure context
                        is_required=score_value is not None,
                        is_applicable=score_value is not None,
                        minimum_score=score_value
                    )
                    self.session.add(requirement)
                    self.stats["requirements_created"] += 1
    
    async def _import_rating_guidance(self, file_path: Path) -> None:
        """Import control rating guidance from Prilog C."""
        logger.info(f"Importing rating guidance from {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Get all controls
        controls_result = await self.session.execute(select(Control))
        controls_by_code = {c.code: c for c in controls_result.scalars().all()}
        
        # Import general criteria (applies to all controls)
        general_criteria = data.get("general_criteria", [])
        if general_criteria:
            await self._import_general_rating_criteria(general_criteria, controls_by_code)
        
        # Import control-specific criteria if available
        control_specific = data.get("control_specific_criteria", {})
        for control_code, criteria in control_specific.items():
            if control_code not in controls_by_code:
                self.stats["warnings"].append(f"Control {control_code} not found for rating guidance")
                continue
            
            control = controls_by_code[control_code]
            await self._import_control_specific_criteria(control, criteria)
    
    async def _import_general_rating_criteria(self, criteria: List[Dict], controls_by_code: Dict) -> None:
        """Import general rating criteria for all controls."""
        logger.info("Importing general rating criteria")
        
        # Apply general criteria to all controls
        for control_code, control in controls_by_code.items():
            for criterion in criteria:
                score = criterion.get("score")
                doc_criteria = criterion.get("documentation_criteria", "")
                impl_criteria = criterion.get("implementation_criteria", "")
                
                if not score:
                    continue
                
                # Check if guidance already exists
                existing = await self.session.execute(
                    select(ControlRatingGuidance).where(
                        and_(
                            ControlRatingGuidance.control_id == control.id,
                            ControlRatingGuidance.score == score
                        )
                    )
                )
                
                if not existing.scalar_one_or_none():
                    guidance = ControlRatingGuidance(
                        control_id=control.id,
                        score=score,
                        documentation_criteria=doc_criteria,
                        implementation_criteria=impl_criteria
                    )
                    self.session.add(guidance)
                    self.stats["rating_guidance_created"] += 1
    
    async def _import_control_specific_criteria(self, control: Control, criteria: List[Dict]) -> None:
        """Import control-specific rating criteria."""
        for criterion in criteria:
            score = criterion.get("score")
            doc_criteria = criterion.get("documentation_criteria", "")
            impl_criteria = criterion.get("implementation_criteria", "")
            
            if not score:
                continue
            
            # Check if guidance already exists
            existing = await self.session.execute(
                select(ControlRatingGuidance).where(
                    and_(
                        ControlRatingGuidance.control_id == control.id,
                        ControlRatingGuidance.score == score
                    )
                )
            )
            
            guidance = existing.scalar_one_or_none()
            if guidance:
                # Update existing with control-specific criteria
                guidance.documentation_criteria = doc_criteria
                guidance.implementation_criteria = impl_criteria
            else:
                # Create new
                guidance = ControlRatingGuidance(
                    control_id=control.id,
                    score=score,
                    documentation_criteria=doc_criteria,
                    implementation_criteria=impl_criteria
                )
                self.session.add(guidance)
                self.stats["rating_guidance_created"] += 1
    
    async def _import_submeasure_requirements(self, file_path: Path) -> None:
        """Import submeasure requirements (A/B/C values)."""
        logger.info(f"Importing submeasure requirements from {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Get all submeasures
        submeasures_result = await self.session.execute(select(Submeasure))
        submeasures_by_number = {s.code: s for s in submeasures_result.scalars().all()}
        
        # Define security levels
        security_levels = ['osnovna', 'srednja', 'napredna']
        levels_by_name = {level: level for level in security_levels}
        
        # Process each submeasure
        for submeasure_num, requirements in data.items():
            submeasure = submeasures_by_number.get(submeasure_num)
            if not submeasure:
                self.stats["warnings"].append(f"Submeasure {submeasure_num} not found in database")
                continue
            
            # Process each security level
            for level_name, requirement_value in requirements.items():
                level = levels_by_name.get(level_name.lower())
                if not level:
                    continue
                
                # Map A/B/C to threshold values
                # A = Required (threshold 3.0)
                # B = Partially required (threshold 2.0)  
                # C = Not required (no threshold)
                threshold_map = {
                    'A': 3.0,
                    'B': 2.0,
                    'C': None
                }
                
                individual_threshold = threshold_map.get(requirement_value)
                
                # Check if threshold already exists
                existing = await self.session.execute(
                    select(SubmeasureThreshold).where(
                        and_(
                            SubmeasureThreshold.submeasure_id == submeasure.id,
                            SubmeasureThreshold.security_level == level
                        )
                    )
                )
                
                threshold = existing.scalar_one_or_none()
                if threshold:
                    # Update existing
                    threshold.individual_threshold = individual_threshold
                    threshold.average_threshold = individual_threshold  # Same for now
                else:
                    # Create new
                    if individual_threshold is not None:  # Only create if not C
                        threshold = SubmeasureThreshold(
                            submeasure_id=submeasure.id,
                            level=level,
                            individual_threshold=individual_threshold,
                            average_threshold=individual_threshold
                        )
                        self.session.add(threshold)
                        self.stats["submeasure_requirements_created"] += 1
    
    async def validate_import(self) -> Dict:
        """Validate the imported data."""
        validation_results = {
            "control_requirements": {
                "total": 0,
                "by_level": {},
                "with_submeasure": 0,
                "without_submeasure": 0
            },
            "control_submeasure_mappings": 0,
            "rating_guidance": {},
            "submeasure_thresholds": {},
            "issues": []
        }
        
        # Check control requirements
        result = await self.session.execute(
            select(ControlRequirement).options(
                selectinload(ControlRequirement.control),
                selectinload(ControlRequirement.security_level),
                selectinload(ControlRequirement.submeasure)
            )
        )
        requirements = result.scalars().all()
        
        validation_results["control_requirements"]["total"] = len(requirements)
        
        # Analyze requirements
        for req in requirements:
            level_name = req.security_level.name
            
            # Count by level
            if level_name not in validation_results["control_requirements"]["by_level"]:
                validation_results["control_requirements"]["by_level"][level_name] = 0
            validation_results["control_requirements"]["by_level"][level_name] += 1
            
            # Count with/without submeasure
            if req.submeasure_id:
                validation_results["control_requirements"]["with_submeasure"] += 1
            else:
                validation_results["control_requirements"]["without_submeasure"] += 1
        
        # Check control-submeasure mappings
        mappings_result = await self.session.execute(select(ControlSubmeasureMapping))
        validation_results["control_submeasure_mappings"] = len(mappings_result.scalars().all())
        
        # Check rating guidance
        guidance_result = await self.session.execute(
            select(ControlRatingGuidance.control_id).distinct()
        )
        controls_with_guidance = len(guidance_result.all())
        validation_results["rating_guidance"]["controls_with_guidance"] = controls_with_guidance
        
        # Check submeasure thresholds
        thresholds_result = await self.session.execute(
            select(SubmeasureThreshold).options(
                selectinload(SubmeasureThreshold.security_level)
            )
        )
        thresholds = thresholds_result.scalars().all()
        
        for threshold in thresholds:
            level_name = threshold.security_level.name
            if level_name not in validation_results["submeasure_thresholds"]:
                validation_results["submeasure_thresholds"][level_name] = 0
            validation_results["submeasure_thresholds"][level_name] += 1
        
        # Check for potential issues
        all_controls = await self.session.execute(select(Control))
        total_controls = len(all_controls.scalars().all())
        
        if controls_with_guidance < total_controls:
            validation_results["issues"].append(
                f"Missing rating guidance for {total_controls - controls_with_guidance} controls"
            )
        
        # Check for controls without any requirements
        controls_with_reqs = await self.session.execute(
            select(ControlRequirement.control_id).distinct()
        )
        controls_with_reqs_count = len(controls_with_reqs.all())
        
        if controls_with_reqs_count < total_controls:
            validation_results["issues"].append(
                f"{total_controls - controls_with_reqs_count} controls have no requirements"
            )
        
        return validation_results
    
    async def clear_existing_data(self) -> None:
        """Clear existing scoring data before import."""
        logger.warning("Clearing existing scoring data")
        
        # Delete in order to respect foreign key constraints
        await self.session.execute(delete(ControlRatingGuidance))
        await self.session.execute(delete(ControlRequirement))
        await self.session.execute(delete(ControlSubmeasureMapping))
        await self.session.execute(delete(SubmeasureThreshold))
        
        await self.session.commit()
        logger.info("Existing scoring data cleared")


async def run_import(session: AsyncSession, data_dir: str, clear_existing: bool = False) -> Dict:
    """Run the complete import process."""
    service = ControlScoringImportServiceV2(session)
    
    if clear_existing:
        await service.clear_existing_data()
    
    return await service.import_all_data(data_dir)