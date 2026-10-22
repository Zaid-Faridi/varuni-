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
        def deg_to_dms(deg):
            d = int(abs(deg))
            m = int((abs(deg) - d) * 60.0)
            s = float(round(((abs(deg) - d) * 60.0 - m) * 60.0, 2))
            return (float(d), float(m), s)

        gps_ifd = exif_dict.get_ifd(0x8825)
        gps_ifd[1] = 'N' if lat >= 0 else 'S'
        gps_ifd[2] = deg_to_dms(lat)
        gps_ifd[3] = 'E' if lon >= 0 else 'W'
        gps_ifd[4] = deg_to_dms(lon)

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


def test_photo_to_intervention_linking(client):
    """Verifies that uploading a photo and registering an intervention links and persists all metadata."""
    img_bytes = create_jpeg_with_exif(lat=18.45, lon=73.75)
    files = {"file": ("field_check_dam.jpg", img_bytes, "image/jpeg")}
    res_img = client.post("/api/v1/images/", files=files)
    assert res_img.status_code == 200
    img_data = res_img.json()
    assert img_data["original_filename"] == "field_check_dam.jpg"
    assert img_data["gps_source"] == "EXIF GPS"
    assert img_data["latitude"] == 18.45
    assert img_data["longitude"] == 73.75
    img_id = img_data["id"]
    object_uri = img_data["object_uri"]

    # Register intervention linked to this photo
    payload = {
        "name": "Linked Check Dam 01",
        "type": "check_dam",
        "status": "observed",
        "image_id": img_id,
        "photo_path": object_uri,
        "photo_filename": "field_check_dam.jpg",
        "exif_latitude": 18.45,
        "exif_longitude": 73.75,
        "gps_source": "EXIF GPS",
        "latitude": 18.45,
        "longitude": 73.75,
        "description": "Masonry check dam with EXIF ground photo."
    }
    res_itv = client.post("/api/v1/interventions/", json=payload)
    assert res_itv.status_code == 200
    itv_data = res_itv.json()
    assert itv_data["image_id"] == img_id
    assert itv_data["photo_path"] == object_uri
    assert itv_data["photo_filename"] == "field_check_dam.jpg"
    assert itv_data["exif_latitude"] == 18.45
    assert itv_data["exif_longitude"] == 73.75
    assert itv_data["gps_source"] == "EXIF GPS"

    # Detail query
    res_detail = client.get(f"/api/v1/interventions/{itv_data['id']}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["image_id"] == img_id
    assert detail["photo_path"] == object_uri
    assert detail["photo_filename"] == "field_check_dam.jpg"
    assert detail["gps_source"] == "EXIF GPS"

    # File serving query
    res_file = client.get(f"/api/v1/images/{img_id}/file")
    assert res_file.status_code == 200
    assert len(res_file.content) > 0

    # Static data route serving
    res_static = client.get(f"/data/{object_uri}")
    assert res_static.status_code == 200
    assert len(res_static.content) > 0
