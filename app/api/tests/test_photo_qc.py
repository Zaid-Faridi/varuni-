import io
import pytest
import numpy as np
from PIL import Image as PILImage, ImageFilter
from services.photo_qc import evaluate_photo_qc, compute_blur_score, compute_exposure_metrics, compute_hashes, hamming_distance


def make_test_image(width=800, height=600, color=(120, 140, 160), blur=False) -> bytes:
    img = PILImage.new("RGB", (width, height), color=color)
    if blur:
        # Apply intense Gaussian blur to guarantee low Laplacian variance (< 100)
        img = img.filter(ImageFilter.GaussianBlur(radius=15))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_blur_detection(db_session):
    """Verifies that a blurry image is detected with Laplacian variance < 100 and reasons populated."""
    sharp_bytes = make_test_image(blur=False)
    blur_bytes = make_test_image(blur=True)

    qc_sharp = evaluate_photo_qc(db_session, sharp_bytes, latitude=18.75, longitude=73.87)
    qc_blur = evaluate_photo_qc(db_session, blur_bytes, latitude=18.75, longitude=73.87)

    assert qc_blur["is_blurry"] is True
    assert qc_blur["blur_score"] < 100.0
    assert any("blurry" in r.lower() for r in qc_blur["quality_reasons"])


def test_exposure_detection(db_session):
    """Verifies that underexposed (dark) and overexposed (washed out) images are flagged."""
    dark_bytes = make_test_image(color=(10, 10, 10))
    bright_bytes = make_test_image(color=(245, 245, 245))

    qc_dark = evaluate_photo_qc(db_session, dark_bytes, latitude=18.75, longitude=73.87)
    qc_bright = evaluate_photo_qc(db_session, bright_bytes, latitude=18.75, longitude=73.87)

    assert qc_dark["is_underexposed"] is True
    assert qc_dark["exposure_mean"] < 40.0
    assert any("underexposed" in r.lower() for r in qc_dark["quality_reasons"])

    assert qc_bright["is_overexposed"] is True
    assert qc_bright["exposure_mean"] > 220.0
    assert any("overexposed" in r.lower() for r in qc_bright["quality_reasons"])


def test_low_resolution_detection(db_session):
    """Verifies that an image below 640x480 minimum resolution is flagged."""
    low_res_bytes = make_test_image(width=320, height=240)
    qc_res = evaluate_photo_qc(db_session, low_res_bytes, latitude=18.75, longitude=73.87)

    assert qc_res["is_low_res"] is True
    assert qc_res["resolution_w"] == 320
    assert any("low resolution" in r.lower() for r in qc_res["quality_reasons"])


def test_duplicate_detection(client, db_session):
    """Verifies that an exact duplicate is detected via SHA-256 and linked instead of deleted."""
    img_bytes = make_test_image()
    
    # Upload first copy
    res1 = client.post("/api/v1/images/", files={"file": ("original.jpg", img_bytes, "image/jpeg")})
    assert res1.status_code == 200
    first_id = res1.json()["id"]

    # Upload exact duplicate copy
    res2 = client.post("/api/v1/images/", files={"file": ("duplicate_copy.jpg", img_bytes, "image/jpeg")})
    assert res2.status_code == 200
    data2 = res2.json()

    assert data2["quality_status"] == "duplicate"
    assert data2["duplicate_of_id"] == first_id
    assert any("duplicate" in r.lower() for r in data2["quality_reasons"])
