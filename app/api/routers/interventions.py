import os
import uuid
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.shape import to_shape

try:
    from database import get_db
    from models import Intervention, Watershed, ImageObservation, ReviewEvent, User
    from schemas import (
        InterventionResponse,
        InterventionCreate,
        InterventionReview,
        InterventionReviewRequest,
        ReviewEventResponse,
    )
    from services.auth import get_current_user, require_role
except ImportError:
    from app.api.database import get_db
    from app.api.models import Intervention, Watershed, ImageObservation, ReviewEvent, User
    from app.api.schemas import (
        InterventionResponse,
        InterventionCreate,
        InterventionReview,
        InterventionReviewRequest,
        ReviewEventResponse,
    )
    from app.api.services.auth import get_current_user, require_role

from satellite.terrain import query_point_hydrology
from analysis.change_detection import compute_intervention_observed_change
from routers.images import compute_satellite_context

router = APIRouter(
    prefix="/api/v1/interventions",
    tags=["interventions"]
)


def _format_intervention_response(item: Intervention, db: Session, sat_context: Optional[Any] = None) -> InterventionResponse:
    ws_name = item.watershed.name if item.watershed else None
    photo_uri = item.photo_path or (item.image.object_uri if item.image else None)
    photo_name = item.photo_filename or (item.image.original_filename if item.image else (os.path.basename(photo_uri) if photo_uri else None))
    exif_lat = item.exif_latitude or (item.image.latitude if item.image else None)
    exif_lon = item.exif_longitude or (item.image.longitude if item.image else None)
    exif_time = item.exif_timestamp or (item.image.captured_at if item.image else None)
    gps_src = item.gps_source or (item.image.gps_source if item.image else ("EXIF GPS" if exif_lat is not None else None))
    rev_status = item.review_status or "OBSERVED"

    return InterventionResponse(
        id=item.id,
        name=item.name,
        type=item.type,
        status=item.status,
        review_status=rev_status,
        current_reviewer_id=item.current_reviewer_id or item.reviewer_id,
        current_notes=item.current_notes,
        idempotency_key=item.idempotency_key,
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
        photo_path=photo_uri,
        photo_filename=photo_name,
        exif_latitude=exif_lat,
        exif_longitude=exif_lon,
        exif_timestamp=exif_time,
        gps_source=gps_src,
        satellite_context=sat_context,
        created_at=item.created_at,
        updated_at=item.updated_at
    )


@router.get("/", response_model=List[InterventionResponse])
def list_interventions(
    watershed_id: Optional[uuid.UUID] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    review_status: Optional[str] = None,
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
    if review_status:
        query = query.filter(Intervention.review_status == review_status.upper())

    interventions = query.order_by(Intervention.created_at.desc()).offset(skip).limit(limit).all()
    return [_format_intervention_response(item, db) for item in interventions]


@router.get("/{id}", response_model=InterventionResponse)
def get_intervention_detail(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single intervention details with terrain point hydrology and real satellite NDVI context."""
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

    # Sample real satellite NDVI at intervention coordinates
    sat_context = None
    if item.latitude is not None and item.longitude is not None and item.watershed_id:
        try:
            sat_context = compute_satellite_context(
                latitude=item.latitude,
                longitude=item.longitude,
                captured_at=item.observed_at,
                watershed_id=item.watershed_id,
                db=db
            )
        except Exception as e:
            print(f"Notice: Satellite context computation for intervention {item.id}: {e}")

    return _format_intervention_response(item, db, sat_context)


@router.post("/", response_model=InterventionResponse)
def create_intervention(
    payload: InterventionCreate,
    idempotency_key_header: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db)
):
    """Creates a new intervention with spatial PostGIS geometry, point hydrology, and idempotency protection."""
    effective_idempotency_key = payload.idempotency_key or idempotency_key_header

    # Check for idempotent retry
    if effective_idempotency_key:
        existing = db.query(Intervention).filter(Intervention.idempotency_key == effective_idempotency_key).first()
        if existing:
            return _format_intervention_response(existing, db)

    # Look up linked image if provided
    linked_img = None
    if payload.image_id:
        linked_img = db.query(ImageObservation).filter(ImageObservation.id == payload.image_id).first()

    lat = payload.latitude if payload.latitude is not None else (linked_img.latitude if linked_img else None)
    lon = payload.longitude if payload.longitude is not None else (linked_img.longitude if linked_img else None)

    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Latitude and longitude coordinates are required.")

    geom_wkt = f"SRID=4326;POINT({lon} {lat})"

    # Automatically find containing watershed if not provided
    ws_id = payload.watershed_id or (linked_img.watershed_id if linked_img else None)
    if not ws_id:
        query = text("""
            SELECT id FROM watersheds 
            WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
            LIMIT 1
        """)
        match = db.execute(query, {"lon": lon, "lat": lat}).fetchone()
        if match:
            ws_id = match[0]

    # Query point hydrology (nearest stream distance & upstream area)
    hydro = query_point_hydrology(db, lat, lon, watershed_id=ws_id)

    photo_uri = payload.photo_path or (linked_img.object_uri if linked_img else None)
    photo_name = payload.photo_filename or (linked_img.original_filename if linked_img else (os.path.basename(photo_uri) if photo_uri else None))
    exif_lat = payload.exif_latitude if payload.exif_latitude is not None else (linked_img.latitude if linked_img else None)
    exif_lon = payload.exif_longitude if payload.exif_longitude is not None else (linked_img.longitude if linked_img else None)
    exif_time = payload.exif_timestamp or (linked_img.captured_at if linked_img else None)
    gps_src = payload.gps_source or (linked_img.gps_source if linked_img else ("EXIF GPS" if exif_lat is not None else "Manual Ground Survey"))

    item = Intervention(
        id=uuid.uuid4(),
        name=payload.name,
        type=payload.type,
        status=payload.status or "observed",
        review_status="OBSERVED",
        idempotency_key=effective_idempotency_key,
        geom=geom_wkt,
        latitude=lat,
        longitude=lon,
        watershed_id=ws_id,
        observed_at=payload.observed_at or (linked_img.captured_at if linked_img else datetime.datetime.utcnow()),
        source=payload.source or ("Geo-Tagged Field Photo" if linked_img else "Ground Survey Registration"),
        description=payload.description,
        cost_estimate=payload.cost_estimate,
        beneficiaries=payload.beneficiaries,
        image_id=payload.image_id,
        photo_path=photo_uri,
        photo_filename=photo_name,
        exif_latitude=exif_lat,
        exif_longitude=exif_lon,
        exif_timestamp=exif_time,
        gps_source=gps_src,
        nearest_stream_distance_m=hydro["distance_to_nearest_stream_m"],
        upstream_catchment_area_sqkm=hydro["upstream_contributing_area_sqkm"]
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return _format_intervention_response(item, db)


@router.post("/{id}/review", response_model=InterventionResponse)
def submit_intervention_review(
    id: uuid.UUID,
    payload: InterventionReviewRequest,
    current_user: User = Depends(require_role("reviewer", "admin")),
    db: Session = Depends(get_db)
):
    """
    Records a human reviewer decision ('confirm', 'needs_visit', 'dismiss') with optimistic concurrency,
    RBAC enforcement, strictly enforced server clock & reviewer identity, and append-only event logging.
    """
    valid_decisions = {
        "confirm": "VERIFIED",
        "needs_visit": "NEEDS_FIELD_VISIT",
        "dismiss": "DISMISSED"
    }

    if payload.decision not in valid_decisions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reviewer decision '{payload.decision}'. Must be one of: 'confirm', 'needs_visit', 'dismiss'."
        )

    target_status = valid_decisions[payload.decision]

    item = db.query(Intervention).filter(Intervention.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    current_status = item.review_status or "OBSERVED"

    # Optimistic concurrency check
    if payload.expected_status and payload.expected_status.strip().upper() != current_status.upper():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Status conflict: Intervention status is currently '{current_status}'. Please refresh the page before submitting."
        )

    # Note requirements validation:
    # notes required (min 10 chars) for needs_visit, dismiss, and any change from previous decision;
    # optional for first confirm.
    is_first_confirm = (current_status == "OBSERVED" and payload.decision == "confirm")
    if not is_first_confirm:
        if not payload.notes or len(payload.notes.strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Review notes are required (minimum 10 characters) for this decision."
            )

    reviewer_name = current_user.full_name or current_user.username
    now_utc = datetime.datetime.utcnow()
    clean_notes = payload.notes.strip() if payload.notes else None

    # Perform update and insert review event in ONE transaction
    from_status = current_status
    item.review_status = target_status
    item.status = target_status.lower()
    item.reviewer_decision = payload.decision
    item.reviewer_id = str(current_user.id)
    item.current_reviewer_id = reviewer_name
    item.reviewed_at = now_utc
    item.current_notes = clean_notes

    event = ReviewEvent(
        id=uuid.uuid4(),
        intervention_id=item.id,
        from_status=from_status,
        to_status=target_status,
        decision=payload.decision,
        notes=clean_notes,
        reviewer_id=reviewer_name,
        created_at=now_utc
    )
    db.add(event)
    db.commit()
    db.refresh(item)

    return _format_intervention_response(item, db)


@router.get("/{id}/reviews", response_model=List[ReviewEventResponse])
def get_intervention_reviews(id: uuid.UUID, db: Session = Depends(get_db)):
    """Returns append-only review history for an intervention, ordered newest first."""
    item = db.query(Intervention).filter(Intervention.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    events = db.query(ReviewEvent).filter(ReviewEvent.intervention_id == id).order_by(ReviewEvent.created_at.desc()).all()
    return [
        ReviewEventResponse(
            id=ev.id,
            intervention_id=ev.intervention_id,
            from_status=ev.from_status,
            to_status=ev.to_status,
            decision=ev.decision,
            notes=ev.notes,
            reviewer_id=ev.reviewer_id,
            reviewer_name=ev.reviewer_id,
            created_at=ev.created_at
        )
        for ev in events
    ]


@router.patch("/{id}/review", response_model=InterventionResponse)
def review_intervention_legacy(
    id: uuid.UUID,
    review: InterventionReview,
    db: Session = Depends(get_db)
):
    """
    Legacy compatibility review endpoint for older tests.
    """
    decision_map = {
        "confirm": "VERIFIED",
        "needs_field_visit": "NEEDS_FIELD_VISIT",
        "needs_visit": "NEEDS_FIELD_VISIT",
        "dismiss": "DISMISSED"
    }
    if review.decision not in decision_map:
        raise HTTPException(
            status_code=400,
            detail="Invalid reviewer decision. Must be one of: 'confirm', 'dismiss', 'needs_field_visit'"
        )

    item = db.query(Intervention).filter(Intervention.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    target_status = decision_map[review.decision]
    from_status = item.review_status or "OBSERVED"
    now_utc = datetime.datetime.utcnow()

    item.reviewer_decision = review.decision
    item.reviewer_id = review.reviewer_id
    item.current_reviewer_id = review.reviewer_id
    item.reviewed_at = now_utc
    item.review_status = target_status
    item.status = target_status.lower()
    if review.notes:
        item.current_notes = review.notes
        item.description = f"{item.description or ''}\nReviewer Note: {review.notes}".strip()

    event = ReviewEvent(
        id=uuid.uuid4(),
        intervention_id=item.id,
        from_status=from_status,
        to_status=target_status,
        decision=review.decision,
        notes=review.notes,
        reviewer_id=review.reviewer_id or "reviewer",
        created_at=now_utc
    )
    db.add(event)
    db.commit()
    db.refresh(item)

    return _format_intervention_response(item, db)


@router.post("/{id}/change-detection")
def run_intervention_change_detection(
    id: uuid.UUID,
    metric: str = Query("ndvi", pattern="^(ndvi|ndwi|NDVI|NDWI)$"),
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
