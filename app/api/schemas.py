"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


# ─── Watershed ────────────────────────────────────────────
class WatershedBase(BaseModel):
    name: str
    state: Optional[str] = None
    district: Optional[str] = None
    block: Optional[str] = None
    area_sqkm: Optional[float] = None
    perimeter_km: Optional[float] = None
    elevation_min: Optional[float] = None
    elevation_max: Optional[float] = None
    slope_avg: Optional[float] = None
    drainage_density: Optional[float] = None
    source: Optional[str] = None
    version: Optional[str] = None
    provenance: Optional[Dict[str, Any]] = None

class WatershedCreate(WatershedBase):
    geometry_geojson: Optional[Dict[str, Any]] = None

class WatershedResponse(WatershedBase):
    id: uuid.UUID
    ndvi_current: Optional[float] = None
    ndwi_current: Optional[float] = None
    landcover_dominant: Optional[str] = None
    population: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    geometry_geojson: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

class WatershedSummary(BaseModel):
    id: uuid.UUID
    name: str
    state: Optional[str] = None
    district: Optional[str] = None
    block: Optional[str] = None
    area_sqkm: Optional[float] = None
    ndvi_current: Optional[float] = None
    ndwi_current: Optional[float] = None
    elevation_min: Optional[float] = None
    elevation_max: Optional[float] = None
    source: Optional[str] = None
    centroid: Optional[List[float]] = None  # [lon, lat]

    model_config = ConfigDict(from_attributes=True)


# ─── Time Series ──────────────────────────────────────────
class TimeSeriesPointResponse(BaseModel):
    date: str
    value: float
    scene_id: Optional[str] = None
    std: Optional[float] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    valid_pct: Optional[float] = None

class WatershedTimeSeriesResponse(BaseModel):
    watershed_id: uuid.UUID
    metric: str
    unit: str
    provenance: Optional[Dict[str, Any]] = None
    data: List[TimeSeriesPointResponse] = []


# ─── Image ────────────────────────────────────────────────
class SatelliteContextScene(BaseModel):
    scene_id: str
    date: str
    day_gap: int
    sensor: Optional[str] = "OLI-TIRS"
    resolution_m: Optional[float] = 30.0
    ndvi: Optional[float] = None
    ndwi: Optional[float] = None
    window_3x3_mean_ndvi: Optional[float] = None
    window_3x3_mean_ndwi: Optional[float] = None
    is_far_gap: bool = False  # True if > 30 days gap

class ImageSatelliteContext(BaseModel):
    nearest_before: Optional[SatelliteContextScene] = None
    nearest_after: Optional[SatelliteContextScene] = None
    time_series_at_pixel: List[TimeSeriesPointResponse] = []
    message: Optional[str] = None

class ImageBase(BaseModel):
    object_uri: str
    original_filename: Optional[str] = None
    captured_at: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_source: Optional[str] = None
    intervention_type: Optional[str] = None
    camera_model: Optional[str] = None
    altitude: Optional[float] = None
    bearing: Optional[float] = None

class ImageCreate(ImageBase):
    watershed_id: Optional[uuid.UUID] = None

class ImageResponse(ImageBase):
    id: uuid.UUID
    watershed_id: Optional[uuid.UUID] = None
    watershed_name: Optional[str] = None
    thumbnail_uri: Optional[str] = None
    quality_status: str
    quality_score: Optional[float] = None
    quality_reasons: Optional[List[str]] = None
    blur_score: Optional[float] = None
    exposure_mean: Optional[float] = None
    clipped_pixel_pct: Optional[float] = None
    resolution_w: Optional[int] = None
    resolution_h: Optional[int] = None
    sha256_hash: Optional[str] = None
    perceptual_hash: Optional[str] = None
    duplicate_of_id: Optional[uuid.UUID] = None
    classification_result: Optional[Dict[str, Any]] = None
    reviewer_label: Optional[str] = None
    reviewer_label_notes: Optional[str] = None
    reviewer_label_at: Optional[datetime] = None
    privacy_status: str = "private"
    ai_tags: Optional[Dict[str, Any]] = None
    is_manual_location: bool = False
    satellite_context: Optional[ImageSatelliteContext] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ImageLabelReviewRequest(BaseModel):
    assigned_label: str
    reviewer_id: str = "reviewer_01"
    notes: Optional[str] = None


# ─── Intervention ─────────────────────────────────────────
class InterventionBase(BaseModel):
    name: Optional[str] = None
    type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    watershed_id: Optional[uuid.UUID] = None
    observed_at: Optional[datetime] = None
    status: str = "proposed"
    source: Optional[str] = None
    description: Optional[str] = None
    cost_estimate: Optional[float] = None
    beneficiaries: Optional[int] = None
    image_id: Optional[uuid.UUID] = None
    photo_path: Optional[str] = None
    photo_filename: Optional[str] = None
    exif_latitude: Optional[float] = None
    exif_longitude: Optional[float] = None
    exif_timestamp: Optional[datetime] = None
    gps_source: Optional[str] = None
    idempotency_key: Optional[str] = None
    review_status: str = "OBSERVED"

class InterventionCreate(InterventionBase):
    pass

class InterventionReview(BaseModel):
    decision: str  # confirm, dismiss, needs_field_visit
    reviewer_id: str
    notes: Optional[str] = None

class InterventionReviewRequest(BaseModel):
    decision: str  # confirm, needs_visit, dismiss
    notes: Optional[str] = None
    expected_status: str

class ReviewEventResponse(BaseModel):
    id: uuid.UUID
    intervention_id: uuid.UUID
    from_status: str
    to_status: str
    decision: str
    notes: Optional[str] = None
    reviewer_id: str
    reviewer_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class InterventionResponse(InterventionBase):
    id: uuid.UUID
    watershed_name: Optional[str] = None
    review_status: str = "OBSERVED"
    current_reviewer_id: Optional[str] = None
    current_notes: Optional[str] = None
    reviewer_decision: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    image_info: Optional[ImageResponse] = None
    
    # Terrain context
    nearest_stream_distance_m: Optional[float] = None
    upstream_catchment_area_sqkm: Optional[float] = None
    local_slope_deg: Optional[float] = None

    # Satellite 30m NDVI & Spectral context
    satellite_context: Optional[ImageSatelliteContext] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Terrain & Streams ────────────────────────────────────
class StreamSegmentResponse(BaseModel):
    id: uuid.UUID
    watershed_id: uuid.UUID
    order: int
    length_km: float
    properties: Optional[Dict[str, Any]] = None
    geometry_geojson: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

class PointHydrologyResponse(BaseModel):
    latitude: float
    longitude: float
    distance_to_nearest_stream_m: float
    nearest_stream_order: int
    nearest_stream_name: str
    upstream_contributing_area_sqkm: float
    dem_resolution_m: float = 30.0
    cell_area_sqkm: float = 0.0009


# ─── Satellite Scenes & Rasters ───────────────────────────
class SatelliteSceneResponse(BaseModel):
    id: uuid.UUID
    scene_id: str
    provider: str
    sensor: Optional[str] = None
    acquisition_time: datetime
    cloud_cover: Optional[float] = None
    resolution_m: Optional[float] = 30.0
    processing_level: Optional[str] = None
    crs: str = "EPSG:4326"
    bands: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RasterLegendEntry(BaseModel):
    min: float
    max: float
    color: str
    label: str

class RasterLegend(BaseModel):
    asset_id: uuid.UUID
    asset_type: str
    min_value: float
    max_value: float
    palette: str
    entries: List[RasterLegendEntry]
    note: Optional[str] = None

class RasterAssetResponse(BaseModel):
    id: uuid.UUID
    scene_id: Optional[uuid.UUID] = None
    watershed_id: Optional[uuid.UUID] = None
    name: str
    asset_type: str
    crs: str = "EPSG:4326"
    resolution_m: Optional[float] = 30.0
    bounds: Optional[List[float]] = None
    stats: Optional[Dict[str, Any]] = None
    valid_pct: Optional[float] = None
    is_flagged: bool = False
    flag_reason: Optional[str] = None
    checksum: Optional[str] = None
    version: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Analysis & Anomaly Detection ────────────────────────
class BaselineObservationResponse(BaseModel):
    scene_id: str
    date: str
    year: int
    value: float

class AnomalyAnalysisResponse(BaseModel):
    location: List[float]
    target_date: str
    nearest_scene_id: Optional[str] = None
    nearest_scene_date: Optional[str] = None
    observed_value: Optional[float] = None
    metric: str
    baseline_median: Optional[float] = None
    baseline_mad: Optional[float] = None
    baseline_n: int
    z_score: Optional[float] = None
    status: str  # normal, watch, review, insufficient_history
    status_label: str
    baseline_observations: List[BaselineObservationResponse] = []
    provenance: Dict[str, Any]

class AnalysisJobCreate(BaseModel):
    type: str
    input_refs: Optional[Dict[str, Any]] = None
    model_version: Optional[str] = None

class AnalysisJobResponse(BaseModel):
    id: uuid.UUID
    type: str
    status: str
    stage: Optional[str] = None
    progress: Optional[float] = 0.0
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result_summary: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Change Detection ─────────────────────────────────────
class ChangeEventResponse(BaseModel):
    id: uuid.UUID
    watershed_id: Optional[uuid.UUID] = None
    intervention_id: Optional[uuid.UUID] = None
    from_date: datetime
    to_date: datetime
    metric: str
    delta: Optional[float] = None
    treated_delta: Optional[float] = None
    control_delta: Optional[float] = None
    did_estimate: Optional[float] = None
    treated_pixel_count: Optional[int] = None
    control_pixel_count: Optional[int] = None
    valid_pct: Optional[float] = None
    confidence: Optional[float] = None
    severity: Optional[str] = None
    methodology: Optional[str] = None
    limitations_disclaimer: Optional[str] = None
    provenance: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Dashboard & Reports ──────────────────────────────────
class DashboardStatsResponse(BaseModel):
    total_watersheds: int
    total_images: int
    total_interventions: int
    total_analyses: int
    avg_ndvi: Optional[float] = None
    avg_ndwi: Optional[float] = None
    total_water_area_sqkm: Optional[float] = None
    quality_alerts: int
    verified_interventions: int = 0
    needs_visit_interventions: int = 0
    dismissed_interventions: int = 0
    observed_interventions: int = 0

DashboardStats = DashboardStatsResponse
WatershedGeoJSON = Dict[str, Any]


# ─── Auth & Users ─────────────────────────────────────────
class UserLoginRequest(BaseModel):
    username_or_email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserResponse"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserCreateRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: str
    role: str = "viewer"  # admin, gis_analyst, field_officer, reviewer, viewer
    organization: Optional[str] = "National Watershed Mission Directorate"

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: str
    role: str
    organization: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: str
    action: str
    resource_type: str
    resource_id: str
    timestamp: datetime
    ip_address: Optional[str] = None
    metadata_info: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Bhuvan LULC Context Schemas ──────────────────────────
class LulcClassItem(BaseModel):
    code: str
    name: str
    area: float
    percentage: float


class LulcStatsResponse(BaseModel):
    watershed_id: Optional[str] = None
    geometry_hash: str
    source: str = "Bhuvan LULC 50K AOI Service (NRSC / ISRO)"
    vintage: str = "year not stated"
    units: str = "unverified"
    token_used: Optional[str] = None  # "A" or "B"
    fetched_at: str
    disclaimer: str = "periodic map product, not current conditions"
    total_area: float
    classes: List[LulcClassItem]
    per_state: Dict[str, Dict[str, float]]
    raw_json: Optional[Any] = None
    cached: bool = False
    empty: bool = False
    message: Optional[str] = None


# ─── Points Density Heatmap Schemas ───────────────────────
class DensityPointItem(BaseModel):
    lat: float
    lng: float
    weight: float = 1.0
    id: Optional[str] = None
    source: str  # "intervention" or "photo"
    type: Optional[str] = None
    date: Optional[str] = None
    label: Optional[str] = None


class PointsDensityLegend(BaseModel):
    total_count: int
    bandwidth_m: float
    interventions_count: int
    photos_count: int
    disclaimer: str = "Shows where documentation & geotagged interventions are concentrated, not impact."


class PointsDensityResponse(BaseModel):
    watershed_id: str
    source_type: str  # "all", "interventions", "photos"
    total_points: int
    bandwidth_m: float
    points: List[DensityPointItem]
    heat_points: List[List[float]]  # [[lat, lng, weight], ...]
    legend: PointsDensityLegend


