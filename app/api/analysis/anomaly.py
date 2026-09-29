"""
Anomaly Detection & Deviation from Seasonal History Module
Computes robust z-scores against historical multi-year seasonal baselines (+/- 20 days in prior years)
using median and Median Absolute Deviation (MAD).

Never claims 'impact' or 'cause' — only 'Deviation from seasonal history'.
"""
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple


def compute_robust_z_score(value: float, baseline_values: List[float]) -> Tuple[float, float, float, str]:
    """
    Computes median, MAD, and robust z-score for a given value against baseline observations.
    
    Robust Z-Score = (value - median) / (1.4826 * MAD)
    where 1.4826 is the normal distribution consistency scale factor for MAD.
    
    Returns: (median, mad, z_score, status)
    status: 'normal' (|z| < 2), 'watch' (2 <= |z| <= 3), 'review' (|z| > 3)
    """
    arr = np.array(baseline_values, dtype=float)
    med = float(np.median(arr))
    deviations = np.abs(arr - med)
    mad = float(np.median(deviations))
    
    # Scale MAD for normal consistency
    scale = 1.4826 * mad
    if scale < 1e-6:
        # If all baseline values are identical
        if abs(value - med) < 1e-6:
            z_score = 0.0
        else:
            z_score = 99.0 if value > med else -99.0
    else:
        z_score = float((value - med) / scale)
    
    abs_z = abs(z_score)
    if abs_z < 2.0:
        status = "normal"
    elif abs_z <= 3.0:
        status = "watch"
    else:
        status = "review"
        
    return med, mad, z_score, status


def analyze_seasonal_deviation(
    observed_value: Optional[float],
    target_date: datetime,
    historical_observations: List[Dict[str, Any]],
    metric: str = "ndvi",
    window_days: int = 20,
    min_observations: int = 4
) -> Dict[str, Any]:
    """
    Builds seasonal baseline from the same calendar window (+/- window_days) in PREVIOUS years.
    Requires at least min_observations (default 4); otherwise returns 'insufficient_history'.
    
    historical_observations format:
    [
        {"scene_id": "LC09_...", "date": datetime(...), "value": 0.45, "is_clear": True},
        ...
    ]
    """
    if observed_value is None:
        return {
            "status": "insufficient_history",
            "status_label": "No clear observation at target date",
            "metric": metric,
            "observed_value": None,
            "baseline_median": None,
            "baseline_mad": None,
            "baseline_n": 0,
            "z_score": None,
            "baseline_observations": [],
            "provenance": {
                "window_days": window_days,
                "min_observations_required": min_observations,
                "reason": "Missing observed value"
            }
        }

    target_doy = target_date.timetuple().tm_yday
    target_year = target_date.year
    
    baseline_obs = []
    baseline_vals = []
    
    for obs in historical_observations:
        obs_date = obs["date"]
        if isinstance(obs_date, str):
            obs_date = datetime.fromisoformat(obs_date.replace("Z", "+00:00"))
            
        # Must be strictly from previous years
        if obs_date.year >= target_year:
            continue
            
        # Must be marked clear (cloud masked)
        if not obs.get("is_clear", True):
            continue
            
        obs_doy = obs_date.timetuple().tm_yday
        doy_diff = abs(obs_doy - target_doy)
        # Handle wrap around near year boundary (e.g. Dec 31 to Jan 2)
        doy_diff = min(doy_diff, 365 - doy_diff)
        
        if doy_diff <= window_days and obs.get("value") is not None:
            val = float(obs["value"])
            baseline_vals.append(val)
            baseline_obs.append({
                "scene_id": obs.get("scene_id", "unknown"),
                "date": obs_date.strftime("%Y-%m-%d"),
                "year": obs_date.year,
                "value": round(val, 4)
            })
            
    n = len(baseline_vals)
    if n < min_observations:
        return {
            "status": "insufficient_history",
            "status_label": f"Insufficient seasonal history (found {n}/{min_observations} required observations)",
            "metric": metric,
            "observed_value": round(observed_value, 4),
            "baseline_median": None,
            "baseline_mad": None,
            "baseline_n": n,
            "z_score": None,
            "baseline_observations": baseline_obs,
            "provenance": {
                "target_date": target_date.strftime("%Y-%m-%d"),
                "window_days": window_days,
                "min_observations_required": min_observations,
                "found_observations": n,
                "reason": f"At least {min_observations} clear baseline observations required across prior years"
            }
        }
        
    med, mad, z_score, status = compute_robust_z_score(observed_value, baseline_vals)
    
    status_map = {
        "normal": "Deviation from seasonal history: Normal (|z| < 2)",
        "watch": "Deviation from seasonal history: Watch (2 <= |z| <= 3)",
        "review": "Deviation from seasonal history: Review (|z| > 3)"
    }
    
    return {
        "status": status,
        "status_label": status_map.get(status, status),
        "metric": metric,
        "observed_value": round(observed_value, 4),
        "baseline_median": round(med, 4),
        "baseline_mad": round(mad, 4),
        "baseline_n": n,
        "z_score": round(z_score, 2),
        "baseline_observations": baseline_obs,
        "provenance": {
            "target_date": target_date.strftime("%Y-%m-%d"),
            "window_days": window_days,
            "baseline_observations_count": n,
            "formula": "Robust Z-Score = (x - median) / (1.4826 * MAD)",
            "thresholds": {"normal": "< 2.0", "watch": "2.0 - 3.0", "review": "> 3.0"},
            "note": "Reported as observed deviation from historical seasonal baseline. Not causal impact."
        }
    }
