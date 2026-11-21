from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field
import structlog

from app.db.session import get_db
from app.core.config import settings
from app.models.database import ModelRegistry, ModelType
from app.api.dependencies import get_current_user, CurrentUser, require_model_manage, require_task_read
from app.services.inference import SegmentationInferenceService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/models", tags=["models"])


# Request/Response models
class ModelInfo(BaseModel):
    id: str
    name: str
    model_type: str
    version: str
    description: Optional[str]
    architecture: Optional[str]
    framework: str
    dataset: Optional[str]
    metrics: Optional[dict]
    is_active: bool
    is_default: bool
    min_memory_gb: int
    recommended_gpu_memory_gb: int
    tags: Optional[list]
    license: Optional[str]
    created_at: str
    loaded: bool = False


class ModelLoadRequest(BaseModel):
    model_name: str


class ModelLoadResponse(BaseModel):
    success: bool
    message: str
    info: Optional[dict] = None


# Global inference service (initialized in main.py)
inference_service: SegmentationInferenceService = None


def get_inference_service() -> SegmentationInferenceService:
    global inference_service
    if inference_service is None:
        inference_service = SegmentationInferenceService(
            model_dir=settings.MODEL_DIR,
            device=settings.DEVICE,
        )
    return inference_service


@router.get("", response_model=List[ModelInfo])
async def list_models(
    model_type: Optional[ModelType] = Query(None),
    active_only: bool = Query(True),
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """List available models."""
    
    query = select(ModelRegistry)
    
    if active_only:
        query = query.where(ModelRegistry.is_active == True)
    
    if model_type:
        query = query.where(ModelRegistry.model_type == model_type)
    
    query = query.order_by(ModelRegistry.name, ModelRegistry.version)
    
    result = await db.execute(query)
    models = result.scalars().all()
    
    service = get_inference_service()
    loaded_models = set(service.list_loaded_models())
    
    return [
        ModelInfo(
            id=str(m.id),
            name=m.name,
            model_type=m.model_type.value,
            version=m.version,
            description=m.description,
            architecture=m.architecture,
            framework=m.framework,
            dataset=m.dataset,
            metrics=m.metrics,
            is_active=m.is_active,
            is_default=m.is_default,
            min_memory_gb=m.min_memory_gb,
            recommended_gpu_memory_gb=m.recommended_gpu_memory_gb,
            tags=m.tags,
            license=m.license,
            created_at=m.created_at.isoformat(),
            loaded=m.name in loaded_models,
        )
        for m in models
    ]


@router.get("/{model_name}", response_model=ModelInfo)
async def get_model(
    model_name: str,
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """Get model details."""
    
    result = await db.execute(
        select(ModelRegistry).where(ModelRegistry.name == model_name)
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )
    
    service = get_inference_service()
    loaded_models = set(service.list_loaded_models())
    
    return ModelInfo(
        id=str(model.id),
        name=model.name,
        model_type=model.model_type.value,
        version=model.version,
        description=model.description,
        architecture=model.architecture,
        framework=model.framework,
        dataset=model.dataset,
        metrics=model.metrics,
        is_active=model.is_active,
        is_default=model.is_default,
        min_memory_gb=model.min_memory_gb,
        recommended_gpu_memory_gb=model.recommended_gpu_memory_gb,
        tags=model.tags,
        license=model.license,
        created_at=model.created_at.isoformat(),
        loaded=model.name in loaded_models,
    )


@router.post("/load", response_model=ModelLoadResponse)
async def load_model(
    request: ModelLoadRequest,
    current_user: CurrentUser = Depends(require_model_manage),
    db: AsyncSession = Depends(get_db),
):
    """Load a model into memory (admin only)."""
    
    service = get_inference_service()
    
    # Check if model exists in registry
    result = await db.execute(
        select(ModelRegistry).where(ModelRegistry.name == request.model_name)
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found in registry",
        )
    
    if not model.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model is not active",
        )
    
    # Load model
    success = service.load_model(request.model_name)
    
    if success:
        info = service.get_model_info(request.model_name)
        return ModelLoadResponse(
            success=True,
            message=f"Model {request.model_name} loaded successfully",
            info=info,
        )
    else:
        return ModelLoadResponse(
            success=False,
            message=f"Failed to load model {request.model_name}",
        )


@router.post("/unload")
async def unload_model(
    model_name: str,
    current_user: CurrentUser = Depends(require_model_manage),
):
    """Unload a model from memory (admin only)."""
    
    service = get_inference_service()
    
    if model_name not in service.list_loaded_models():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not loaded",
        )
    
    service.unload_model(model_name)
    
    return {"message": f"Model {model_name} unloaded successfully"}


@router.get("/loaded/list")
async def list_loaded_models(
    current_user: CurrentUser = Depends(require_task_read),
):
    """List currently loaded models."""
    
    service = get_inference_service()
    loaded = service.list_loaded_models()
    
    models_info = []
    for name in loaded:
        info = service.get_model_info(name)
        if info:
            models_info.append(info)
    
    return {"models": models_info}


@router.get("/default/info")
async def get_default_model(
    current_user: CurrentUser = Depends(require_task_read),
    db: AsyncSession = Depends(get_db),
):
    """Get default model for segmentation."""
    
    result = await db.execute(
        select(ModelRegistry).where(
            ModelRegistry.is_default == True,
            ModelRegistry.is_active == True,
        )
    )
    model = result.scalar_one_or_none()
    
    if not model:
        # Fallback to first active model
        result = await db.execute(
            select(ModelRegistry).where(ModelRegistry.is_active == True).limit(1)
        )
        model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active models available",
        )
    
    return {
        "name": model.name,
        "model_type": model.model_type.value,
        "version": model.version,
        "class_names": model.training_config.get("class_names", []) if model.training_config else [],
        "input_shape": model.training_config.get("input_shape", [128, 128, 128]) if model.training_config else [128, 128, 128],
    }


# Admin routes for model registry management
@router.post("/admin/register", response_model=ModelInfo, status_code=status.HTTP_201_CREATED)
async def register_model(
    name: str,
    model_type: ModelType,
    version: str,
    file_path: str,
    file_hash: str,
    file_size: int,
    description: Optional[str] = None,
    architecture: Optional[str] = None,
    framework: str = "pytorch",
    dataset: Optional[str] = None,
    training_config: Optional[dict] = None,
    metrics: Optional[dict] = None,
    class_names: Optional[list] = None,
    min_memory_gb: int = 4,
    recommended_gpu_memory_gb: int = 8,
    tags: Optional[list] = None,
    license: Optional[str] = None,
    citation: Optional[str] = None,
    is_default: bool = False,
    current_user: CurrentUser = Depends(require_model_manage),
    db: AsyncSession = Depends(get_db),
):
    """Register a new model in the registry (admin only)."""
    
    # Check if model file exists
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model file not found",
        )
    
    # Check for duplicate
    result = await db.execute(
        select(ModelRegistry).where(
            ModelRegistry.name == name,
            ModelRegistry.version == version,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model with this name and version already exists",
        )
    
    # If setting as default, unset other defaults
    if is_default:
        await db.execute(
            select(ModelRegistry).where(ModelRegistry.is_default == True)
        )
        # This would need an update statement
    
    model = ModelRegistry(
        name=name,
        model_type=model_type,
        version=version,
        description=description,
        architecture=architecture,
        framework=framework,
        dataset=dataset,
        training_config=training_config,
        metrics=metrics,
        file_path=file_path,
        file_hash=file_hash,
        file_size=file_size,
        min_memory_gb=min_memory_gb,
        recommended_gpu_memory_gb=recommended_gpu_memory_gb,
        tags=tags,
        license=license,
        citation=citation,
        is_default=is_default,
    )
    
    db.add(model)
    await db.commit()
    await db.refresh(model)
    
    return ModelInfo(
        id=str(model.id),
        name=model.name,
        model_type=model.model_type.value,
        version=model.version,
        description=model.description,
        architecture=model.architecture,
        framework=model.framework,
        dataset=model.dataset,
        metrics=model.metrics,
        is_active=model.is_active,
        is_default=model.is_default,
        min_memory_gb=model.min_memory_gb,
        recommended_gpu_memory_gb=model.recommended_gpu_memory_gb,
        tags=model.tags,
        license=model.license,
        created_at=model.created_at.isoformat(),
    )


@router.patch("/admin/{model_id}/activate")
async def activate_model(
    model_id: str,
    active: bool = True,
    current_user: CurrentUser = Depends(require_model_manage),
    db: AsyncSession = Depends(get_db),
):
    """Activate/deactivate a model (admin only)."""
    
    result = await db.execute(
        select(ModelRegistry).where(ModelRegistry.id == model_id)
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )
    
    model.is_active = active
    await db.commit()
    
    return {"message": f"Model {'activated' if active else 'deactivated'}"}


@router.patch("/admin/{model_id}/default")
async def set_default_model(
    model_id: str,
    current_user: CurrentUser = Depends(require_model_manage),
    db: AsyncSession = Depends(get_db),
):
    """Set a model as default (admin only)."""
    
    result = await db.execute(
        select(ModelRegistry).where(ModelRegistry.id == model_id)
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )
    
    if not model.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot set inactive model as default",
        )
    
    # Unset current default
    await db.execute(
        select(ModelRegistry).where(ModelRegistry.is_default == True)
    )
    
    model.is_default = True
    await db.commit()
    
    return {"message": f"Model {model.name} set as default"}


import os