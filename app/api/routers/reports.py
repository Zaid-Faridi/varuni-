import uuid
import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from database import get_db
    from models import Watershed, Intervention, ImageObservation, RasterAsset, SatelliteScene, User
    from services.auth import get_current_user, log_audit_event
    from services.report_export import (
        generate_observations_csv,
        generate_observations_geojson,
        generate_watershed_pdf_report,
        SOFTWARE_VERSION
    )
except ImportError:
    from app.api.database import get_db
    from app.api.models import Watershed, Intervention, ImageObservation, RasterAsset, SatelliteScene, User
    from app.api.services.auth import get_current_user, log_audit_event
    from app.api.services.report_export import (
        generate_observations_csv,
        generate_observations_geojson,
        generate_watershed_pdf_report,
        SOFTWARE_VERSION
    )

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["reports"]
)


@router.get("/summary")
def get_watershed_report_summary(
    watershed_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Generates a consolidated summary report for a given watershed or all watersheds.
    All figures are derived directly from database records; unavailable metrics return None.
    """
    ws = None
    if watershed_id:
        ws = db.query(Watershed).filter(Watershed.id == watershed_id).first()
        if not ws:
            raise HTTPException(status_code=404, detail="Watershed not found")

    itv_query = db.query(Intervention)
    img_query = db.query(ImageObservation)
    scene_query = db.query(SatelliteScene)
    raster_query = db.query(RasterAsset)

    if watershed_id:
        itv_query = itv_query.filter(Intervention.watershed_id == watershed_id)
        img_query = img_query.filter(ImageObservation.watershed_id == watershed_id)
        raster_query = raster_query.filter(RasterAsset.watershed_id == watershed_id)

    total_interventions = itv_query.count()
    verified_interventions = itv_query.filter(Intervention.status == "verified").count()
    total_images = img_query.count()
    good_gps_images = img_query.filter(ImageObservation.quality_status == "good").count()
    total_scenes = scene_query.count()
    clear_rasters = raster_query.filter(RasterAsset.is_flagged == False).count()
    flagged_rasters = raster_query.filter(RasterAsset.is_flagged == True).count()

    # Calculate average NDVI and NDWI if available
    avg_ndvi = ws.ndvi_current if ws else db.query(func.avg(Watershed.ndvi_current)).scalar()
    avg_ndwi = ws.ndwi_current if ws else db.query(func.avg(Watershed.ndwi_current)).scalar()

    return {
        "watershed": {
            "id": str(ws.id) if ws else None,
            "name": ws.name if ws else "All Monitored Watersheds",
            "state": ws.state if ws else None,
            "district": ws.district if ws else None,
            "area_sqkm": ws.area_sqkm if ws else None,
            "source": ws.source if ws else None
        },
        "metrics": {
            "mean_ndvi": round(avg_ndvi, 4) if avg_ndvi is not None else None,
            "mean_ndwi": round(avg_ndwi, 4) if avg_ndwi is not None else None,
            "interventions_total": total_interventions,
            "interventions_verified": verified_interventions,
            "field_photos_total": total_images,
            "field_photos_with_gps": good_gps_images,
            "satellite_scenes_ingested": total_scenes,
            "clear_raster_assets": clear_rasters,
            "flagged_cloud_raster_assets": flagged_rasters
        },
        "provenance": {
            "provider": "Landsat 8/9 Collection 2 Level-2 (30m GSD) & Copernicus DEM",
            "processing_steps": "Scale Factor 0.0000275 - 0.2, USGS QA_PIXEL Cloud/Shadow Masking, McFeeters NDWI, Horn Slope",
            "software_version": SOFTWARE_VERSION,
            "compliance": "Scientific observation without causal claims"
        }
    }


@router.get("/export/csv")
def export_observations_csv(
    watershed_id: Optional[uuid.UUID] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Exports CSV of ground photos and interventions with location, date, watershed,
    quality score/status, model label + confidence, and hydrological terrain metrics.
    """
    csv_io = generate_observations_csv(db, watershed_id=watershed_id)
    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"varuni_observations_export_{timestamp_str}.csv"

    # Log audit event
    client_ip = request.client.host if request and request.client else "unknown"
    log_audit_event(
        db=db,
        actor_id="export_agent",
        action="export_csv",
        resource_type="report",
        resource_id=str(watershed_id) if watershed_id else "all",
        metadata_info={"format": "csv", "filename": filename},
        ip_address=client_ip
    )

    return StreamingResponse(
        iter([csv_io.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/geojson")
def export_observations_geojson(
    watershed_id: Optional[uuid.UUID] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Exports GeoJSON FeatureCollection of ground photos and interventions with all properties.
    """
    geojson_data = generate_observations_geojson(db, watershed_id=watershed_id)
    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"varuni_observations_export_{timestamp_str}.geojson"

    # Log audit event
    client_ip = request.client.host if request and request.client else "unknown"
    log_audit_event(
        db=db,
        actor_id="export_agent",
        action="export_geojson",
        resource_type="report",
        resource_id=str(watershed_id) if watershed_id else "all",
        metadata_info={"format": "geojson", "filename": filename},
        ip_address=client_ip
    )

    return Response(
        content=json_dumps(geojson_data),
        media_type="application/geo+json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/pdf")
def export_watershed_pdf(
    watershed_id: Optional[uuid.UUID] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Generates a comprehensive, deterministic PDF Watershed Assessment Report:
    - Topography, terrain slope, drainage density
    - Satellite scene dates & IDs
    - Methodology notes & index formulas
    - Interventions & point hydrology
    - Difference-in-Differences observed change events
    - Limitations and non-causal disclaimer
    - Audit ID and timestamp footer
    """
    audit_uuid = str(uuid.uuid4())
    pdf_bytes = generate_watershed_pdf_report(db, watershed_id=watershed_id, audit_id=audit_uuid)
    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"varuni_watershed_assessment_report_{timestamp_str}.pdf"

    # Log audit event
    client_ip = request.client.host if request and request.client else "unknown"
    log_audit_event(
        db=db,
        actor_id="export_agent",
        action="export_pdf",
        resource_type="report",
        resource_id=str(watershed_id) if watershed_id else "all",
        metadata_info={"format": "pdf", "audit_id": audit_uuid, "filename": filename},
        ip_address=client_ip
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def json_dumps(obj: Any) -> str:
    import json
    return json.dumps(obj, default=str)
