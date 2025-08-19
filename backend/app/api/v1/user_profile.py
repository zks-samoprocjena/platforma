"""User profile API endpoints."""

from typing import Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.models.organization import User
from app.services.keycloak_service import KeycloakService

router = APIRouter()


class UserProfileResponse(BaseModel):
    """User profile response model."""
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None
    roles: list[str] = []
    organization_id: str
    organization_name: Optional[str] = None
    
    # Profile attributes (editable)
    job_title: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    responsibilities: Optional[str] = None


class UpdateUserProfileRequest(BaseModel):
    """Request model for updating user profile."""
    job_title: Optional[str] = Field(None, max_length=100, description="Job title (e.g., CISO, IT Manager)")
    department: Optional[str] = Field(None, max_length=100, description="Department (e.g., IT, Security)")
    phone: Optional[str] = Field(None, max_length=20, description="Contact phone number")
    location: Optional[str] = Field(None, max_length=100, description="Work location")
    responsibilities: Optional[str] = Field(None, max_length=500, description="Job responsibilities")


class UserRolesResponse(BaseModel):
    """Response model for user roles information."""
    jwt_roles: list[str]
    keycloak_roles: list[str]
    roles_match: bool


class UserProfileService:
    """Service for user profile operations."""
    
    def __init__(self):
        self.keycloak_service = KeycloakService()
    
    async def get_user_profile(self, user: User) -> UserProfileResponse:
        """Get user profile data including Keycloak attributes."""
        try:
            # Get user data from Keycloak
            keycloak_user = await self.keycloak_service.get_user_by_id(user.id)
            
            if not keycloak_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found in Keycloak"
                )
            
            # Extract user attributes
            attributes = keycloak_user.get('attributes', {})
            
            # Keycloak stores attributes as arrays, so we take the first value
            def get_attr(key: str) -> Optional[str]:
                attr_value = attributes.get(key, [])
                return attr_value[0] if attr_value else None
            
            return UserProfileResponse(
                user_id=user.id,
                email=user.email,
                name=user.name,
                roles=user.roles,
                organization_id=user.organization_id,
                organization_name=user.organization_name,
                job_title=get_attr('job_title'),
                department=get_attr('department'),
                phone=get_attr('phone'),
                location=get_attr('location'),
                responsibilities=get_attr('responsibilities')
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error retrieving user profile: {str(e)}"
            )
    
    async def update_user_profile(
        self, 
        user: User, 
        profile_data: UpdateUserProfileRequest
    ) -> UserProfileResponse:
        """Update user profile attributes in Keycloak."""
        try:
            # Prepare attributes for update (only include provided fields)
            attributes_to_update = {}
            
            if profile_data.job_title is not None:
                attributes_to_update['job_title'] = profile_data.job_title
            if profile_data.department is not None:
                attributes_to_update['department'] = profile_data.department
            if profile_data.phone is not None:
                attributes_to_update['phone'] = profile_data.phone
            if profile_data.location is not None:
                attributes_to_update['location'] = profile_data.location
            if profile_data.responsibilities is not None:
                attributes_to_update['responsibilities'] = profile_data.responsibilities
            
            if not attributes_to_update:
                # No changes to make, return current profile
                return await self.get_user_profile(user)
            
            # Update attributes in Keycloak
            success = await self.keycloak_service.update_user_attributes(
                user.id, 
                attributes_to_update
            )
            
            if not success:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update user profile in Keycloak"
                )
            
            # Return updated profile
            return await self.get_user_profile(user)
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error updating user profile: {str(e)}"
            )


@router.get("/profile", response_model=UserProfileResponse)
async def get_user_profile(
    current_user: User = Depends(get_current_user)
) -> UserProfileResponse:
    """
    Get current user's profile including roles and attributes.
    
    Returns:
    - System roles (read-only from JWT token)
    - Profile attributes (editable via PUT endpoint)
    """
    service = UserProfileService()
    return await service.get_user_profile(current_user)


@router.put("/profile", response_model=UserProfileResponse)
async def update_user_profile(
    profile_data: UpdateUserProfileRequest,
    current_user: User = Depends(get_current_user)
) -> UserProfileResponse:
    """
    Update current user's profile attributes.
    
    Note: System roles cannot be changed via this endpoint.
    Only profile attributes (job_title, department, etc.) can be updated.
    """
    service = UserProfileService()
    return await service.update_user_profile(current_user, profile_data)


@router.get("/roles", response_model=UserRolesResponse)
async def get_user_roles(
    current_user: User = Depends(get_current_user)
) -> UserRolesResponse:
    """
    Get current user's system roles.
    
    This endpoint provides role information for UI display purposes.
    Returns both JWT roles and fresh Keycloak roles for comparison.
    """
    try:
        keycloak_service = KeycloakService()
        
        # Get fresh roles from Keycloak
        keycloak_roles = await keycloak_service.get_user_roles(current_user.id)
        
        return UserRolesResponse(
            jwt_roles=current_user.roles,  # From current JWT token
            keycloak_roles=keycloak_roles,  # Fresh from Keycloak
            roles_match=set(current_user.roles) == set(keycloak_roles)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving user roles: {str(e)}"
        ) 