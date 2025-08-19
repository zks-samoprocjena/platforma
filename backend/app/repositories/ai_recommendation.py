"""Repository for AI Recommendation operations."""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import AIRecommendation
from app.models.reference import Control, ControlSubmeasureMapping, Submeasure
from app.repositories.base import BaseRepository


class AIRecommendationRepository(BaseRepository[AIRecommendation]):
    """Repository for AI recommendation operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, AIRecommendation)

    async def get_by_assessment_id(
        self,
        assessment_id: UUID,
        include_superseded: bool = False,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[AIRecommendation]:
        """Get all recommendations for an assessment."""
        query = select(self.model).where(
            self.model.assessment_id == assessment_id
        )
        
        if not include_superseded:
            query = query.where(self.model.is_active == True)
        
        # Apply filters
        if filters:
            if "priority" in filters and filters["priority"]:
                query = query.where(self.model.priority == filters["priority"])
            if "effort_estimate" in filters and filters["effort_estimate"]:
                query = query.where(self.model.effort_estimate == filters["effort_estimate"])
            if "is_implemented" in filters:
                query = query.where(self.model.is_implemented == filters["is_implemented"])
        
        # Include control relationship with submeasure mappings
        query = query.options(
            selectinload(self.model.control)
                .selectinload(Control.submeasure_mappings)
                .selectinload(ControlSubmeasureMapping.submeasure)
                .selectinload(Submeasure.measure)
        )
        
        # Order by impact score (highest first)
        query = query.order_by(self.model.impact_score.desc())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_by_control_id(
        self,
        assessment_id: UUID,
        control_id: UUID,
        active_only: bool = True
    ) -> Optional[AIRecommendation]:
        """Get recommendation for a specific control in an assessment."""
        query = select(self.model).where(
            and_(
                self.model.assessment_id == assessment_id,
                self.model.control_id == control_id
            )
        )
        
        if active_only:
            query = query.where(self.model.is_active == True)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def create_or_update(
        self,
        recommendation_data: Dict[str, Any]
    ) -> AIRecommendation:
        """Create or update a recommendation."""
        assessment_id = recommendation_data["assessment_id"]
        control_id = recommendation_data.get("control_id")
        
        # Check if recommendation exists for this control
        if control_id:
            existing = await self.get_by_control_id(assessment_id, control_id)
            if existing:
                # Update existing
                for key, value in recommendation_data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
                existing.updated_at = datetime.now(timezone.utc)
                await self.db.flush()
                return existing
        
        # Create new
        recommendation = self.model(**recommendation_data)
        self.db.add(recommendation)
        await self.db.flush()
        return recommendation
    
    async def mark_as_superseded(
        self,
        recommendation_id: UUID,
        superseded_by_id: Optional[UUID] = None
    ) -> bool:
        """Mark a recommendation as superseded."""
        stmt = (
            update(self.model)
            .where(self.model.id == recommendation_id)
            .values(
                is_active=False,
                superseded_by_id=superseded_by_id,
                updated_at=datetime.now(timezone.utc)
            )
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0
    
    async def mark_as_implemented(
        self,
        recommendation_id: UUID,
        implemented: bool = True
    ) -> bool:
        """Mark a recommendation as implemented."""
        stmt = (
            update(self.model)
            .where(self.model.id == recommendation_id)
            .values(
                is_implemented=implemented,
                implemented_at=datetime.now(timezone.utc) if implemented else None,
                updated_at=datetime.now(timezone.utc)
            )
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0
    
    async def get_control_ids_with_recommendations(
        self,
        assessment_id: UUID
    ) -> List[UUID]:
        """Get list of control IDs that already have recommendations."""
        query = (
            select(self.model.control_id)
            .where(
                and_(
                    self.model.assessment_id == assessment_id,
                    self.model.is_active == True,
                    self.model.control_id.isnot(None)
                )
            )
            .distinct()
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_recommendations_count(
        self,
        assessment_id: UUID,
        active_only: bool = True
    ) -> Dict[str, int]:
        """Get count of recommendations by various criteria."""
        base_query = select(func.count(self.model.id)).where(
            self.model.assessment_id == assessment_id
        )
        
        if active_only:
            base_query = base_query.where(self.model.is_active == True)
        
        # Total count
        total_result = await self.db.execute(base_query)
        total_count = total_result.scalar() or 0
        
        # Implemented count
        implemented_query = base_query.where(self.model.is_implemented == True)
        implemented_result = await self.db.execute(implemented_query)
        implemented_count = implemented_result.scalar() or 0
        
        # Count by priority
        priority_counts = {}
        for priority in ["high", "medium", "low"]:
            priority_query = base_query.where(self.model.priority == priority)
            priority_result = await self.db.execute(priority_query)
            priority_counts[priority] = priority_result.scalar() or 0
        
        return {
            "total": total_count,
            "implemented": implemented_count,
            "pending": total_count - implemented_count,
            "by_priority": priority_counts
        }
    
    async def bulk_create(
        self,
        recommendations: List[Dict[str, Any]]
    ) -> List[AIRecommendation]:
        """Create multiple recommendations at once."""
        recommendation_objects = []
        for rec_data in recommendations:
            recommendation = self.model(**rec_data)
            self.db.add(recommendation)
            recommendation_objects.append(recommendation)
        
        await self.db.flush()
        return recommendation_objects