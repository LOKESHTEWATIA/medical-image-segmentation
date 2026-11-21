-- MedSeg Database Initialization Script
-- This script runs on first database startup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'radiologist', 'researcher', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked', 'pending_verification');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE model_type AS ENUM ('unet', 'nnunet', 'attention_unet', 'swin_unetr', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_task_created ON audit_logs (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created ON audit_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segmentation_tasks_user_status_created ON segmentation_tasks (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segmentation_tasks_status_created ON segmentation_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys (user_id, revoked_at) WHERE revoked_at IS NULL;

-- Insert default admin user (password: Admin123!@# - CHANGE IN PRODUCTION!)
-- This is a placeholder - in production, create admin user via registration flow
INSERT INTO users (email, username, hashed_password, full_name, role, status, email_verified_at, password_changed_at)
VALUES (
    'admin@medseg.local',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S',  -- bcrypt hash of 'Admin123!@#'
    'System Administrator',
    'admin',
    'active',
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Insert default model registry entries (placeholders)
INSERT INTO model_registry (name, model_type, version, description, architecture, framework, file_path, file_hash, file_size, is_active, is_default, min_memory_gb, recommended_gpu_memory_gb, tags, license)
VALUES
(
    'unet_brats',
    'unet',
    '1.0.0',
    '3D U-Net trained on BraTS 2021 dataset for brain tumor segmentation',
    'U-Net 3D',
    'pytorch',
    '/app/models/unet_brats.pth',
    'placeholder_hash',
    0,
    true,
    true,
    4,
    8,
    ARRAY['brain', 'tumor', 'segmentation', 'brats'],
    'MIT'
),
(
    'attention_unet_brats',
    'attention_unet',
    '1.0.0',
    '3D Attention U-Net with attention gates for brain tumor segmentation',
    'Attention U-Net 3D',
    'pytorch',
    '/app/models/attention_unet_brats.pth',
    'placeholder_hash',
    0,
    true,
    false,
    4,
    8,
    ARRAY['brain', 'tumor', 'segmentation', 'attention', 'brats'],
    'MIT'
) ON CONFLICT (name, version) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medseg;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO medseg;