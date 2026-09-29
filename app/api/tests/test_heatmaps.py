import pytest
import uuid
import datetime
import numpy as np
from shapely.geometry import Polygon
from geoalchemy2.shape import from_shape

from satellite.ingest import process_surface_temperature, compute_pixel_anomaly, CLOUD_SHADOW_MASK_BITS
from satellite.zonal import get_palette_for_asset, get_legend_data, LST_PALETTE, ANOMALY_PALETTE
from models import Watershed, Intervention, ImageObservation


def test_lst_scaling_and_celsius_conversion():
    """Tests Landsat Collection 2 Level-2 Surface Temperature scaling formula."""
    # USGS formula: Kelvin = DN * 0.00341802 + 149.0
    # Celsius = Kelvin - 273.15
    # For DN = 44000:
    # Kelvin = 44000 * 0.00341802 + 149.0 = 150.39288 + 149.0 = 299.39288 K
    # Celsius = 299.39288 - 273.15 = 26.24288 °C
    thermal_dn = np.array([[44000, 48000], [0, 42000]], dtype=np.uint16)
    qa_pixel = np.array([[0, 0], [0, 0]], dtype=np.uint16)

    lst_c, valid_mask, valid_pct = process_surface_temperature(thermal_dn, qa_pixel)

    expected_c_00 = 44000 * 0.00341802 + 149.0 - 273.15
    assert np.isclose(lst_c[0, 0], expected_c_00, atol=1e-3)
    assert valid_mask[0, 0] is True or valid_mask[0, 0] == 1
    # DN=0 should be masked out
    assert np.isnan(lst_c[1, 0])
    assert valid_mask[1, 0] == 0


def test_lst_cloud_shadow_masking():
    """Tests that QA_PIXEL flags (cloud, shadow, cirrus) mask out thermal pixels."""
    thermal_dn = np.array([[45000, 45000], [45000, 45000]], dtype=np.uint16)
    # Bit 3 = Cloud (8), Bit 4 = Cloud Shadow (16)
    qa_pixel = np.array([
        [0, 1 << 3],  # Clear, Cloud
        [1 << 4, 1 << 1]  # Shadow, Dilated cloud
    ], dtype=np.uint16)

    lst_c, valid_mask, valid_pct = process_surface_temperature(thermal_dn, qa_pixel)

    assert valid_mask[0, 0] == 1
    assert valid_mask[0, 1] == 0
    assert valid_mask[1, 0] == 0
    assert valid_mask[1, 1] == 0
    assert np.isnan(lst_c[0, 1])
    assert valid_pct == 25.0


def test_anomaly_zscore_calculation():
    """Tests per-pixel Median and MAD Z-score calculation with >= 3 historical observations."""
    # Create 3 historical same-season NDVI grids (2x2)
    # At pixel (0,0): history = [0.4, 0.5, 0.6] -> median = 0.5, MAD = 0.1, sigma = 0.14826
    # Current = 0.8 -> Z = (0.8 - 0.5) / 0.14826 = +2.0234
    hist1 = np.array([[0.4, 0.3], [0.2, 0.5]], dtype=np.float32)
    hist2 = np.array([[0.5, 0.3], [0.2, 0.5]], dtype=np.float32)
    hist3 = np.array([[0.6, 0.3], [0.2, 0.5]], dtype=np.float32)
    hist_stack = [hist1, hist2, hist3]

    current_ndvi = np.array([[0.8, 0.3], [0.2, np.nan]], dtype=np.float32)

    z_grid, valid_mask, stats = compute_pixel_anomaly(current_ndvi, hist_stack, min_observations=3)

    assert stats["status"] == "computed"
    assert z_grid[0, 0] > 1.9
    assert np.isclose(z_grid[0, 1], 0.0, atol=0.01)  # current matches historical exactly
    assert np.isnan(z_grid[1, 1])  # NaN current value remains NaN


def test_anomaly_insufficient_history():
    """Tests that anomaly calculation handles < 3 historical observations by returning transparent nodata."""
    hist1 = np.array([[0.4, 0.3], [0.2, 0.5]], dtype=np.float32)
    hist2 = np.array([[0.5, 0.3], [0.2, 0.5]], dtype=np.float32)
    hist_stack = [hist1, hist2]  # Only 2 observations

    current_ndvi = np.array([[0.8, 0.3], [0.2, 0.5]], dtype=np.float32)

    z_grid, valid_mask, stats = compute_pixel_anomaly(current_ndvi, hist_stack, min_observations=3)

    assert stats["status"] == "insufficient_history"
    assert np.all(np.isnan(z_grid))
    assert np.all(~valid_mask)


def test_legend_metadata_and_resolution_notes():
    """Tests that legend metadata provides resolution disclaimers for LST and Anomaly."""
    lst_legend = get_legend_data("asset-123", "lst")
    assert lst_legend["asset_type"] == "lst"
    assert "Thermal band natively 100m" in lst_legend["note"]

    anomaly_legend = get_legend_data("asset-456", "anomaly")
    assert anomaly_legend["asset_type"] == "anomaly"
    assert "historical seasonal baseline" in anomaly_legend["note"]


def test_points_density_api_endpoint(client, db_session):
    """Tests the GET /api/v1/watersheds/{id}/points-density endpoint."""
    # 1. Create a test watershed
    poly = Polygon([(73.80, 18.50), (73.90, 18.50), (73.90, 18.60), (73.80, 18.60), (73.80, 18.50)])
    ws_id = uuid.uuid4()
    ws = Watershed(
        id=ws_id,
        name="Density Test Catchment",
        geometry=from_shape(poly, srid=4326),
        area_sqkm=15.0,
        perimeter_km=16.0
    )
    db_session.add(ws)

    # 2. Add an intervention
    itv = Intervention(
        id=uuid.uuid4(),
        watershed_id=ws_id,
        name="Check Dam Alpha",
        type="check_dam",
        status="verified",
        latitude=18.55,
        longitude=73.85,
        geom="SRID=4326;POINT(73.85 18.55)",
        observed_at=datetime.datetime(2025, 6, 15, 10, 0, 0)
    )
    db_session.add(itv)

    # 3. Add an image observation
    img = ImageObservation(
        id=uuid.uuid4(),
        watershed_id=ws_id,
        object_uri="photos/test1.jpg",
        latitude=18.56,
        longitude=73.86,
        quality_status="good",
        intervention_type="check_dam",
        captured_at=datetime.datetime(2025, 6, 16, 11, 0, 0)
    )
    db_session.add(img)
    db_session.commit()

    # Query all points
    res = client.get(f"/api/v1/watersheds/{ws_id}/points-density?bandwidth_m=1000")
    assert res.status_code == 200
    data = res.json()
    assert data["watershed_id"] == str(ws_id)
    assert data["total_points"] == 2
    assert data["bandwidth_m"] == 1000.0
    assert len(data["points"]) == 2
    assert len(data["heat_points"]) == 2
    assert data["legend"]["interventions_count"] == 1
    assert data["legend"]["photos_count"] == 1
    assert "Shows where documentation" in data["legend"]["disclaimer"]

    # Query filter source_type=interventions
    res_itv = client.get(f"/api/v1/watersheds/{ws_id}/points-density?source_type=interventions")
    assert res_itv.status_code == 200
    data_itv = res_itv.json()
    assert data_itv["total_points"] == 1
    assert data_itv["points"][0]["source"] == "intervention"

    # Query filter source_type=photos
    res_photos = client.get(f"/api/v1/watersheds/{ws_id}/points-density?source_type=photos")
    assert res_photos.status_code == 200
    data_photos = res_photos.json()
    assert data_photos["total_points"] == 1
    assert data_photos["points"][0]["source"] == "photo"
