"""Organization service for registration and management."""
import uuid
from typing import Optional, Dict, Any
from datetime import datetime
import logging

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.services.keycloak_service import KeycloakService

logger = logging.getLogger(__name__)


class OrganizationService:
    """Service for organization operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def check_organization_exists(
        self, 
        name: Optional[str] = None, 
        code: Optional[str] = None
    ) -> Dict[str, Any]:
        """Check if organization exists by name or code."""
        if not name and not code:
            return {"exists": False, "organization_id": None}
        
        query = select(Organization).where(
            or_(
                Organization.name.ilike(f"%{name}%") if name else False,
                Organization.code.ilike(f"%{code}%") if code else False
            )
        )
        
        result = await self.db.execute(query)
        org = result.scalar_one_or_none()
        
        if org:
            return {
                "exists": True,
                "organization_id": str(org.id),
                "exact_match": (
                    (name and org.name.lower() == name.lower()) or 
                    (code and org.code.lower() == code.lower())
                )
            }
        
        return {"exists": False, "organization_id": None}
    
    async def create_organization_for_registration(
        self,
        name: str,
        code: str,
        type: str,
        security_level: str,
        admin_user_id: str,
        website: Optional[str] = None,
        size: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> Organization:
        """Create a new organization during registration."""
        # Check if code already exists
        existing = await self.db.execute(
            select(Organization).where(Organization.code == code.upper())
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Organization with code '{code}' already exists")
        
        # Create organization
        # If all required fields are provided, mark setup as completed
        has_all_required_fields = bool(name and code and type and security_level)
        
        org = Organization(
            id=uuid.uuid4(),
            code=code.upper(),
            name=name,
            type=type,
            security_level=security_level,
            description=f"Organization registered via self-service registration",
            active=True,
            website=website,
            size=size,
            admin_user_id=admin_user_id,
            registration_date=datetime.utcnow(),
            setup_completed=has_all_required_fields,  # Mark as completed if all fields present
            tenant_id=uuid.UUID(tenant_id) if tenant_id and len(tenant_id) == 36 else None
        )
        
        self.db.add(org)
        await self.db.commit()
        await self.db.refresh(org)
        
        # Update Keycloak user attributes and assign default role
        try:
            keycloak_service = KeycloakService()
            
            # Add user to organization
            org_success = await keycloak_service.add_user_to_organization(
                user_id=admin_user_id,
                organization_id=str(org.id),
                organization_name=org.name
            )
            
            # Assign default role to user (CRITICAL: ensures users have roles)
            role_success = await keycloak_service.assign_default_role(admin_user_id)
            
            if org_success and role_success:
                logger.info(f"Successfully updated Keycloak attributes and assigned default role to user {admin_user_id}")
            else:
                if not org_success:
                    logger.warning(f"Failed to update Keycloak organization attributes for user {admin_user_id}")
                if not role_success:
                    logger.warning(f"Failed to assign default role to user {admin_user_id}")
                    
        except Exception as e:
            logger.error(f"Error updating Keycloak attributes or assigning role: {e}")
            # Don't fail the organization creation, just log the error
        
        return org
    
    async def assign_user_to_organization(
        self,
        organization_id: str,
        user_id: str,
        is_admin: bool = False
    ) -> None:
        """Assign a user to an existing organization."""
        # Verify organization exists
        org = await self.db.get(Organization, uuid.UUID(organization_id))
        if not org:
            raise ValueError(f"Organization {organization_id} not found")
        
        # For now, we just log this assignment
        # In a full implementation, this would update a user_organizations table
        # or sync with Keycloak groups
        print(f"User {user_id} assigned to organization {organization_id} (admin: {is_admin})")
    
    async def complete_organization_setup(
        self,
        organization_id: str,
        updates: Dict[str, Any]
    ) -> Organization:
        """Complete organization setup with additional details."""
        org = await self.db.get(Organization, uuid.UUID(organization_id))
        if not org:
            raise ValueError(f"Organization {organization_id} not found")
        
        # Update organization with setup details
        for key, value in updates.items():
            if hasattr(org, key):
                setattr(org, key, value)
        
        org.setup_completed = True
        org.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(org)
        
        return org
    
    async def generate_unique_code(self, name: str) -> str:
        """Generate a unique organization code from name."""
        # Basic code generation: uppercase, replace spaces with hyphens
        base_code = name.upper().replace(' ', '-')
        # Remove special characters
        base_code = ''.join(c for c in base_code if c.isalnum() or c == '-')
        # Limit length
        base_code = base_code[:20]
        
        # Check if code exists and append number if needed
        code = base_code
        counter = 1
        
        while True:
            existing = await self.db.execute(
                select(Organization).where(Organization.code == code)
            )
            if not existing.scalar_one_or_none():
                break
            
            code = f"{base_code}-{counter}"
            counter += 1
        
        return code