# MedSeg — Medical Image Segmentation Platform

**A secure, HIPAA-compliant web platform for AI-powered medical image segmentation using state-of-the-art 3D U-Net architectures.**

---

## Overview

MedSeg enables radiologists, researchers, and clinicians to upload medical imaging studies (MRI, CT, PET) and receive automated organ/tumor segmentation within minutes. Built for clinical and research workflows with full audit trails, role-based access control, and GPU-accelerated inference.

---

## Key Capabilities

| Category | Features |
|----------|----------|
| **Medical Imaging** | DICOM (`.dcm`), NIfTI (`.nii`, `.nii.gz`), MetaImage (`.mha`, `.mhd`) |
| **Models** | U-Net 3D, Attention U-Net 3D, nnU-Net, Swin UNETR (extensible registry) |
| **Segmentation Tasks** | Brain tumors (BraTS), organs, custom anatomies — multi-class output with confidence metrics |
| **Visualization** | Interactive 3D slice viewer with overlay opacity, window/level, class legend |
| **Async Processing** | Celery task queue with progress polling, GPU worker isolation |
| **Security** | JWT auth (access + refresh tokens), RBAC (Admin/Radiologist/Researcher/Viewers), password policy, account lockout |
| **Compliance** | Full audit logging (7-year retention), encryption at rest, session timeout, CORS/CSP/HSTS headers |
| **Admin Ops** | User management, model registry with GPU memory tracking, audit log query, system health monitoring |

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Backend** | FastAPI, SQLAlchemy 2.0, PostgreSQL, Redis, Celery, PyTorch, MONAI, SimpleITK |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Cornerstone3D (medical imaging) |
| **Infrastructure** | Docker Compose, Nginx reverse proxy, Prometheus metrics, Flower (Celery monitoring) |
| **DevOps** | Multi-stage Dockerfiles, Makefile, pre-commit hooks (ruff, mypy, black), pytest |

---

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

---

## Quick Start

```bash
# Clone and enter
git clone <repo> && cd medseg-app

# One-command development setup
chmod +x quickstart.sh && ./quickstart.sh
```

**Access:** Frontend `http://localhost:3000` · API Docs `http://localhost:8000/docs` · Flower `http://localhost:5555`

**Test Accounts:**  
`radiologist@hospital.org` / `SecurePass123!` (Radiologist)  
`researcher@university.edu` / `SecurePass123!` (Researcher)  
`viewer@clinic.com` / `SecurePass123!` (Viewer)

---

## Production Deployment

```bash
# Generate secrets
openssl rand -base64 32  # SECRET_KEY
openssl rand -base64 32  # ENCRYPTION_KEY

# Configure .env for production
# ENVIRONMENT=production
# ALLOWED_ORIGINS=https://your-domain.com
# SSL certs in nginx/ssl/

docker-compose up -d
```

---

## Use Cases

- **Clinical**: Radiologist review of AI-assisted tumor segmentation (brain, liver, prostate)
- **Research**: Batch processing of imaging cohorts with standardized outputs
- **Education**: Teaching segmentation workflows with audit trails
- **Integration**: REST API for PACS/RIS integration or custom pipelines

---

## License

MIT License — see `LICENSE` for details.
