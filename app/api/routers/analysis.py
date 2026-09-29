import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models import AnalysisJob, ImageObservation, Intervention, Watershed, RasterAsset, SatelliteScene
from schemas import (
    AnalysisJobCreate,
    AnalysisJobResponse,
    AnomalyAnalysisResponse
)
from analysis.anomaly import analyze_seasonal_deviation
from satellite.zonal import sample_raster_at_point

router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"]
)


@router.get("/jobs", response_model=List[AnalysisJobResponse])
def list_analysis_jobs(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List analysis jobs."""
    query = db.query(AnalysisJob)
    if status:
        query = query.filter(AnalysisJob.status == status)
    return query.order_by(AnalysisJob.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/jobs/{id}", response_model=AnalysisJobResponse)
def get_analysis_job(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get analysis job details."""
    job = db.query(AnalysisJob).filter(AnalysisJob.id == id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return job


@router.post("/jobs", response_model=AnalysisJobResponse)
def create_analysis_job(payload: AnalysisJobCreate, db: Session = Depends(get_db)):
    """Submit a new analysis job."""
    job = AnalysisJob(
        type=payload.type,
        input_refs=payload.input_refs,
        model_version=payload.model_version or "v1.0",
        status="queued",
        stage="validating",
        progress=0.0
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/anomaly", response_model=AnomalyAnalysisResponse)
def get_seasonal_anomaly_analysis(
    latitude: Optional[float] = Query(None, ge=-90, le=90),
    longitude: Optional[float] = Query(None, ge=-180, le=180),
    target_date: Optional[str] = Query(None, description="ISO Date YYYY-MM-DD"),
    image_id: Optional[uuid.UUID] = None,
    intervention_id: Optional[uuid.UUID] = None,
    metric: str = Query("ndvi", pattern="^(ndvi|ndwi)$"),
    db: Session = Depends(get_db)
):
    """
    Computes deviation from historical seasonal baseline for a specific photo or coordinates.
    Builds seasonal baseline from the same calendar window (+/- 20 days) across prior years.
    Requires >= 4 clear baseline observations; otherwise returns 'insufficient_history'.
    """
    # Resolve coordinates and date from image or intervention if provided
    lat = latitude
    lon = longitude
    dt = None

    if image_id:
        img = db.query(ImageObservation).filter(ImageObservation.id == image_id).first()
        if img:
            lat = img.latitude
            lon = img.longitude
            dt = img.captured_at
    elif intervention_id:
        itv = db.query(Intervention).filter(Intervention.id == intervention_id).first()
        if itv:
            lat = itv.latitude
            lon = itv.longitude
            dt = itv.observed_at

    if target_date:
        try:
            dt = datetime.datetime.fromisoformat(target_date.replace("Z", "+00:00"))
        except Exception:
            pass

    if dt is None:
        dt = datetime.datetime.utcnow()

    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Latitude and longitude are required.")

    # Find containing watershed
    query = text("""
        SELECT id FROM watersheds 
        WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
        LIMIT 1
    """)
    match = db.execute(query, {"lon": lon, "lat": lat}).fetchone()
    watershed_id = match[0] if match else None

    # Gather all clear historical raster observations at this location
    historical_obs = []
    observed_val = None
    nearest_scene_id = None
    nearest_scene_date = None
    min_time_diff = float("inf")

    if watershed_id:
        rasters = (
            db.query(RasterAsset, SatelliteScene)
            .join(SatelliteScene, RasterAsset.scene_id == SatelliteScene.id)
            .filter(
                RasterAsset.watershed_id == watershed_id,
                RasterAsset.asset_type == metric.lower(),
                RasterAsset.is_flagged == False
            )
            .order_by(SatelliteScene.acquisition_time.asc())
            .all()
        )

        for r_asset, s_scene in rasters:
            pix_val, _ = sample_raster_at_point(r_asset.uri, lon, lat)
            if pix_val is not None:
                scene_time = s_scene.acquisition_time
                historical_obs.append({
                    "scene_id": s_scene.scene_id,
                    "date": scene_time,
                    "value": pix_val,
                    "is_clear": True
                })

                # Check if this is the closest observation to the target date
                diff = abs((scene_time - dt).total_seconds())
                if diff < min_time_diff:
                    min_time_diff = diff
                    observed_val = pix_val
                    nearest_scene_id = s_scene.scene_id
                    nearest_scene_date = scene_time.strftime("%Y-%m-%d")

    result = analyze_seasonal_deviation(
        observed_value=observed_val,
        target_date=dt,
        historical_observations=historical_obs,
        metric=metric.lower(),
        window_days=20,
        min_observations=4
    )

    return AnomalyAnalysisResponse(
        location=[round(lat, 6), round(lon, 6)],
        target_date=dt.strftime("%Y-%m-%d"),
        nearest_scene_id=nearest_scene_id,
        nearest_scene_date=nearest_scene_date,
        observed_value=result.get("observed_value"),
        metric=metric.lower(),
        baseline_median=result.get("baseline_median"),
        baseline_mad=result.get("baseline_mad"),
        baseline_n=result.get("baseline_n", 0),
        z_score=result.get("z_score"),
        status=result.get("status"),
        status_label=result.get("status_label"),
        baseline_observations=result.get("baseline_observations", []),
        provenance=result.get("provenance", {})
    )
