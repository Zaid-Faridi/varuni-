"""
Watershed Geospatial Intelligence API — FastAPI Backend
Production-ready API for GIS watershed monitoring, 30m Landsat processing,
geocoded image interpretation, and scientific decision support.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
# Load environment variables if .env files exist
load_dotenv(".env")
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from database import init_db, SessionLocal
from services.auth import seed_admin_user, get_jwt_secret_key
from routers import (
    auth,
    watersheds,
    images,
    interventions,
    satellite,
    analysis,
    changes,
    reports,
    dashboard
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate JWT secret key at startup - fail fast if missing or shorter than 32 characters
    get_jwt_secret_key()

    # Initialize PostGIS extension and database tables on startup
    init_db()
    # Seed initial admin if env vars provided
    db = SessionLocal()
    try:
        seed_admin_user(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="VARUNI — Watershed Geospatial Intelligence API",
    description="Backend API for 30m satellite watershed monitoring, geo-coded image interpretation, and decision support.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Restrict CORS to origins specified in environment variables
cors_origins_raw = os.getenv(
    "CORS_ORIGINS", 
    "http://localhost:3000,http://localhost:3033,http://127.0.0.1:3000,http://127.0.0.1:3033"
)
origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(watersheds.router)
app.include_router(images.router)
app.include_router(interventions.router)
app.include_router(satellite.router)
app.include_router(analysis.router)
app.include_router(changes.router)
app.include_router(reports.router)
app.include_router(dashboard.router)

# Mount static files directory for uploaded photos and thumbnails
from fastapi.staticfiles import StaticFiles
data_dir = os.path.abspath(os.getenv("DATA_DIR", "./data"))
if os.path.exists(data_dir):
    app.mount("/data", StaticFiles(directory=data_dir), name="data")


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "service": "watershed-api", "version": "1.0.0"}


@app.get("/")
def root():
    return {
        "message": "VARUNI Geospatial Intelligence API",
        "docs": "/docs",
        "health": "/api/v1/health"
    }

