import pytest
from datetime import datetime
from analysis.anomaly import analyze_seasonal_deviation, compute_robust_z_score


def test_insufficient_history():
    """Verifies that fewer than 4 historical baseline observations returns 'insufficient_history'."""
    target_dt = datetime(2024, 10, 15)
    # Only 2 prior year observations provided
    history = [
        {"scene_id": "LC08_2023", "date": datetime(2023, 10, 10), "value": 0.45, "is_clear": True},
        {"scene_id": "LC08_2022", "date": datetime(2022, 10, 18), "value": 0.48, "is_clear": True},
    ]

    res = analyze_seasonal_deviation(
        observed_value=0.52,
        target_date=target_dt,
        historical_observations=history,
        min_observations=4
    )

    assert res["status"] == "insufficient_history"
    assert res["baseline_n"] == 2
    assert res["z_score"] is None


def test_normal_seasonal_deviation():
    """Verifies that an observed value within normal seasonal variance produces |z| < 2."""
    target_dt = datetime(2024, 10, 15)
    # 5 prior years observations around mid-October
    history = [
        {"scene_id": "LC08_2023", "date": datetime(2023, 10, 12), "value": 0.50, "is_clear": True},
        {"scene_id": "LC08_2022", "date": datetime(2022, 10, 14), "value": 0.52, "is_clear": True},
        {"scene_id": "LC08_2021", "date": datetime(2021, 10, 16), "value": 0.49, "is_clear": True},
        {"scene_id": "LC08_2020", "date": datetime(2020, 10, 10), "value": 0.51, "is_clear": True},
        {"scene_id": "LC08_2019", "date": datetime(2019, 10, 20), "value": 0.48, "is_clear": True},
    ]

    # Observed value is 0.51 (very close to baseline median 0.50)
    res = analyze_seasonal_deviation(
        observed_value=0.51,
        target_date=target_dt,
        historical_observations=history,
        min_observations=4
    )

    assert res["status"] == "normal"
    assert abs(res["z_score"]) < 2.0
    assert res["baseline_n"] == 5
    assert len(res["baseline_observations"]) == 5


def test_review_status_high_deviation():
    """Verifies that an observed value with high deviation (|z| > 3) produces 'review' status."""
    target_dt = datetime(2024, 10, 15)
    history = [
        {"scene_id": "LC08_2023", "date": datetime(2023, 10, 12), "value": 0.40, "is_clear": True},
        {"scene_id": "LC08_2022", "date": datetime(2022, 10, 14), "value": 0.42, "is_clear": True},
        {"scene_id": "LC08_2021", "date": datetime(2021, 10, 16), "value": 0.41, "is_clear": True},
        {"scene_id": "LC08_2020", "date": datetime(2020, 10, 10), "value": 0.39, "is_clear": True},
    ]

    # Observed value is 0.75 (massive surge, e.g. new perennial plantation or water body)
    res = analyze_seasonal_deviation(
        observed_value=0.75,
        target_date=target_dt,
        historical_observations=history,
        min_observations=4
    )

    assert res["status"] == "review"
    assert res["z_score"] > 3.0
