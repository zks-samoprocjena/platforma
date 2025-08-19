"""Repository layer for data access."""

from .assessment import (
    AssessmentRepository,
    # AssessmentAnswerRepository_OLD,  # OBSOLETE - Use assessment_answer_repository.py instead
    AssessmentAuditRepository,
    AssessmentActivityRepository,
    AssessmentProgressRepository,
    AssessmentResultRepository,
)
from .base import BaseRepository
from .control_repository import ControlRepository
from .measure import MeasureRepository
from .organization import OrganizationRepository
from .document import (
    ProcessedDocumentRepository,
    DocumentChunkRepository, 
    AIRecommendationRepository,
)
from .assessment_insights_repository import AssessmentInsightsRepository

__all__ = [
    "BaseRepository",
    "AssessmentRepository",
    # "AssessmentAnswerRepository_OLD",  # OBSOLETE - Use assessment_answer_repository.py instead
    "AssessmentAuditRepository",
    "AssessmentActivityRepository",
    "AssessmentProgressRepository",
    "AssessmentResultRepository",
    "ControlRepository",
    "MeasureRepository",
    "OrganizationRepository",
    "ProcessedDocumentRepository",
    "DocumentChunkRepository",
    "AIRecommendationRepository",
    "AssessmentInsightsRepository",
]
