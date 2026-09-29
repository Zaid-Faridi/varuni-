import pytest
import io
import csv
from services.report_export import (
    generate_observations_csv,
    generate_observations_geojson,
    generate_watershed_pdf_report
)
from models import Watershed, Intervention
import uuid
from geoalchemy2.elements import WKTElement


def test_csv_export_generation(db_session):
    # Seed intervention
    ws_id = uuid.uuid4()
    ws = Watershed(
        id=ws_id,
        name="Export Test Watershed",
        geometry=WKTElement("POLYGON((73.0 18.0, 73.1 18.0, 73.1 18.1, 73.0 18.1, 73.0 18.0))", srid=4326),
        area_sqkm=50.0
    )
    db_session.add(ws)

    itv = Intervention(
        id=uuid.uuid4(),
        name="Test Check Dam",
        type="check_dam",
        geom=WKTElement("POINT(73.05 18.05)", srid=4326),
        latitude=18.05,
        longitude=73.05,
        watershed_id=ws_id,
        status="verified"
    )
    db_session.add(itv)
    db_session.commit()

    csv_output = generate_observations_csv(db_session, watershed_id=ws_id)
    content = csv_output.getvalue()
    assert "Test Check Dam" in content
    assert "check_dam" in content
    assert "Export Test Watershed" in content


def test_geojson_export_generation(db_session):
    ws_id = uuid.uuid4()
    geojson = generate_observations_geojson(db_session, watershed_id=ws_id)
    assert geojson["type"] == "FeatureCollection"
    assert "features" in geojson
    assert "provenance" in geojson


def test_pdf_report_generation(db_session):
    ws_id = uuid.uuid4()
    pdf_bytes = generate_watershed_pdf_report(db_session, watershed_id=ws_id)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 500


def test_report_endpoints(client, db_session):
    # Test CSV endpoint
    res_csv = client.get("/api/v1/reports/export/csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]

    # Test GeoJSON endpoint
    res_geo = client.get("/api/v1/reports/export/geojson")
    assert res_geo.status_code == 200
    assert "application/geo+json" in res_geo.headers["content-type"]

    # Test PDF endpoint
    res_pdf = client.get("/api/v1/reports/export/pdf")
    assert res_pdf.status_code == 200
    assert "application/pdf" in res_pdf.headers["content-type"]
    assert res_pdf.content.startswith(b"%PDF-")
