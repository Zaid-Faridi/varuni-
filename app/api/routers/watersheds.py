import json
import uuid
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2.shape import to_shape
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from pyproj import Transformer

from database import get_db
from models import Watershed, WatershedTimeSeries, StreamSegment, LulcStat, Intervention, ImageObservation
from schemas import (
    WatershedResponse,
    WatershedSummary,
    WatershedCreate,
    WatershedTimeSeriesResponse,
    TimeSeriesPointResponse,
    PointHydrologyResponse,
    LulcStatsResponse,
    LulcClassItem,
    PointsDensityResponse,
    PointsDensityLegend,
    DensityPointItem
)
from satellite.terrain import process_watershed_terrain, query_point_hydrology
from context.bhuvan_lulc import (
    fetch_bhuvan_lulc,
    compute_geometry_hash,
    load_lulc_legend
)

router = APIRouter(
    prefix="/api/v1/watersheds",
    tags=["watersheds"]
)


def compute_projected_area_perimeter(geom_shapely) -> tuple[float, float]:
    """
    Computes accurate area in sq. km and perimeter in km using the appropriate projected UTM CRS.
    Geodesic/projected CRS ensures accurate metric properties instead of degree distortion.
    """
    centroid = geom_shapely.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    epsg_code = 32600 + utm_zone if centroid.y >= 0 else 32700 + utm_zone

    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg_code}", always_xy=True)
    if isinstance(geom_shapely, Polygon):
        coords = geom_shapely.exterior.coords
        proj_coords = [transformer.transform(x, y) for x, y in coords]
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


@router.get("/", response_model=List[WatershedSummary])
def list_watersheds(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List all watersheds. Returns empty list if database has no watersheds."""
    watersheds = db.query(Watershed).offset(skip).limit(limit).all()
    results = []
    for w in watersheds:
        centroid_coords = None
        if w.geometry is not None:
            try:
                geom = to_shape(w.geometry)
                c = geom.centroid
                centroid_coords = [round(c.x, 6), round(c.y, 6)]
            except Exception:
                pass

        # Sync current NDVI if null but observations exist
        ndvi_val = w.ndvi_current
        if ndvi_val is None:
            latest_ts_ndvi = db.query(WatershedTimeSeries).filter(
                WatershedTimeSeries.watershed_id == w.id,
                WatershedTimeSeries.metric == "ndvi"
            ).order_by(WatershedTimeSeries.date.desc()).first()
            if latest_ts_ndvi:
                ndvi_val = latest_ts_ndvi.mean
                w.ndvi_current = latest_ts_ndvi.mean
                db.commit()

        # Sync current NDWI if null but observations exist
        ndwi_val = w.ndwi_current
        if ndwi_val is None:
            latest_ts_ndwi = db.query(WatershedTimeSeries).filter(
                WatershedTimeSeries.watershed_id == w.id,
                WatershedTimeSeries.metric == "ndwi"
            ).order_by(WatershedTimeSeries.date.desc()).first()
            if latest_ts_ndwi:
                ndwi_val = latest_ts_ndwi.mean
                w.ndwi_current = latest_ts_ndwi.mean
                db.commit()

        results.append(WatershedSummary(
            id=w.id,
            name=w.name,
            state=w.state,
            district=w.district,
            block=w.block,
            area_sqkm=w.area_sqkm,
            ndvi_current=ndvi_val,
            ndwi_current=ndwi_val,
            elevation_min=w.elevation_min,
            elevation_max=w.elevation_max,
            source=w.source,
            centroid=centroid_coords
        ))
    return results


@router.get("/geojson")
def get_watersheds_geojson(db: Session = Depends(get_db)):
    """
    Returns all watershed boundaries as a GeoJSON FeatureCollection with properties and provenance.
    """
    watersheds = db.query(Watershed).all()
    features = []

    for w in watersheds:
        if w.geometry is None:
            continue
        try:
            geom_shapely = to_shape(w.geometry)
            geom_dict = mapping(geom_shapely)
            
            features.append({
                "type": "Feature",
                "id": str(w.id),
                "properties": {
                    "id": str(w.id),
                    "name": w.name,
                    "state": w.state,
                    "district": w.district,
                    "block": w.block,
                    "area_sqkm": w.area_sqkm,
                    "perimeter_km": w.perimeter_km,
                    "elevation_min": w.elevation_min,
                    "elevation_max": w.elevation_max,
                    "slope_avg": w.slope_avg,
                    "drainage_density": w.drainage_density,
                    "source": w.source,
                    "version": w.version,
                    "ndvi_current": w.ndvi_current,
                    "ndwi_current": w.ndwi_current,
                    "provenance": w.provenance
                },
                "geometry": geom_dict
            })
        except Exception as e:
            print(f"Error parsing geometry for watershed {w.id}: {e}")

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.post("/", response_model=WatershedResponse)
def create_watershed(payload: WatershedCreate, db: Session = Depends(get_db)):
    """Create a new watershed from GeoJSON geometry."""
    if not payload.geometry_geojson:
        raise HTTPException(status_code=400, detail="geometry_geojson is required")

    try:
        geom_shapely = shape(payload.geometry_geojson)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON geometry: {str(e)}")

    if not geom_shapely.is_valid:
        from shapely.validation import make_valid
        geom_shapely = make_valid(geom_shapely)

    area_sqkm, perimeter_km = compute_projected_area_perimeter(geom_shapely)
    geom_wkt = f"SRID=4326;{geom_shapely.wkt}"

    ws = Watershed(
        id=uuid.uuid4(),
        name=payload.name,
        state=payload.state,
        district=payload.district,
        block=payload.block,
        geometry=geom_wkt,
        area_sqkm=area_sqkm,
        perimeter_km=perimeter_km,
        elevation_min=payload.elevation_min,
        elevation_max=payload.elevation_max,
        slope_avg=payload.slope_avg,
        source=payload.source or "User GeoJSON Upload",
        version=payload.version or "1.0",
        provenance=payload.provenance or {"source": "API Upload", "crs": "EPSG:4326"}
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)

    # Automatically process initial terrain layers (slope & drainage)
    try:
        process_watershed_terrain(db, ws.id)
    except Exception as e:
        print(f"Notice: Initial terrain auto-processing: {e}")

    return WatershedResponse(
        id=ws.id,
        name=ws.name,
        state=ws.state,
        district=ws.district,
        block=ws.block,
        area_sqkm=ws.area_sqkm,
        perimeter_km=ws.perimeter_km,
        elevation_min=ws.elevation_min,
        elevation_max=ws.elevation_max,
        slope_avg=ws.slope_avg,
        drainage_density=ws.drainage_density,
        source=ws.source,
        version=ws.version,
        provenance=ws.provenance,
        created_at=ws.created_at,
        geometry_geojson=mapping(geom_shapely)
    )


@router.get("/{id}", response_model=WatershedResponse)
def get_watershed(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single watershed detail with full properties and geometry."""
    ws = db.query(Watershed).filter(Watershed.id == id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Watershed not found")

    geom_dict = None
    if ws.geometry is not None:
        try:
            geom_shapely = to_shape(ws.geometry)
            geom_dict = mapping(geom_shapely)
        except Exception:
            pass

    # Sync current NDVI if null
    ndvi_val = ws.ndvi_current
    if ndvi_val is None:
        latest_ts_ndvi = db.query(WatershedTimeSeries).filter(
            WatershedTimeSeries.watershed_id == ws.id,
            WatershedTimeSeries.metric == "ndvi"
        ).order_by(WatershedTimeSeries.date.desc()).first()
        if latest_ts_ndvi:
            ndvi_val = latest_ts_ndvi.mean
            ws.ndvi_current = latest_ts_ndvi.mean
            db.commit()

    # Sync current NDWI if null
    ndwi_val = ws.ndwi_current
    if ndwi_val is None:
        latest_ts_ndwi = db.query(WatershedTimeSeries).filter(
            WatershedTimeSeries.watershed_id == ws.id,
            WatershedTimeSeries.metric == "ndwi"
        ).order_by(WatershedTimeSeries.date.desc()).first()
        if latest_ts_ndwi:
            ndwi_val = latest_ts_ndwi.mean
            ws.ndwi_current = latest_ts_ndwi.mean
            db.commit()

    return WatershedResponse(
        id=ws.id,
        name=ws.name,
        state=ws.state,
        district=ws.district,
        block=ws.block,
        area_sqkm=ws.area_sqkm,
        perimeter_km=ws.perimeter_km,
        elevation_min=ws.elevation_min,
        elevation_max=ws.elevation_max,
        slope_avg=ws.slope_avg,
        drainage_density=ws.drainage_density,
        source=ws.source,
        version=ws.version,
        ndvi_current=ndvi_val,
        ndwi_current=ndwi_val,
        landcover_dominant=ws.landcover_dominant,
        population=ws.population,
        provenance=ws.provenance,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        geometry_geojson=geom_dict
    )


@router.post("/{id}/terrain")
def trigger_terrain_processing(
    id: uuid.UUID,
    accumulation_threshold: int = Query(150, ge=10, le=5000),
    db: Session = Depends(get_db)
):
    """
    Triggers Copernicus DEM 30m terrain derivation:
    - Generates 30m slope raster.
    - Delineates drainage network with Strahler orders.
    - Computes catchment drainage density and mean slope.
    """
    try:
        res = process_watershed_terrain(db, id, accumulation_threshold)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terrain processing error: {str(e)}")


@router.get("/{id}/streams")
def get_watershed_streams_geojson(id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Returns the real Copernicus DEM derived drainage network as a GeoJSON FeatureCollection
    with Strahler stream orders and segment lengths.
    """
    ws = db.query(Watershed).filter(Watershed.id == id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Watershed not found")

    segments = db.query(StreamSegment).filter(StreamSegment.watershed_id == id).all()
    if not segments:
        # Run terrain processing to populate streams
        try:
            process_watershed_terrain(db, id)
            segments = db.query(StreamSegment).filter(StreamSegment.watershed_id == id).all()
        except Exception:
            pass

    features = []
    for seg in segments:
        try:
            geom_shapely = to_shape(seg.geometry)
            features.append({
                "type": "Feature",
                "id": str(seg.id),
                "properties": {
                    "id": str(seg.id),
                    "watershed_id": str(seg.watershed_id),
                    "strahler_order": seg.order,
                    "length_km": seg.length_km,
                    **(seg.properties or {})
                },
                "geometry": mapping(geom_shapely)
            })
        except Exception as e:
            print(f"Error mapping stream segment {seg.id}: {e}")

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/{id}/point-hydrology", response_model=PointHydrologyResponse)
def get_point_hydrology(
    id: uuid.UUID,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db)
):
    """
    Calculates distance to the nearest stream and upstream contributing area in km2
    for a given coordinate point inside or near the watershed.
    """
    return query_point_hydrology(db, latitude, longitude, watershed_id=id)


@router.get("/{id}/time-series", response_model=WatershedTimeSeriesResponse)
def get_watershed_time_series(
    id: uuid.UUID,
    metric: str = Query("ndvi", regex="^(ndvi|ndwi|NDVI|NDWI)$"),
    db: Session = Depends(get_db)
):
    """
    Returns real Landsat 8/9 time-series observations for a watershed.
    """
    ws = db.query(Watershed).filter(Watershed.id == id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Watershed not found")

    records = (
        db.query(WatershedTimeSeries)
        .filter(
            WatershedTimeSeries.watershed_id == id,
            WatershedTimeSeries.metric == metric.lower()
        )
        .order_by(WatershedTimeSeries.date.asc())
        .all()
    )

    data = []
    for r in records:
        data.append(TimeSeriesPointResponse(
            date=r.date.strftime("%Y-%m-%d"),
            value=round(r.mean, 4),
            scene_id=r.scene_id,
            std=round(r.std, 4) if r.std is not None else None,
            min_val=round(r.min_val, 4) if r.min_val is not None else None,
            max_val=round(r.max_val, 4) if r.max_val is not None else None,
            valid_pct=round(r.valid_pct, 1) if r.valid_pct is not None else 100.0
        ))

    unit_name = "Index (-1.0 to 1.0)" if metric.lower() in ["ndvi", "ndwi"] else "Unit"
    provenance_info = {
        "source": "Landsat 8/9 Collection 2 Level-2 Surface Reflectance",
        "resolution": "30m",
        "cloud_mask": "USGS QA_PIXEL Bitmask filtered"
    }

    return WatershedTimeSeriesResponse(
        watershed_id=ws.id,
        metric=metric.upper(),
        unit=unit_name,
        provenance=provenance_info,
        data=data
    )


@router.get("/{id}/lulc", response_model=LulcStatsResponse)
def get_watershed_lulc(
    id: uuid.UUID,
    refresh: bool = Query(False, description="Force re-fetch from Bhuvan LULC API"),
    db: Session = Depends(get_db)
):
    """
    Fetches Bhuvan LULC 50K AOI-wise land use/land cover statistics for the watershed.
    Caches result by geometry hash. Re-fetches only on explicit refresh request.
    """
    ws = db.query(Watershed).filter(Watershed.id == id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Watershed not found")

    geom_shapely = to_shape(ws.geometry)
    geom_hash = compute_geometry_hash(mapping(geom_shapely))

    # Check cache if refresh is not requested
    if not refresh:
        cached_stat = db.query(LulcStat).filter(
            (LulcStat.geometry_hash == geom_hash) | (LulcStat.watershed_id == id)
        ).order_by(LulcStat.fetched_at.desc()).first()

        if cached_stat and cached_stat.summed_classes:
            legend = load_lulc_legend()
            classes_list = []
            for code, data_val in sorted(cached_stat.summed_classes.items(), key=lambda x: x[1] if isinstance(x[1], (int, float)) else x[1].get("area", 0.0), reverse=True):
                area_val = data_val if isinstance(data_val, (int, float)) else data_val.get("area", 0.0)
                tot = cached_stat.total_area or 1.0
                pct = round((area_val / tot * 100.0), 2) if tot > 0 else 0.0
                classes_list.append(LulcClassItem(
                    code=code,
                    name=legend.get(code, code),
                    area=round(float(area_val), 4),
                    percentage=pct
                ))

            return LulcStatsResponse(
                watershed_id=str(ws.id),
                geometry_hash=cached_stat.geometry_hash,
                source=cached_stat.source or "Bhuvan LULC 50K AOI Service (NRSC / ISRO)",
                vintage=cached_stat.vintage or "year not stated",
                units=cached_stat.units or "unverified",
                token_used=cached_stat.token_used,
                fetched_at=cached_stat.fetched_at.isoformat() if cached_stat.fetched_at else "",
                disclaimer=cached_stat.disclaimer or "periodic map product, not current conditions",
                total_area=cached_stat.total_area or 0.0,
                classes=classes_list,
                per_state=cached_stat.per_state or {},
                raw_json=cached_stat.raw_json,
                cached=True,
                empty=len(classes_list) == 0,
                message=None if len(classes_list) > 0 else "No LULC data returned for this area"
            )

    # Fetch from Bhuvan LULC context provider
    try:
        lulc_result = fetch_bhuvan_lulc(geom_shapely)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Bhuvan LULC service error: {str(e)}"
        )

    # Store / update in database
    db_stat = LulcStat(
        id=uuid.uuid4(),
        watershed_id=ws.id,
        geometry_hash=lulc_result["geometry_hash"],
        raw_json=lulc_result["raw_json"],
        per_state=lulc_result["per_state"],
        summed_classes={c["code"]: c["area"] for c in lulc_result["classes"]},
        total_area=lulc_result["total_area"],
        units=lulc_result["units"],
        vintage=lulc_result["vintage"],
        source=lulc_result["source"],
        token_used=lulc_result["token_used"],
        disclaimer=lulc_result["disclaimer"],
    )
    db.add(db_stat)
    db.commit()
    db.refresh(db_stat)

    classes_resp = [
        LulcClassItem(
            code=c["code"],
            name=c["name"],
            area=c["area"],
            percentage=c["percentage"]
        )
        for c in lulc_result["classes"]
    ]

    return LulcStatsResponse(
        watershed_id=str(ws.id),
        geometry_hash=lulc_result["geometry_hash"],
        source=lulc_result["source"],
        vintage=lulc_result["vintage"],
        units=lulc_result["units"],
        token_used=lulc_result["token_used"],
        fetched_at=lulc_result["fetched_at"],
        disclaimer=lulc_result["disclaimer"],
        total_area=lulc_result["total_area"],
        classes=classes_resp,
        per_state=lulc_result["per_state"],
        raw_json=lulc_result["raw_json"],
        cached=False,
        empty=lulc_result["empty"],
        message=lulc_result.get("message")
    )


@router.get("/{id}/points-density", response_model=PointsDensityResponse)
def get_watershed_points_density(
    id: uuid.UUID,
    source_type: str = Query("all", description="Data sources: 'all', 'interventions', or 'photos'"),
    intervention_type: Optional[str] = Query(None, description="Optional filter by intervention category"),
    from_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date filter (YYYY-MM-DD)"),
    bandwidth_m: float = Query(500.0, ge=50.0, le=5000.0, description="KDE kernel bandwidth in meters"),
    db: Session = Depends(get_db)
):
    """
    Computes documentation density and retrieves real coordinate points
    for geotagged field photos and structured interventions.
    Shows where documentation is concentrated (not environmental impact).
    """
    ws = db.query(Watershed).filter(Watershed.id == id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Watershed not found")

    dt_from = None
    if from_date:
        try:
            dt_from = datetime.datetime.strptime(from_date, "%Y-%m-%d")
        except ValueError:
            pass

    dt_to = None
    if to_date:
        try:
            dt_to = datetime.datetime.strptime(to_date, "%Y-%m-%d")
        except ValueError:
            pass

    points_list: List[DensityPointItem] = []
    heat_points: List[List[float]] = []

    itv_count = 0
    photo_count = 0

    # 1. Fetch Interventions
    if source_type in ["all", "interventions"]:
        itv_query = db.query(Intervention).filter(Intervention.watershed_id == id)
        if intervention_type:
            itv_query = itv_query.filter(Intervention.type.ilike(f"%{intervention_type}%"))
        if dt_from:
            itv_query = itv_query.filter(Intervention.observed_at >= dt_from)
        if dt_to:
            itv_query = itv_query.filter(Intervention.observed_at <= dt_to)

        itvs = itv_query.all()
        for itv in itvs:
            if itv.latitude is not None and itv.longitude is not None:
                itv_count += 1
                points_list.append(DensityPointItem(
                    lat=round(float(itv.latitude), 6),
                    lng=round(float(itv.longitude), 6),
                    weight=1.0,
                    id=str(itv.id),
                    source="intervention",
                    type=itv.type,
                    date=itv.observed_at.strftime("%Y-%m-%d") if itv.observed_at else None,
                    label=itv.name or itv.type.replace("_", " ").title()
                ))
                heat_points.append([round(float(itv.latitude), 6), round(float(itv.longitude), 6), 1.0])

    # 2. Fetch Field Photos
    if source_type in ["all", "photos"]:
        img_query = db.query(ImageObservation).filter(ImageObservation.watershed_id == id)
        if intervention_type:
            img_query = img_query.filter(ImageObservation.intervention_type.ilike(f"%{intervention_type}%"))
        if dt_from:
            img_query = img_query.filter(ImageObservation.captured_at >= dt_from)
        if dt_to:
            img_query = img_query.filter(ImageObservation.captured_at <= dt_to)

        images = img_query.all()
        for img in images:
            if img.latitude is not None and img.longitude is not None:
                photo_count += 1
                points_list.append(DensityPointItem(
                    lat=round(float(img.latitude), 6),
                    lng=round(float(img.longitude), 6),
                    weight=0.8,
                    id=str(img.id),
                    source="photo",
                    type=img.intervention_type,
                    date=img.captured_at.strftime("%Y-%m-%d") if img.captured_at else None,
                    label=f"Field Photo ({img.quality_status})"
                ))
                heat_points.append([round(float(img.latitude), 6), round(float(img.longitude), 6), 0.8])

    total_count = len(points_list)

    return PointsDensityResponse(
        watershed_id=str(ws.id),
        source_type=source_type,
        total_points=total_count,
        bandwidth_m=bandwidth_m,
        points=points_list,
        heat_points=heat_points,
        legend=PointsDensityLegend(
            total_count=total_count,
            bandwidth_m=bandwidth_m,
            interventions_count=itv_count,
            photos_count=photo_count,
            disclaimer="Shows where documentation & geotagged interventions are concentrated, not impact."
        )
    )
