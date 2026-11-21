from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
import structlog

from app.db.session import get_db
from app.core.audit import AuditService
from app.models.database import User, UserRole, UserStatus, SegmentationTask, TaskStatus, AuditLog, APIKey
from app.api.dependencies import get_current_user, CurrentUser, require_admin

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# Response models
class SystemStats(BaseModel):
    total_users: int
    active_users: int
    total_tasks: int
    tasks_by_status: dict
    tasks_today: int
    storage_used_gb: float
    api_keys_active: int


class UserAdminResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    status: str
    institution: Optional[str]
    department: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    failed_login_attempts: int
    locked_until: Optional[datetime]
    task_count: int


class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str]
    task_id: Optional[str]
    event_type: str
    event_category: str
    description: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    request_id: Optional[str]
    resource_type: Optional[str]
    resource_id: Optional[str]
    success: bool
    error_code: Optional[str]
    error_message: Optional[str]
    created_at: datetime


@router.get("/stats", response_model=SystemStats)
async def get_system_stats(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get system statistics."""
    
    # User stats
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar()
    
    active_users_result = await db.execute(
        select(func.count(User.id)).where(User.status == UserStatus.ACTIVE)
    )
    active_users = active_users_result.scalar()
    
    # Task stats
    total_tasks_result = await db.execute(select(func.count(SegmentationTask.id)))
    total_tasks = total_tasks_result.scalar()
    
    tasks_by_status_result = await db.execute(
        select(SegmentationTask.status, func.count(SegmentationTask.id))
        .group_by(SegmentationTask.status)
    )
    tasks_by_status = {row[0].value: row[1] for row in tasks_by_status_result.all()}
    
    # Tasks today
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tasks_today_result = await db.execute(
        select(func.count(SegmentationTask.id))
        .where(SegmentationTask.created_at >= today)
    )
    tasks_today = tasks_today_result.scalar()
    
    # Storage (approximate from DB)
    storage_result = await db.execute(
        select(func.sum(SegmentationTask.file_size) + func.sum(SegmentationTask.output_file_size))
    )
    storage_bytes = storage_result.scalar() or 0
    storage_gb = storage_bytes / (1024 ** 3)
    
    # API keys
    api_keys_result = await db.execute(
        select(func.count(APIKey.id)).where(APIKey.revoked_at.is_(None))
    )
    api_keys_active = api_keys_result.scalar()
    
    return SystemStats(
        total_users=total_users,
        active_users=active_users,
        total_tasks=total_tasks,
        tasks_by_status=tasks_by_status,
        tasks_today=tasks_today,
        storage_used_gb=round(storage_gb, 2),
        api_keys_active=api_keys_active,
    )


@router.get("/users", response_model=List[UserAdminResponse])
async def list_users_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    role: Optional[UserRole] = Query(None),
    status: Optional[UserStatus] = Query(None),
    search: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users with admin details."""
    
    query = select(User)
    
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.username.ilike(f"%{search}%")) |
            (User.full_name.ilike(f"%{search}%"))
        )
    
    # Get task counts
    task_count_subq = select(
        SegmentationTask.user_id,
        func.count(SegmentationTask.id).label("task_count")
    ).group_by(SegmentationTask.user_id).subquery()
    
    query = query.outerjoin(task_count_subq, User.id == task_count_subq.c.user_id)
    query = query.order_by(desc(User.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        UserAdminResponse(
            id=str(row[0].id),
            email=row[0].email,
            username=row[0].username,
            full_name=row[0].full_name,
            role=row[0].role.value,
            status=row[0].status.value,
            institution=row[0].institution,
            department=row[0].department,
            created_at=row[0].created_at,
            last_login=row[0].last_login,
            failed_login_attempts=row[0].failed_login_attempts,
            locked_until=row[0].locked_until,
            task_count=row[1] or 0,
        )
        for row in rows
    ]


@router.get("/users/{user_id}", response_model=UserAdminResponse)
async def get_user_admin(
    user_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get user details (admin)."""
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Get task count
    task_count_result = await db.execute(
        select(func.count(SegmentationTask.id)).where(SegmentationTask.user_id == user.id)
    )
    task_count = task_count_result.scalar()
    
    return UserAdminResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        institution=user.institution,
        department=user.department,
        created_at=user.created_at,
        last_login=user.last_login,
        failed_login_attempts=user.failed_login_attempts,
        locked_until=user.locked_until,
        task_count=task_count,
    )


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    user_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    event_category: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get audit logs with filtering."""
    
    query = select(AuditLog)
    
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if event_type:
        query = query.where(AuditLog.event_type.ilike(f"%{event_type}%"))
    if event_category:
        query = query.where(AuditLog.event_category == event_category)
    if success is not None:
        query = query.where(AuditLog.success == success)
    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
    if end_date:
        query = query.where(AuditLog.created_at <= end_date)
    
    query = query.order_by(desc(AuditLog.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        AuditLogResponse(
            id=str(log.id),
            user_id=str(log.user_id) if log.user_id else None,
            task_id=str(log.task_id) if log.task_id else None,
            event_type=log.event_type,
            event_category=log.event_category,
            description=log.description,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            request_id=log.request_id,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            success=log.success,
            error_code=log.error_code,
            error_message=log.error_message,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/tasks", response_model=List[dict])
async def list_all_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[TaskStatus] = Query(None),
    user_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks across all users (admin)."""
    
    query = select(SegmentationTask, User.email, User.username).join(
        User, SegmentationTask.user_id == User.id
    )
    
    if status:
        query = query.where(SegmentationTask.status == status)
    if user_id:
        query = query.where(SegmentationTask.user_id == user_id)
    
    query = query.order_by(desc(SegmentationTask.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": str(row[0].id),
            "user_id": str(row[0].user_id),
            "user_email": row[1],
            "user_username": row[2],
            "original_filename": row[0].original_filename,
            "model_type": row[0].model_type.value,
            "status": row[0].status.value,
            "progress": row[0].progress,
            "created_at": row[0].created_at.isoformat(),
            "completed_at": row[0].completed_at.isoformat() if row[0].completed_at else None,
        }
        for row in rows
    ]


@router.post("/maintenance/cleanup")
async def trigger_cleanup(
    days: int = Query(30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_admin),
):
    """Trigger cleanup of old tasks."""
    from app.tasks.inference import cleanup_old_tasks
    
    task = cleanup_old_tasks.delay(days)
    
    return {
        "message": "Cleanup task queued",
        "task_id": task.id,
    }


@router.get("/health/detailed")
async def detailed_health(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Detailed health check for admin monitoring."""
    
    # Database
    db_healthy = True
    try:
        await db.execute("SELECT 1")
    except Exception:
        db_healthy = False
    
    # Redis
    redis_healthy = True
    try:
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.close()
    except Exception:
        redis_healthy = False
    
    # Celery
    celery_healthy = True
    try:
        from app.tasks.inference import celery_app
        inspect = celery_app.control.inspect()
        stats = inspect.stats()
        celery_healthy = stats is not None
    except Exception:
        celery_healthy = False
    
    # GPU
    gpu_available = False
    gpu_memory = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu_available = True
            gpu_memory = {
                "total_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2),
                "allocated_gb": round(torch.cuda.memory_allocated(0) / (1024**3), 2),
                "cached_gb": round(torch.cuda.memory_reserved(0) / (1024**3), 2),
            }
    except Exception:
        pass
    
    # Loaded models
    from app.api.routes.models import get_inference_service
    service = get_inference_service()
    loaded_models = service.list_loaded_models()
    
    return {
        "database": "healthy" if db_healthy else "unhealthy",
        "redis": "healthy" if redis_healthy else "unhealthy",
        "celery": "healthy" if celery_healthy else "unhealthy",
        "gpu": {
            "available": gpu_available,
            "memory": gpu_memory,
        },
        "loaded_models": loaded_models,
        "timestamp": datetime.utcnow().isoformat(),
    }