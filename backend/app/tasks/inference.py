import os
import uuid
from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure, task_retry
from celery.utils.log import get_task_logger
import structlog

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.database import SegmentationTask, TaskStatus, AuditLog
from app.services.inference import SegmentationInferenceService
from app.core.audit import AuditService
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_task_logger(__name__)
structlog_logger = structlog.get_logger(__name__)

# Create Celery app
celery_app = Celery("medseg")

celery_app.conf.update(
    broker_url=settings.CELERY_BROKER_URL,
    result_backend=settings.CELERY_RESULT_BACKEND,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=settings.CELERY_TASK_TRACK_STARTED,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=settings.CELERY_TASK_TIME_LIMIT - 30,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=10,
    result_expires=86400,  # 24 hours
    task_routes={
        "app.tasks.inference.run_segmentation": {"queue": "inference"},
        "app.tasks.inference.cleanup_old_tasks": {"queue": "maintenance"},
    },
    beat_schedule={
        "cleanup-old-tasks": {
            "task": "app.tasks.inference.cleanup_old_tasks",
            "schedule": 86400.0,  # Daily
        },
    },
)

# Global inference service instance (initialized per worker)
inference_service: SegmentationInferenceService = None


def get_inference_service() -> SegmentationInferenceService:
    """Get or create inference service instance."""
    global inference_service
    if inference_service is None:
        inference_service = SegmentationInferenceService(
            model_dir=settings.MODEL_DIR,
            device=settings.DEVICE,
        )
    return inference_service


@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **kwds):
    """Log task start."""
    structlog_logger.info("task_started", task_name=task.name, task_id=task_id)


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, state=None, **kwds):
    """Log task completion."""
    structlog_logger.info("task_completed", task_name=task.name, task_id=task_id, state=state)


@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwds):
    """Log task failure."""
    structlog_logger.error("task_failed", task_name=sender.name, task_id=task_id, error=str(exception))


@task_retry.connect
def task_retry_handler(sender=None, task_id=None, reason=None, einfo=None, **kwds):
    """Log task retry."""
    structlog_logger.warning("task_retry", task_name=sender.name, task_id=task_id, reason=str(reason))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def run_segmentation(self, task_id: str):
    """
    Run segmentation inference asynchronously.
    
    Args:
        task_id: UUID of the segmentation task
    """
    import asyncio
    
    async def _run():
        async with AsyncSessionLocal() as session:
            # Get task
            result = await session.execute(
                select(SegmentationTask).where(SegmentationTask.id == uuid.UUID(task_id))
            )
            task = result.scalar_one_or_none()
            
            if not task:
                structlog_logger.error("task_not_found", task_id=task_id)
                return
            
            # Update status to processing
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            task.celery_task_id = self.request.id
            await session.commit()
            
            # Log audit
            await AuditService.log_event(
                user_id=str(task.user_id),
                event_type="inference_started",
                event_category="model",
                description=f"Started inference for task {task_id}",
                task_id=task_id,
                resource_type="task",
                resource_id=task_id,
            )
            
            try:
                # Get inference service
                service = get_inference_service()
                
                # Prepare paths
                input_path = os.path.join(settings.UPLOAD_DIR, task.stored_filename)
                output_filename = f"seg_{task.stored_filename}"
                output_path = os.path.join(settings.UPLOAD_DIR, output_filename)
                
                # Update progress
                self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Loading model"})
                
                # Run inference
                result = await service.run_inference(
                    model_name=task.model_type.value,
                    input_path=input_path,
                    output_path=output_path,
                )
                
                # Update progress
                self.update_state(state="PROGRESS", meta={"progress": 90, "status": "Saving results"})
                
                # Update task with results
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
                task.progress = 100
                task.output_filename = output_filename
                task.output_file_size = result.file_size
                task.output_file_hash = result.output_hash
                task.metrics = result.metrics
                
                await session.commit()
                
                # Log audit
                await AuditService.log_inference(
                    user_id=str(task.user_id),
                    task_id=task_id,
                    model_name=task.model_type.value,
                    duration_ms=result.processing_time_ms,
                    success=True,
                )
                
                structlog_logger.info(
                    "segmentation_completed",
                    task_id=task_id,
                    output=output_filename,
                    time_ms=result.processing_time_ms,
                )
                
                return {
                    "status": "completed",
                    "output_filename": output_filename,
                    "metrics": result.metrics,
                    "processing_time_ms": result.processing_time_ms,
                }
                
            except Exception as e:
                # Update task with error
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.utcnow()
                task.error_message = str(e)
                await session.commit()
                
                # Log audit
                await AuditService.log_inference(
                    user_id=str(task.user_id),
                    task_id=task_id,
                    model_name=task.model_type.value,
                    duration_ms=0,
                    success=False,
                    error=str(e),
                )
                
                structlog_logger.error("segmentation_failed", task_id=task_id, error=str(e))
                
                # Retry on certain errors
                if "CUDA out of memory" in str(e) or "OOM" in str(e):
                    raise self.retry(exc=e, countdown=120)
                
                raise
    
    # Run async function
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run())
    finally:
        loop.close()


@celery_app.task
def cleanup_old_tasks(days: int = 30):
    """Clean up old completed/failed tasks and their files."""
    import asyncio
    from datetime import datetime, timedelta
    
    async def _cleanup():
        async with AsyncSessionLocal() as session:
            cutoff = datetime.utcnow() - timedelta(days=days)
            
            # Find old tasks
            result = await session.execute(
                select(SegmentationTask).where(
                    SegmentationTask.status.in_([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]),
                    SegmentationTask.updated_at < cutoff,
                    SegmentationTask.is_archived == False,
                )
            )
            tasks = result.scalars().all()
            
            deleted_count = 0
            for task in tasks:
                try:
                    # Delete input file
                    input_path = os.path.join(settings.UPLOAD_DIR, task.stored_filename)
                    if os.path.exists(input_path):
                        os.remove(input_path)
                    
                    # Delete output file
                    if task.output_filename:
                        output_path = os.path.join(settings.UPLOAD_DIR, task.output_filename)
                        if os.path.exists(output_path):
                            os.remove(output_path)
                    
                    # Mark as archived
                    task.is_archived = True
                    deleted_count += 1
                    
                except Exception as e:
                    structlog_logger.error("cleanup_failed", task_id=str(task.id), error=str(e))
            
            await session.commit()
            
            structlog_logger.info("cleanup_completed", deleted_tasks=deleted_count)
            return {"deleted_tasks": deleted_count}
    
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_cleanup())
    finally:
        loop.close()


@celery_app.task
def generate_model_report(model_name: str):
    """Generate performance report for a model."""
    # Placeholder for model evaluation/reporting
    pass