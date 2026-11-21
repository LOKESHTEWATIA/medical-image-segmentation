#!/usr/bin/env python3
"""
Database seeding script for MedSeg development.
Creates test users, models, and sample tasks.
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext

from app.models.database import (
    Base,
    User,
    UserRole,
    UserStatus,
    SegmentationTask,
    TaskStatus,
    ModelRegistry,
    ModelType,
)

# Configuration
DATABASE_URL = "postgresql+asyncpg://medseg:devpassword@localhost:5432/medseg_dev"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


async def seed_database():
    """Seed the database with test data."""
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create test users
        users_data = [
            {
                "email": "radiologist@hospital.org",
                "username": "dr_radiologist",
                "password": "SecurePass123!",
                "full_name": "Dr. Sarah Radiologist",
                "role": UserRole.RADIOLOGIST,
                "institution": "University Hospital",
                "department": "Radiology",
                "orcid": "0000-0000-0000-0001",
            },
            {
                "email": "researcher@university.edu",
                "username": "researcher_john",
                "password": "SecurePass123!",
                "full_name": "Dr. John Researcher",
                "role": UserRole.RESEARCHER,
                "institution": "Medical University",
                "department": "Biomedical Engineering",
                "orcid": "0000-0000-0000-0002",
            },
            {
                "email": "viewer@clinic.com",
                "username": "viewer_jane",
                "password": "SecurePass123!",
                "full_name": "Jane Viewer",
                "role": UserRole.VIEWER,
                "institution": "Community Clinic",
                "department": "Radiology",
            },
        ]
        
        created_users = []
        for user_data in users_data:
            password = user_data.pop("password")
            user = User(
                hashed_password=pwd_context.hash(password),
                status=UserStatus.ACTIVE,
                email_verified_at=datetime.utcnow(),
                password_changed_at=datetime.utcnow(),
                **user_data,
            )
            session.add(user)
            created_users.append(user)
        
        await session.commit()
        print(f"Created {len(created_users)} test users")
        
        # Create test models
        models_data = [
            {
                "name": "unet_brats_dev",
                "model_type": ModelType.UNET,
                "version": "1.0.0-dev",
                "description": "Development U-Net for BraTS brain tumor segmentation",
                "architecture": "U-Net 3D",
                "framework": "pytorch",
                "dataset": "BraTS 2021 (subset)",
                "file_path": "/app/models/unet_brats_dev.pth",
                "file_hash": "dev_placeholder_hash",
                "file_size": 12345678,
                "min_memory_gb": 4,
                "recommended_gpu_memory_gb": 8,
                "is_active": True,
                "is_default": True,
                "tags": ["brain", "tumor", "dev"],
                "license": "MIT",
                "training_config": {
                    "in_channels": 4,
                    "out_channels": 4,
                    "features": [32, 64, 128, 256, 512],
                    "input_shape": [128, 128, 128],
                    "class_names": ["background", "WT", "TC", "ET"],
                },
                "metrics": {
                    "dice_wt": 0.89,
                    "dice_tc": 0.85,
                    "dice_et": 0.78,
                },
            },
            {
                "name": "attention_unet_brats_dev",
                "model_type": ModelType.ATTENTION_UNET,
                "version": "1.0.0-dev",
                "description": "Development Attention U-Net for BraTS brain tumor segmentation",
                "architecture": "Attention U-Net 3D",
                "framework": "pytorch",
                "dataset": "BraTS 2021 (subset)",
                "file_path": "/app/models/attention_unet_brats_dev.pth",
                "file_hash": "dev_placeholder_hash_2",
                "file_size": 15678901,
                "min_memory_gb": 4,
                "recommended_gpu_memory_gb": 8,
                "is_active": True,
                "is_default": False,
                "tags": ["brain", "tumor", "attention", "dev"],
                "license": "MIT",
                "training_config": {
                    "in_channels": 4,
                    "out_channels": 4,
                    "features": [32, 64, 128, 256, 512],
                    "input_shape": [128, 128, 128],
                    "class_names": ["background", "WT", "TC", "ET"],
                },
                "metrics": {
                    "dice_wt": 0.91,
                    "dice_tc": 0.87,
                    "dice_et": 0.81,
                },
            },
        ]
        
        created_models = []
        for model_data in models_data:
            model = ModelRegistry(**model_data)
            session.add(model)
            created_models.append(model)
        
        await session.commit()
        print(f"Created {len(created_models)} test models")
        
        # Create sample tasks (without actual files)
        for i, user in enumerate(created_users):
            for j in range(3):
                task = SegmentationTask(
                    user_id=user.id,
                    original_filename=f"sample_case_{i}_{j}.nii.gz",
                    stored_filename=f"sample_{uuid.uuid4().hex[:16]}.nii.gz",
                    file_size=1024 * 1024 * 50,  # 50MB
                    file_hash=uuid.uuid4().hex,
                    modality="MRI",
                    body_part="Brain",
                    model_type=ModelType.UNET if j % 2 == 0 else ModelType.ATTENTION_UNET,
                    model_version="1.0.0-dev",
                    status=TaskStatus.COMPLETED if j < 2 else TaskStatus.PROCESSING,
                    progress=100 if j < 2 else 45,
                    output_filename=f"seg_sample_{uuid.uuid4().hex[:16]}.nii.gz" if j < 2 else None,
                    output_file_size=1024 * 1024 * 5 if j < 2 else None,
                    output_file_hash=uuid.uuid4().hex if j < 2 else None,
                    metrics={
                        "WT_mean_confidence": 0.92,
                        "WT_volume_voxels": 15000,
                        "TC_mean_confidence": 0.88,
                        "TC_volume_voxels": 8000,
                        "ET_mean_confidence": 0.85,
                        "ET_volume_voxels": 3000,
                    } if j < 2 else None,
                    notes=f"Sample task {j+1} for {user.full_name}",
                    created_at=datetime.utcnow() - timedelta(days=j, hours=i),
                    completed_at=datetime.utcnow() - timedelta(days=j, hours=i) + timedelta(minutes=30) if j < 2 else None,
                )
                session.add(task)
        
        await session.commit()
        print("Created sample tasks")
        
        # Print summary
        print("\n=== Seed Summary ===")
        for user in created_users:
            print(f"User: {user.email} ({user.role.value})")
        for model in created_models:
            print(f"Model: {model.name} v{model.version} ({model.model_type.value})")
        print("\nLogin credentials:")
        print("  radiologist@hospital.org / SecurePass123!")
        print("  researcher@university.edu / SecurePass123!")
        print("  viewer@clinic.com / SecurePass123!")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())