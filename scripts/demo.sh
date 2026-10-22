#!/usr/bin/env bash
set -e

START_TIME=$(date +%s)

echo "================================================================="
echo "  VARUNI: Automated Pilot Demonstration Setup"
echo "  Watershed Monitoring & Spatial Decision Support System"
echo "================================================================="
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PYTHONPATH="$ROOT_DIR/app/api:$PYTHONPATH"
export CLIP_OFFLINE_MODE="${CLIP_OFFLINE_MODE:-1}"

# Check Python environment
if [ -d "$ROOT_DIR/app/api/.venv" ]; then
    PYTHON_EXEC="$ROOT_DIR/app/api/.venv/bin/python"
else
    PYTHON_EXEC="python3"
fi

# Ensure Demonstration Mode is active
export DEMO_MODE=1

# Generate a temporary JWT secret key if none is set or if shorter than 32 characters
if [ -z "$JWT_SECRET_KEY" ] || [ ${#JWT_SECRET_KEY} -lt 32 ]; then
    export JWT_SECRET_KEY=$("$PYTHON_EXEC" -c "import secrets; print(secrets.token_urlsafe(48))")
fi

echo "[1/4] Initializing database and tables..."
"$PYTHON_EXEC" -c "import sys; sys.path.insert(0, 'app/api'); from database import init_db; from services.auth import seed_admin_user; from database import SessionLocal; init_db(); db = SessionLocal(); seed_admin_user(db); db.close(); print('Database initialized successfully.')"

echo ""
echo "[2/4] Loading pilot watershed boundary (Sukhi Nadi Catchment)..."
"$PYTHON_EXEC" -m tools.load_watershed \
    --geojson data/boundaries/pilot_watershed.geojson \
    --name "Sukhi Nadi Pilot Catchment" \
    --district "Chhatrapati Sambhajinagar" \
    --state "Maharashtra" \
    --source "Survey of India / India-WRIS" \
    --version "2024.1"

echo ""
echo "[3/4] Ingesting satellite scenes and generating zonal indices..."
"$PYTHON_EXEC" -m tools.ingest \
    --watershed "Sukhi Nadi Pilot Catchment" \
    --start 2023-01-01 \
    --end 2024-03-31 \
    --max-cloud 30.0 || echo "Note: Satellite online ingest skipped or completed offline."

echo ""
echo "[4/4] Loading sample geo-tagged ground photos and evaluating QC..."
"$PYTHON_EXEC" -m tools.load_photos --dir data/photos/

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "================================================================="
echo "  DEMO READY in ${ELAPSED} seconds!"
echo "================================================================="
echo "  Web Application:   http://localhost:3033"
echo "  FastAPI Backend:   http://localhost:8000"
echo "  API Documentation: http://localhost:8000/docs"
echo "  Admin Credentials: Set via ADMIN_EMAIL / ADMIN_PASSWORD in .env"
echo "================================================================="
