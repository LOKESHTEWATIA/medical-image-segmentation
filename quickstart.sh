#!/usr/bin/env bash
# Quick start script for MedSeg development

set -e

echo "🏥 MedSeg - Medical Image Segmentation Platform"
echo "=============================================="
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
    echo "✅ $1 found"
}

echo "Checking prerequisites..."
check_command docker
check_command docker-compose

# Check for NVIDIA Docker support (optional)
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected"
    if docker run --rm --gpus all nvidia/cuda:11.8-base nvidia-smi &> /dev/null; then
        echo "✅ NVIDIA Docker support enabled"
    else
        echo "⚠️  NVIDIA Docker support not configured (GPU inference will use CPU)"
    fi
else
    echo "ℹ️  No NVIDIA GPU detected (will use CPU for inference)"
fi

# Check for .env file
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env from template..."
    cp .env.example .env
    echo "✅ .env created. Please edit it with your configuration."
    echo ""
    echo "Important: Update these values in .env:"
    echo "  - SECRET_KEY (generate with: openssl rand -base64 32)"
    echo "  - DATABASE_URL (if using external DB)"
    echo "  - ALLOWED_ORIGINS (your frontend URL)"
    echo ""
    read -p "Press Enter to continue after editing .env..."
fi

# Create necessary directories
echo ""
echo "Creating directories..."
mkdir -p uploads models logs configs
echo "✅ Directories created"

# Start development environment
echo ""
echo "Starting development environment..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Wait for services
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Run database migrations
echo ""
echo "Running database migrations..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend alembic upgrade head

# Seed database
echo ""
echo "Seeding database with test data..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend python scripts/seed_db.py

echo ""
echo "🎉 MedSeg development environment is ready!"
echo ""
echo "Access points:"
echo "  📱 Frontend:     http://localhost:3000"
echo "  🔧 Backend API:  http://localhost:8000"
echo "  📚 API Docs:     http://localhost:8000/docs"
echo "  🌸 Flower:       http://localhost:5555 (admin/changeme)"
echo ""
echo "Test accounts (from seed):"
echo "  👨‍⚕️ Radiologist:  radiologist@hospital.org / SecurePass123!"
echo "  🔬 Researcher:   researcher@university.edu / SecurePass123!"
echo "  👁️  Viewer:        viewer@clinic.com / SecurePass123!"
echo ""
echo "Useful commands:"
echo "  make dev-logs    # View logs"
echo "  make dev-shell   # Open backend shell"
echo "  make test        # Run tests"
echo "  make lint        # Run linters"
echo "  make format      # Format code"
echo ""