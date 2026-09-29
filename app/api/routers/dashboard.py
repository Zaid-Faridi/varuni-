from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Watershed, ImageObservation, Intervention, AnalysisJob, ChangeEvent, RasterAsset
from schemas import DashboardStats, ChangeEventResponse

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["dashboard"]
)


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Computes real aggregate KPI statistics directly from database rows.
    Returns 0/None for an empty database with NO synthetic numbers.
    """
    total_ws = db.query(Watershed).count()
    total_imgs = db.query(ImageObservation).count()
    total_itvs = db.query(Intervention).count()
    total_jobs = db.query(AnalysisJob).count()

    avg_ndvi = db.query(func.avg(Watershed.ndvi_current)).filter(Watershed.ndvi_current.isnot(None)).scalar()
    avg_ndwi = db.query(func.avg(Watershed.ndwi_current)).filter(Watershed.ndwi_current.isnot(None)).scalar()
    total_water = db.query(func.sum(Watershed.area_sqkm)).filter(Watershed.ndwi_current > 0).scalar()

    # Alerts: flagged low-quality raster scenes (<40% clear) and images missing GPS
    flagged_rasters = db.query(RasterAsset).filter(RasterAsset.is_flagged == True).count()
    no_gps_images = db.query(ImageObservation).filter(ImageObservation.quality_status.in_(["no_gps", "outside_monitored_area"])).count()
    quality_alerts_count = flagged_rasters + no_gps_images

    return DashboardStats(
        total_watersheds=total_ws,
        total_images=total_imgs,
        total_interventions=total_itvs,
        total_analyses=total_jobs,
        avg_ndvi=round(float(avg_ndvi), 4) if avg_ndvi is not None else None,
        avg_ndwi=round(float(avg_ndwi), 4) if avg_ndwi is not None else None,
        total_water_area_sqkm=round(float(total_water), 2) if total_water is not None else None,
        quality_alerts=quality_alerts_count
    )


@router.get("/recent-changes", response_model=List[ChangeEventResponse])
def get_recent_changes(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """List most recent observed change detection events."""
    events = db.query(ChangeEvent).order_by(ChangeEvent.to_date.desc()).limit(limit).all()
    results = []
    for ev in events:
        ws_name = ev.watershed.name if hasattr(ev, "watershed") and ev.watershed else None
        results.append(ChangeEventResponse(
            id=ev.id,
            watershed_id=ev.watershed_id,
            watershed_name=ws_name,
            from_date=ev.from_date,
            to_date=ev.to_date,
            metric=ev.metric,
            delta=ev.delta,
            from_value=ev.from_value,
            to_value=ev.to_value,
            confidence=ev.confidence,
            severity=ev.severity,
            provenance=ev.provenance,
            created_at=ev.created_at
        ))
    return results


@router.get("/quality-alerts")
def get_quality_alerts(limit: int = Query(15, ge=1, le=50), db: Session = Depends(get_db)):
    """Active data quality alerts (e.g. flagged cloudy scenes or unlocated photos)."""
    alerts = []
    
    # Check flagged rasters
    flagged = db.query(RasterAsset).filter(RasterAsset.is_flagged == True).limit(limit).all()
    for r in flagged:
        alerts.append({
            "id": str(r.id),
            "type": "satellite_quality",
            "severity": "medium",
            "title": f"Insufficient Clear Satellite Data ({r.name})",
            "detail": r.flag_reason or "Scene has < 40% clear pixels due to cloud/shadow mask",
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else None
        })

    # Check unlocated images
    no_gps = db.query(ImageObservation).filter(ImageObservation.quality_status.in_(["no_gps", "outside_monitored_area"])).limit(limit).all()
    for img in no_gps:
        alerts.append({
            "id": str(img.id),
            "type": "photo_quality",
            "severity": "low" if img.quality_status == "no_gps" else "medium",
            "title": "Field Photo Requires Location" if img.quality_status == "no_gps" else "Photo Outside Monitored Area",
            "detail": "EXIF GPS missing - manual location required" if img.quality_status == "no_gps" else "Coordinates fall outside any monitored watershed boundary",
            "created_at": img.created_at.strftime("%Y-%m-%d %H:%M:%S") if img.created_at else None
        })

    return alerts[:limit]
