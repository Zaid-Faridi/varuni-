import uuid
import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
try:
    from database import Base
except ImportError:
    from app.api.database import Base


class Watershed(Base):
    __tablename__ = "watersheds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, index=True, nullable=False)
    state = Column(String, index=True, nullable=True)
    district = Column(String, index=True, nullable=True)
    block = Column(String, nullable=True)
    geometry = Column(Geometry('POLYGON', srid=4326), nullable=False)
    area_sqkm = Column(Float, nullable=True)
    perimeter_km = Column(Float, nullable=True)
    elevation_min = Column(Float, nullable=True)
    elevation_max = Column(Float, nullable=True)
    slope_avg = Column(Float, nullable=True)
    drainage_density = Column(Float, nullable=True)
    source = Column(String, nullable=True)
    version = Column(String, nullable=True)
    ndvi_current = Column(Float, nullable=True)
    ndwi_current = Column(Float, nullable=True)
    landcover_dominant = Column(String, nullable=True)
    population = Column(Integer, nullable=True)
    provenance = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    images = relationship("ImageObservation", back_populates="watershed")
    interventions = relationship("Intervention", back_populates="watershed")
    time_series = relationship("WatershedTimeSeries", back_populates="watershed")
    streams = relationship("StreamSegment", back_populates="watershed")


class WatershedTimeSeries(Base):
    __tablename__ = "watershed_time_series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=False)
    scene_id = Column(String, nullable=True)
    metric = Column(String, nullable=False)  # ndvi, ndwi
    date = Column(DateTime, nullable=False)
    mean = Column(Float, nullable=False)
    std = Column(Float, nullable=True)
    min_val = Column(Float, nullable=True)
    max_val = Column(Float, nullable=True)
    valid_pct = Column(Float, nullable=True)
    provenance = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    watershed = relationship("Watershed", back_populates="time_series")


class ImageObservation(Base):
    __tablename__ = "images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    object_uri = Column(String, nullable=False)
    thumbnail_uri = Column(String, nullable=True)
    captured_at = Column(DateTime, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geom = Column(Geometry('POINT', srid=4326), nullable=True)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=True)
    
    # Deterministic QC fields
    quality_status = Column(String, default="pending")  # good, poor, duplicate, no_gps, outside_monitored_area, pending
    quality_score = Column(Float, nullable=True)
    quality_reasons = Column(JSONB, nullable=True)      # list of string reasons
    blur_score = Column(Float, nullable=True)          # Variance of Laplacian
    exposure_mean = Column(Float, nullable=True)       # Mean pixel brightness (0-255)
    clipped_pixel_pct = Column(Float, nullable=True)   # % pixels clipped at 0 or 255
    resolution_w = Column(Integer, nullable=True)
    resolution_h = Column(Integer, nullable=True)
    sha256_hash = Column(String, index=True, nullable=True)
    perceptual_hash = Column(String, index=True, nullable=True)
    duplicate_of_id = Column(UUID(as_uuid=True), ForeignKey("images.id"), nullable=True)
    
    # Zero-shot CLIP Classification fields
    classification_result = Column(JSONB, nullable=True)  # {top_1, top_2, top_3, is_uncertain, model_name, version, etc.}
    reviewer_label = Column(String, nullable=True)         # Human ground truth label
    reviewer_label_notes = Column(String, nullable=True)
    reviewer_label_at = Column(DateTime, nullable=True)
    reviewer_id = Column(String, nullable=True)

    privacy_status = Column(String, default="private")
    ai_tags = Column(JSONB, nullable=True)
    intervention_type = Column(String, nullable=True)
    camera_model = Column(String, nullable=True)
    altitude = Column(Float, nullable=True)
    bearing = Column(Float, nullable=True)
    is_manual_location = Column(Boolean, default=False)
    satellite_context = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    watershed = relationship("Watershed", back_populates="images")
    ground_truth_labels = relationship("ImageGroundTruthLabel", back_populates="image")


class ImageGroundTruthLabel(Base):
    __tablename__ = "image_ground_truth_labels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id = Column(UUID(as_uuid=True), ForeignKey("images.id"), nullable=False)
    assigned_label = Column(String, nullable=False)
    original_model_label = Column(String, nullable=True)
    original_confidence = Column(Float, nullable=True)
    reviewer_id = Column(String, nullable=False)
    reviewer_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    image = relationship("ImageObservation", back_populates="ground_truth_labels")


class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=True)
    type = Column(String, nullable=False)  # check_dam, farm_pond, contour_trench, plantation_vegetation, bare_degraded_land, water_body, other_unclear
    geom = Column(Geometry('POINT', srid=4326), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=True)
    observed_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="proposed")  # proposed, observed, verified, needs_review, archived
    source = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    cost_estimate = Column(Float, nullable=True)
    beneficiaries = Column(Integer, nullable=True)
    
    # Terrain metrics at point
    nearest_stream_distance_m = Column(Float, nullable=True)
    upstream_catchment_area_sqkm = Column(Float, nullable=True)
    local_slope_deg = Column(Float, nullable=True)

    reviewer_decision = Column(String, nullable=True)  # confirm, dismiss, needs_field_visit
    reviewer_id = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    image_id = Column(UUID(as_uuid=True), ForeignKey("images.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    watershed = relationship("Watershed", back_populates="interventions")
    change_events = relationship("ChangeEvent", back_populates="intervention")


class StreamSegment(Base):
    __tablename__ = "stream_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=False)
    order = Column(Integer, nullable=False)  # Strahler stream order (1, 2, 3, etc.)
    length_km = Column(Float, nullable=False)
    geometry = Column(Geometry('LINESTRING', srid=4326), nullable=False)
    properties = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    watershed = relationship("Watershed", back_populates="streams")


class SatelliteScene(Base):
    __tablename__ = "satellite_scenes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scene_id = Column(String, unique=True, index=True, nullable=False)
    provider = Column(String, nullable=False)  # Landsat, Sentinel, SRISHTI-DRISHTI
    sensor = Column(String, nullable=True)
    acquisition_time = Column(DateTime, nullable=False)
    footprint = Column(Geometry('POLYGON', srid=4326), nullable=True)
    cloud_cover = Column(Float, nullable=True)
    resolution_m = Column(Float, default=30.0)
    source_uri = Column(String, nullable=True)
    processing_level = Column(String, nullable=True)
    crs = Column(String, default="EPSG:4326")
    bands = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RasterAsset(Base):
    __tablename__ = "raster_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scene_id = Column(UUID(as_uuid=True), ForeignKey("satellite_scenes.id"), nullable=True)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=True)
    name = Column(String, nullable=False)
    asset_type = Column(String, nullable=False)  # ndvi, ndwi, lulc, dem, slope, flow_accum, change
    band_set = Column(JSONB, nullable=True)
    crs = Column(String, default="EPSG:4326")
    resolution_m = Column(Float, default=30.0)
    uri = Column(String, nullable=True)
    bounds = Column(JSONB, nullable=True)  # [west, south, east, north] in EPSG:4326
    stats = Column(JSONB, nullable=True)   # {min, max, mean, std, valid_pct}
    valid_pct = Column(Float, nullable=True)
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(String, nullable=True)
    checksum = Column(String, nullable=True)
    version = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String, nullable=False)  # spectral_index, landcover, change_detect, zonal_stats, anomaly, terrain, clip_classify
    input_refs = Column(JSONB, nullable=True)
    model_version = Column(String, nullable=True)
    status = Column(String, default="queued")  # queued, running, succeeded, failed, cancelled
    stage = Column(String, nullable=True)
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    result_summary = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChangeEvent(Base):
    __tablename__ = "change_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=True)
    intervention_id = Column(UUID(as_uuid=True), ForeignKey("interventions.id"), nullable=True)
    area_geom = Column(Geometry('POLYGON', srid=4326), nullable=True)
    from_date = Column(DateTime, nullable=False)
    to_date = Column(DateTime, nullable=False)
    metric = Column(String, nullable=False)  # ndvi_observed_change, ndwi_observed_change
    
    # Difference-in-Differences fields
    treated_delta = Column(Float, nullable=True)
    control_delta = Column(Float, nullable=True)
    did_estimate = Column(Float, nullable=True)  # treated_delta - control_delta
    
    from_value = Column(Float, nullable=True)
    to_value = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)
    
    treated_pixel_count = Column(Integer, nullable=True)
    control_pixel_count = Column(Integer, nullable=True)
    valid_pct = Column(Float, nullable=True)
    
    confidence = Column(Float, nullable=True)
    severity = Column(String, nullable=True)  # low, medium, high, neutral
    methodology = Column(String, default="Difference-in-Differences (Treated 250m buffer vs Control 500-1500m ring)")
    limitations_disclaimer = Column(String, default="Observed change only. This is not proof of causal impact or causation.")
    provenance = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    intervention = relationship("Intervention", back_populates="change_events")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    request_id = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    metadata_info = Column(JSONB, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")  # admin, gis_analyst, field_officer, reviewer, viewer
    organization = Column(String, default="National Watershed Mission")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class LulcStat(Base):
    __tablename__ = "lulc_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id"), nullable=True, index=True)
    geometry_hash = Column(String, index=True, nullable=False)
    raw_json = Column(JSONB, nullable=True)
    per_state = Column(JSONB, nullable=True)
    summed_classes = Column(JSONB, nullable=True)
    total_area = Column(Float, nullable=True)
    units = Column(String, default="unverified")
    vintage = Column(String, default="year not stated")
    source = Column(String, default="Bhuvan LULC 50K AOI Service (NRSC / ISRO)")
    token_used = Column(String, nullable=True)  # "A" or "B"
    disclaimer = Column(String, default="periodic map product, not current conditions")
    fetched_at = Column(DateTime, default=datetime.datetime.utcnow)

    watershed = relationship("Watershed", backref="lulc_stats")

