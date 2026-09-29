import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

# PostgreSQL with PostGIS is the sole supported database for the spatial queries
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://watershed_user:watershed_password@localhost:5432/watershed_db"
)

# Create database engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """
    Ensures the PostGIS extension is loaded in the PostgreSQL database and all tables are created.
    The PostGIS extension provides spatial data types (GEOMETRY) and spatial functions (ST_Contains, ST_Area, etc.).
    """
    try:
        with engine.connect() as conn:
            # Enable PostGIS extension for spatial vector support
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.commit()
    except Exception as e:
        print(f"Notice during PostGIS extension init: {e}")
    
    # Create all defined SQLAlchemy and GeoAlchemy2 tables
    Base.metadata.create_all(bind=engine)

    # Automatically ensure new columns exist on existing tables
    migration_statements = [
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS quality_reasons JSONB;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS blur_score FLOAT;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS exposure_mean FLOAT;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS clipped_pixel_pct FLOAT;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS resolution_w INTEGER;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS resolution_h INTEGER;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS perceptual_hash VARCHAR;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES images(id);",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS classification_result JSONB;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS reviewer_label VARCHAR;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS reviewer_label_notes VARCHAR;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS reviewer_label_at TIMESTAMP;",
        "ALTER TABLE images ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR;",
        "ALTER TABLE interventions ADD COLUMN IF NOT EXISTS nearest_stream_distance_m FLOAT;",
        "ALTER TABLE interventions ADD COLUMN IF NOT EXISTS upstream_catchment_area_sqkm FLOAT;",
        "ALTER TABLE interventions ADD COLUMN IF NOT EXISTS local_slope_deg FLOAT;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS intervention_id UUID REFERENCES interventions(id);",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS treated_delta FLOAT;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS control_delta FLOAT;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS did_estimate FLOAT;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS treated_pixel_count INTEGER;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS control_pixel_count INTEGER;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS valid_pct FLOAT;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS methodology VARCHAR;",
        "ALTER TABLE change_events ADD COLUMN IF NOT EXISTS limitations_disclaimer VARCHAR;",
        """CREATE TABLE IF NOT EXISTS lulc_stats (
            id UUID PRIMARY KEY,
            watershed_id UUID REFERENCES watersheds(id),
            geometry_hash VARCHAR NOT NULL,
            raw_json JSONB,
            per_state JSONB,
            summed_classes JSONB,
            total_area FLOAT,
            units VARCHAR DEFAULT 'unverified',
            vintage VARCHAR DEFAULT 'year not stated',
            source VARCHAR DEFAULT 'Bhuvan LULC 50K AOI Service (NRSC / ISRO)',
            token_used VARCHAR,
            disclaimer VARCHAR DEFAULT 'periodic map product, not current conditions',
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );""",
        "CREATE INDEX IF NOT EXISTS idx_lulc_stats_geom_hash ON lulc_stats(geometry_hash);",
        "CREATE INDEX IF NOT EXISTS idx_lulc_stats_ws_id ON lulc_stats(watershed_id);"
    ]
    try:
        with engine.connect() as conn:
            for stmt in migration_statements:
                conn.execute(text(stmt))
            conn.commit()
    except Exception as e:
        print(f"Notice during column migration: {e}")


def get_db():
    """FastAPI dependency for yielding database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
