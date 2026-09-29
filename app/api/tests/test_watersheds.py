import pytest
from sqlalchemy import text


def test_empty_db_endpoints(client):
    """Verifies that on a clean empty database, endpoints return honest empty structures."""
    # Watersheds list
    res = client.get("/api/v1/watersheds/")
    assert res.status_code == 200
    assert res.json() == []

    # Watersheds GeoJSON
    res_geo = client.get("/api/v1/watersheds/geojson")
    assert res_geo.status_code == 200
    data = res_geo.json()
    assert data["type"] == "FeatureCollection"
    assert data["features"] == []

    # Dashboard stats
    res_stats = client.get("/api/v1/dashboard/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert stats["total_watersheds"] == 0
    assert stats["total_images"] == 0
    assert stats["total_interventions"] == 0
    assert stats["avg_ndvi"] is None
    assert stats["avg_ndwi"] is None


def test_create_watershed_from_geojson(client):
    """Verifies watershed creation with UTM projected metric area calculation."""
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [[
            [73.70, 18.40],
            [73.80, 18.40],
            [73.80, 18.50],
            [73.70, 18.50],
            [73.70, 18.40]
        ]]
    }

    payload = {
        "name": "Pune Pilot Catchment",
        "state": "Maharashtra",
        "district": "Pune",
        "block": "Haveli",
        "geometry_geojson": polygon_geojson,
        "source": "India-WRIS / Survey of India",
        "version": "2024.1"
    }

    res = client.post("/api/v1/watersheds/", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Pune Pilot Catchment"
    assert data["area_sqkm"] is not None
    assert data["area_sqkm"] > 100.0  # Approx 10km x 11km ~ 110 sq km
    assert data["perimeter_km"] is not None
    assert data["perimeter_km"] > 35.0


def test_point_in_polygon_lookup(client, db_session):
    """Verifies PostGIS ST_Contains spatial point-in-polygon resolution."""
    # Create test polygon: [73.70, 18.40] to [73.80, 18.50]
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [[
            [73.70, 18.40],
            [73.80, 18.40],
            [73.80, 18.50],
            [73.70, 18.50],
            [73.70, 18.40]
        ]]
    }

    ws_res = client.post("/api/v1/watersheds/", json={
        "name": "Spatial Test Watershed",
        "geometry_geojson": polygon_geojson
    })
    ws_id = ws_res.json()["id"]

    # Point INSIDE polygon: [73.75, 18.45]
    query_inside = text("""
        SELECT id FROM watersheds 
        WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(73.75, 18.45), 4326))
    """)
    result_inside = db_session.execute(query_inside).fetchone()
    assert result_inside is not None
    assert str(result_inside[0]) == ws_id

    # Point OUTSIDE polygon: [73.95, 18.65]
    query_outside = text("""
        SELECT id FROM watersheds 
        WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(73.95, 18.65), 4326))
    """)
    result_outside = db_session.execute(query_outside).fetchone()
    assert result_outside is None
