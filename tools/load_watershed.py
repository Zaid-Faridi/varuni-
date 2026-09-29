"""
CLI Tool: Load Real Watershed Boundary from GeoJSON (Option A - Primary Path)

Validates geometry (valid, single polygon, EPSG:4326, area sanity check),
computes area_sqkm and perimeter in an appropriate projected UTM zone CRS
(determined from the centroid, avoiding degree distortion), and inserts into PostGIS database.

Usage:
    python -m tools.load_watershed --geojson path/to/boundary.geojson --name "Upper Sukhi Pilot Watershed" --source "India-WRIS / Bhuvan" --version "2024.1"
"""
import sys
import os
import argparse
import json
import uuid
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.validation import make_valid
from pyproj import Transformer

# Add app/api to sys.path so we can import models and database
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "api"))

from database import SessionLocal, init_db
from models import Watershed


def compute_projected_utm_stats(geom_shapely) -> tuple[float, float]:
    """
    Projects WGS84 EPSG:4326 geometry into local UTM Zone (Meters)
    to calculate true geodesic area in sq km and perimeter in km.
    """
    centroid = geom_shapely.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    epsg_code = 32600 + utm_zone if centroid.y >= 0 else 32700 + utm_zone

    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg_code}", always_xy=True)

    if isinstance(geom_shapely, Polygon):
        proj_coords = [transformer.transform(x, y) for x, y in geom_shapely.exterior.coords]
        proj_poly = Polygon(proj_coords)
        area_sqkm = proj_poly.area / 1_000_000.0
        perimeter_km = proj_poly.length / 1000.0
    elif isinstance(geom_shapely, MultiPolygon):
        area_sum = 0.0
        perim_sum = 0.0
        for p in geom_shapely.geoms:
            proj_coords = [transformer.transform(x, y) for x, y in p.exterior.coords]
            proj_p = Polygon(proj_coords)
            area_sum += proj_p.area
            perim_sum += proj_p.length
        area_sqkm = area_sum / 1_000_000.0
        perimeter_km = perim_sum / 1000.0
    else:
        raise ValueError(f"Unsupported geometry type: {geom_shapely.geom_type}")

    return round(area_sqkm, 4), round(perimeter_km, 4)


def load_watershed_from_geojson(
    geojson_path: str,
    name: str,
    state: str = None,
    district: str = None,
    block: str = None,
    source: str = "India-WRIS",
    version: str = "1.0",
    elevation_min: float = None,
    elevation_max: float = None,
    slope_avg: float = None
) -> Watershed:
    """Loads, validates, and stores a watershed from GeoJSON file into PostGIS."""
    if not os.path.exists(geojson_path):
        raise FileNotFoundError(f"GeoJSON file not found: {geojson_path}")

    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Handle FeatureCollection, Feature, or pure Geometry dict
    if data.get("type") == "FeatureCollection":
        if not data.get("features"):
            raise ValueError("GeoJSON FeatureCollection contains no features.")
        feature = data["features"][0]
        geom_dict = feature.get("geometry")
        props = feature.get("properties", {})
        name = name or props.get("name") or props.get("WATERSHED_NAME") or "Watershed"
        state = state or props.get("state") or props.get("STATE_NAME")
        district = district or props.get("district") or props.get("DIST_NAME")
        block = block or props.get("block") or props.get("SUB_DIST")
    elif data.get("type") == "Feature":
        geom_dict = data.get("geometry")
        props = data.get("properties", {})
        name = name or props.get("name") or "Watershed"
    else:
        geom_dict = data

    geom_shapely = shape(geom_dict)
    if not geom_shapely.is_valid:
        print("Warning: Geometry was invalid, applying make_valid()...")
        geom_shapely = make_valid(geom_shapely)

    # Sanity check: must be Polygon or MultiPolygon
    if not isinstance(geom_shapely, (Polygon, MultiPolygon)):
        raise ValueError(f"Expected Polygon or MultiPolygon geometry, got {geom_shapely.geom_type}")

    # Coordinate check: Ensure within sensible EPSG:4326 range
    bounds = geom_shapely.bounds
    if not (-180 <= bounds[0] <= 180 and -90 <= bounds[1] <= 90):
        raise ValueError(f"Coordinates are out of WGS84 EPSG:4326 bounds: {bounds}")

    area_sqkm, perimeter_km = compute_projected_utm_stats(geom_shapely)
    print(f"Validated geometry for '{name}': Area = {area_sqkm} sq km, Perimeter = {perimeter_km} km")

    # Sanity check on area
    if area_sqkm < 0.01:
        print(f"Notice: Area ({area_sqkm} sq km) is very small for a watershed catchment.")
    elif area_sqkm > 50000:
        print(f"Notice: Area ({area_sqkm} sq km) is exceptionally large (basin-scale).")

    init_db()
    db = SessionLocal()
    try:
        # Check if watershed with same name already exists
        existing = db.query(Watershed).filter(Watershed.name == name).first()
        if existing:
            print(f"Updating existing watershed record: {name} ({existing.id})")
            ws = existing
        else:
            ws = Watershed(id=uuid.uuid4())
            db.add(ws)

        ws.name = name
        ws.state = state
        ws.district = district
        ws.block = block
        ws.geometry = f"SRID=4326;{geom_shapely.wkt}"
        ws.area_sqkm = area_sqkm
        ws.perimeter_km = perimeter_km
        ws.elevation_min = elevation_min
        ws.elevation_max = elevation_max
        ws.slope_avg = slope_avg
        ws.source = source
        ws.version = version
        ws.provenance = {
            "loaded_via": "tools.load_watershed",
            "file": os.path.basename(geojson_path),
            "utm_projection": "Centroid-based UTM projection for metric accuracy",
            "validation": "Shapely WGS84 check passed"
        }

        db.commit()
        db.refresh(ws)
        print(f"Successfully loaded watershed into database! ID: {ws.id}")
        return ws
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Load real watershed boundary into PostGIS.")
    parser.add_argument("--geojson", required=True, help="Path to GeoJSON file")
    parser.add_argument("--name", required=True, help="Watershed name")
    parser.add_argument("--state", default="Maharashtra", help="State name")
    parser.add_argument("--district", default="Pune", help="District name")
    parser.add_argument("--block", default=None, help="Block / Taluka name")
    parser.add_argument("--source", default="India-WRIS / Bhuvan", help="Data source provenance")
    parser.add_argument("--version", default="2024.1", help="Dataset version")
    parser.add_argument("--elevation-min", type=float, default=None, help="Min elevation in meters")
    parser.add_argument("--elevation-max", type=float, default=None, help="Max elevation in meters")
    parser.add_argument("--slope-avg", type=float, default=None, help="Mean slope in degrees")

    args = parser.parse_args()
    load_watershed_from_geojson(
        geojson_path=args.geojson,
        name=args.name,
        state=args.state,
        district=args.district,
        block=args.block,
        source=args.source,
        version=args.version,
        elevation_min=args.elevation_min,
        elevation_max=args.elevation_max,
        slope_avg=args.slope_avg
    )


if __name__ == "__main__":
    main()
