import os
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel, Field
import structlog

from app.db.session import get_db
from app.core.config import settings
from app.core.audit import AuditService
from app.models.database import SegmentationTask, TaskStatus, ModelType, User
from app.api.dependencies import (
    get_current_user,
    CurrentUser,
    require_task_create,
    require_task_read,
    require_task_delete,
)
from app.tasks.inference import run_segmentation
from app.utils.file_validation import (
    validate_upload_file,
    generate_stored_filename,
    get_upload_path,
    delete_file,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/tasks", tags=["segmentation tasks"])


# Request/Response models
class TaskCreate(BaseModel):
    model_type: ModelType = ModelType.UNET
    model_version: Optional[str] = None
    modality: Optional[str] = Field(None, max_length=50)
    body_part: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    user_id: str
    original_filename: str
    stored_filename: str
    file_size: int
    file_hash: str
    modality: Optional[str]
    body_part: Optional[str]
    model_type: str
    model_version: Optional[str]
    status: str
    progress: int
    error_message: Optional[str]
    output_filename: Optional[str]
    output_file_size: Optional[int]
    output_file_hash: Optional[str]
    metrics: Optional[dict]
    notes: Optional[str]
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


@router.post("/upload", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def upload_and_create_task(
    file: UploadFile = File(...),
    model_type: ModelType = Query(ModelType.UNET),
    model_version: Optional[str] = Query(None),
    modality: Optional[str] = Query(None, max_length=50),
    body_part: Optional[str] = Query(None, max_length=100),
    notes: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_task_create),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Upload a medical image and create segmentation task."""
    
    # Validate file
    validation = await validate_upload_file(file)
    
    if not validation["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="; ".join(validation["errors"]),
        )
    
    metadata = validation["metadata"]
    
    # Generate stored filename
    stored_filename = generate_stored_filename(
        metadata["sanitized_filename"],
        metadata["file_hash"],
    )
    
    # Save file
    upload_path = get_upload_path(stored_filename)
    
    try:
        content = await file.read()
        with open(upload_path, "wb") as f:
            f.write(content)
    except Exception as e:
        logger.error("file_save_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file",
        )
    
    # Create task record
    task = SegmentationTask(
        user_id=uuid.UUID(current_user.id),
        original_filename=metadata["original_filename"],
        stored_filename=stored_filename,
        file_size=metadata["file_size"],
        file_hash=metadata["file_hash"],
        modality=modality,
        body_part=body_part,
        model_type=model_type,
        model_version=model_version,
        status=TaskStatus.PENDING,
        notes=notes,
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    # Queue inference task
    celery_task = run_segmentation.delay(str(task.id))
    task.celery_task_id = celery_task.id
    task.status = TaskStatus.QUEUED
    await db.commit()
    
    # Log audit
    await AuditService.log_upload(
        user_id=current_user.id,
        task_id=str(task.id),
        filename=metadata["original_filename"],
        file_size=metadata["file_size"],
        ip_address=request.client.host if request.client else None,
    )
    
    logger.info(
        "task_created",
        task_id=str(task.id),
        user_id=current_user.id,
        filename=metadata["original_filename"],
    )
    
    return TaskResponse(
        id=str(task.id),
        user_id=str(task.user_id),
        original_filename=task.original_filename,
        stored_filename=task.stored_filename,
        file_size=task.file_size,
        file_hash=task.file_hash,
        modality=task.modality,
        body_part=task.body_part,
        model_type=task.model_type.value,
        model_version=task.model_version,
        status=task.status.value,
        progress=task.progress,
        error_message=task.error_message,
        output_filename=task.output_filename,
        output_file_size=task.output_file_size,
        output_file_hash=task.output_file_hash,
        metrics=task.metrics,
        notes=task.notes,
        is_archived=task.is_archived,
        created_at=task.created_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
    )


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    model_type: Optional[ModelType] = Query(None),
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """List user's segmentation tasks with pagination."""
    
    # Build query
    query = select(SegmentationTask).where(SegmentationTask.user_id == current_user.id)
    
    if status_filter:
        query = query.where(SegmentationTask.status == status_filter)
    
    if model_type:
        query = query.where(SegmentationTask.model_type == model_type)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    query = query.order_by(desc(SegmentationTask.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return TaskListResponse(
        tasks=[
            TaskResponse(
                id=str(t.id),
                user_id=str(t.user_id),
                original_filename=t.original_filename,
                stored_filename=t.stored_filename,
                file_size=t.file_size,
                file_hash=t.file_hash,
                modality=t.modality,
                body_part=t.body_part,
                model_type=t.model_type.value,
                model_version=t.model_version,
                status=t.status.value,
                progress=t.progress,
                error_message=t.error_message,
                output_filename=t.output_filename,
                output_file_size=t.output_file_size,
                output_file_hash=t.output_file_hash,
                metrics=t.metrics,
                notes=t.notes,
                is_archived=t.is_archived,
                created_at=t.created_at,
                updated_at=t.updated_at,
                started_at=t.started_at,
                completed_at=t.completed_at,
            )
            for t in tasks
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """Get task details."""
    
    result = await db.execute(
        select(SegmentationTask).where(SegmentationTask.id == uuid.UUID(task_id))
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    # Check access
    if not current_user.can_access_task(str(task.user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    return TaskResponse(
        id=str(task.id),
        user_id=str(task.user_id),
        original_filename=task.original_filename,
        stored_filename=task.stored_filename,
        file_size=task.file_size,
        file_hash=task.file_hash,
        modality=task.modality,
        body_part=task.body_part,
        model_type=task.model_type.value,
        model_version=task.model_version,
        status=task.status.value,
        progress=task.progress,
        error_message=task.error_message,
        output_filename=task.output_filename,
        output_file_size=task.output_file_size,
        output_file_hash=task.output_file_hash,
        metrics=task.metrics,
        notes=task.notes,
        is_archived=task.is_archived,
        created_at=task.created_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
    )


@router.get("/{task_id}/status")
async def get_task_status(
    task_id: str,
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """Get task status (lightweight endpoint for polling)."""
    
    result = await db.execute(
        select(SegmentationTask.status, SegmentationTask.progress, SegmentationTask.error_message)
        .where(SegmentationTask.id == uuid.UUID(task_id))
    )
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    task_status, progress, error = row
    
    # Check access
    task_result = await db.execute(
        select(SegmentationTask.user_id).where(SegmentationTask.id == uuid.UUID(task_id))
    )
    task_user_id = task_result.scalar()
    
    if not current_user.can_access_task(str(task_user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    return {
        "task_id": task_id,
        "status": task_status.value,
        "progress": progress,
        "error": error,
    }


@router.get("/{task_id}/download")
async def download_result(
    task_id: str,
    file_type: str = Query("segmentation", pattern="^(segmentation|probabilities|original)$"),
    current_user: CurrentUser = Depends(require_task_read),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Download task result file."""
    
    result = await db.execute(
        select(SegmentationTask).where(SegmentationTask.id == uuid.UUID(task_id))
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if not current_user.can_access_task(str(task.user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task not completed",
        )
    
    # Determine file to serve
    if file_type == "original":
        filename = task.stored_filename
        display_name = task.original_filename
    elif file_type == "probabilities":
        if not task.output_filename:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Probabilities not available",
            )
        filename = task.output_filename.replace(".nii.gz", "_probs.nii.gz")
        display_name = f"{task.original_filename}_probs.nii.gz"
    else:  # segmentation
        if not task.output_filename:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Segmentation not available",
            )
        filename = task.output_filename
        display_name = f"seg_{task.original_filename}"
    
    file_path = get_upload_path(filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk",
        )
    
    # Log audit
    await AuditService.log_download(
        user_id=current_user.id,
        task_id=task_id,
        file_type=file_type,
        ip_address=request.client.host if request.client else None,
    )
    
    return FileResponse(
        path=file_path,
        filename=display_name,
        media_type="application/octet-stream",
    )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    current_user: CurrentUser = Depends(require_task_delete),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task and its associated files."""
    
    result = await db.execute(
        select(SegmentationTask).where(SegmentationTask.id == uuid.UUID(task_id))
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if not current_user.can_access_task(str(task.user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    # Delete files
    input_path = get_upload_path(task.stored_filename)
    delete_file(input_path)
    
    if task.output_filename:
        output_path = get_upload_path(task.output_filename)
        delete_file(output_path)
        
        # Also delete probabilities file if exists
        probs_path = get_upload_path(task.output_filename.replace(".nii.gz", "_probs.nii.gz"))
        delete_file(probs_path)
    
    # Delete task record
    await db.delete(task)
    await db.commit()
    
    logger.info("task_deleted", task_id=task_id, user_id=current_user.id)
    
    return None


@router.patch("/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: CurrentUser = Depends(require_task_delete),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending/queued task."""
    
    result = await db.execute(
        select(SegmentationTask).where(SegmentationTask.id == uuid.UUID(task_id))
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if not current_user.can_access_task(str(task.user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    if task.status not in [TaskStatus.PENDING, TaskStatus.QUEUED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel task with status {task.status.value}",
        )
    
    # Cancel Celery task
    if task.celery_task_id:
        from app.tasks.inference import celery_app
        celery_app.control.revoke(task.celery_task_id, terminate=True)
    
    task.status = TaskStatus.CANCELLED
    task.completed_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Task cancelled", "task_id": task_id}