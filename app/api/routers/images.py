import os
import uuid
import datetime
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from PIL import Image as PILImage
import exifread
import io

from database import get_db
from models import ImageObservation, Watershed, RasterAsset, SatelliteScene, ImageGroundTruthLabel
from schemas import (
    ImageResponse,
    ImageSatelliteContext,
    SatelliteContextScene,
    TimeSeriesPointResponse,
    ImageLabelReviewRequest
)
from satellite.zonal import sample_raster_at_point
from services.photo_qc import evaluate_photo_qc
from services.classifier import classify_photo_zero_shot

router = APIRouter(
    prefix="/api/v1/images",
    tags=["images"]
)

# India bounding box for coordinate sanity validation
INDIA_BBOX = {"min_lat": 6.0, "max_lat": 38.0, "min_lon": 68.0, "max_lon": 98.0}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

UPLOAD_DIR = os.getenv("DATA_DIR", "./data") + "/uploads"
THUMB_DIR = os.getenv("DATA_DIR", "./data") + "/thumbnails"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)


def _convert_dms_to_deg(dms_values, ref: str) -> Optional[float]:
    """Converts GPS DMS (degrees, minutes, seconds) ratio objects to decimal degrees."""
    try:
        d = float(dms_values[0].num) / float(dms_values[0].den)
        m = float(dms_values[1].num) / float(dms_values[1].den)
        s = float(dms_values[2].num) / float(dms_values[2].den)
        deg = d + (m / 60.0) + (s / 3600.0)
        if ref in ['S', 'W']:
            deg = -deg
        return round(deg, 6)
    except Exception:
        return None


def extract_exif_metadata(image_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts GPS coordinates, capture date, altitude, and camera model from image EXIF.
    Does NOT store device serials or personal hardware identifiers.
    """
    tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
    
    lat = None
    lon = None
    alt = None
    captured_at = None
    camera_model = None

    if "GPS GPSLatitude" in tags and "GPS GPSLatitudeRef" in tags:
        lat = _convert_dms_to_deg(tags["GPS GPSLatitude"].values, str(tags["GPS GPSLatitudeRef"].values))
    if "GPS GPSLongitude" in tags and "GPS GPSLongitudeRef" in tags:
        lon = _convert_dms_to_deg(tags["GPS GPSLongitude"].values, str(tags["GPS GPSLongitudeRef"].values))
    if "GPS GPSAltitude" in tags:
        try:
            val = tags["GPS GPSAltitude"].values[0]
            alt = round(float(val.num) / float(val.den), 1)
        except Exception:
            pass

    # Extract capture timestamp
    for date_tag in ["EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"]:
        if date_tag in tags:
            try:
                date_str = str(tags[date_tag].values)
                captured_at = datetime.datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
                break
            except Exception:
                pass

    if "Image Model" in tags:
        make = str(tags.get("Image Make", "")).strip()
        model = str(tags["Image Model"]).strip()
        camera_model = f"{make} {model}".strip() if make and make not in model else model

    return {
        "latitude": lat,
        "longitude": lon,
        "altitude": alt,
        "captured_at": captured_at,
        "camera_model": camera_model
    }


def compute_satellite_context(
    latitude: float,
    longitude: float,
    captured_at: Optional[datetime.datetime],
    watershed_id: uuid.UUID,
    db: Session
) -> ImageSatelliteContext:
    """Samples NDVI and NDWI at the photo pixel and 3x3 window."""
    target_dt = captured_at or datetime.datetime.utcnow()

    # Query all clear NDVI raster assets for this watershed
    assets = (
        db.query(RasterAsset)
        .filter(
            RasterAsset.watershed_id == watershed_id,
            RasterAsset.asset_type == "ndvi",
            RasterAsset.is_flagged == False
        )
        .all()
    )

    if not assets:
        return ImageSatelliteContext(time_series_at_pixel=[], message="No clear satellite rasters ingested for this watershed.")

    # Sort assets by acquisition date
    asset_dates = []
    for a in assets:
        scene = db.query(SatelliteScene).filter(SatelliteScene.id == a.scene_id).first() if a.scene_id else None
        dt = scene.acquisition_time if scene else a.created_at
        asset_dates.append((a, dt, scene))

    asset_dates.sort(key=lambda x: x[1])

    time_series = []
    before_scene = None
    after_scene = None
    min_before_gap = float("inf")
    min_after_gap = float("inf")

    for asset, dt, scene in asset_dates:
        px_val, win_mean = sample_raster_at_point(asset.uri, latitude, longitude)
        if px_val is not None:
            scene_code = scene.scene_id if scene else asset.name
            time_series.append(TimeSeriesPointResponse(
                date=dt.strftime("%Y-%m-%d"),
                value=round(px_val, 4),
                scene_id=scene_code,
                valid_pct=asset.valid_pct or 100.0
            ))

            day_gap = (dt.date() - target_dt.date()).days
            if day_gap <= 0:
                gap = abs(day_gap)
                if gap < min_before_gap:
                    min_before_gap = gap
                    before_scene = SatelliteContextScene(
                        scene_id=scene_code,
                        date=dt.strftime("%Y-%m-%d"),
                        day_gap=gap,
                        ndvi=round(px_val, 4),
                        window_3x3_mean_ndvi=round(win_mean, 4) if win_mean is not None else None,
                        is_far_gap=gap > 30
                    )
            else:
                gap = day_gap
                if gap < min_after_gap:
                    min_after_gap = gap
                    after_scene = SatelliteContextScene(
                        scene_id=scene_code,
                        date=dt.strftime("%Y-%m-%d"),
                        day_gap=gap,
                        ndvi=round(px_val, 4),
                        window_3x3_mean_ndvi=round(win_mean, 4) if win_mean is not None else None,
                        is_far_gap=gap > 30
                    )

    return ImageSatelliteContext(
        nearest_before=before_scene,
        nearest_after=after_scene,
        time_series_at_pixel=time_series,
        message=None
    )


@router.post("/", response_model=ImageResponse)
async def upload_image(
    file: UploadFile = File(...),
    watershed_id: Optional[uuid.UUID] = Form(None),
    intervention_type: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Real Photo Pipeline Upload:
    - Content-type sniffing & size validation.
    - Server-side EXIF GPS extraction.
    - Deterministic non-ML Quality Control (Blur, exposure, resolution, duplicates, metadata sanity).
    - Zero-Shot CLIP photo classification against 7-class taxonomy.
    - PostGIS ST_Contains spatial join.
    - Satellite 30m pixel context extraction.
    """
    # 1. Content-Type Sniffing
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum 25 MB limit")

    if not contents.startswith(b'\xff\xd8\xff') and not contents.startswith(b'\x89PNG\r\n\x1a\n'):
        raise HTTPException(status_code=400, detail="Invalid image file. Only genuine JPEG and PNG files accepted.")

    # 2. Server-side EXIF Extraction
    exif_info = extract_exif_metadata(contents)
    lat = exif_info.get("latitude")
    lon = exif_info.get("longitude")
    captured_at = exif_info.get("captured_at")
    alt = exif_info.get("altitude")
    camera_model = exif_info.get("camera_model")

    if captured_at and captured_at > datetime.datetime.utcnow() + datetime.timedelta(days=1):
        captured_at = datetime.datetime.utcnow()

    # 3. Deterministic Photo Quality Control (No ML)
    qc_result = evaluate_photo_qc(
        db=db,
        img_bytes=contents,
        latitude=lat,
        longitude=lon,
        captured_at=captured_at,
        claimed_watershed_id=str(watershed_id) if watershed_id else None
    )

    # 4. Zero-Shot CLIP Photo Classification
    classification_res = classify_photo_zero_shot(
        img_bytes=contents,
        confidence_threshold=0.50,
        margin_threshold=0.10
    )

    # 5. Save original image to data/uploads
    img_id = uuid.uuid4()
    ext = os.path.splitext(file.filename)[1].lower() or ".jpg"
    filename = f"{img_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(contents)

    # 6. Generate thumbnail
    thumb_path = os.path.join(THUMB_DIR, f"{img_id}_thumb.jpg")
    try:
        with PILImage.open(io.BytesIO(contents)) as pil_img:
            pil_img.thumbnail((300, 300))
            pil_img.convert("RGB").save(thumb_path, "JPEG", quality=85)
    except Exception as e:
        print(f"Error generating thumbnail: {e}")

    # 7. Spatial validation and PostGIS Watershed Join
    matched_watershed_id = watershed_id
    watershed_name = None
    geom_wkt = None
    is_manual = False

    if lat is not None and lon is not None:
        if INDIA_BBOX["min_lat"] <= lat <= INDIA_BBOX["max_lat"] and INDIA_BBOX["min_lon"] <= lon <= INDIA_BBOX["max_lon"]:
            geom_wkt = f"SRID=4326;POINT({lon} {lat})"
            query = text("""
                SELECT id, name FROM watersheds 
                WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
                LIMIT 1
            """)
            match = db.execute(query, {"lon": lon, "lat": lat}).fetchone()
            if match:
                matched_watershed_id = match[0]
                watershed_name = match[1]
            elif not matched_watershed_id:
                qc_result["quality_status"] = "outside_monitored_area"

    db_image = ImageObservation(
        id=img_id,
        object_uri=f"uploads/{filename}",
        thumbnail_uri=f"thumbnails/{img_id}_thumb.jpg",
        captured_at=captured_at or datetime.datetime.utcnow(),
        latitude=lat,
        longitude=lon,
        geom=geom_wkt,
        watershed_id=matched_watershed_id,
        quality_status=qc_result["quality_status"],
        quality_score=qc_result["quality_score"],
        quality_reasons=qc_result["quality_reasons"],
        blur_score=qc_result["blur_score"],
        exposure_mean=qc_result["exposure_mean"],
        clipped_pixel_pct=qc_result["clipped_pixel_pct"],
        resolution_w=qc_result["resolution_w"],
        resolution_h=qc_result["resolution_h"],
        sha256_hash=qc_result["sha256_hash"],
        perceptual_hash=qc_result["perceptual_hash"],
        duplicate_of_id=qc_result["duplicate_of_id"],
        classification_result=classification_res,
        camera_model=camera_model,
        altitude=alt,
        intervention_type=intervention_type or classification_res["top_1"],
        is_manual_location=is_manual
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    # 8. Compute satellite context if location is available
    sat_context = None
    if lat is not None and lon is not None and matched_watershed_id:
        sat_context = compute_satellite_context(lat, lon, captured_at, matched_watershed_id, db)

    return ImageResponse(
        id=db_image.id,
        object_uri=db_image.object_uri,
        thumbnail_uri=db_image.thumbnail_uri,
        captured_at=db_image.captured_at,
        latitude=db_image.latitude,
        longitude=db_image.longitude,
        watershed_id=db_image.watershed_id,
        watershed_name=watershed_name,
        quality_status=db_image.quality_status,
        quality_score=db_image.quality_score,
        quality_reasons=db_image.quality_reasons,
        blur_score=db_image.blur_score,
        exposure_mean=db_image.exposure_mean,
        clipped_pixel_pct=db_image.clipped_pixel_pct,
        resolution_w=db_image.resolution_w,
        resolution_h=db_image.resolution_h,
        sha256_hash=db_image.sha256_hash,
        perceptual_hash=db_image.perceptual_hash,
        duplicate_of_id=db_image.duplicate_of_id,
        classification_result=db_image.classification_result,
        reviewer_label=db_image.reviewer_label,
        privacy_status=db_image.privacy_status,
        ai_tags=db_image.ai_tags,
        intervention_type=db_image.intervention_type,
        camera_model=db_image.camera_model,
        altitude=db_image.altitude,
        is_manual_location=db_image.is_manual_location,
        satellite_context=sat_context,
        created_at=db_image.created_at
    )


@router.get("/", response_model=List[ImageResponse])
def list_images(
    watershed_id: Optional[uuid.UUID] = None,
    quality_status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List images with optional watershed and quality filters."""
    query = db.query(ImageObservation)
    if watershed_id:
        query = query.filter(ImageObservation.watershed_id == watershed_id)
    if quality_status:
        query = query.filter(ImageObservation.quality_status == quality_status)
    images = query.order_by(ImageObservation.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for img in images:
        ws_name = img.watershed.name if img.watershed else None
        results.append(ImageResponse(
            id=img.id,
            object_uri=img.object_uri,
            thumbnail_uri=img.thumbnail_uri,
            captured_at=img.captured_at,
            latitude=img.latitude,
            longitude=img.longitude,
            watershed_id=img.watershed_id,
            watershed_name=ws_name,
            quality_status=img.quality_status,
            quality_score=img.quality_score,
            quality_reasons=img.quality_reasons,
            blur_score=img.blur_score,
            exposure_mean=img.exposure_mean,
            clipped_pixel_pct=img.clipped_pixel_pct,
            resolution_w=img.resolution_w,
            resolution_h=img.resolution_h,
            sha256_hash=img.sha256_hash,
            perceptual_hash=img.perceptual_hash,
            duplicate_of_id=img.duplicate_of_id,
            classification_result=img.classification_result,
            reviewer_label=img.reviewer_label,
            reviewer_label_notes=img.reviewer_label_notes,
            reviewer_label_at=img.reviewer_label_at,
            privacy_status=img.privacy_status,
            intervention_type=img.intervention_type,
            camera_model=img.camera_model,
            altitude=img.altitude,
            is_manual_location=img.is_manual_location,
            created_at=img.created_at
        ))
    return results


@router.get("/quality/flagged", response_model=List[ImageResponse])
def list_flagged_images(
    reason_filter: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns all photos with quality warnings (poor quality, blurry, duplicate, no GPS, or outside boundary)
    for the Data Quality inspection dashboard.
    """
    query = db.query(ImageObservation).filter(
        or_(
            ImageObservation.quality_status.in_(["poor", "duplicate", "no_gps", "outside_monitored_area"]),
            ImageObservation.duplicate_of_id.isnot(None),
            ImageObservation.blur_score < 100.0,
            ImageObservation.quality_score < 0.80
        )
    )

    images = query.order_by(ImageObservation.created_at.desc()).all()
    results = []
    for img in images:
        if reason_filter:
            reasons_str = " ".join(img.quality_reasons or []).lower()
            if reason_filter.lower() not in reasons_str and reason_filter.lower() not in img.quality_status.lower():
                continue

        ws_name = img.watershed.name if img.watershed else None
        results.append(ImageResponse(
            id=img.id,
            object_uri=img.object_uri,
            thumbnail_uri=img.thumbnail_uri,
            captured_at=img.captured_at,
            latitude=img.latitude,
            longitude=img.longitude,
            watershed_id=img.watershed_id,
            watershed_name=ws_name,
            quality_status=img.quality_status,
            quality_score=img.quality_score,
            quality_reasons=img.quality_reasons,
            blur_score=img.blur_score,
            exposure_mean=img.exposure_mean,
            clipped_pixel_pct=img.clipped_pixel_pct,
            resolution_w=img.resolution_w,
            resolution_h=img.resolution_h,
            sha256_hash=img.sha256_hash,
            perceptual_hash=img.perceptual_hash,
            duplicate_of_id=img.duplicate_of_id,
            classification_result=img.classification_result,
            reviewer_label=img.reviewer_label,
            privacy_status=img.privacy_status,
            intervention_type=img.intervention_type,
            camera_model=img.camera_model,
            altitude=img.altitude,
            is_manual_location=img.is_manual_location,
            created_at=img.created_at
        ))
    return results


@router.post("/{id}/label", response_model=ImageResponse)
def review_image_label(
    id: uuid.UUID,
    payload: ImageLabelReviewRequest,
    db: Session = Depends(get_db)
):
    """
    Reviewer label ground truth registration.
    Saves human-verified label in `image_ground_truth_labels` for future model evaluation
    without auto-retraining.
    """
    img = db.query(ImageObservation).filter(ImageObservation.id == id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    original_label = (img.classification_result or {}).get("top_1")
    original_conf = (img.classification_result or {}).get("confidence")

    # Update image record
    img.reviewer_label = payload.assigned_label
    img.reviewer_label_notes = payload.notes
    img.reviewer_label_at = datetime.datetime.utcnow()
    img.reviewer_id = payload.reviewer_id

    # Create ground truth record
    gt = ImageGroundTruthLabel(
        id=uuid.uuid4(),
        image_id=img.id,
        assigned_label=payload.assigned_label,
        original_model_label=original_label,
        original_confidence=original_conf,
        reviewer_id=payload.reviewer_id,
        reviewer_notes=payload.notes
    )
    db.add(gt)
    db.commit()
    db.refresh(img)

    ws_name = img.watershed.name if img.watershed else None
    return ImageResponse(
        id=img.id,
        object_uri=img.object_uri,
        thumbnail_uri=img.thumbnail_uri,
        captured_at=img.captured_at,
        latitude=img.latitude,
        longitude=img.longitude,
        watershed_id=img.watershed_id,
        watershed_name=ws_name,
        quality_status=img.quality_status,
        quality_score=img.quality_score,
        quality_reasons=img.quality_reasons,
        blur_score=img.blur_score,
        exposure_mean=img.exposure_mean,
        clipped_pixel_pct=img.clipped_pixel_pct,
        resolution_w=img.resolution_w,
        resolution_h=img.resolution_h,
        sha256_hash=img.sha256_hash,
        perceptual_hash=img.perceptual_hash,
        duplicate_of_id=img.duplicate_of_id,
        classification_result=img.classification_result,
        reviewer_label=img.reviewer_label,
        reviewer_label_notes=img.reviewer_label_notes,
        reviewer_label_at=img.reviewer_label_at,
        privacy_status=img.privacy_status,
        intervention_type=img.intervention_type,
        camera_model=img.camera_model,
        altitude=img.altitude,
        is_manual_location=img.is_manual_location,
        created_at=img.created_at
    )


@router.get("/{id}", response_model=ImageResponse)
def get_image_detail(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get image details with QC breakdown and satellite context."""
    img = db.query(ImageObservation).filter(ImageObservation.id == id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    sat_context = None
    if img.latitude is not None and img.longitude is not None and img.watershed_id:
        sat_context = compute_satellite_context(img.latitude, img.longitude, img.captured_at, img.watershed_id, db)

    ws_name = img.watershed.name if img.watershed else None
    return ImageResponse(
        id=img.id,
        object_uri=img.object_uri,
        thumbnail_uri=img.thumbnail_uri,
        captured_at=img.captured_at,
        latitude=img.latitude,
        longitude=img.longitude,
        watershed_id=img.watershed_id,
        watershed_name=ws_name,
        quality_status=img.quality_status,
        quality_score=img.quality_score,
        quality_reasons=img.quality_reasons,
        blur_score=img.blur_score,
        exposure_mean=img.exposure_mean,
        clipped_pixel_pct=img.clipped_pixel_pct,
        resolution_w=img.resolution_w,
        resolution_h=img.resolution_h,
        sha256_hash=img.sha256_hash,
        perceptual_hash=img.perceptual_hash,
        duplicate_of_id=img.duplicate_of_id,
        classification_result=img.classification_result,
        reviewer_label=img.reviewer_label,
        reviewer_label_notes=img.reviewer_label_notes,
        reviewer_label_at=img.reviewer_label_at,
        privacy_status=img.privacy_status,
        ai_tags=img.ai_tags,
        intervention_type=img.intervention_type,
        camera_model=img.camera_model,
        altitude=img.altitude,
        is_manual_location=img.is_manual_location,
        satellite_context=sat_context,
        created_at=img.created_at
    )


@router.put("/{id}/manual-location", response_model=ImageResponse)
def set_manual_location(
    id: uuid.UUID,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db)
):
    """Assigns manual coordinates to an image that had no EXIF GPS."""
    img = db.query(ImageObservation).filter(ImageObservation.id == id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    img.latitude = latitude
    img.longitude = longitude
    img.is_manual_location = True
    img.geom = f"SRID=4326;POINT({longitude} {latitude})"

    # Find matching watershed
    query = text("""
        SELECT id, name FROM watersheds 
        WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(:lon, :lat), 4326))
        LIMIT 1
    """)
    match = db.execute(query, {"lon": longitude, "lat": latitude}).fetchone()
    if match:
        img.watershed_id = match[0]
        img.quality_status = "good" if (img.quality_score or 1.0) >= 0.70 else "poor"
    else:
        img.quality_status = "outside_monitored_area"

    db.commit()
    db.refresh(img)
    ws_name = img.watershed.name if img.watershed else None

    return ImageResponse(
        id=img.id,
        object_uri=img.object_uri,
        thumbnail_uri=img.thumbnail_uri,
        captured_at=img.captured_at,
        latitude=img.latitude,
        longitude=img.longitude,
        watershed_id=img.watershed_id,
        watershed_name=ws_name,
        quality_status=img.quality_status,
        quality_score=img.quality_score,
        quality_reasons=img.quality_reasons,
        privacy_status=img.privacy_status,
        intervention_type=img.intervention_type,
        camera_model=img.camera_model,
        is_manual_location=img.is_manual_location,
        created_at=img.created_at
    )


@router.get("/{id}/file")
def get_image_file(id: uuid.UUID, db: Session = Depends(get_db)):
    """Serves the original image file."""
    img = db.query(ImageObservation).filter(ImageObservation.id == id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    file_path = os.path.join(os.getenv("DATA_DIR", "./data"), img.object_uri)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File on disk not found")
    return FileResponse(file_path)


@router.get("/{id}/thumbnail")
def get_image_thumbnail(id: uuid.UUID, db: Session = Depends(get_db)):
    """Serves the thumbnail file."""
    img = db.query(ImageObservation).filter(ImageObservation.id == id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    thumb_path = os.path.join(os.getenv("DATA_DIR", "./data"), img.thumbnail_uri or "")
    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(thumb_path)
