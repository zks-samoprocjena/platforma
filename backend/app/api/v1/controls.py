"""
Controls API V2 with M:N relationship support.
Replaces the obsolete controls.py API.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.services.compliance import ComplianceService
from app.schemas.compliance import (
    ControlSearchResponseV2 as ControlSearchResponse,
    ControlDetailResponseV2 as ControlDetailResponse,
    ErrorResponse,
    ControlResponseV2 as ControlResponse,
    ControlWithContextResponseV2 as ControlWithContextResponse,
)

router = APIRouter(prefix="/controls", tags=["controls"])


@router.get(
    "/",
    response_model=ControlSearchResponse,
    summary="Search controls with filters",
    description="Search and filter controls by various criteria including security level, measure, and text search.",
)
async def search_controls(
    search_term: Optional[str] = Query(
        None, description="Search term for control name/description/code"
    ),
    measure_id: Optional[UUID] = Query(None, description="Filter by measure ID"),
    submeasure_id: Optional[UUID] = Query(None, description="Filter by submeasure ID"),
    level: Optional[str] = Query(
        None, description="Filter by security level (osnovna/srednja/napredna)"
    ),
    mandatory_only: bool = Query(False, description="Show only mandatory controls"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results per page"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: AsyncSession = Depends(get_async_session),
) -> ControlSearchResponse:
    """Search controls with various filters."""
    service = ComplianceService(db)

    # Check if there's an active version
    version = await service.get_active_version()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questionnaire version found",
        )

    # Validate security level if provided
    if level:
        valid_levels = ["osnovna", "srednja", "napredna"]
        if level.lower() not in valid_levels:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid security level '{level}'. Must be one of: {valid_levels}",
            )

    try:
        result = await service.search_controls(
            search_term=search_term,
            measure_id=measure_id,
            submeasure_id=submeasure_id,
            level=level.lower() if level else None,
            mandatory_only=mandatory_only,
            limit=limit,
            offset=offset,
        )

        return ControlSearchResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/{control_id}",
    response_model=ControlDetailResponse,
    summary="Get control by ID",
    description="Retrieve a specific control with all submeasure contexts and requirements.",
    responses={404: {"model": ErrorResponse, "description": "Control not found"}},
)
async def get_control_by_id(
    control_id: UUID,
    submeasure_id: Optional[UUID] = Query(
        None, description="Get control in context of specific submeasure"
    ),
    db: AsyncSession = Depends(get_async_session),
) -> ControlDetailResponse:
    """Get a specific control with requirements and context."""
    service = ComplianceService(db)

    control_data = await service.get_control_details_with_context(
        control_id, submeasure_id
    )
    
    if not control_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Control with ID {control_id} not found",
        )

    control = control_data["control"]
    
    # If specific submeasure requested, return single context
    if submeasure_id and "submeasure" in control_data:
        return ControlDetailResponse(
            id=control.id,
            code=control.code,
            name_hr=control.name_hr,
            description_hr=control.description_hr,
            order_index=control_data["order_index"],
            requirements=[
                {
                    "level": req.level,
                    "is_mandatory": req.is_mandatory,
                    "is_applicable": req.is_applicable,
                    "minimum_score": req.minimum_score,
                }
                for req in control_data["requirements"]
            ],
            submeasure={
                "id": control_data["submeasure"].id,
                "code": control_data["submeasure"].code,
                "name_hr": control_data["submeasure"].name_hr,
                "order_index": control_data["submeasure"].order_index,
            },
            measure={
                "id": control_data["measure"].id,
                "code": control_data["measure"].code,
                "name_hr": control_data["measure"].name_hr,
                "order_index": control_data["measure"].order_index,
            },
        )
    
    # Return all submeasure contexts
    return ControlDetailResponse(
        id=control.id,
        code=control.code,
        name_hr=control.name_hr,
        description_hr=control.description_hr,
        order_index=0,  # Control itself doesn't have order, only in context of submeasure
        requirements=[],  # Requirements are per submeasure
        submeasure_contexts=[
            {
                "submeasure": {
                    "id": mapping["submeasure"].id,
                    "code": mapping["submeasure"].code,
                    "name_hr": mapping["submeasure"].name_hr,
                    "order_index": mapping["submeasure"].order_index,
                },
                "measure": {
                    "id": mapping["measure"].id,
                    "code": mapping["measure"].code,
                    "name_hr": mapping["measure"].name_hr,
                    "order_index": mapping["measure"].order_index,
                },
                "order_index": mapping["order_index"],
                "requirements": [
                    {
                        "level": req.level,
                        "is_mandatory": req.is_mandatory,
                        "is_applicable": req.is_applicable,
                        "minimum_score": req.minimum_score,
                    }
                    for req in mapping["requirements"]
                ]
            }
            for mapping in control_data.get("mappings", [])
        ]
    )


@router.get(
    "/level/{level}",
    response_model=list[ControlWithContextResponse],
    summary="Get controls by security level",
    description="Retrieve all controls applicable for a specific security level with submeasure context.",
    responses={400: {"model": ErrorResponse, "description": "Invalid security level"}},
)
async def get_controls_by_level(
    level: str,
    mandatory_only: bool = Query(False, description="Show only mandatory controls"),
    db: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """Get all controls for a specific security level with submeasure context."""
    service = ComplianceService(db)

    # Check if there's an active version
    version = await service.get_active_version()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questionnaire version found",
        )

    # Validate security level
    valid_levels = ["osnovna", "srednja", "napredna"]
    if level.lower() not in valid_levels:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid security level '{level}'. Must be one of: {valid_levels}",
        )

    try:
        controls_with_context = await service.get_controls_for_level(
            level.lower(), mandatory_only
        )
        
        # Format response
        formatted_controls = []
        for item in controls_with_context:
            formatted_controls.append({
                "control": {
                    "id": item["control"].id,
                    "code": item["control"].code,
                    "name_hr": item["control"].name_hr,
                    "description_hr": item["control"].description_hr,
                },
                "submeasure": {
                    "id": item["submeasure"].id,
                    "code": item["submeasure"].code,
                    "name_hr": item["submeasure"].name_hr,
                    "order_index": item["submeasure"].order_index,
                },
                "measure": {
                    "id": item["measure"].id,
                    "code": item["measure"].code,
                    "name_hr": item["measure"].name_hr,
                    "order_index": item["measure"].order_index,
                },
                "order_index": item["order_index"],
                "is_mandatory": item["requirement"].is_mandatory,
                "is_applicable": item["requirement"].is_applicable,
                "minimum_score": item["requirement"].minimum_score,
            })
        
        return formatted_controls

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))