import io
import pytest
from PIL import Image as PILImage
from PIL.ExifTags import TAGS, GPSTAGS
from routers.images import extract_exif_metadata


def create_jpeg_with_exif(lat=None, lon=None) -> bytes:
    """Helper creating an in-memory JPEG with optional GPS EXIF tags."""
    img = PILImage.new("RGB", (100, 100), color=(100, 150, 200))
    exif_dict = img.getexif()

    if lat is not None and lon is not None:
        # Convert decimal degrees to DMS rational format
        def deg_to_dms(deg):
            d = int(abs(deg))
            min_float = (abs(deg) - d) * 60.0
            m = int(min_float)
            s = int(round((min_float - m) * 60.0 * 100.0))
            return ((d, 1), (m, 1), (s, 100))

        gps_ifd = {
            1: 'N' if lat >= 0 else 'S',
            2: deg_to_dms(lat),
            3: 'E' if lon >= 0 else 'W',
            4: deg_to_dms(lon),
        }
        # EXIF GPS IFD tag ID is 34853 (0x8825)
        exif_dict[34853] = gps_ifd

    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif_dict)
    return buf.getvalue()


def test_exif_parsing_no_gps():
    """Verifies that an image without GPS returns None for coordinates."""
    img_bytes = create_jpeg_with_exif()
    meta = extract_exif_metadata(img_bytes)
    assert meta["latitude"] is None
    assert meta["longitude"] is None


def test_upload_image_no_gps_flow(client):
    """Verifies image upload without GPS results in 'no_gps' status and supports manual location."""
    img_bytes = create_jpeg_with_exif()
    files = {"file": ("test_photo.jpg", img_bytes, "image/jpeg")}
    res = client.post("/api/v1/images/", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["quality_status"] == "no_gps"
    assert data["latitude"] is None
    assert data["watershed_id"] is None

    img_id = data["id"]

    # Manual location flow
    res_loc = client.put(f"/api/v1/images/{img_id}/manual-location?latitude=18.45&longitude=73.75")
    assert res_loc.status_code == 200
    data_loc = res_loc.json()
    assert data_loc["is_manual_location"] is True
    assert data_loc["latitude"] == 18.45


def test_upload_image_outside_monitored_area(client):
    """Verifies image with GPS outside any monitored watershed is flagged 'outside_monitored_area'."""
    img_bytes = create_jpeg_with_exif()
    files = {"file": ("outside_photo.jpg", img_bytes, "image/jpeg")}
    res = client.post("/api/v1/images/", files=files)
    assert res.status_code == 200
    img_id = res.json()["id"]

    # Set manual location to a valid Indian coordinate that has NO watershed loaded
    res_loc = client.put(f"/api/v1/images/{img_id}/manual-location?latitude=28.61&longitude=77.20")
    assert res_loc.status_code == 200
    assert res_loc.json()["quality_status"] == "outside_monitored_area"
    assert res_loc.json()["watershed_id"] is None
