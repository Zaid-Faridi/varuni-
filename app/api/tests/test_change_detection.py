import datetime
import uuid
import pytest
from analysis.change_detection import (
    compute_intervention_observed_change,
    compute_did_from_rasters,
)
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


def test_did_engine_known_answer_planted_change(db_session):
    """
    Scientific Known-Answer Test:
    Verifies Difference-in-Differences (DiD) calculation on synthetic rasters
    with a planted +0.10 NDVI change strictly inside the treated buffer (<= 250m),
    while the surrounding control ring (500m - 1500m) has 0 change.

    TEST FIXTURE: Generated strictly in-test within a temporary directory;
    NEVER written to data/.

    T0 (Baseline):
        Uniform NDVI = 0.40 across entire grid (treated & control).
    T1 (Post-Intervention):
        Treated buffer (r <= 250m) = 0.50 (+0.10 planted change).
        Control ring (500m <= r <= 1500m) = 0.40 (0.00 change).

    Expected:
        Treated Delta = 0.50 - 0.40 = +0.10
        Control Delta = 0.40 - 0.40 = 0.00
        DiD Estimate = Treated Delta - Control Delta = +0.10 - 0.00 = +0.10
    """
    import os
    import tempfile
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    ws = get_or_create_test_watershed(db_session)
    itv = db_session.query(Intervention).filter(Intervention.watershed_id == ws.id).first()
    if not itv:
        itv = Intervention(
            id=uuid.uuid4(),
            name="Synthetic DiD Known-Answer Check Dam",
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

    center_lon = itv.longitude
    center_lat = itv.latitude
    treated_r = 250.0
    control_inner_r = 500.0
    control_outer_r = 1500.0

    # Grid: 120 x 120 pixels at 0.0003 deg resolution (~30m Landsat resolution)
    res = 0.0003
    width = 120
    height = 120
    origin_x = center_lon - (width / 2.0) * res
    origin_y = center_lat + (height / 2.0) * res
    transform = from_origin(origin_x, origin_y, res, res)

    cols, rows = np.meshgrid(np.arange(width), np.arange(height))
    xs = origin_x + (cols + 0.5) * res
    ys = origin_y - (rows + 0.5) * res
    dist_m = np.sqrt(((xs - center_lon) * 105100.0)**2 + ((ys - center_lat) * 111000.0)**2)

    # T0 baseline raster: 0.40 everywhere
    t0_data = np.full((height, width), 0.40, dtype=np.float32)

    # T1 comparison raster: planted +0.10 NDVI inside treated buffer, 0.40 elsewhere
    t1_data = np.full((height, width), 0.40, dtype=np.float32)
    t1_data[dist_m <= treated_r] = 0.50

    with tempfile.TemporaryDirectory() as tmpdir:
        t0_path = os.path.join(tmpdir, "synth_did_t0.tif")
        t1_path = os.path.join(tmpdir, "synth_did_t1.tif")

        for path, data in [(t0_path, t0_data), (t1_path, t1_data)]:
            with rasterio.open(
                path,
                'w',
                driver='GTiff',
                height=height,
                width=width,
                count=1,
                dtype=data.dtype,
                crs='EPSG:4326',
                transform=transform,
                nodata=-9999.0
            ) as dst:
                dst.write(data, 1)

        # 1. Test standalone compute_did_from_rasters engine
        engine_res = compute_did_from_rasters(
            t0_raster_path=t0_path,
            t1_raster_path=t1_path,
            center_lon=center_lon,
            center_lat=center_lat,
            treated_radius_m=treated_r,
            control_inner_radius_m=control_inner_r,
            control_outer_radius_m=control_outer_r
        )

        assert engine_res["treated_t0"] == pytest.approx(0.40, abs=0.01)
        assert engine_res["treated_t1"] == pytest.approx(0.50, abs=0.01)
        assert engine_res["control_t0"] == pytest.approx(0.40, abs=0.01)
        assert engine_res["control_t1"] == pytest.approx(0.40, abs=0.01)
        assert engine_res["treated_delta"] == pytest.approx(0.10, abs=0.01)
        assert engine_res["control_delta"] == pytest.approx(0.00, abs=0.01)
        assert engine_res["did_estimate"] == pytest.approx(0.10, abs=0.01)

        # 2. Test full intervention pipeline compute_intervention_observed_change
        pipeline_res = compute_intervention_observed_change(
            db=db_session,
            intervention_id=itv.id,
            metric="ndvi",
            treated_radius_m=treated_r,
            control_inner_radius_m=control_inner_r,
            control_outer_radius_m=control_outer_r,
            t0_raster_path=t0_path,
            t1_raster_path=t1_path
        )

        assert pipeline_res["status"] == "success"
        assert pipeline_res["can_compute"] is True
        assert pipeline_res["results"]["treated_delta"] == pytest.approx(0.10, abs=0.01)
        assert pipeline_res["results"]["control_delta"] == pytest.approx(0.00, abs=0.01)
        assert pipeline_res["results"]["did_observed_change"] == pytest.approx(0.10, abs=0.01)

