"""Measures API endpoints."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.services.compliance import ComplianceService
from app.schemas.compliance import (
    MeasureResponse,
    MeasureSummaryResponse,
    SubmeasureResponse,
    ErrorResponse,
)
from app.models.reference import Submeasure

router = APIRouter(prefix="/measures", tags=["measures"])


@router.get(
    "/",
    response_model=List[MeasureSummaryResponse],
    summary="Get all compliance measures",
    description="Retrieve all compliance measures for the active questionnaire version with summary information.",
)
async def get_measures(
    db: AsyncSession = Depends(get_async_session),
) -> List[MeasureSummaryResponse]:
    """Get all measures for the active questionnaire version."""
    service = ComplianceService(db)

    # Check if there's an active version
    if not await service.validate_version_active():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questionnaire version found",
        )

    measures = await service.get_measures()

    # Convert to summary response - we'll need to get submeasures count separately
    result = []
    for measure in measures:
        submeasures_count = await service.measure_repo.db.execute(
            select(func.count(Submeasure.id)).where(Submeasure.measure_id == measure.id)
        )
        count = submeasures_count.scalar()

        result.append(
            MeasureSummaryResponse(
                id=measure.id,
                code=measure.code,
                name_hr=measure.name_hr,
                description_hr=measure.description_hr,
                order_index=measure.order_index,
                submeasures_count=count,
            )
        )

    return result


@router.get(
    "/{measure_id}",
    response_model=MeasureResponse,
    summary="Get measure by ID",
    description="Retrieve a specific measure with all submeasures and controls.",
    responses={404: {"model": ErrorResponse, "description": "Measure not found"}},
)
async def get_measure_by_id(
    measure_id: UUID, db: AsyncSession = Depends(get_async_session)
) -> MeasureResponse:
    """Get a specific measure with submeasures and controls."""
    service = ComplianceService(db)

    measure = await service.get_measure_by_id(measure_id)
    if not measure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Measure with ID {measure_id} not found",
        )

    return MeasureResponse.model_validate(measure)


@router.get(
    "/{measure_id}/submeasures",
    response_model=List[SubmeasureResponse],
    summary="Get submeasures for a specific measure",
    description="Retrieve all submeasures for a specific measure with control counts.",
    responses={404: {"model": ErrorResponse, "description": "Measure not found"}},
)
async def get_measure_submeasures(
    measure_id: UUID, db: AsyncSession = Depends(get_async_session)
) -> List[SubmeasureResponse]:
    """Get all submeasures for a specific measure."""
    service = ComplianceService(db)

    # Check if measure exists
    measure = await service.measure_repo.get_by_id(measure_id)
    if not measure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Measure with ID {measure_id} not found",
        )

    # Get submeasures for this measure
    submeasures = await service.get_submeasures_by_measure(measure_id)
    
    return [SubmeasureResponse.model_validate(submeasure) for submeasure in submeasures]
