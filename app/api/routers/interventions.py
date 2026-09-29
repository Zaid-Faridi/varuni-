import uuid
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.shape import to_shape

from database import get_db
from models import Intervention, Watershed
from schemas import (
    InterventionResponse,
    InterventionCreate,
    InterventionReview
)
from satellite.terrain import query_point_hydrology
from analysis.change_detection import compute_intervention_observed_change

router = APIRouter(
    prefix="/api/v1/interventions",
    tags=["interventions"]
)


@router.get("/", response_model=List[InterventionResponse])
def list_interventions(
    watershed_id: Optional[uuid.UUID] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List interventions with optional filters. Returns empty list if no interventions exist."""
    query = db.query(Intervention)
    if watershed_id:
        query = query.filter(Intervention.watershed_id == watershed_id)
    if type:
        query = query.filter(Intervention.type == type)
    if status:
        query = query.filter(Intervention.status == status)

    interventions = query.order_by(Intervention.created_at.desc()).offset(skip).limit(limit).all()
    results = []
    for item in interventions:
        ws_name = item.watershed.name if item.watershed else None
        results.append(InterventionResponse(
            id=item.id,
            name=item.name,
            type=item.type,
            status=item.status,
            latitude=item.latitude,
            longitude=item.longitude,
            watershed_id=item.watershed_id,
            watershed_name=ws_name,
            observed_at=item.observed_at,
            source=item.source,
            description=item.description,
            cost_estimate=item.cost_estimate,
            beneficiaries=item.beneficiaries,
            nearest_stream_distance_m=item.nearest_stream_distance_m,
            upstream_catchment_area_sqkm=item.upstream_catchment_area_sqkm,
            local_slope_deg=item.local_slope_deg,
            reviewer_decision=item.reviewer_decision,
            reviewer_id=item.reviewer_id,
            reviewed_at=item.reviewed_at,
            image_id=item.image_id,
            created_at=item.created_at,
            updated_at=item.updated_at
        ))
    return results


@router.get("/{id}", response_model=InterventionResponse)
def get_intervention_detail(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single intervention details with terrain point hydrology."""
    item = db.query(Intervention).filter(Intervention.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    # Compute terrain metrics if missing
    if item.latitude and item.longitude and (item.nearest_stream_distance_m is None):
        try:
            hydro = query_point_hydrology(db, item.latitude, item.longitude, watershed_id=item.watershed_id)
            item.nearest_stream_distance_m = hydro["distance_to_nearest_stream_m"]
            item.upstream_catchment_area_sqkm = hydro["upstream_contributing_area_sqkm"]
            db.commit()
        except Exception:
            pass

    ws_name = item.watershed.name if item.watershed else None
    return InterventionResponse(
        id=item.id,
        name=item.name,
        type=item.type,
        status=item.status,
        latitude=item.latitude,
        longitude=item.longitude,
        watershed_id=item.watershed_id,
        watershed_name=ws_name,
        observed_at=item.observed_at,
        source=item.source,
        description=item.description,
        cost_estimate=item.cost_estimate,
        beneficiaries=item.beneficiaries,
        nearest_stream_distance_m=item.nearest_stream_distance_m,
        upstream_catchment_area_sqkm=item.upstream_catchment_area_sqkm,
        local_slope_deg=item.local_slope_deg,
        reviewer_decision=item.reviewer_decision,
        reviewer_id=item.reviewer_id,
        reviewed_at=item.reviewed_at,
        image_id=item.image_id,
        created_at=item.created_at,
        updated_at=item.updated_at
    )


@router.post("/", response_model=InterventionResponse)
def create_intervention(payload: InterventionCreate, db: Session = Depends(get_db)):
    """Creates a new intervention with spatial PostGIS geometry and point hydrology."""
    if payload.latitude is None or payload.longitude is None:
        raise HTTPException(status_code=400, detail="Latitude and longitude coordinates are required.")

    geom_wkt = f"SRID=4326;POINT({payload.longitude} {payload.latitude})"

    # Automatically find containing watershed if not provided
    ws_id = payload.watershed_id
    if not ws_id:
        query = text("""
            SELECT id FROM watersheds 
            WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
            LIMIT 1
        """)
        match = db.execute(query, {"lon": payload.longitude, "lat": payload.latitude}).fetchone()
        if match:
            ws_id = match[0]

    # Query point hydrology (nearest stream distance & upstream area)
    hydro = query_point_hydrology(db, payload.latitude, payload.longitude, watershed_id=ws_id)

    item = Intervention(
        id=uuid.uuid4(),
        name=payload.name,
        type=payload.type,
        status=payload.status or "observed",
        geom=geom_wkt,
        latitude=payload.latitude,
        longitude=payload.longitude,
        watershed_id=ws_id,
        observed_at=payload.observed_at or datetime.datetime.utcnow(),
        source=payload.source or "Ground Survey Registration",
        description=payload.description,
        cost_estimate=payload.cost_estimate,
        beneficiaries=payload.beneficiaries,
        nearest_stream_distance_m=hydro["distance_to_nearest_stream_m"],
        upstream_catchment_area_sqkm=hydro["upstream_contributing_area_sqkm"]
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    ws_name = item.watershed.name if item.watershed else None
    return InterventionResponse(
        id=item.id,
        name=item.name,
        type=item.type,
        status=item.status,
        latitude=item.latitude,
        longitude=item.longitude,
        watershed_id=item.watershed_id,
        watershed_name=ws_name,
        observed_at=item.observed_at,
        source=item.source,
        description=item.description,
        cost_estimate=item.cost_estimate,
        beneficiaries=item.beneficiaries,
        nearest_stream_distance_m=item.nearest_stream_distance_m,
        upstream_catchment_area_sqkm=item.upstream_catchment_area_sqkm,
        local_slope_deg=item.local_slope_deg,
        created_at=item.created_at
    )


@router.post("/{id}/change-detection")
def run_intervention_change_detection(
    id: uuid.UUID,
    metric: str = Query("ndvi", regex="^(ndvi|ndwi|NDVI|NDWI)$"),
    treated_radius_m: float = Query(250.0, ge=50, le=1000),
    control_inner_radius_m: float = Query(500.0, ge=200, le=2000),
    control_outer_radius_m: float = Query(1500.0, ge=500, le=5000),
    season_window_days: int = Query(20, ge=5, le=45),
    db: Session = Depends(get_db)
):
    """
    Computes Difference-in-Differences observed change around an intervention:
    - Baseline year (T0) vs Comparison year (T1) in the SAME seasonal window (+/- 20 days).
    - Treated 250m buffer vs Control 500-1500m ring.
    - Refuses to compute if clear data is < 40%.
    - Formally worded as 'observed change' with non-causal disclaimer.
    """
    try:
        res = compute_intervention_observed_change(
            db=db,
            intervention_id=id,
            metric=metric,
            treated_radius_m=treated_radius_m,
            control_inner_radius_m=control_inner_radius_m,
            control_outer_radius_m=control_outer_radius_m,
            season_window_days=season_window_days
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Change detection error: {str(e)}")


@router.patch("/{id}/review", response_model=InterventionResponse)
def review_intervention(
    id: uuid.UUID,
    review: InterventionReview,
    db: Session = Depends(get_db)
):
    """
    Records a human reviewer decision ('confirm', 'dismiss', 'needs_field_visit')
    along with reviewer ID and timestamp.
    """
    if review.decision not in ["confirm", "dismiss", "needs_field_visit"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid reviewer decision. Must be one of: 'confirm', 'dismiss', 'needs_field_visit'"
        )

    item = db.query(Intervention).filter(Intervention.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    item.reviewer_decision = review.decision
    item.reviewer_id = review.reviewer_id
    item.reviewed_at = datetime.datetime.utcnow()

    if review.decision == "confirm":
        item.status = "verified"
    elif review.decision == "dismiss":
        item.status = "archived"
    elif review.decision == "needs_field_visit":
        item.status = "needs_review"

    if review.notes:
        item.description = f"{item.description or ''}\nReviewer Note: {review.notes}".strip()

    db.commit()
    db.refresh(item)

    ws_name = item.watershed.name if item.watershed else None
    return InterventionResponse(
        id=item.id,
        name=item.name,
        type=item.type,
        status=item.status,
        latitude=item.latitude,
        longitude=item.longitude,
        watershed_id=item.watershed_id,
        watershed_name=ws_name,
        observed_at=item.observed_at,
        source=item.source,
        description=item.description,
        cost_estimate=item.cost_estimate,
        beneficiaries=item.beneficiaries,
        nearest_stream_distance_m=item.nearest_stream_distance_m,
        upstream_catchment_area_sqkm=item.upstream_catchment_area_sqkm,
        local_slope_deg=item.local_slope_deg,
        reviewer_decision=item.reviewer_decision,
        reviewer_id=item.reviewer_id,
        reviewed_at=item.reviewed_at,
        image_id=item.image_id,
        created_at=item.created_at,
        updated_at=item.updated_at
    )
