"""Import log model for tracking import operations."""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class ImportStatus(str, Enum):
    """Import operation status."""

    STARTED = "started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    VALIDATION_FAILED = "validation_failed"


class ImportType(str, Enum):
    """Type of import operation."""

    QUESTIONNAIRE = "questionnaire"
    DOCUMENT = "document"
    ORGANIZATION = "organization"


class ImportLog(BaseModel):
    """Log entry for import operations."""

    __tablename__ = "import_logs"

    # Import details
    import_type: Mapped[ImportType] = mapped_column(String(50), nullable=False)
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # Status and progress
    status: Mapped[ImportStatus] = mapped_column(
        String(50), nullable=False, default=ImportStatus.STARTED
    )
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Results
    records_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Questionnaire-specific fields
    questionnaire_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    measures_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    submeasures_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    controls_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Logs and errors
    log_messages: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validation_errors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Flags
    is_forced_reimport: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    validation_only: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    def add_log_message(self, message: str) -> None:
        """Add a log message to the import log."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_message = f"[{timestamp}] {message}\n"

        if self.log_messages:
            self.log_messages += new_message
        else:
            self.log_messages = new_message

    def set_error(self, error_message: str) -> None:
        """Set error message and update status."""
        self.error_message = error_message
        self.status = ImportStatus.FAILED
        self.completed_at = datetime.now(timezone.utc)

    def set_validation_errors(self, validation_errors: str) -> None:
        """Set validation errors and update status."""
        self.validation_errors = validation_errors
        self.status = ImportStatus.VALIDATION_FAILED
        self.completed_at = datetime.now(timezone.utc)

    def complete_import(self) -> None:
        """Mark import as completed."""
        self.status = ImportStatus.COMPLETED
        self.progress_percentage = 100
        self.completed_at = datetime.now(timezone.utc)

    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate import duration in seconds."""
        if not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def total_records(self) -> int:
        """Total records processed."""
        return self.records_created + self.records_updated + self.records_skipped
