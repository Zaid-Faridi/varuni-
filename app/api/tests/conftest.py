import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add app/api to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Configure test environment variables for pytest session
os.environ.setdefault("JWT_SECRET_KEY", "pytest_test_session_jwt_secret_key_with_at_least_32_chars!")
os.environ.setdefault("ADMIN_PASSWORD", "test_admin_secure_password_min_12_chars")
os.environ.setdefault("DEMO_MODE", "0")

from database import Base, get_db
from main import app
import models  # noqa: F401

# Use test database or current PostGIS database
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    os.getenv("DATABASE_URL", "postgresql://watershed_user:watershed_password@localhost:5432/watershed_db")
)

test_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    with test_engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.commit()
    Base.metadata.create_all(bind=test_engine)
    yield
    # Cleanup tables after test session
    # Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """Returns clean database session per test."""
    session = TestingSessionLocal()
    # Truncate tables between tests for clean isolation
    try:
        truncate_sql = (
            "TRUNCATE TABLE watershed_time_series, raster_assets, change_events, "
            "interventions, images, analysis_results, analysis_jobs, "
            "satellite_scenes, watersheds, audit_events, users CASCADE;"
        )
        session.execute(text(truncate_sql))
        session.commit()
    except Exception:
        session.rollback()

    
    yield session
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
