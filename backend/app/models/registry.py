"""
Model registry to ensure proper import order and avoid circular dependencies.
Import all models here in dependency order.
"""

# Import base model first
from app.models.base import BaseModel

# Import models without dependencies first
from app.models.organization import Organization
from app.models.reference import (
    QuestionnaireVersion, 
    Measure, 
    Submeasure, 
    Control,
    ControlSubmeasureMapping,
    ControlRequirement
)

# Import document models
from app.models.document import ProcessedDocument, DocumentChunk, AIRecommendation

# Import document generation models
from app.models.document_generation import DocumentTemplate, DocumentGenerationJob

# Import import log model
from app.models.import_log import ImportLog

# Import Assessment and related models before scoring models
from app.models.assessment import (
    Assessment,
    AssessmentAnswer,
    AssessmentResult,
    AssessmentProgress,
    AssessmentAuditLog,
    AssessmentActivity,
    AssessmentAssignment
)

# Insights model (depends on Assessment and Organization)
from app.models.assessment_insights import AssessmentInsights

# Import scoring models after Assessment
from app.models.compliance_scoring_v2 import (
    ControlScoreHistory,
    SubmeasureScore,
    MeasureScore,
    ComplianceScore
)

# Export all models
__all__ = [
    'BaseModel',
    'Organization',
    'QuestionnaireVersion',
    'Measure',
    'Submeasure', 
    'Control',
    'ControlSubmeasureMapping',
    'ControlRequirement',
    'ProcessedDocument',
    'DocumentChunk',
    'AIRecommendation',
    'DocumentTemplate',
    'DocumentGenerationJob',
    'ImportLog',
    'Assessment',
    'AssessmentAnswer',
    'AssessmentResult',
    'AssessmentProgress',
    'AssessmentAuditLog',
    'AssessmentActivity',
    'AssessmentAssignment',
    'AssessmentInsights',
    'ControlScoreHistory',
    'SubmeasureScore',
    'MeasureScore',
    'ComplianceScore',
]