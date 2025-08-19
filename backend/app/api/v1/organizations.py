"""Organization API endpoints."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.models.organization import Organization

from app.api.deps import get_db, get_current_user
from app.models.organization import User
from app.services.organization_service import OrganizationService


router = APIRouter(prefix="/organizations", tags=["organizations"])


# Request/Response schemas
class OrganizationCheckRequest(BaseModel):
    """Request to check if organization exists."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, min_length=1, max_length=50)


class OrganizationCheckResponse(BaseModel):
    """Response for organization existence check."""
    exists: bool
    organization_id: Optional[str] = None
    exact_match: Optional[bool] = None


class OrganizationRegisterRequest(BaseModel):
    """Request to register a new organization."""
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)
    type: str = Field(..., pattern="^(government|private-sector|critical-infrastructure|other)$")
    security_level: str = Field(..., pattern="^(osnovna|srednja|napredna)$")
    website: Optional[str] = Field(None, max_length=255)
    size: Optional[str] = Field(None, pattern="^(1-10|11-50|51-250|250\\+)$")
    admin_user_id: str = Field(..., description="Keycloak user ID")


class OrganizationRegisterResponse(BaseModel):
    """Response for organization registration."""
    organization_id: str
    requires_setup: bool
    code: str
    name: str


class GenerateCodeRequest(BaseModel):
    """Request to generate organization code."""
    name: str = Field(..., min_length=1, max_length=255)


class GenerateCodeResponse(BaseModel):
    """Response with generated code."""
    code: str


@router.post("/check", response_model=OrganizationCheckResponse)
async def check_organization_exists(
    request: OrganizationCheckRequest,
    db: AsyncSession = Depends(get_db)
) -> OrganizationCheckResponse:
    """Check if an organization exists by name or code."""
    service = OrganizationService(db)
    result = await service.check_organization_exists(
        name=request.name,
        code=request.code
    )
    return OrganizationCheckResponse(**result)


@router.post("/register", response_model=OrganizationRegisterResponse)
async def register_organization(
    request: OrganizationRegisterRequest,
    db: AsyncSession = Depends(get_db)
) -> OrganizationRegisterResponse:
    """Register a new organization during user registration."""
    print(f"Received registration request: {request.dict()}")
    service = OrganizationService(db)
    
    try:
        org = await service.create_organization_for_registration(
            name=request.name,
            code=request.code,
            type=request.type,
            security_level=request.security_level,
            admin_user_id=request.admin_user_id,
            website=request.website,
            size=request.size,
            tenant_id=request.admin_user_id  # Use user ID as tenant for now
        )
        
        return OrganizationRegisterResponse(
            organization_id=str(org.id),
            requires_setup=not org.setup_completed,
            code=org.code,
            name=org.name
        )
    except ValueError as e:
        if "already exists" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/generate-code", response_model=GenerateCodeResponse)
async def generate_organization_code(
    request: GenerateCodeRequest,
    db: AsyncSession = Depends(get_db)
) -> GenerateCodeResponse:
    """Generate a unique organization code from name."""
    service = OrganizationService(db)
    code = await service.generate_unique_code(request.name)
    return GenerateCodeResponse(code=code)


@router.get("/{organization_id}")
async def get_organization(
    organization_id: UUID,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get organization by ID."""
    org = await db.get(Organization, organization_id)
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization {organization_id} not found"
        )
    
    return {
        "id": str(org.id),
        "code": org.code,
        "name": org.name,
        "type": org.type,
        "security_level": org.security_level,
        "setup_completed": org.setup_completed,
        "active": org.active
    }


class CompleteSetupRequest(BaseModel):
    """Request to complete organization setup."""
    setup_completed: bool = True


@router.put("/{organization_id}/complete-setup")
async def complete_organization_setup(
    organization_id: UUID,
    request: CompleteSetupRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Complete organization setup with additional details."""
    # TODO: Add proper authentication and authorization
    # For now, allowing any authenticated user to complete setup
    
    service = OrganizationService(db)
    
    try:
        org = await service.complete_organization_setup(
            organization_id=str(organization_id),
            updates={"setup_completed": request.setup_completed}
        )
        return {
            "status": "success",
            "organization_id": str(org.id),
            "setup_completed": org.setup_completed
        }
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )