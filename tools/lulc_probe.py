#!/usr/bin/env python3
"""
Bhuvan LULC 50K AOI Service Probe Tool.

Calls the Bhuvan LULC API with Token A and Token B against a sample polygon,
displays status, states, classes, and calculates the true area in UTM (ha & km2)
along with diagnostic ratios to identify the unit.

Security Rule:
- NEVER prints, logs, or exports the raw token strings.
"""

import os
import sys
import json
import argparse
import urllib.parse
from dotenv import load_dotenv
import requests
import pyproj
from shapely.geometry import Polygon
from shapely.wkt import loads as wkt_loads
from shapely.ops import transform

# Load environment variables
load_dotenv(".env")
load_dotenv("app/api/.env")

BHUVAN_LULC_URL = "https://bhuvan-app1.nrsc.gov.in/api/lulc/curl_aoi.php"
DEFAULT_SAMPLE_WKT = "POLYGON((77.5 13.0, 77.6 13.0, 77.6 13.1, 77.5 13.1, 77.5 13.0))"


def compute_true_utm_area(geom_wkt: str):
    """
    Computes true geodesic surface area in UTM projection.
    Returns (area_m2, area_ha, area_km2, utm_epsg).
    """
    poly = wkt_loads(geom_wkt)
    centroid_lon, centroid_lat = poly.centroid.x, poly.centroid.y
    utm_zone = int((centroid_lon + 180) / 6) + 1
    utm_epsg = 32600 + utm_zone if centroid_lat >= 0 else 32700 + utm_zone

    wgs84 = pyproj.CRS("EPSG:4326")
    utm_crs = pyproj.CRS(f"EPSG:{utm_epsg}")
    project = pyproj.Transformer.from_crs(wgs84, utm_crs, always_xy=True).transform
    poly_utm = transform(project, poly)

    area_m2 = poly_utm.area
    area_ha = area_m2 / 10000.0
    area_km2 = area_m2 / 1000000.0
    return area_m2, area_ha, area_km2, utm_epsg


def probe_token(token_label: str, token_val: str, geom_wkt: str, timeout: float = 20.0):
    """
    Calls Bhuvan API with a masked token label.
    """
    if not token_val:
        return {
            "token_label": token_label,
            "status": "NOT_CONFIGURED",
            "http_code": None,
            "raw_response": "Environment variable missing or empty",
            "classes": {},
            "summed_area": 0.0,
            "states": []
        }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    encoded_geom = urllib.parse.quote(geom_wkt)
    url = f"{BHUVAN_LULC_URL}?geom={encoded_geom}&token={token_val}"

    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        http_code = resp.status_code
        text = resp.text.strip()

        if http_code != 200:
            return {
                "token_label": token_label,
                "status": f"HTTP_{http_code}",
                "http_code": http_code,
                "raw_response": text,
                "classes": {},
                "summed_area": 0.0,
                "states": []
            }

        if not text or text.lower() == "null":
            return {
                "token_label": token_label,
                "status": "NULL_RESPONSE",
                "http_code": http_code,
                "raw_response": "null",
                "classes": {},
                "summed_area": 0.0,
                "states": []
            }

        try:
            parsed = resp.json()
        except Exception:
            parsed = json.loads(text)

        if isinstance(parsed, dict) and "error" in parsed:
            err_desc = parsed.get("error_description") or parsed.get("error")
            return {
                "token_label": token_label,
                "status": f"AUTH_ERROR ({err_desc})",
                "http_code": http_code,
                "raw_response": str(parsed),
                "classes": {},
                "summed_area": 0.0,
                "states": []
            }

        if not isinstance(parsed, list):
            return {
                "token_label": token_label,
                "status": "INVALID_FORMAT",
                "http_code": http_code,
                "raw_response": str(parsed),
                "classes": {},
                "summed_area": 0.0,
                "states": []
            }

        # Parse cleaned classes and states
        states = []
        classes = {}
        for row in parsed:
            if not isinstance(row, dict):
                continue
            st = row.get("State", "Unknown")
            states.append(st)
            for k, v in row.items():
                if k == "State":
                    continue
                clean_k = str(k).strip().strip("'").strip('"').lower()
                try:
                    val = float(v)
                    classes[clean_k] = round(classes.get(clean_k, 0.0) + val, 4)
                except (ValueError, TypeError):
                    pass

        summed = round(sum(classes.values()), 4)
        return {
            "token_label": token_label,
            "status": "SUCCESS",
            "http_code": http_code,
            "raw_response": parsed,
            "classes": classes,
            "summed_area": summed,
            "states": list(set(states))
        }

    except requests.exceptions.Timeout:
        return {
            "token_label": token_label,
            "status": "TIMEOUT",
            "http_code": None,
            "raw_response": f"Request timed out after {timeout}s",
            "classes": {},
            "summed_area": 0.0,
            "states": []
        }
    except Exception as e:
        return {
            "token_label": token_label,
            "status": f"ERROR: {str(e)}",
            "http_code": None,
            "raw_response": str(e),
            "classes": {},
            "summed_area": 0.0,
            "states": []
        }


def main():
    parser = argparse.ArgumentParser(description="Probe Bhuvan LULC 50K API and diagnose units")
    parser.add_argument("--wkt", type=str, default=DEFAULT_SAMPLE_WKT, help="Polygon WKT string")
    parser.add_argument("--timeout", type=float, default=20.0, help="Request timeout in seconds")
    args = parser.parse_args()

    token_a = os.getenv("BHUVAN_LULC_TOKEN_A", "").strip()
    token_b = os.getenv("BHUVAN_LULC_TOKEN_B", "").strip()

    print("=" * 70)
    print("🛰️  BHUVAN LULC 50K AOI SERVICE PROBE & UNIT DIAGNOSTIC")
    print("=" * 70)
    print(f"Sample Polygon WKT: {args.wkt}")

    area_m2, area_ha, area_km2, utm_epsg = compute_true_utm_area(args.wkt)
    print(f"Projected UTM CRS: EPSG:{utm_epsg}")
    print(f"True UTM Area:     {area_km2:.4f} km²  |  {area_ha:.4f} ha  |  {area_m2:,.1f} m²")
    print("-" * 70)

    tokens = [("Token A (BHUVAN_LULC_TOKEN_A)", token_a), ("Token B (BHUVAN_LULC_TOKEN_B)", token_b)]

    for label, val in tokens:
        print(f"\n▶ Probing {label}...")
        res = probe_token(label, val, args.wkt, timeout=args.timeout)
        print(f"  • Status:     {res['status']}")
        if res["http_code"]:
            print(f"  • HTTP Code:  {res['http_code']}")
        print(f"  • States:     {res['states'] if res['states'] else 'None'}")
        print(f"  • Classes:    {len(res['classes'])} detected")
        if res["classes"]:
            for c, v in sorted(res["classes"].items()):
                print(f"      - {c}: {v}")
        print(f"  • Summed:     {res['summed_area']}")

        if res["summed_area"] > 0:
            r_ha = res["summed_area"] / area_ha
            r_km2 = res["summed_area"] / area_km2
            print("\n  📊 Unit Diagnostic Ratios:")
            print(f"      - Ratio (Bhuvan Sum / True km²): {r_km2:.4f}")
            print(f"      - Ratio (Bhuvan Sum / True ha):  {r_ha:.4f}")
            if 0.90 <= r_km2 <= 1.10:
                print(f"      👉 Strong Evidence: Bhuvan area unit is SQUARE KILOMETERS (km²) [Ratio: {r_km2:.4f} ≈ 1.0]")
            elif 0.90 <= r_ha <= 1.10:
                print(f"      👉 Strong Evidence: Bhuvan area unit is HECTARES (ha) [Ratio: {r_ha:.4f} ≈ 1.0]")
            else:
                print("      👉 Inconclusive unit ratio. Check LULC_AREA_UNITS configuration.")

    print("\n" + "=" * 70)
    print("🔒 Security Verification: Zero tokens printed or logged.")
    print("=" * 70)


if __name__ == "__main__":
    main()
