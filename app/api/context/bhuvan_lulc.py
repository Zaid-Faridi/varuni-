"""
Bhuvan LULC 50K AOI-wise API Context Provider.
Connects to NRSC / ISRO Bhuvan LULC 50K AOI service.

Rules:
- Tokens come ONLY from environment variables BHUVAN_LULC_TOKEN_A / BHUVAN_LULC_TOKEN_B.
- Never log, print, commit, or return raw tokens. Record only "A" or "B".
- Simplifies watershed polygon geometry to keep URL concise and valid.
- 20s timeout with retries. No fabricated fallback data.
- Legend loaded strictly from data/lulc_legend.csv without guessing unknown codes.
"""

import os
import csv
import json
import time
import hashlib
import logging
import urllib.parse
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv
import requests
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.wkt import loads as wkt_loads, dumps as wkt_dumps

# Ensure environment variables are loaded
load_dotenv(".env")
load_dotenv("app/api/.env")
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

logger = logging.getLogger("varuni.context.bhuvan_lulc")

BHUVAN_LULC_URL = "https://bhuvan-app1.nrsc.gov.in/api/lulc/curl_aoi.php"
DEFAULT_TIMEOUT = 20.0
DEFAULT_MAX_RETRIES = 2
DEFAULT_SIMPLIFY_TOLERANCE = 0.001


def get_legend_path() -> str:
    """Finds the path to data/lulc_legend.csv."""
    candidates = [
        os.path.join(os.getcwd(), "data", "lulc_legend.csv"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "lulc_legend.csv"),
        os.path.join(os.path.dirname(__file__), "..", "data", "lulc_legend.csv"),
        "/Users/zaidfaridi/Downloads/PROJECTS /VARUNI /Varuni/data/lulc_legend.csv"
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return candidates[0]


def load_lulc_legend(filepath: Optional[str] = None) -> Dict[str, str]:
    """
    Loads LULC legend mapping from CSV (code -> name).
    Never guesses class names. If a code is not in the legend, raw code is used.
    """
    path = filepath or get_legend_path()
    legend: Dict[str, str] = {}
    if not os.path.exists(path):
        logger.warning("LULC legend CSV not found at %s. Using raw codes.", path)
        return legend

    try:
        with open(path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                code = row.get("code", "").strip().lower()
                name = row.get("name", "").strip()
                if code and name:
                    legend[code] = name
    except Exception as e:
        logger.error("Error reading LULC legend CSV: %s", e)

    return legend


def compute_geometry_hash(geom_wkt_or_dict: Any) -> str:
    """Computes a deterministic SHA-256 hash for geometry caching."""
    if isinstance(geom_wkt_or_dict, dict):
        canonical_str = json.dumps(geom_wkt_or_dict, sort_keys=True)
    elif isinstance(geom_wkt_or_dict, str):
        canonical_str = geom_wkt_or_dict.strip().upper()
    else:
        canonical_str = str(geom_wkt_or_dict)
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()


def simplify_geometry_to_wkt(geom_input: Any, tolerance: float = DEFAULT_SIMPLIFY_TOLERANCE) -> str:
    """
    Converts GeoJSON dict, Shapely geom, or WKT to a simplified WKT POLYGON/MULTIPOLYGON
    in (lon lat) closed-ring format.
    """
    if isinstance(geom_input, str):
        if geom_input.strip().startswith("{"):
            geom_obj = shape(json.loads(geom_input))
        else:
            geom_obj = wkt_loads(geom_input)
    elif isinstance(geom_input, dict):
        geom_obj = shape(geom_input)
    else:
        geom_obj = geom_input

    # If it's a MultiPolygon or Polygon, simplify
    if hasattr(geom_obj, "simplify"):
        simplified = geom_obj.simplify(tolerance=tolerance, preserve_topology=True)
        if not simplified.is_valid:
            simplified = geom_obj
    else:
        simplified = geom_obj

    # If MultiPolygon, take exterior or convex hull if needed, or format first polygon
    if simplified.geom_type == "MultiPolygon":
        # Extract the largest polygon or convex hull to keep WKT clean
        polys = sorted(list(simplified.geoms), key=lambda p: p.area, reverse=True)
        simplified = polys[0]

    # Convert coordinates to WKT with lon lat order
    coords = list(simplified.exterior.coords)
    # Ensure closed ring
    if coords[0] != coords[-1]:
        coords.append(coords[0])

    coord_str = ", ".join(f"{round(x, 6)} {round(y, 6)}" for x, y in coords)
    return f"POLYGON(({coord_str}))"


def clean_bhuvan_keys(raw_data: Any) -> List[Dict[str, Any]]:
    """
    Strips literal single/double quotes from keys in Bhuvan JSON response objects.
    e.g. {"'l04'": 203.17} -> {"l04": 203.17}
    """
    if not raw_data or not isinstance(raw_data, list):
        return []

    cleaned: List[Dict[str, Any]] = []
    for item in raw_data:
        if not isinstance(item, dict):
            continue
        cleaned_item: Dict[str, Any] = {}
        for k, v in item.items():
            clean_k = str(k).strip().strip("'").strip('"')
            try:
                # Convert numeric string to float if applicable
                if isinstance(v, (int, float)):
                    cleaned_item[clean_k] = float(v)
                elif isinstance(v, str) and clean_k != "State":
                    cleaned_item[clean_k] = float(v)
                else:
                    cleaned_item[clean_k] = v
            except (ValueError, TypeError):
                cleaned_item[clean_k] = v
        cleaned.append(cleaned_item)

    return cleaned


def aggregate_lulc_data(cleaned_data: List[Dict[str, Any]], legend: Dict[str, str]) -> Tuple[Dict[str, Dict[str, float]], List[Dict[str, Any]], float]:
    """
    Aggregates per-state and summed class values across all states.
    Returns (per_state, classes_summary_list, total_summed_area).
    """
    per_state: Dict[str, Dict[str, float]] = {}
    summed_classes: Dict[str, float] = {}

    for entry in cleaned_data:
        state_name = str(entry.get("State", "Unknown"))
        if state_name not in per_state:
            per_state[state_name] = {}

        for k, v in entry.items():
            if k == "State" or not isinstance(v, (int, float)):
                continue
            code = k.lower()
            val = float(v)
            per_state[state_name][code] = round(per_state[state_name].get(code, 0.0) + val, 4)
            summed_classes[code] = round(summed_classes.get(code, 0.0) + val, 4)

    total_area = round(sum(summed_classes.values()), 4)

    # Build sorted class list with percentages and legend lookup
    classes_list: List[Dict[str, Any]] = []
    for code, area in sorted(summed_classes.items(), key=lambda x: x[1], reverse=True):
        name = legend.get(code, code)  # Never guess; raw code if missing
        pct = round((area / total_area * 100.0), 2) if total_area > 0 else 0.0
        classes_list.append({
            "code": code,
            "name": name,
            "area": area,
            "percentage": pct
        })

    return per_state, classes_list, total_area


def fetch_bhuvan_lulc(
    geometry_input: Any,
    simplify_tolerance: float = DEFAULT_SIMPLIFY_TOLERANCE,
    timeout: float = DEFAULT_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
    legend_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetches LULC 50K AOI statistics from the Bhuvan API.
    Tries Token A, then Token B on authentication/authorization errors.
    Returns normalized dictionary with parsed classes, provenance, and raw response.
    """
    token_a = os.getenv("BHUVAN_LULC_TOKEN_A", "").strip()
    token_b = os.getenv("BHUVAN_LULC_TOKEN_B", "").strip()

    if not token_a and not token_b:
        raise ValueError("BHUVAN_LULC_TOKEN_A and BHUVAN_LULC_TOKEN_B are not configured in environment.")

    wkt_geom = simplify_geometry_to_wkt(geometry_input, tolerance=simplify_tolerance)
    geom_hash = compute_geometry_hash(wkt_geom)
    legend = load_lulc_legend(legend_path)

    tokens_to_try: List[Tuple[str, str]] = []
    if token_a:
        tokens_to_try.append(("A", token_a))
    if token_b:
        tokens_to_try.append(("B", token_b))

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    encoded_geom = urllib.parse.quote(wkt_geom)

    last_error: Optional[str] = None
    response_json: Any = None
    token_used_id: Optional[str] = None

    for token_label, token_val in tokens_to_try:
        url = f"{BHUVAN_LULC_URL}?geom={encoded_geom}&token={token_val}"
        success = False

        for attempt in range(1, max_retries + 1):
            try:
                resp = requests.get(url, headers=headers, timeout=timeout)
                if resp.status_code in (401, 403):
                    last_error = f"Token {token_label} unauthorized ({resp.status_code})"
                    logger.warning("Token %s returned status %d. Trying next token.", token_label, resp.status_code)
                    break  # Failover to next token immediately

                resp.raise_for_status()
                text = resp.text.strip()

                if not text or text.lower() == "null":
                    response_json = []
                    token_used_id = token_label
                    success = True
                    break

                try:
                    parsed = resp.json()
                except Exception:
                    # Some responses return JSON with text wrapper
                    parsed = json.loads(text)

                if isinstance(parsed, dict) and "error" in parsed:
                    err_msg = parsed.get("error_description") or parsed.get("error")
                    last_error = f"Token {token_label} error: {err_msg}"
                    logger.warning("Token %s returned error: %s. Trying next token.", token_label, err_msg)
                    break  # Try next token

                response_json = parsed
                token_used_id = token_label
                success = True
                break

            except requests.exceptions.Timeout:
                last_error = f"Bhuvan API timed out after {timeout}s (attempt {attempt}/{max_retries})"
                logger.warning(last_error)
                if attempt < max_retries:
                    time.sleep(1.0)
            except requests.exceptions.RequestException as e:
                last_error = f"Bhuvan API connection error: {str(e)}"
                logger.warning(last_error)
                if attempt < max_retries:
                    time.sleep(1.0)

        if success:
            break

    if response_json is None:
        raise RuntimeError(f"Failed to fetch Bhuvan LULC data: {last_error or 'All tokens failed'}")

    cleaned = clean_bhuvan_keys(response_json)
    per_state, classes_summary, total_area = aggregate_lulc_data(cleaned, legend)

    area_units = os.getenv("LULC_AREA_UNITS", "unverified")
    vintage = os.getenv("LULC_VINTAGE", "year not stated")

    return {
        "geometry_hash": geom_hash,
        "wkt_simplified": wkt_geom,
        "source": "Bhuvan LULC 50K AOI Service (NRSC / ISRO)",
        "vintage": vintage,
        "units": area_units,
        "token_used": token_used_id,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "disclaimer": "periodic map product, not current conditions",
        "total_area": total_area,
        "classes": classes_summary,
        "per_state": per_state,
        "raw_json": response_json,
        "empty": len(classes_summary) == 0,
        "message": "No LULC data returned for this area" if len(classes_summary) == 0 else None
    }
