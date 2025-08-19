"""
Questionnaire importer v2 that creates proper M:N relationships.
This importer uses the new parser and creates the correct database structure.
"""
import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple
from uuid import UUID
import asyncio

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.reference import (
    QuestionnaireVersion, Measure, Submeasure, Control,
    ControlSubmeasureMapping, ControlRequirement
)
from app.models.import_log import ImportLog
from app.parsers.excel_parser import ExcelParser, ParsedData

logger = logging.getLogger(__name__)


class QuestionnaireImporter:
    """Importer that creates proper M:N relationships."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def import_questionnaire(
        self, 
        excel_path: Path,
        version_number: Optional[str] = None,
        force: bool = False
    ) -> QuestionnaireVersion:
        """
        Import questionnaire with clean structure.
        
        Args:
            excel_path: Path to Excel file
            version_number: Version number (auto-generated if not provided)
            force: Force reimport even if version exists
        
        Returns:
            Created or existing QuestionnaireVersion
        """
        logger.info(f"Starting import from {excel_path}")
        
        # Calculate content hash
        content_hash = self._calculate_file_hash(excel_path)
        
        # Check if version already exists
        existing = await self._get_existing_version(content_hash)
        if existing and not force:
            logger.info(f"Version already exists: {existing.version_number}")
            return existing
        
        # Parse Excel
        parser = ExcelParser(excel_path)
        data = parser.parse()
        
        # Create version
        version = await self._create_version(
            data, content_hash, version_number, excel_path.name
        )
        
        # Import measures and submeasures
        measure_map = await self._import_measures(data.measures, version.id)
        submeasure_map = await self._import_submeasures(data.submeasures, measure_map)
        
        # Import unique controls
        control_map = await self._import_controls(data.controls)
        
        # Create all mappings and requirements
        await self._create_mappings_and_requirements(
            data.mappings, control_map, submeasure_map
        )
        
        # Apply minimum scores from Prilog B data if available
        await self._apply_minimum_scores()
        
        # Commit everything
        await self.db.commit()
        
        logger.info(f"Import complete: {len(data.controls)} unique controls, "
                   f"{len(data.mappings)} mappings")
        
        # Log verification counts
        await self._log_verification_counts(version.id)
        
        return version
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file content."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    async def _get_existing_version(self, content_hash: str) -> Optional[QuestionnaireVersion]:
        """Check if version with this content already exists."""
        result = await self.db.execute(
            select(QuestionnaireVersion).where(
                QuestionnaireVersion.content_hash == content_hash
            )
        )
        return result.scalar_one_or_none()
    
    async def _create_version(
        self,
        data: ParsedData,
        content_hash: str,
        version_number: Optional[str],
        source_file: str
    ) -> QuestionnaireVersion:
        """Create questionnaire version."""
        if not version_number:
            # Auto-generate version number
            from datetime import datetime
            version_number = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        version = QuestionnaireVersion(
            version_number=version_number,
            description=f"Imported from {source_file}",
            content_hash=content_hash,
            is_active=True,  # Set as active by default
            source_file=source_file
        )
        
        # Deactivate other versions
        await self.db.execute(
            QuestionnaireVersion.__table__.update().values(is_active=False)
        )
        
        self.db.add(version)
        await self.db.flush()
        
        logger.info(f"Created version: {version.version_number}")
        return version
    
    async def _import_measures(
        self,
        measures: Dict[str, dict],
        version_id: UUID
    ) -> Dict[str, UUID]:
        """Import measures and return mapping of code to ID."""
        measure_map = {}
        
        for code, measure_data in measures.items():
            measure = Measure(
                version_id=version_id,
                code=measure_data['code'],
                name_hr=measure_data['name'],
                description_hr=measure_data['description'],
                order_index=measure_data['order_index']
            )
            self.db.add(measure)
            await self.db.flush()
            measure_map[code] = measure.id
            
        logger.info(f"Created {len(measure_map)} measures")
        return measure_map
    
    async def _import_submeasures(
        self,
        submeasures: Dict[str, dict],
        measure_map: Dict[str, UUID]
    ) -> Dict[str, UUID]:
        """Import submeasures and return mapping of key to ID."""
        submeasure_map = {}
        
        for key, submeasure_data in submeasures.items():
            measure_id = measure_map[submeasure_data['measure_code']]
            
            submeasure = Submeasure(
                measure_id=measure_id,
                code=submeasure_data['code'],
                name_hr=submeasure_data['name'],
                description_hr=submeasure_data['description'],
                order_index=submeasure_data['order_index']
            )
            self.db.add(submeasure)
            await self.db.flush()
            submeasure_map[key] = submeasure.id
            
        logger.info(f"Created {len(submeasure_map)} submeasures")
        return submeasure_map
    
    async def _import_controls(self, controls: Dict[str, any]) -> Dict[str, UUID]:
        """Import unique controls."""
        control_map = {}
        
        for code, control in controls.items():
            db_control = Control(
                code=control.code,
                name_hr=control.title,
                description_hr=control.description
            )
            self.db.add(db_control)
            await self.db.flush()
            control_map[code] = db_control.id
            
        logger.info(f"Created {len(control_map)} unique controls")
        return control_map
    
    async def _create_mappings_and_requirements(
        self, 
        mappings: list,
        control_map: Dict[str, UUID],
        submeasure_map: Dict[str, UUID]
    ):
        """Create control-submeasure mappings and requirements."""
        # Track unique mappings to avoid duplicates
        created_mappings = set()
        requirement_count = 0
        
        for mapping in mappings:
            control_id = control_map[mapping.control_code]
            submeasure_id = submeasure_map[mapping.submeasure_key]
            
            # Create mapping if not exists
            mapping_key = (control_id, submeasure_id)
            if mapping_key not in created_mappings:
                csm = ControlSubmeasureMapping(
                    control_id=control_id,
                    submeasure_id=submeasure_id,
                    order_index=mapping.order_index
                )
                self.db.add(csm)
                created_mappings.add(mapping_key)
            
            # Create requirement for this level
            req = ControlRequirement(
                control_id=control_id,
                submeasure_id=submeasure_id,
                level=mapping.level,
                is_mandatory=mapping.is_mandatory,
                is_applicable=mapping.is_applicable
            )
            self.db.add(req)
            requirement_count += 1
            
        await self.db.flush()
        logger.info(f"Created {len(created_mappings)} mappings and {requirement_count} requirements")
    
    async def _log_verification_counts(self, version_id: UUID):
        """Log verification counts for imported data."""
        # Count controls
        control_count = await self.db.scalar(select(func.count(Control.id)))
        logger.info(f"Total unique controls: {control_count}")
        
        # Count requirements by level
        for level in ['osnovna', 'srednja', 'napredna']:
            count = await self.db.scalar(
                select(func.count())
                .select_from(ControlRequirement)
                .where(ControlRequirement.level == level)
            )
            logger.info(f"Requirements for {level}: {count}")
    
    async def _apply_minimum_scores(self):
        """Apply minimum scores from Prilog B data if available."""
        # Look for Prilog B data in standard locations
        prilog_b_paths = [
            Path("/app/specification/extracted-data/prilog_b_parsed.json"),
            Path("/mnt/shared/_Projects/ai/specijalisticki_rad/specification/extracted-data/prilog_b_parsed.json"),
        ]
        
        prilog_b_data = None
        for path in prilog_b_paths:
            if path.exists():
                logger.info(f"Loading minimum scores from {path}")
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        prilog_b_data = json.load(f)
                    break
                except Exception as e:
                    logger.warning(f"Failed to load {path}: {e}")
                    continue
        
        if not prilog_b_data:
            logger.warning("No Prilog B data found - minimum scores will not be applied")
            return
        
        # Get all controls from database
        controls_result = await self.db.execute(select(Control))
        controls_by_code = {c.code: c for c in controls_result.scalars().all()}
        
        scores_applied = 0
        scores_skipped = 0
        
        # Apply minimum scores to control requirements
        for control_code, scores in prilog_b_data.get("controls", {}).items():
            if control_code not in controls_by_code:
                logger.debug(f"Control {control_code} not found in database")
                scores_skipped += 1
                continue
            
            control = controls_by_code[control_code]
            
            # Update requirements for each security level
            for level in ['osnovna', 'srednja', 'napredna']:
                if level in scores and scores[level] is not None:
                    minimum_score = float(scores[level])
                    
                    # Update all requirements for this control at this level
                    result = await self.db.execute(
                        select(ControlRequirement).where(
                            and_(
                                ControlRequirement.control_id == control.id,
                                ControlRequirement.level == level
                            )
                        )
                    )
                    
                    requirements = result.scalars().all()
                    for req in requirements:
                        req.minimum_score = minimum_score
                        scores_applied += 1
        
        logger.info(f"Applied minimum scores: {scores_applied} updated, {scores_skipped} skipped")


async def main():
    """Test the importer."""
    import sys
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Test file
    test_file = Path("/tmp/questionnaire.xlsx")
    
    if not test_file.exists():
        logger.error(f"Test file not found: {test_file}")
        sys.exit(1)
    
    # Import
    async with AsyncSessionLocal() as db:
        try:
            importer = QuestionnaireImporterV2(db)
            version = await importer.import_questionnaire(
                test_file,
                version_number="2025.1",
                force=True
            )
            
            print(f"\nImport successful!")
            print(f"Version: {version.version_number}")
            print(f"ID: {version.id}")
            
        except Exception as e:
            logger.error(f"Import failed: {e}")
            await db.rollback()
            raise


async def import_questionnaire_from_excel(
    excel_file_path: str | Path,
    force_reimport: bool = False,
    validation_only: bool = False,
) -> Tuple[bool, ImportLog]:
    """
    High-level function to import questionnaire from Excel file.
    Wrapper for compatibility with CLI.
    
    Args:
        excel_file_path: Path to Excel file
        force_reimport: Force reimport even if data exists
        validation_only: If True, only validate without importing (not implemented in V2)
        
    Returns:
        Tuple of (success: bool, import_log: ImportLog)
    """
    from app.core.database import AsyncSessionLocal
    from app.models.import_log import ImportLog, ImportStatus, ImportType
    import hashlib
    from datetime import datetime
    
    if validation_only:
        logger.warning("Validation-only mode not implemented in V2 importer, proceeding with full import")
    
    excel_path = Path(excel_file_path)
    
    # Calculate file hash
    file_content = excel_path.read_bytes()
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    # Create import log
    import_log = ImportLog(
        import_type=ImportType.QUESTIONNAIRE,
        source_file=str(excel_path),
        file_hash=file_hash,
        status=ImportStatus.IN_PROGRESS,
        started_at=datetime.utcnow(),
    )
    
    async with AsyncSessionLocal() as db:
        try:
            db.add(import_log)
            await db.flush()
            
            # Create importer and run import
            importer = QuestionnaireImporterV2(db)
            version = await importer.import_questionnaire(
                excel_path,
                force=force_reimport
            )
            
            # Update import log with success
            import_log.status = ImportStatus.COMPLETED
            import_log.completed_at = datetime.utcnow()
            import_log.records_created = 1  # Version created
            
            # Try to get counts from parsed data
            parser = ExcelParser(excel_path)
            data = parser.parse()
            import_log.measures_count = len(data.measures)
            import_log.submeasures_count = len(data.submeasures)
            import_log.controls_count = len(data.controls)
            
            await db.commit()
            return True, import_log
            
        except Exception as e:
            logger.error(f"Import failed: {str(e)}")
            import_log.status = ImportStatus.FAILED
            import_log.completed_at = datetime.utcnow()
            import_log.error_message = str(e)
            
            await db.commit()
            return False, import_log


if __name__ == "__main__":
    asyncio.run(main())