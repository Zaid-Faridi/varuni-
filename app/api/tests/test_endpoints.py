import pytest
from datetime import datetime


def test_health_check(client):
    """Verifies health check endpoint returns 200 and ok status."""
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_auth_me_endpoint(client):
    """Verifies user info endpoint returns 401 Unauthorized when unauthenticated."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


def test_interventions_crud_and_review(client):
    """Verifies intervention creation and reviewer decision audit workflow."""
    # Create intervention
    payload = {
        "name": "Check Dam Beta",
        "type": "check_dam",
        "status": "proposed",
        "latitude": 18.45,
        "longitude": 73.75,
        "description": "Masonry check dam for stream runoff retention."
    }
    res = client.post("/api/v1/interventions/", json=payload)
    assert res.status_code == 200
    itv = res.json()
    itv_id = itv["id"]
    assert itv["status"] == "proposed"

    # Review decision: confirm
    review_payload = {
        "decision": "confirm",
        "reviewer_id": "officer_sharma",
        "notes": "Verified structure during field inspection."
    }
    res_rev = client.patch(f"/api/v1/interventions/{itv_id}/review", json=review_payload)
    assert res_rev.status_code == 200
    reviewed = res_rev.json()
    assert reviewed["reviewer_decision"] == "confirm"
    assert reviewed["reviewer_id"] == "officer_sharma"
    assert reviewed["status"] == "verified"
    assert reviewed["reviewed_at"] is not None


def test_reports_summary_endpoint(client):
    """Verifies report summary endpoint responds correctly."""
    res = client.get("/api/v1/reports/summary")
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert "provenance" in data
