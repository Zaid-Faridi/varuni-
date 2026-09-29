"""
Tests for Bhuvan LULC 50K Context Provider.
Verifies quote stripping, multi-state summing, null responses,
missing legend codes, token privacy/security, and failover.
"""

import os
import io
import json
import logging
import pytest
from unittest.mock import patch, MagicMock
from shapely.geometry import Polygon

from context.bhuvan_lulc import (
    clean_bhuvan_keys,
    aggregate_lulc_data,
    load_lulc_legend,
    simplify_geometry_to_wkt,
    compute_geometry_hash,
    fetch_bhuvan_lulc,
)


def test_quote_stripping():
    """Verifies that literal single and double quotes are cleanly stripped from Bhuvan keys."""
    raw_fixture = [
        {
            "State": "KA",
            "'l01'": "92.99",
            "'l04'": 203.17,
            '"l06"': "14.50",
            "'l16'": 0.39,
        }
    ]

    cleaned = clean_bhuvan_keys(raw_fixture)
    assert len(cleaned) == 1
    assert cleaned[0]["State"] == "KA"
    assert cleaned[0]["l01"] == 92.99
    assert cleaned[0]["l04"] == 203.17
    assert cleaned[0]["l06"] == 14.50
    assert cleaned[0]["l16"] == 0.39
    assert "'l01'" not in cleaned[0]
    assert "'l04'" not in cleaned[0]
    assert '"l06"' not in cleaned[0]


def test_multi_state_summing():
    """Verifies that LULC data spanning multiple state polygons is summed and parsed accurately."""
    fixture = [
        {"State": "KA", "'l01'": 10.0, "'l02'": 5.0},
        {"State": "MH", "'l01'": 20.0, "'l02'": 15.0, "'l04'": 50.0},
    ]

    legend = {
        "l01": "Built-up Land",
        "l02": "Kharif Crop",
        "l04": "Zaid Crop",
    }

    cleaned = clean_bhuvan_keys(fixture)
    per_state, classes_summary, total_area = aggregate_lulc_data(cleaned, legend)

    assert total_area == 100.0  # (10 + 20) + (5 + 15) + 50 = 100.0
    assert per_state["KA"]["l01"] == 10.0
    assert per_state["MH"]["l01"] == 20.0

    class_dict = {c["code"]: c for c in classes_summary}
    assert class_dict["l01"]["area"] == 30.0
    assert class_dict["l01"]["percentage"] == 30.0
    assert class_dict["l01"]["name"] == "Built-up Land"

    assert class_dict["l02"]["area"] == 20.0
    assert class_dict["l02"]["percentage"] == 20.0

    assert class_dict["l04"]["area"] == 50.0
    assert class_dict["l04"]["percentage"] == 50.0


def test_null_and_empty_response():
    """Verifies that null and empty responses return structured empty results without error."""
    assert clean_bhuvan_keys(None) == []
    assert clean_bhuvan_keys([]) == []
    assert clean_bhuvan_keys("invalid string") == []

    per_state, classes, total_area = aggregate_lulc_data([], {})
    assert per_state == {}
    assert classes == []
    assert total_area == 0.0


def test_missing_legend_code():
    """Verifies that unknown or unmapped codes display the raw code without guessing."""
    fixture = [{"State": "KA", "'l99'": 42.5}]
    legend = {"l01": "Built-up Land"}  # l99 is missing from legend

    cleaned = clean_bhuvan_keys(fixture)
    per_state, classes_summary, total_area = aggregate_lulc_data(cleaned, legend)

    assert len(classes_summary) == 1
    assert classes_summary[0]["code"] == "l99"
    assert classes_summary[0]["name"] == "l99"  # Raw code preserved, no fabricated name


def test_token_never_appears_in_logs_or_output(caplog):
    """Verifies that secret token strings never appear in responses, logs, or error strings."""
    secret_token_a = "mock_secret_bhuvan_token_a_9876543210"
    secret_token_b = "mock_secret_bhuvan_token_b_1234567890"

    with patch.dict(os.environ, {"BHUVAN_LULC_TOKEN_A": secret_token_a, "BHUVAN_LULC_TOKEN_B": secret_token_b}):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = json.dumps([{"State": "KA", "'l01'": 12.0}])
        mock_resp.json.return_value = [{"State": "KA", "'l01'": 12.0}]

        with patch("requests.get", return_value=mock_resp):
            with caplog.at_level(logging.DEBUG):
                result = fetch_bhuvan_lulc("POLYGON((77.5 13.0, 77.6 13.0, 77.6 13.1, 77.5 13.1, 77.5 13.0))")

    # Verify result structure
    assert result["total_area"] == 12.0
    assert result["token_used"] in ["A", "B"]

    # Verify tokens are NEVER present anywhere
    result_str = json.dumps(result)
    assert secret_token_a not in result_str
    assert secret_token_b not in result_str

    for record in caplog.records:
        assert secret_token_a not in record.message
        assert secret_token_b not in record.message


def test_token_failover_a_to_b():
    """Verifies that when Token A fails with auth error, Token B is automatically used."""
    secret_token_a = "token_a_invalid"
    secret_token_b = "token_b_valid"

    with patch.dict(os.environ, {"BHUVAN_LULC_TOKEN_A": secret_token_a, "BHUVAN_LULC_TOKEN_B": secret_token_b}):
        def side_effect(url, headers, timeout):
            if secret_token_a in url:
                # Token A returns error
                mock_a = MagicMock()
                mock_a.status_code = 200
                mock_a.text = json.dumps({"error": "insufficient_scope", "error_description": "Scope error"})
                mock_a.json.return_value = {"error": "insufficient_scope", "error_description": "Scope error"}
                return mock_a
            elif secret_token_b in url:
                # Token B succeeds
                mock_b = MagicMock()
                mock_b.status_code = 200
                mock_b.text = json.dumps([{"State": "KA", "'l04'": 75.0}])
                mock_b.json.return_value = [{"State": "KA", "'l04'": 75.0}]
                return mock_b
            raise ValueError("Unexpected URL in test")

        with patch("requests.get", side_effect=side_effect):
            result = fetch_bhuvan_lulc("POLYGON((77.5 13.0, 77.6 13.0, 77.6 13.1, 77.5 13.1, 77.5 13.0))")

        assert result["token_used"] == "B"
        assert result["total_area"] == 75.0
        assert len(result["classes"]) == 1
        assert result["classes"][0]["code"] == "l04"


def test_geometry_simplification():
    """Verifies geometry simplification preserves topology and produces valid closed WKT."""
    # Highly detailed polygon with 100 points along edges
    coords = []
    for i in range(25):
        coords.append((77.0 + i * 0.004, 13.0))
    for i in range(25):
        coords.append((77.1, 13.0 + i * 0.004))
    for i in range(25):
        coords.append((77.1 - i * 0.004, 13.1))
    for i in range(25):
        coords.append((77.0, 13.1 - i * 0.004))
    coords.append(coords[0])

    poly = Polygon(coords)
    wkt = simplify_geometry_to_wkt(poly, tolerance=0.01)

    assert wkt.startswith("POLYGON((")
    assert wkt.endswith("))")
    # Simplification reduces number of vertices
    assert len(wkt.split(",")) < len(coords)
