from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment_insights import AssessmentInsights
from app.repositories.base import BaseRepository


class AssessmentInsightsRepository(BaseRepository[AssessmentInsights]):
    """Repository for persisted assessment insights."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AssessmentInsights)

    async def get_by_assessment_id(self, assessment_id: UUID) -> Optional[AssessmentInsights]:
        query = select(AssessmentInsights).where(AssessmentInsights.assessment_id == assessment_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def upsert(
        self,
        *,
        assessment_id: UUID,
        organization_id: UUID,
        computed_at,
        gaps: list,
        roadmap: dict,
        ai_summary: Optional[str],
        measures_ai: dict,
        status: str = "ok",
        source_version: str = "v1",
        error_message: Optional[str] = None,
        computed_by: Optional[UUID] = None,
    ) -> AssessmentInsights:
        existing = await self.get_by_assessment_id(assessment_id)
        if existing:
            existing.organization_id = organization_id
            existing.computed_at = computed_at
            existing.gaps = gaps
            existing.roadmap = roadmap
            existing.ai_summary = ai_summary
            existing.measures_ai = measures_ai
            existing.status = status
            existing.source_version = source_version
            existing.error_message = error_message
            existing.computed_by = computed_by
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        else:
            instance = AssessmentInsights(
                assessment_id=assessment_id,
                organization_id=organization_id,
                computed_at=computed_at,
                gaps=gaps,
                roadmap=roadmap,
                ai_summary=ai_summary,
                measures_ai=measures_ai,
                status=status,
                source_version=source_version,
                error_message=error_message,
                computed_by=computed_by,
            )
            self.db.add(instance)
            await self.db.flush()
            await self.db.refresh(instance)
            return instance

    async def mark_stale(self, assessment_id: UUID) -> bool:
        existing = await self.get_by_assessment_id(assessment_id)
        if not existing:
            return False
        existing.status = "stale"
        await self.db.flush()
        return True 