.PHONY: help demo test lint dev build clean

help:
	@echo "VARUNI Makefile Commands:"
	@echo "  make demo        - Start services, load pilot watershed, scenes, photos, and print URL"
	@echo "  make test        - Run backend pytest and frontend test suites"
	@echo "  make lint        - Run backend and frontend linters"
	@echo "  make dev-backend - Start FastAPI backend (port 8000)"
	@echo "  make dev-web     - Start Next.js frontend (port 3033)"
	@echo "  make dev         - Start both backend and frontend concurrently"

demo:
	@bash scripts/demo.sh

test:
	@echo "Running backend pytest..."
	@CLIP_OFFLINE_MODE=1 PYTHONPATH=app/api app/api/.venv/bin/pytest app/api/tests/ -v
	@echo "Running frontend tests..."
	@cd app/web && npm test

lint:
	@echo "Linting backend..."
	@app/api/.venv/bin/flake8 app/api --count --select=E9,F63,F7,F82 --show-source --statistics || true
	@echo "Linting frontend..."
	@cd app/web && npm run lint || true

dev-backend:
	PYTHONPATH=app/api app/api/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

dev-web:
	cd app/web && PORT=3033 npm run dev

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
