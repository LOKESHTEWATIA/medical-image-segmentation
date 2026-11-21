# MedSeg - Medical Image Segmentation Platform

A secure, HIPAA-compliant web platform for AI-powered medical image segmentation using state-of-the-art U-Net architectures.

## Features

- **Medical Image Support**: DICOM (.dcm), NIfTI (.nii, .nii.gz), MetaImage (.mha, .mhd)
- **Multiple Architectures**: U-Net, nnU-Net, Attention U-Net, Swin UNETR
- **Secure Authentication**: JWT-based auth with refresh tokens, role-based access control
- **Audit Logging**: Comprehensive audit trail for HIPAA compliance
- **Async Processing**: Celery-based task queue for GPU inference
- **Medical Image Viewer**: Interactive 3D slice navigation with overlay controls
- **Admin Dashboard**: User management, audit logs, system monitoring
- **Model Registry**: Versioned model management with GPU memory tracking

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Database   │
│  (React)    │     │  (FastAPI)  │     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Celery    │────▶│    Redis    │
                    │  Workers    │     │  (Broker)   │
                    └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Models    │
                    │  (PyTorch)  │
                    └─────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA GPU with CUDA 11.8+ (for GPU inference)
- 16GB+ RAM recommended

### Development

```bash
# Clone repository
git clone <repository>
cd medseg-app

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Start development stack
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Access frontend at http://localhost:3000
# Access API docs at http://localhost:8000/docs
```

### Production

```bash
# Generate secure secrets
openssl rand -base64 32  # For SECRET_KEY
openssl rand -base64 32  # For ENCRYPTION_KEY

# Configure .env with production values
# Set ENVIRONMENT=production
# Set ALLOWED_ORIGINS to your domain
# Configure SSL certificates in nginx/ssl/

# Deploy
docker-compose up -d
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key (min 32 chars) | Required |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `ENVIRONMENT` | `development`, `staging`, or `production` | `development` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `UPLOAD_DIR` | File upload directory | `/app/uploads` |
| `MODEL_DIR` | Model storage directory | `/app/models` |
| `DEVICE` | `cuda` or `cpu` | `cpu` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `524288000` (500MB) |

### Model Registration

Models are registered via the admin interface or API:

```bash
# Example model registration via API
curl -X POST "https://medseg.local/api/v1/models/admin/register" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "unet_brats_v1",
    "model_type": "unet",
    "version": "1.0.0",
    "file_path": "/app/models/unet_brats_v1.pth",
    "file_hash": "sha256:...",
    "file_size": 123456789,
    "architecture": "U-Net 3D",
    "dataset": "BraTS 2021",
    "training_config": {
      "in_channels": 4,
      "out_channels": 4,
      "features": [32, 64, 128, 256, 512],
      "input_shape": [128, 128, 128],
      "class_names": ["background", "WT", "TC", "ET"]
    },
    "metrics": {
      "dice_wt": 0.91,
      "dice_tc": 0.88,
      "dice_et": 0.82
    }
  }'
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login (returns JWT tokens)
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user profile
- `PATCH /api/v1/auth/me` - Update profile
- `POST /api/v1/auth/change-password` - Change password

### Tasks
- `POST /api/v1/tasks/upload` - Upload file and create segmentation task
- `GET /api/v1/tasks` - List user tasks (paginated)
- `GET /api/v1/tasks/{task_id}` - Get task details
- `GET /api/v1/tasks/{task_id}/status` - Get task status (lightweight)
- `GET /api/v1/tasks/{task_id}/download` - Download result file
- `PATCH /api/v1/tasks/{task_id}/cancel` - Cancel pending task
- `DELETE /api/v1/tasks/{task_id}` - Delete task

### Models
- `GET /api/v1/models` - List available models
- `GET /api/v1/models/{model_name}` - Get model details
- `GET /api/v1/models/default/info` - Get default model
- `POST /api/v1/models/load` - Load model into memory (admin)
- `POST /api/v1/models/unload` - Unload model (admin)

### Admin (requires admin role)
- `GET /api/v1/admin/stats` - System statistics
- `GET /api/v1/admin/users` - List all users
- `PATCH /api/v1/admin/users/{user_id}/role` - Update user role
- `PATCH /api/v1/admin/users/{user_id}/status` - Update user status
- `GET /api/v1/admin/audit-logs` - Query audit logs
- `GET /api/v1/admin/tasks` - List all tasks
- `GET /api/v1/admin/health/detailed` - Detailed health check
- `POST /api/v1/admin/maintenance/cleanup` - Trigger cleanup

## Security Features

- **Authentication**: JWT with short-lived access tokens (30 min) and refresh tokens (7 days)
- **Password Policy**: 12+ chars, uppercase, lowercase, number, special char
- **Rate Limiting**: Configurable per-endpoint limits
- **File Validation**: MIME type + magic byte verification
- **Audit Logging**: All actions logged with user, IP, timestamp
- **CORS**: Configurable allowed origins
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.
- **Role-Based Access**: Admin, Radiologist, Researcher, Viewer roles

## HIPAA Compliance

- Audit logs retained for 7 years (configurable)
- Encryption at rest for PHI (via ENCRYPTION_KEY)
- Access controls with role-based permissions
- Session timeout (15 min default)
- Account lockout after failed attempts
- Secure password storage (bcrypt, 12 rounds)

## Monitoring

- **Prometheus Metrics**: `/metrics` endpoint
- **Health Checks**: `/health`, `/ready`, `/healthz`
- **Flower**: Celery monitoring at `:5555`
- **Structured Logging**: JSON format with correlation IDs

## Development

### Backend Development

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend
cd backend
pytest -v

# Frontend
cd frontend
npm run test
```

## License

MIT License - See LICENSE file for details.

## Citation

If you use MedSeg in your research, please cite:

```
@software{medseg2024,
  title={MedSeg: Medical Image Segmentation Platform},
  year={2024},
  url={https://github.com/your-org/medseg}
}
```