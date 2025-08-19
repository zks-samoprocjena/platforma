"""
OBSOLETE - DO NOT USE
Questionnaire importer for loading Excel data into database - Updated version.
This importer uses the old 1:N relationship model.
Use questionnaire_importer_v2.py instead which supports proper M:N relationships.
Marked obsolete on 2025-07-11.
"""
import hashlib
import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_async_session
from ..models.import_log import ImportLog, ImportStatus, ImportType
from ..models.reference import (
    QuestionnaireVersion,
    Measure,
    Submeasure,
    Control,
    ControlRequirement,
)
from ..parsers.excel_parser_updated import (
    ExcelParser,
    QuestionnaireData,
    validate_questionnaire_data,
    Control as ParsedControl,
)

logger = logging.getLogger(__name__)


class QuestionnaireImporterError(Exception):
    """Exception raised during questionnaire import."""

    pass


class QuestionnaireImporter:
    """Importer for questionnaire data from Excel files."""

    def __init__(self, db_session: AsyncSession, import_log: ImportLog):
        """Initialize importer with database session and import log."""
        self.db = db_session
        self.import_log = import_log
        # Track control IDs for deduplication
        self.control_id_map: Dict[str, str] = {}  # control_code -> control_id

    async def import_from_excel(
        self,
        excel_file_path: str | Path,
        force_reimport: bool = False,
        validation_only: bool = False,
    ) -> bool:
        """
        Import questionnaire data from Excel file.

        Args:
            excel_file_path: Path to Excel file
            force_reimport: Force reimport even if data exists
            validation_only: Only validate, don't import

        Returns:
            True if successful, False otherwise
        """
        try:
            excel_file_path = Path(excel_file_path)
            self.import_log.add_log_message(f"Starting import from: {excel_file_path}")
            self.import_log.is_forced_reimport = force_reimport
            self.import_log.validation_only = validation_only

            # Step 1: Parse Excel file
            self.import_log.add_log_message("Step 1: Parsing Excel file...")
            with ExcelParser(excel_file_path) as parser:
                questionnaire_data = parser.parse_questionnaire()
                statistics = parser.get_statistics()

            self.import_log.progress_percentage = 20

            # Step 2: Validate parsed data
            self.import_log.add_log_message("Step 2: Validating parsed data...")
            validation_result = validate_questionnaire_data(questionnaire_data)

            if not validation_result["is_valid"]:
                error_messages = "\n".join(validation_result["errors"])
                self.import_log.set_validation_errors(error_messages)
                return False

            if validation_result["warnings"]:
                warning_messages = "\n".join(validation_result["warnings"])
                self.import_log.add_log_message(
                    f"Validation warnings:\n{warning_messages}"
                )

            self.import_log.progress_percentage = 40

            # Update import log with parsed statistics
            stats = validation_result["statistics"]
            self.import_log.measures_count = stats["total_measures"]
            self.import_log.submeasures_count = stats["total_submeasures"]
            self.import_log.controls_count = stats["unique_controls"]
            
            # Log detailed statistics
            self.import_log.add_log_message(
                f"Parsed data statistics:\n"
                f"  - Measures: {statistics['measures']}\n"
                f"  - Submeasures: {statistics['submeasures']}\n"
                f"  - Unique controls: {statistics['unique_controls']}\n"
                f"  - Total requirements: {statistics['total_requirements']}\n"
                f"  - Submeasures with descriptions: {statistics['submeasures_with_descriptions']}"
            )

            if validation_only:
                self.import_log.add_log_message(
                    "Validation completed successfully (validation-only mode)"
                )
                self.import_log.complete_import()
                return True

            # Step 3: Check if version already exists
            self.import_log.add_log_message("Step 3: Checking for existing versions...")
            content_hash = self._calculate_content_hash(questionnaire_data)
            existing_version = await self._find_existing_version(content_hash)

            if existing_version and not force_reimport:
                self.import_log.add_log_message(
                    f"Version with content hash {content_hash[:8]}... already exists. "
                    "Use --force flag to reimport."
                )
                self.import_log.records_skipped = 1
                self.import_log.complete_import()
                return True

            self.import_log.progress_percentage = 60

            # Step 4: Import data
            self.import_log.add_log_message("Step 4: Importing questionnaire data...")

            if existing_version and force_reimport:
                # Deactivate existing version
                existing_version.is_active = False
                self.import_log.add_log_message(
                    f"Deactivated existing version: {existing_version.version_number}"
                )

            # Create new questionnaire version
            questionnaire_version = await self._create_questionnaire_version(
                questionnaire_data, content_hash
            )
            self.import_log.questionnaire_version_id = questionnaire_version.id

            self.import_log.progress_percentage = 80

            # Import measures, submeasures, and controls
            await self._import_measures(
                questionnaire_data.measures, questionnaire_version.id
            )

            self.import_log.progress_percentage = 100
            self.import_log.add_log_message("Import completed successfully")
            self.import_log.complete_import()

            await self.db.commit()
            return True

        except Exception as e:
            await self.db.rollback()
            error_msg = f"Import failed: {str(e)}"
            logger.exception(error_msg)
            self.import_log.set_error(error_msg)
            return False

    def _calculate_content_hash(self, data: QuestionnaireData) -> str:
        """Calculate content hash for the questionnaire data."""
        # Convert to JSON and hash
        json_str = json.dumps(data.to_dict(), sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(json_str.encode("utf-8")).hexdigest()

    async def _find_existing_version(
        self, content_hash: str
    ) -> Optional[QuestionnaireVersion]:
        """Find existing questionnaire version by content hash."""
        result = await self.db.execute(
            select(QuestionnaireVersion).where(
                QuestionnaireVersion.content_hash == content_hash
            )
        )
        return result.scalar_one_or_none()

    async def _create_questionnaire_version(
        self, data: QuestionnaireData, content_hash: str
    ) -> QuestionnaireVersion:
        """Create new questionnaire version."""
        # Deactivate all existing versions
        await self.db.execute(
            QuestionnaireVersion.__table__.update().values(is_active=False)
        )

        version = QuestionnaireVersion(
            version_number=data.version,
            content_hash=content_hash,
            is_active=True,
            description=f"Imported questionnaire with {len(data.measures)} measures",
        )

        self.db.add(version)
        await self.db.flush()  # Get the ID

        self.import_log.add_log_message(
            f"Created questionnaire version: {version.version_number}"
        )
        return version

    async def _import_measures(self, measures: List, version_id) -> None:
        """Import measures, submeasures, and controls with deduplication."""
        measures_created = 0
        submeasures_created = 0
        controls_created = 0
        requirements_created = 0
        
        # Track all unique controls across all submeasures
        all_unique_controls: Dict[str, ParsedControl] = {}

        # First pass: collect all unique controls
        for measure_data in measures:
            for submeasure_data in measure_data.submeasures:
                for control_data in submeasure_data.controls:
                    if control_data.code not in all_unique_controls:
                        all_unique_controls[control_data.code] = control_data

        self.import_log.add_log_message(
            f"Found {len(all_unique_controls)} unique controls to import"
        )

        # Import measures and submeasures
        for measure_data in measures:
            # Create measure
            measure = Measure(
                version_id=version_id,
                code=measure_data.code,
                name_hr=measure_data.title,
                description_hr=measure_data.description,
                order_index=measure_data.order_index,
            )
            self.db.add(measure)
            await self.db.flush()
            measures_created += 1

            # Create submeasures
            for submeasure_idx, submeasure_data in enumerate(measure_data.submeasures):
                submeasure = Submeasure(
                    measure_id=measure.id,
                    code=submeasure_data.code,
                    name_hr=submeasure_data.title,
                    description_hr=submeasure_data.description,  # Full description
                    order_index=submeasure_idx + 1,
                )
                self.db.add(submeasure)
                await self.db.flush()
                submeasures_created += 1

                # Create controls (only if not already created)
                for control_idx, control_data in enumerate(submeasure_data.controls):
                    if control_data.code not in self.control_id_map:
                        # Create control only once
                        control = Control(
                            submeasure_id=submeasure.id,
                            code=control_data.code,
                            name_hr=control_data.title,
                            description_hr=control_data.description,
                            order_index=control_idx + 1,
                        )
                        self.db.add(control)
                        await self.db.flush()
                        controls_created += 1
                        
                        # Store control ID for reuse
                        self.control_id_map[control_data.code] = str(control.id)
                        
                        # Create all requirements for this control
                        for requirement_data in control_data.requirements:
                            requirement = ControlRequirement(
                                control_id=control.id,
                                level=requirement_data.security_level.value,
                                is_mandatory=requirement_data.is_mandatory,
                                is_applicable=requirement_data.is_applicable,
                            )
                            self.db.add(requirement)
                            requirements_created += 1
                    else:
                        # Control already exists, just log it
                        logger.debug(
                            f"Control {control_data.code} already created, skipping"
                        )

        await self.db.flush()  # Ensure all entities are persisted

        self.import_log.records_created = (
            measures_created + submeasures_created + controls_created + requirements_created
        )
        self.import_log.add_log_message(
            f"Created: {measures_created} measures, {submeasures_created} submeasures, "
            f"{controls_created} unique controls, {requirements_created} requirements"
        )


async def import_questionnaire_from_excel(
    excel_file_path: str | Path,
    force_reimport: bool = False,
    validation_only: bool = False,
) -> Tuple[bool, ImportLog]:
    """
    High-level function to import questionnaire from Excel file.

    Args:
        excel_file_path: Path to Excel file
        force_reimport: Force reimport even if data exists
        validation_only: Only validate, don't import

    Returns:
        Tuple of (success, import_log)
    """
    excel_file_path = Path(excel_file_path)

    # Calculate file hash
    file_content = excel_file_path.read_bytes()
    file_hash = hashlib.sha256(file_content).hexdigest()

    # Create import log
    import_log = ImportLog(
        import_type=ImportType.QUESTIONNAIRE,
        source_file=str(excel_file_path),
        file_hash=file_hash,
        status=ImportStatus.STARTED,
    )

    async for db in get_async_session():
        db.add(import_log)
        await db.flush()  # Get the ID

        # Create importer and run import
        importer = QuestionnaireImporter(db, import_log)
        success = await importer.import_from_excel(
            excel_file_path, force_reimport, validation_only
        )

        break  # Exit the async generator loop

    return success, import_log