from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from keycloak import KeycloakOpenID
from jose import jwt, JWTError
import httpx
from functools import lru_cache
import logging
import time

from ..core.config import settings
from ..models.organization import User

# Set up logging
logger = logging.getLogger(__name__)

security = HTTPBearer()


@lru_cache()
def get_keycloak_openid() -> KeycloakOpenID:
    """Get Keycloak OpenID client instance."""
    return KeycloakOpenID(
        server_url=settings.KEYCLOAK_URL,
        client_id=settings.KEYCLOAK_CLIENT_ID,
        realm_name=settings.KEYCLOAK_REALM,
        client_secret_key=settings.KEYCLOAK_CLIENT_SECRET,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """
    Validate JWT token and return current user.
    
    This function:
    1. Extracts the bearer token
    2. Validates it with Keycloak
    3. Extracts user information and roles
    4. Returns a User object
    """
    token = credentials.credentials
    logger.info(f"[AUTH] Attempting to validate token for user authentication")
    
    try:
        # Get Keycloak instance
        keycloak_openid = get_keycloak_openid()
        logger.debug(f"[AUTH] Keycloak instance created for realm: {settings.KEYCLOAK_REALM}")
        
        # First decode the token without verification to check basic info
        try:
            options = {"verify_signature": False, "verify_aud": False, "verify_exp": False}
            unverified_payload = jwt.decode(token, key="", options=options)
            token_client = unverified_payload.get('azp', unverified_payload.get('client_id'))
            logger.debug(f"[AUTH] Token issued for client: {token_client}, aud: {unverified_payload.get('aud')}")
            
            # Check if token is expired
            exp = unverified_payload.get('exp', 0)
            if exp < time.time():
                logger.warning(f"[AUTH] Token is expired: exp={exp}, now={time.time()}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token is expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except JWTError as e:
            logger.error(f"[AUTH] Failed to decode token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # For frontend tokens, we'll validate using the public key instead of introspection
        if token_client == "assessment-frontend":
            logger.info(f"[AUTH] Token from frontend client, using public key validation")
            try:
                # Get public key from Keycloak
                public_key = keycloak_openid.public_key()
                # Wrap in PEM format if needed
                if not public_key.startswith('-----BEGIN'):
                    public_key = f"-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----"
                
                # Validate token with public key
                options = {"verify_aud": False}  # Still skip audience check
                payload = jwt.decode(token, public_key, algorithms=["RS256"], options=options)
                logger.debug(f"[AUTH] Frontend token validated successfully")
            except JWTError as e:
                logger.error(f"[AUTH] Frontend token validation failed: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Token validation failed: {str(e)}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        else:
            # For backend tokens, use introspection
            try:
                token_info = keycloak_openid.introspect(token)
                logger.debug(f"[AUTH] Token introspection result: active={token_info.get('active')}")
                
                if not token_info.get("active"):
                    logger.warning(f"[AUTH] Token is not active")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Token is not active",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                    
                # Get the payload from introspection or decode
                payload = unverified_payload
            except Exception as introspect_error:
                logger.error(f"[AUTH] Token introspection failed: {str(introspect_error)}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Token validation failed: {str(introspect_error)}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        # Verify the token is from our realm
        issuer = payload.get('iss', '')
        if not issuer.endswith(f"/realms/{settings.KEYCLOAK_REALM}"):
            logger.error(f"[AUTH] Invalid issuer: {issuer}, expected realm: {settings.KEYCLOAK_REALM}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token from invalid realm",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Extract user information
        user_id = payload.get("sub")
        email = payload.get("email")
        name = payload.get("name") or payload.get("preferred_username")
        
        logger.debug(f"[AUTH] User info extracted: id={user_id}, email={email}, name={name}")
        
        # Extract roles
        realm_roles = payload.get("realm_access", {}).get("roles", [])
        client_roles = (
            payload.get("resource_access", {})
            .get(settings.KEYCLOAK_CLIENT_ID, {})
            .get("roles", [])
        )
        all_roles = list(set(realm_roles + client_roles))
        
        logger.debug(f"[AUTH] Roles extracted: realm_roles={realm_roles}, client_roles={client_roles}")
        
        # Extract organization information
        organization_id = payload.get("organization_id")
        organization_name = payload.get("organization_name")
        
        logger.debug(f"[AUTH] Organization info: id={organization_id}, name={organization_name}")
        
        if not organization_id:
            logger.warning(f"[AUTH] User {user_id} missing organization_id in token")
            logger.debug(f"[AUTH] Full token payload: {payload}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User must belong to an organization",
            )
        
        # Create and return User object
        user = User(
            id=user_id,
            email=email,
            name=name,
            roles=all_roles,
            organization_id=organization_id,
            organization_name=organization_name,
        )
        
        logger.info(f"[AUTH] User authentication successful: {user_id} from organization {organization_id}")
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except JWTError as jwt_error:
        logger.error(f"[AUTH] JWT processing error: {str(jwt_error)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(jwt_error)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"[AUTH] Unexpected authentication error: {str(e)}", exc_info=True)
        logger.error(f"[AUTH] Error type: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Check if user is active."""
    # Add any additional checks here if needed
    return current_user


def require_role(required_role: str):
    """
    Dependency to require a specific role.
    
    Usage:
        @router.get("/admin", dependencies=[Depends(require_role("admin"))])
    """
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        logger.info(f"[ROLE_CHECK] Checking role {required_role} for user {current_user.id}")
        logger.info(f"[ROLE_CHECK] User roles: {current_user.roles}")
        
        if required_role not in current_user.roles:
            logger.warning(f"[ROLE_CHECK] User {current_user.id} does not have required role: {required_role}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role: {required_role}",
            )
        
        logger.info(f"[ROLE_CHECK] User {current_user.id} has required role: {required_role}")
        return current_user
    
    return role_checker


def require_any_role(roles: list[str]):
    """
    Dependency to require any of the specified roles.
    
    Usage:
        @router.get("/edit", dependencies=[Depends(require_any_role(["admin", "editor"]))])
    """
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        if not any(role in current_user.roles for role in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have any of required roles: {roles}",
            )
        return current_user
    
    return role_checker