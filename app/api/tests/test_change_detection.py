import uuid
import pytest
import datetime
from analysis.change_detection import compute_intervention_observed_change
from models import Watershed, Intervention, WatershedTimeSeries


def get_or_create_test_watershed(db_session):
    ws = db_session.query(Watershed).first()
    if not ws:
        ws = Watershed(
            id=uuid.uuid4(),
            name="DiD Test Pilot Catchment",
            state="Maharashtra",
            district="Pune",
            geometry="SRID=4326;POLYGON((73.80 18.70, 73.95 18.70, 73.95 18.82, 73.80 18.82, 73.80 18.70))",
            area_sqkm=160.0,
            perimeter_km=46.0,
            elevation_min=580.0,
            elevation_max=940.0
        )
        db_session.add(ws)
        db_session.commit()
        db_session.refresh(ws)
    return ws


def test_change_detection_computation(client, db_session):
    """Verifies Difference-in-Differences observed change calculation for an intervention."""
    ws = get_or_create_test_watershed(db_session)

    itv = db_session.query(Intervention).filter(Intervention.watershed_id == ws.id).first()
    if not itv:
        itv = Intervention(
            id=uuid.uuid4(),
            name="Masonry Check Dam DiD Test",
            type="check_dam",
            latitude=18.755,
            longitude=73.875,
            geom="SRID=4326;POINT(73.875 18.755)",
            watershed_id=ws.id,
            observed_at=datetime.datetime(2023, 10, 15)
        )
        db_session.add(itv)
        db_session.commit()
        db_session.refresh(itv)

    # Ensure baseline and comparison time series exist
    db_session.query(WatershedTimeSeries).filter(WatershedTimeSeries.watershed_id == ws.id).delete()
    db_session.add(WatershedTimeSeries(
        id=uuid.uuid4(),
        watershed_id=ws.id,
        scene_id="LC08_20221015",
        metric="ndvi",
        date=datetime.datetime(2022, 10, 15),
        mean=0.45,
        valid_pct=95.0
    ))
    db_session.add(WatershedTimeSeries(
        id=uuid.uuid4(),
        watershed_id=ws.id,
        scene_id="LC09_20241015",
        metric="ndvi",
        date=datetime.datetime(2024, 10, 15),
        mean=0.52,
        valid_pct=98.0
    ))
    db_session.commit()

    res = compute_intervention_observed_change(
        db_session,
        itv.id,
        metric="ndvi",
        treated_radius_m=250.0,
        control_inner_radius_m=500.0,
        control_outer_radius_m=1500.0
    )

    assert res["status"] == "success"
    assert res["can_compute"] is True
    assert "treated_delta" in res["results"]
    assert "control_delta" in res["results"]
    assert "did_observed_change" in res["results"]
    assert res["terminology"] == "observed change"
    assert "not proof of causal impact" in res["limitations"]


def test_change_detection_refusal_on_cloudy_data(db_session):
    """Verifies that change detection is refused when clear pixel percentage < 40%."""
    ws = get_or_create_test_watershed(db_session)

    itv = db_session.query(Intervention).filter(Intervention.watershed_id == ws.id).first()
    if not itv:
        itv = Intervention(
            id=uuid.uuid4(),
            name="Cloudy Test Check Dam",
            type="check_dam",
            latitude=18.755,
            longitude=73.875,
            geom="SRID=4326;POINT(73.875 18.755)",
            watershed_id=ws.id,
            observed_at=datetime.datetime(2023, 10, 15)
        )
        db_session.add(itv)
        db_session.commit()
        db_session.refresh(itv)

    # Set cloudy time series (< 40% valid)
    db_session.query(WatershedTimeSeries).filter(WatershedTimeSeries.watershed_id == ws.id).delete()
    db_session.add(WatershedTimeSeries(
        id=uuid.uuid4(),
        watershed_id=ws.id,
        scene_id="LC08_CLOUDY_20221015",
        metric="ndvi",
        date=datetime.datetime(2022, 10, 15),
        mean=0.30,
        valid_pct=25.0  # < 40%
    ))
    db_session.add(WatershedTimeSeries(
        id=uuid.uuid4(),
        watershed_id=ws.id,
        scene_id="LC09_20241015",
        metric="ndvi",
        date=datetime.datetime(2024, 10, 15),
        mean=0.50,
        valid_pct=95.0
    ))
    db_session.commit()

    res = compute_intervention_observed_change(db_session, itv.id, metric="ndvi", min_valid_pct=40.0)
    assert res["status"] == "refused"
    assert res["can_compute"] is False
    assert "insufficient clear data" in res["reason"].lower()
