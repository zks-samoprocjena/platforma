"""Keycloak integration service for updating user attributes."""
import os
import httpx
from typing import Dict, Optional, List
import logging

logger = logging.getLogger(__name__)

class KeycloakService:
    """Service for interacting with Keycloak Admin API."""
    
    def __init__(self):
        self.keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
        self.realm = os.getenv("KEYCLOAK_REALM", "assessment-platform")
        self.admin_username = os.getenv("KEYCLOAK_ADMIN_USERNAME", "admin")
        self.admin_password = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
        self._admin_token = None
        
        # Default role for MVP
        self.DEFAULT_ROLE = "assessment_editor"
        
    async def _get_admin_token(self) -> str:
        """Get admin access token for Keycloak API."""
        if self._admin_token:
            # TODO: Check if token is still valid
            return self._admin_token
            
        token_url = f"{self.keycloak_url}/realms/master/protocol/openid-connect/token"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "password",
                    "client_id": "admin-cli",
                    "username": self.admin_username,
                    "password": self.admin_password
                }
            )
            
            if response.status_code != 200:
                logger.error(f"Failed to get admin token: {response.text}")
                raise Exception("Failed to authenticate with Keycloak")
                
            data = response.json()
            self._admin_token = data["access_token"]
            return self._admin_token

    async def _get_realm_role(self, role_name: str) -> Optional[Dict]:
        """Get realm role by name.
        
        Args:
            role_name: Role name to get
            
        Returns:
            Role data dict or None if not found
        """
        try:
            token = await self._get_admin_token()
            role_url = f"{self.keycloak_url}/admin/realms/{self.realm}/roles/{role_name}"
            
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(role_url, headers=headers)
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    logger.warning(f"Role {role_name} not found in realm {self.realm}")
                    return None
                else:
                    logger.error(f"Failed to get role {role_name}: {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting realm role {role_name}: {e}")
            return None

    async def get_user_roles(self, user_id: str) -> List[str]:
        """Get user's current realm roles.
        
        Args:
            user_id: Keycloak user ID
            
        Returns:
            List of role names
        """
        try:
            token = await self._get_admin_token()
            roles_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
            
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(roles_url, headers=headers)
                
                if response.status_code == 200:
                    roles_data = response.json()
                    role_names = [role["name"] for role in roles_data]
                    logger.info(f"User {user_id} has roles: {role_names}")
                    return role_names
                else:
                    logger.error(f"Failed to get user {user_id} roles: {response.text}")
                    return []
                    
        except Exception as e:
            logger.error(f"Error getting user {user_id} roles: {e}")
            return []

    async def assign_user_role(self, user_id: str, role_name: str) -> bool:
        """Assign a realm role to a user.
        
        Args:
            user_id: Keycloak user ID
            role_name: Role name to assign
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get the role data
            role_data = await self._get_realm_role(role_name)
            if not role_data:
                logger.error(f"Cannot assign role {role_name}: role not found")
                return False
            
            token = await self._get_admin_token()
            assign_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
            
            async with httpx.AsyncClient() as client:
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                
                # Keycloak expects an array of role objects
                payload = [role_data]
                
                response = await client.post(assign_url, headers=headers, json=payload)
                
                if response.status_code in [200, 204]:
                    logger.info(f"Successfully assigned role {role_name} to user {user_id}")
                    return True
                else:
                    logger.error(f"Failed to assign role {role_name} to user {user_id}: {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error assigning role {role_name} to user {user_id}: {e}")
            return False

    async def remove_user_role(self, user_id: str, role_name: str) -> bool:
        """Remove a realm role from a user.
        
        Args:
            user_id: Keycloak user ID
            role_name: Role name to remove
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get the role data
            role_data = await self._get_realm_role(role_name)
            if not role_data:
                logger.error(f"Cannot remove role {role_name}: role not found")
                return False
            
            token = await self._get_admin_token()
            remove_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
            
            async with httpx.AsyncClient() as client:
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                
                # Keycloak expects an array of role objects
                payload = [role_data]
                
                response = await client.request("DELETE", remove_url, headers=headers, json=payload)
                
                if response.status_code in [200, 204]:
                    logger.info(f"Successfully removed role {role_name} from user {user_id}")
                    return True
                else:
                    logger.error(f"Failed to remove role {role_name} from user {user_id}: {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error removing role {role_name} from user {user_id}: {e}")
            return False

    async def assign_default_role(self, user_id: str) -> bool:
        """Assign the default role to a user (MVP: assessment_editor).
        
        Args:
            user_id: Keycloak user ID
            
        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Assigning default role '{self.DEFAULT_ROLE}' to user {user_id}")
        return await self.assign_user_role(user_id, self.DEFAULT_ROLE)

    async def get_all_users(self) -> List[Dict]:
        """Get all users in the realm.
        
        Returns:
            List of user data dictionaries
        """
        try:
            token = await self._get_admin_token()
            users_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users"
            
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(users_url, headers=headers)
                
                if response.status_code == 200:
                    users_data = response.json()
                    logger.info(f"Retrieved {len(users_data)} users from realm {self.realm}")
                    return users_data
                else:
                    logger.error(f"Failed to get users: {response.text}")
                    return []
                    
        except Exception as e:
            logger.error(f"Error getting all users: {e}")
            return []

    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user data by ID.
        
        Args:
            user_id: Keycloak user ID
            
        Returns:
            User data dict or None if not found
        """
        try:
            token = await self._get_admin_token()
            user_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users/{user_id}"
            
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(user_url, headers=headers)
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    logger.warning(f"User {user_id} not found")
                    return None
                else:
                    logger.error(f"Failed to get user {user_id}: {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting user {user_id}: {e}")
            return None
    
    async def update_user_attributes(
        self, 
        user_id: str, 
        attributes: Dict[str, str]
    ) -> bool:
        """Update user attributes in Keycloak.
        
        Args:
            user_id: Keycloak user ID
            attributes: Dictionary of attributes to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            token = await self._get_admin_token()
            
            # Get current user data
            user_url = f"{self.keycloak_url}/admin/realms/{self.realm}/users/{user_id}"
            
            async with httpx.AsyncClient() as client:
                # Get user
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(user_url, headers=headers)
                
                if response.status_code != 200:
                    logger.error(f"Failed to get user {user_id}: {response.text}")
                    return False
                    
                user_data = response.json()
                
                # Update attributes
                current_attributes = user_data.get("attributes", {})
                for key, value in attributes.items():
                    current_attributes[key] = [value]  # Keycloak stores attributes as arrays
                    
                user_data["attributes"] = current_attributes
                
                # Update user
                response = await client.put(
                    user_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json=user_data
                )
                
                if response.status_code in [200, 204]:
                    logger.info(f"Successfully updated user {user_id} attributes")
                    return True
                else:
                    logger.error(f"Failed to update user {user_id}: {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error updating user attributes: {e}")
            return False
    
    async def add_user_to_organization(
        self,
        user_id: str,
        organization_id: str,
        organization_name: str
    ) -> bool:
        """Add user to organization by updating their Keycloak attributes.
        
        Args:
            user_id: Keycloak user ID
            organization_id: Organization UUID
            organization_name: Organization name
            
        Returns:
            True if successful, False otherwise
        """
        return await self.update_user_attributes(
            user_id,
            {
                "organization_id": str(organization_id),
                "organization_name": organization_name
            }
        )