"""
Deterministic Photo Quality Control (QC) Service

Executes deterministic, non-ML quality checks upon upload:
1. Sharpness / Blur score (Variance of Laplacian via OpenCV).
2. Exposure analysis (Mean pixel brightness, highlight/shadow clipped-pixel percentage).
3. Resolution verification (Min 640x480).
4. Exact duplicate detection (SHA-256 cryptographic hash).
5. Near-duplicate detection (Perceptual difference hash with Hamming distance <= 5).
6. Metadata sanity:
   - Same-GPS/same-timestamp bulk upload detection (within 60 seconds and 5m).
   - Spatial boundary check: coordinates must lie inside claimed watershed polygon.
7. Quality score & explainable reasons list (never silently deletes or hides poor images).
"""

import io
import hashlib
import datetime
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import cv2
from PIL import Image
import imagehash
from sqlalchemy.orm import Session
from sqlalchemy import text
from shapely.geometry import Point
from geoalchemy2.shape import to_shape

try:
    from models import ImageObservation, Watershed
except ImportError:
    from app.api.models import ImageObservation, Watershed


def compute_blur_score(cv_gray: np.ndarray) -> float:
    """
    Computes variance of Laplacian on grayscale image.
    Higher values = sharper image, lower values (< 100.0) = blurry / out of focus.
    """
    laplacian = cv2.Laplacian(cv_gray, cv2.CV_64F)
    variance = float(laplacian.var())
    return round(variance, 2)


def compute_exposure_metrics(cv_gray: np.ndarray) -> Tuple[float, float]:
    """
    Computes:
    1. Mean brightness (0 to 255).
    2. Percentage of clipped pixels (underexposed <= 5 or overexposed >= 250).
    """
    mean_val = float(np.mean(cv_gray))
    total_pixels = cv_gray.size
    clipped_count = np.sum((cv_gray <= 5) | (cv_gray >= 250))
    clipped_pct = float((clipped_count / total_pixels) * 100.0)
    return round(mean_val, 2), round(clipped_pct, 2)


def compute_hashes(img_bytes: bytes, pil_img: Image.Image) -> Tuple[str, str]:
    """
    Computes:
    1. SHA-256 cryptographic checksum (for exact duplicates).
    2. Perceptual Difference Hash (dHash) hex string (for near-duplicates).
    """
    sha256_hash = hashlib.sha256(img_bytes).hexdigest()
    phash = str(imagehash.dhash(pil_img))
    return sha256_hash, phash


def hamming_distance(hash1: str, hash2: str) -> int:
    """Computes Hamming distance between two hex perceptual hash strings."""
    try:
        h1 = imagehash.hex_to_hash(hash1)
        h2 = imagehash.hex_to_hash(hash2)
        return int(h1 - h2)
    except Exception:
        return 999


def evaluate_photo_qc(
    db: Session,
    img_bytes: bytes,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    captured_at: Optional[datetime.datetime] = None,
    claimed_watershed_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates complete deterministic quality metrics for a photo.
    Returns dictionary with all metrics, scores, reasons, and duplicate references.
    """
    reasons: List[str] = []
    quality_score = 1.0
    duplicate_of_id = None
    is_duplicate = False

    # 1. Decode Image with PIL and OpenCV
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    width, height = pil_img.size
    
    # Convert to OpenCV BGR then grayscale
    np_arr = np.frombuffer(img_bytes, np.uint8)
    cv_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if cv_img is None:
        cv_img = np.array(pil_img)[:, :, ::-1]  # RGB to BGR
    cv_gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

    # 2. Blur / Sharpness check
    blur_score = compute_blur_score(cv_gray)
    if blur_score < 100.0:
        quality_score -= 0.35
        reasons.append(f"Image is blurry (Laplacian variance {blur_score:.1f} < 100.0)")

    # 3. Exposure & Clipping check
    exposure_mean, clipped_pct = compute_exposure_metrics(cv_gray)
    if exposure_mean < 40.0:
        quality_score -= 0.25
        reasons.append(f"Underexposed / too dark (mean brightness {exposure_mean:.1f} < 40.0)")
    elif exposure_mean > 220.0:
        quality_score -= 0.25
        reasons.append(f"Overexposed / washed out (mean brightness {exposure_mean:.1f} > 220.0)")

    if clipped_pct > 25.0:
        quality_score -= 0.15
        reasons.append(f"Severe highlight/shadow clipping ({clipped_pct:.1f}% pixels clipped > 25%)")

    # 4. Resolution check
    if width < 640 or height < 480:
        quality_score -= 0.20
        reasons.append(f"Low resolution ({width}x{height} < 640x480 minimum)")

    # 5. Exact & Near Duplicate Checks
    sha256_hash, phash_str = compute_hashes(img_bytes, pil_img)

    # Check exact duplicate (SHA-256)
    exact_match = db.query(ImageObservation).filter(
        ImageObservation.sha256_hash == sha256_hash
    ).first()
    if exact_match:
        is_duplicate = True
        duplicate_of_id = str(exact_match.id)
        quality_score -= 0.50
        reasons.append(f"Exact duplicate of photo {exact_match.id} (matching SHA-256 checksum)")
    else:
        # Check near duplicate across perceptual hashes in DB
        existing_images = db.query(
            ImageObservation.id, ImageObservation.perceptual_hash
        ).filter(
            ImageObservation.perceptual_hash.isnot(None)
        ).limit(500).all()

        for ex_id, ex_phash in existing_images:
            if ex_phash:
                dist = hamming_distance(phash_str, ex_phash)
                if dist <= 5:
                    is_duplicate = True
                    duplicate_of_id = str(ex_id)
                    quality_score -= 0.40
                    reasons.append(f"Near-duplicate of photo {ex_id} (perceptual Hamming distance {dist} <= 5)")
                    break

    # 6. Metadata Sanity: Same-GPS / Same-timestamp Bulk Uploads
    if latitude is not None and longitude is not None and captured_at is not None:
        time_window_start = captured_at - datetime.timedelta(seconds=60)
        time_window_end = captured_at + datetime.timedelta(seconds=60)
        
        # Check existing images within +/- 60s and 0.0001 deg (~10m)
        bulk_candidate = db.query(ImageObservation).filter(
            ImageObservation.latitude.between(latitude - 0.0001, latitude + 0.0001),
            ImageObservation.longitude.between(longitude - 0.0001, longitude + 0.0001),
            ImageObservation.captured_at.between(time_window_start, time_window_end)
        ).first()

        if bulk_candidate and str(bulk_candidate.id) != duplicate_of_id:
            quality_score -= 0.15
            reasons.append(f"Potential duplicate bulk upload (same coordinates & timestamp within 60s of {bulk_candidate.id})")

    # 7. Spatial Plausibility for Claimed Watershed
    if claimed_watershed_id and latitude is not None and longitude is not None:
        try:
            ws = db.query(Watershed).filter(Watershed.id == claimed_watershed_id).first()
            if ws:
                ws_poly = to_shape(ws.geometry)
                pt = Point(longitude, latitude)
                if not ws_poly.contains(pt):
                    quality_score -= 0.25
                    reasons.append(f"Coordinates ({latitude:.4f}N, {longitude:.4f}E) lie outside claimed watershed boundary '{ws.name}'")
        except Exception as e:
            print(f"Notice: Could not check spatial boundary: {e}")

    # Determine status
    quality_score = max(0.0, min(1.0, round(quality_score, 2)))
    if is_duplicate:
        status = "duplicate"
    elif quality_score < 0.70 or len(reasons) > 0:
        status = "poor" if quality_score < 0.70 else "good"
    else:
        status = "good"

    if latitude is None or longitude is None:
        if not is_duplicate:
            status = "no_gps"
        reasons.append("No EXIF GPS metadata found in photograph")

    return {
        "quality_score": quality_score,
        "quality_status": status,
        "quality_reasons": reasons,
        "blur_score": blur_score,
        "exposure_mean": exposure_mean,
        "clipped_pixel_pct": clipped_pct,
        "resolution_w": width,
        "resolution_h": height,
        "sha256_hash": sha256_hash,
        "perceptual_hash": phash_str,
        "duplicate_of_id": duplicate_of_id,
        "is_blurry": blur_score < 100.0,
        "is_underexposed": exposure_mean < 40.0,
        "is_overexposed": exposure_mean > 220.0,
        "is_low_res": width < 640 or height < 480,
    }
