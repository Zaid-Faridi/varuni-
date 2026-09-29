import uuid
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import SatelliteScene, RasterAsset, Watershed
from schemas import (
    SatelliteSceneResponse,
    RasterAssetResponse,
    RasterLegend
)
from satellite.zonal import render_raster_to_png_bytes, get_legend_data

router = APIRouter(
    tags=["satellite"]
)


@router.get("/api/v1/satellite/scenes", response_model=List[SatelliteSceneResponse])
def list_satellite_scenes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List ingested satellite scenes with provenance and cloud cover metadata."""
    scenes = db.query(SatelliteScene).order_by(SatelliteScene.acquisition_time.desc()).offset(skip).limit(limit).all()
    return scenes


@router.get("/api/v1/satellite/scenes/{id}", response_model=SatelliteSceneResponse)
def get_satellite_scene(id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single satellite scene details."""
    scene = db.query(SatelliteScene).filter(SatelliteScene.id == id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Satellite scene not found")
    return scene


@router.get("/api/v1/satellite/rasters", response_model=List[RasterAssetResponse])
def list_raster_assets(
    watershed_id: Optional[uuid.UUID] = None,
    asset_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List processed raster assets (NDVI, NDWI, etc.) with resolution, bounds, and stats."""
    query = db.query(RasterAsset)
    if watershed_id:
        query = query.filter(RasterAsset.watershed_id == watershed_id)
    if asset_type:
        query = query.filter(RasterAsset.asset_type == asset_type.lower())

    rasters = query.order_by(RasterAsset.created_at.desc()).offset(skip).limit(limit).all()
    return rasters


@router.get("/api/v1/rasters/{asset_id}/overlay.png")
def get_raster_overlay_png(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Renders a transparent, colormapped PNG image for Leaflet ImageOverlay.
    """
    asset = db.query(RasterAsset).filter(RasterAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Raster asset not found")

    if not asset.uri or not os.path.exists(asset.uri):
        raise HTTPException(status_code=404, detail="Raster GeoTIFF file not found on disk")

    try:
        png_bytes = render_raster_to_png_bytes(asset.uri, asset_type=asset.asset_type)
        return Response(content=png_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rendering raster overlay: {e}")


@router.get("/api/v1/rasters/{asset_id}/legend", response_model=RasterLegend)
def get_raster_legend(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Returns legend color stops and value intervals for the raster overlay.
    """
    asset = db.query(RasterAsset).filter(RasterAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Raster asset not found")

    legend_data = get_legend_data(asset.id, asset_type=asset.asset_type)
    return legend_data
