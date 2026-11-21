# MedSeg Makefile
# Common development and deployment tasks

.PHONY: help dev-up dev-down dev-logs prod-up prod-down prod-logs test lint format clean db-migrate db-seed

# Default target
help:
	@echo "MedSeg - Medical Image Segmentation Platform"
	@echo ""
	@echo "Available targets:"
	@echo "  dev-up       Start development environment"
	@echo "  dev-down     Stop development environment"
	@echo "  dev-logs     View development logs"
	@echo "  dev-shell    Open shell in backend container"
	@echo "  prod-up      Start production environment"
	@echo "  prod-down    Stop production environment"
	@echo "  prod-logs    View production logs"
	@echo "  test         Run all tests"
	@echo "  test-backend Run backend tests"
	@echo "  test-frontend Run frontend tests"
	@echo "  lint         Run linters"
	@echo "  format       Format code"
	@echo "  clean        Clean build artifacts"
	@echo "  db-migrate   Run database migrations"
	@echo "  db-seed      Seed database with test data"
	@echo "  build        Build all Docker images"
	@echo "  train        Train a model (usage: make train CONFIG=configs/unet_brats.yaml)"

# Development
dev-up:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

dev-down:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

dev-logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

dev-shell:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend bash

# Production
prod-up:
	docker-compose up -d

prod-down:
	docker-compose down

prod-logs:
	docker-compose logs -f

# Testing
test: test-backend test-frontend

test-backend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend pytest -v

test-frontend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npm run test

# Linting
lint: lint-backend lint-frontend

lint-backend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend ruff check .
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend mypy app/

lint-frontend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npm run lint

# Formatting
format: format-backend format-frontend

format-backend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend ruff check --fix .
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend black .

format-frontend:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npm run format

# Database
db-migrate:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend alembic upgrade head

db-seed:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python scripts/seed_db.py

# Cleaning
clean:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
	rm -rf backend/__pycache__ backend/.pytest_cache backend/.mypy_cache
	rm -rf frontend/node_modules frontend/dist frontend/.vite

# Building
build:
	docker-compose build

# Training
train:
	@if [ -z "$(CONFIG)" ]; then \
		echo "Usage: make train CONFIG=configs/unet_brats.yaml"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python scripts/train.py --config $(CONFIG)

# Model management
model-list:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -c "from app.services.inference import SegmentationInferenceService; s = SegmentationInferenceService(); print(s.list_loaded_models())"

model-load:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make model-load MODEL=unet_brats"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -c "from app.services.inference import SegmentationInferenceService; s = SegmentationInferenceService(); s.load_model('$(MODEL)')"

model-unload:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make model-unload MODEL=unet_brats"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -c "from app.services.inference import SegmentationInferenceService; s = SegmentationInferenceService(); s.unload_model('$(MODEL)')"