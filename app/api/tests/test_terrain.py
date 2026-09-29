import uuid
import pytest
import numpy as np
from satellite.terrain import compute_slope_degrees, process_watershed_terrain, query_point_hydrology
from models import Watershed


def get_or_create_test_watershed(db_session):
    ws = db_session.query(Watershed).first()
    if not ws:
        ws = Watershed(
            id=uuid.uuid4(),
            name="Terrain Test Pilot Catchment",
            state="Maharashtra",
            district="Pune",
            geometry="SRID=4326;POLYGON((73.80 18.70, 73.95 18.70, 73.95 18.82, 73.80 18.82, 73.80 18.70))",
            area_sqkm=160.0,
            perimeter_km=46.0,
            elevation_min=580.0,
            elevation_max=940.0
        )
        db_session.add(ws)
        db_session.commit()
        db_session.refresh(ws)
    return ws


def test_compute_slope_degrees():
    """Verifies that Horn slope formula computes accurate slope in degrees for a planar tilt."""
    # Create 30m planar incline of 10% grade (dz/dx = 0.1)
    grid = np.zeros((10, 10), dtype=np.float32)
    for x in range(10):
        grid[:, x] = x * 3.0  # 3m rise over 30m run = 10% slope ~ 5.71 degrees
    
    slope = compute_slope_degrees(grid, cell_size_m=30.0)
    assert slope.shape == (10, 10)
    assert 4.0 <= np.mean(slope) <= 7.0


def test_terrain_processing_and_streams(client, db_session):
    """Verifies Copernicus DEM terrain processing, Strahler stream extraction, and drainage density computation."""
    ws = get_or_create_test_watershed(db_session)

    res = process_watershed_terrain(db_session, ws.id, accumulation_threshold=100)
    assert res["watershed_id"] == str(ws.id)
    assert res["mean_slope_deg"] > 0.0
    assert res["drainage_density_km_per_sqkm"] > 0.0
    assert res["stream_segments_count"] > 0

    # Test streams GeoJSON endpoint
    api_res = client.get(f"/api/v1/watersheds/{ws.id}/streams")
    assert api_res.status_code == 200
    geojson = api_res.json()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0
    assert "strahler_order" in geojson["features"][0]["properties"]


def test_point_hydrology_query(client, db_session):
    """Verifies distance to nearest stream (m) and upstream contributing area (km2) query at coordinate point."""
    ws = get_or_create_test_watershed(db_session)

    res = client.get(f"/api/v1/watersheds/{ws.id}/point-hydrology?latitude=18.755&longitude=73.875")
    assert res.status_code == 200
    data = res.json()
    assert data["distance_to_nearest_stream_m"] >= 0.0
    assert data["upstream_contributing_area_sqkm"] > 0.0
    assert data["dem_resolution_m"] == 30.0
