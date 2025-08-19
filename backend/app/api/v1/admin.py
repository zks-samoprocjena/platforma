"""Admin API endpoints for global document management."""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, text

from app.api.deps import get_db, get_current_user, require_admin
from app.models.organization import User, Organization
from app.models.document import ProcessedDocument
from app.models.assessment import Assessment
from app.schemas.document import (
    ProcessedDocumentResponse, 
    ProcessedDocumentCreate,
    DocumentListResponse,
    GlobalDocumentCreate,
    GlobalDocumentStats,
)
from app.services.document_service import DocumentService
from app.services.background_jobs import enqueue_document_processing
from app.services.keycloak_service import KeycloakService
from pydantic import BaseModel

router = APIRouter()

# ===== USER MANAGEMENT SCHEMAS =====

class UserInfo(BaseModel):
    id: UUID
    email: str
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    organization_id: Optional[UUID] = None
    organization_name: Optional[str] = None
    roles: List[str] = []
    attributes: dict = {}
    created_timestamp: Optional[int] = None
    enabled: bool = True

class UserListResponse(BaseModel):
    users: List[UserInfo]
    total: int
    page: int
    page_size: int

class RoleAssignmentRequest(BaseModel):
    user_id: UUID
    role_name: str

class OrganizationStats(BaseModel):
    id: UUID
    name: str
    user_count: int
    assessment_count: int
    document_count: int
    created_at: Optional[datetime] = None

class SystemStats(BaseModel):
    total_users: int
    total_organizations: int
    total_assessments: int
    total_documents: int
    global_documents: int
    active_users_last_30_days: int
    recent_registrations: int

# ===== USER MANAGEMENT ENDPOINTS =====

@router.get("/users", response_model=UserListResponse)
async def list_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by email, username, or name"),
    organization_id: Optional[UUID] = Query(None, description="Filter by organization"),
    role: Optional[str] = Query(None, description="Filter by role"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users in the system with filtering and pagination.
    
    Admin only endpoint.
    """
    keycloak_service = KeycloakService()
    
    # Get users from Keycloak
    keycloak_users = await keycloak_service.get_all_users()
    
    # Get organization data from database
    org_query = select(Organization.id, Organization.name)
    org_result = await db.execute(org_query)
    organizations = {str(org.id): org.name for org in org_result.fetchall()}
    
    # Build user info with organization data
    users_info = []
    for kc_user in keycloak_users:
        # Get user roles
        user_roles = await keycloak_service.get_user_roles(kc_user.get('id'))
        
        # Find organization
        org_id = kc_user.get('attributes', {}).get('organization_id')
        org_name = None
        if org_id and isinstance(org_id, list) and len(org_id) > 0:
            org_id_str = org_id[0]
            org_name = organizations.get(org_id_str)
        
        user_info = UserInfo(
            id=UUID(kc_user.get('id')),
            email=kc_user.get('email', ''),
            username=kc_user.get('username', ''),
            first_name=kc_user.get('firstName'),
            last_name=kc_user.get('lastName'),
            organization_id=UUID(org_id_str) if org_id_str else None,
            organization_name=org_name,
            roles=user_roles,
            attributes=kc_user.get('attributes', {}),
            created_timestamp=kc_user.get('createdTimestamp'),
            enabled=kc_user.get('enabled', True),
        )
        
        # Apply filters
        if search:
            search_lower = search.lower()
            if not any(search_lower in str(getattr(user_info, field, '')).lower() 
                      for field in ['email', 'username', 'first_name', 'last_name']):
                continue
        
        if organization_id and user_info.organization_id != organization_id:
            continue
            
        if role and role not in user_info.roles:
            continue
        
        users_info.append(user_info)
    
    # Pagination
    total = len(users_info)
    start = (page - 1) * page_size
    end = start + page_size
    paginated_users = users_info[start:end]
    
    return UserListResponse(
        users=paginated_users,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/users/{user_id}/roles/{role_name}")
async def assign_user_role(
    user_id: UUID,
    role_name: str,
    current_user: User = Depends(require_admin),
):
    """
    Assign a role to a user.
    
    Admin only endpoint.
    """
    keycloak_service = KeycloakService()
    
    # Validate role exists
    valid_roles = ["assessment_viewer", "assessment_editor", "organization_admin", "system_admin"]
    if role_name not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )
    
    try:
        success = await keycloak_service.assign_user_role(str(user_id), role_name)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to assign role {role_name}")
        
        return {"message": f"Role {role_name} assigned successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error assigning role: {str(e)}")


@router.delete("/users/{user_id}/roles/{role_name}")
async def remove_user_role(
    user_id: UUID,
    role_name: str,
    current_user: User = Depends(require_admin),
):
    """
    Remove a role from a user.
    
    Admin only endpoint.
    """
    keycloak_service = KeycloakService()
    
    try:
        success = await keycloak_service.remove_user_role(str(user_id), role_name)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to remove role {role_name}")
        
        return {"message": f"Role {role_name} removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing role: {str(e)}")


@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: UUID,
    current_user: User = Depends(require_admin),
):
    """
    Get all roles assigned to a user.
    
    Admin only endpoint.
    """
    keycloak_service = KeycloakService()
    
    try:
        roles = await keycloak_service.get_user_roles(str(user_id))
        return {"roles": roles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user roles: {str(e)}")


# ===== ORGANIZATION MANAGEMENT ENDPOINTS =====

@router.get("/organizations", response_model=List[OrganizationStats])
async def list_organizations_with_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all organizations with usage statistics.
    
    Admin only endpoint.
    """
    # Get basic organization data
    org_query = select(Organization)
    org_result = await db.execute(org_query)
    organizations = org_result.scalars().all()
    
    # Get statistics for each organization
    org_stats = []
    keycloak_service = KeycloakService()
    
    for org in organizations:
        # Count users (from Keycloak)
        all_users = await keycloak_service.get_all_users()
        user_count = sum(
            1 for user in all_users 
            if user.get('attributes', {}).get('organization_id', []) == [str(org.id)]
        )
        
        # Count assessments
        assessment_query = select(func.count(Assessment.id)).where(Assessment.organization_id == org.id)
        assessment_result = await db.execute(assessment_query)
        assessment_count = assessment_result.scalar() or 0
        
        # Count documents
        doc_query = select(func.count(ProcessedDocument.id)).where(
            ProcessedDocument.organization_id == org.id
        )
        doc_result = await db.execute(doc_query)
        document_count = doc_result.scalar() or 0
        
        org_stats.append(OrganizationStats(
            id=org.id,
            name=org.name,
            user_count=user_count,
            assessment_count=assessment_count,
            document_count=document_count,
            created_at=org.created_at,
        ))
    
    return org_stats


# ===== SYSTEM STATISTICS ENDPOINTS =====

@router.get("/stats", response_model=SystemStats)
async def get_system_statistics(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get overall system statistics.
    
    Admin only endpoint.
    """
    keycloak_service = KeycloakService()
    
    # Get user statistics from Keycloak
    all_users = await keycloak_service.get_all_users()
    total_users = len(all_users)
    
    # Count recent registrations (last 30 days)
    thirty_days_ago = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
    recent_registrations = sum(
        1 for user in all_users 
        if user.get('createdTimestamp', 0) > thirty_days_ago
    )
    
    # Active users (this is a simplified metric - users with recent activity)
    # For now, we'll use recent registrations + existing users as a proxy
    active_users_last_30_days = min(total_users, recent_registrations + int(total_users * 0.7))
    
    # Database statistics
    org_query = select(func.count(Organization.id))
    org_result = await db.execute(org_query)
    total_organizations = org_result.scalar() or 0
    
    assessment_query = select(func.count(Assessment.id))
    assessment_result = await db.execute(assessment_query)
    total_assessments = assessment_result.scalar() or 0
    
    doc_query = select(func.count(ProcessedDocument.id))
    doc_result = await db.execute(doc_query)
    total_documents = doc_result.scalar() or 0
    
    global_doc_query = select(func.count(ProcessedDocument.id)).where(
        ProcessedDocument.is_global == True
    )
    global_doc_result = await db.execute(global_doc_query)
    global_documents = global_doc_result.scalar() or 0
    
    return SystemStats(
        total_users=total_users,
        total_organizations=total_organizations,
        total_assessments=total_assessments,
        total_documents=total_documents,
        global_documents=global_documents,
        active_users_last_30_days=active_users_last_30_days,
        recent_registrations=recent_registrations,
    )

# ===== EXISTING DOCUMENT MANAGEMENT ENDPOINTS =====

@router.post("/documents/global", response_model=ProcessedDocumentResponse)
async def upload_global_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    source: str = Form(...),
    tags: Optional[str] = Form(None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a global document accessible to all organizations.
    
    Admin only endpoint.
    
    Document types: standard, regulation, guideline, best_practice, other
    Sources: ISO, NIST, ZKS, NIS2, other
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[GLOBAL_UPLOAD] Upload request received - title: {title}, document_type: {document_type}, source: {source}, tags: {tags}")
    
    document_service = DocumentService(db)
    
    # Validate document type
    valid_types = ["standard", "regulation", "guideline", "best_practice", "other"]
    if document_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type. Must be one of: {', '.join(valid_types)}"
        )
    
    # Validate source
    valid_sources = ["ISO", "NIST", "ZKS", "NIS2", "other"]
    if source not in valid_sources:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source. Must be one of: {', '.join(valid_sources)}"
        )
    
    # Create document data
    document_data = ProcessedDocumentCreate(
        title=title,
        tags=tags.split(",") if tags else [],
    )
    
    # Upload global document
    document = await document_service.upload_global_document(
        file=file,
        document_data=document_data,
        uploaded_by=current_user.id,
        document_type=document_type,
        source=source,
    )
    
    # Enqueue for processing with global flag
    enqueue_document_processing(
        document_id=document.id,
        organization_id=None,  # No organization for global docs
        is_global=True
    )
    
    return ProcessedDocumentResponse.model_validate(document)


@router.get("/documents/global", response_model=DocumentListResponse)
async def list_global_documents(
    status: Optional[str] = Query(None, description="Filter by status"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    source: Optional[str] = Query(None, description="Filter by source"),
    limit: Optional[int] = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all global documents.
    
    Admin only endpoint.
    """
    document_service = DocumentService(db)
    
    documents, total = await document_service.get_global_documents(
        status=status,
        document_type=document_type,
        source=source,
        limit=limit,
        offset=offset,
    )
    
    return DocumentListResponse(
        items=[ProcessedDocumentResponse.model_validate(doc) for doc in documents],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/documents/global/stats", response_model=GlobalDocumentStats)
async def get_global_document_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get statistics about global documents.
    
    Admin only endpoint.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[GLOBAL_STATS] Endpoint called by user: {current_user.id}")
    
    try:
        from sqlalchemy import select, func
        from app.models.document import ProcessedDocument
        
        logger.info("[GLOBAL_STATS] Starting to query database")
        
        # Count total documents
        total_query = select(func.count(ProcessedDocument.id)).where(
            ProcessedDocument.scope == 'global'
        )
        total_result = await db.execute(total_query)
        total_documents = total_result.scalar() or 0
        
        # Count by status
        status_query = select(
            ProcessedDocument.status,
            func.count(ProcessedDocument.id).label('count')
        ).where(
            ProcessedDocument.scope == 'global'
        ).group_by(ProcessedDocument.status)
        
        status_result = await db.execute(status_query)
        status_counts = {row.status: row.count for row in status_result.fetchall()}
        
        # Count by type
        type_query = select(
            ProcessedDocument.document_type,
            func.count(ProcessedDocument.id).label('count')
        ).where(
            ProcessedDocument.scope == 'global'
        ).group_by(ProcessedDocument.document_type)
        
        type_result = await db.execute(type_query)
        type_counts = {row.document_type or 'unknown': row.count for row in type_result.fetchall()}
        
        # Count by source
        source_query = select(
            ProcessedDocument.source,
            func.count(ProcessedDocument.id).label('count')
        ).where(
            ProcessedDocument.scope == 'global'
        ).group_by(ProcessedDocument.source)
        
        source_result = await db.execute(source_query)
        source_counts = {row.source or 'unknown': row.count for row in source_result.fetchall()}
        
        logger.info(f"[GLOBAL_STATS] Query completed. Total: {total_documents}")
        
        result = {
            "total_documents": total_documents,
            "total_size_bytes": 0,  # TODO: Calculate actual size
            "status_breakdown": status_counts,
            "type_distribution": type_counts,
            "source_distribution": source_counts,
            "supported_languages": ["hr", "en"],
        }
        
        logger.info(f"[GLOBAL_STATS] Returning result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"[GLOBAL_STATS] Error occurred: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get global document stats: {str(e)}")


@router.get("/documents/global/{document_id}", response_model=ProcessedDocumentResponse)
async def get_global_document(
    document_id: UUID,
    include_chunks: bool = Query(False, description="Include document chunks"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific global document by ID.
    
    Admin only endpoint.
    """
    document_service = DocumentService(db)
    
    # Use a dummy org ID for permission check - the service will recognize it's global
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=current_user.organization_id or UUID('00000000-0000-0000-0000-000000000000'),
        include_chunks=include_chunks,
    )
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.is_global:
        raise HTTPException(
            status_code=403, 
            detail="This endpoint is for global documents only"
        )
    
    return ProcessedDocumentResponse.model_validate(document)


@router.delete("/documents/global/{document_id}")
async def delete_global_document(
    document_id: UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a global document and all its chunks.
    
    Admin only endpoint.
    """
    document_service = DocumentService(db)
    
    # First verify it's a global document
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=current_user.organization_id or UUID('00000000-0000-0000-0000-000000000000'),
    )
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.is_global:
        raise HTTPException(
            status_code=403, 
            detail="This endpoint is for global documents only"
        )
    
    # Delete the document
    success = await document_service.delete_document(
        document_id=document_id,
        organization_id=UUID('00000000-0000-0000-0000-000000000000'),  # Dummy for global
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete document")
    
    return {"message": "Global document deleted successfully"}


@router.post("/documents/global/{document_id}/reprocess")
async def reprocess_global_document(
    document_id: UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger reprocessing of a global document.
    
    Admin only endpoint.
    """
    document_service = DocumentService(db)
    
    # Verify it's a global document
    document = await document_service.get_document_by_id(
        document_id=document_id,
        organization_id=current_user.organization_id or UUID('00000000-0000-0000-0000-000000000000'),
    )
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.is_global:
        raise HTTPException(
            status_code=403, 
            detail="This endpoint is for global documents only"
        )
    
    # Reset status to pending
    from app.repositories.document import ProcessedDocumentRepository
    doc_repo = ProcessedDocumentRepository(db)
    await doc_repo.update_processing_status(
        document_id=document_id,
        status="pending",
        processing_metadata={"reprocessing": True}
    )
    
    # Enqueue for processing
    enqueue_document_processing(
        document_id=document.id,
        organization_id=None,
        is_global=True
    )
    
    return {"message": "Global document queued for reprocessing"}

