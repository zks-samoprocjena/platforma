"""Compliance overview API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.services.compliance import ComplianceService
from app.schemas.compliance import (
    ComplianceStructureResponse,
    ComplianceSummaryResponse,
    QuestionnaireVersionResponse,
)

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.get(
    "/structure",
    response_model=ComplianceStructureResponse,
    summary="Get complete compliance structure",
    description="Retrieve the complete compliance structure including all measures, submeasures, and controls with their requirements.",
)
async def get_compliance_structure(
    db: AsyncSession = Depends(get_async_session),
) -> ComplianceStructureResponse:
    """Get the complete compliance structure."""
    service = ComplianceService(db)

    # Check if there's an active version
    if not await service.get_active_version():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questionnaire version found",
        )

    structure = await service.get_compliance_structure()
    return ComplianceStructureResponse(**structure)


@router.get(
    "/summary",
    response_model=ComplianceSummaryResponse,
    summary="Get compliance summary statistics",
    description="Retrieve high-level compliance statistics including counts by security level and requirement type.",
)
async def get_compliance_summary(
    db: AsyncSession = Depends(get_async_session),
) -> ComplianceSummaryResponse:
    """Get compliance summary statistics."""
    service = ComplianceService(db)

    # Check if there's an active version
    if not await service.get_active_version():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questionnaire version found",
        )

    summary = await service.get_compliance_summary()

    # Convert version separately to handle datetime serialization
    version_data = summary["version"]
    if version_data:
        version = QuestionnaireVersionResponse(
            id=version_data["id"],
            version_number=version_data["version_number"],
            description=version_data["description"],
            is_active=True,  # We know it's active from the health check
            created_at=version_data["created_at"],
        )
    else:
        version = None

    return ComplianceSummaryResponse(version=version, statistics=summary["statistics"])


@router.get(
    "/health",
    summary="Check compliance data health",
    description="Check if the compliance system is properly configured with an active questionnaire version.",
)
async def get_compliance_health(db: AsyncSession = Depends(get_async_session)) -> dict:
    """Health check for compliance data."""
    service = ComplianceService(db)

    has_active_version = await service.validate_version_active()

    if has_active_version:
        version = await service.get_active_version()
        summary = await service.get_compliance_summary()

        return {
            "status": "healthy",
            "active_version": {
                "id": str(version.id),
                "version_number": version.version_number,
                "created_at": version.created_at.isoformat(),
            },
            "data_counts": summary["statistics"],
        }
    else:
        return {
            "status": "no_data",
            "message": "No active questionnaire version found. Please import questionnaire data.",
            "active_version": None,
            "data_counts": {},
        }
