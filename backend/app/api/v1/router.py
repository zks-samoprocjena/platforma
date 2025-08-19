"""Main API v1 router combining all endpoints."""

from fastapi import APIRouter

from app.api.v1.measures import router as measures_router
from app.api.v1.controls import router as controls_router
from app.api.v1.compliance import router as compliance_router
from app.api.v1.assessments import router as assessments_router
from app.api.v1.documents import router as documents_router
from app.api.v1.ai import router as ai_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.user_profile import router as user_profile_router
from app.api.v1.admin import router as admin_router
from app.api.v1.compliance_documents import router as compliance_documents_router

# Create main v1 router
api_router = APIRouter(prefix="/api/v1")

# Include all endpoint routers
api_router.include_router(measures_router)
api_router.include_router(controls_router)
api_router.include_router(compliance_router)
api_router.include_router(assessments_router)
api_router.include_router(documents_router)
api_router.include_router(compliance_documents_router)
api_router.include_router(ai_router)
api_router.include_router(organizations_router)
api_router.include_router(user_profile_router, prefix="/users", tags=["user-profile"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
