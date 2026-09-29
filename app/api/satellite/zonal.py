"""
Zonal Statistics & Colormap Rendering for Leaflet ImageOverlay
Generates transparent, colormapped PNGs and legend definitions for NDVI, NDWI, and elevation rasters.
"""
import io
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image
from typing import Dict, Any, List, Optional, Tuple


# Color palettes for spectral indices (RGBA tuples, 0-255)
# NDVI Palette: brown/bare (low) -> yellow/grass -> deep vibrant green (high)
NDVI_PALETTE = [
    (-1.0, (100, 100, 100, 220), "Water / Non-vegetated"),
    (0.0, (190, 150, 90, 220), "Barren / Soil"),
    (0.2, (230, 215, 120, 220), "Sparse Vegetation"),
    (0.4, (160, 210, 80, 220), "Moderate Vegetation"),
    (0.6, (50, 175, 45, 230), "Dense Crop / Forest"),
    (1.0, (10, 100, 25, 240), "Very Dense Canopy")
]

# NDWI Palette: dry/land (low) -> yellow/light blue -> deep ocean blue (high)
NDWI_PALETTE = [
    (-1.0, (210, 180, 140, 200), "Very Dry / Non-water"),
    (-0.2, (240, 230, 170, 200), "Dry Soil"),
    (0.0, (180, 230, 240, 220), "Moist Soil / Marsh"),
    (0.2, (80, 170, 235, 230), "Shallow Water / Stream"),
    (0.5, (20, 100, 210, 240), "Water Body / Pond"),
    (1.0, (5, 45, 150, 255), "Deep Water Body")
]

# Land Surface Temperature (LST in °C) Palette:
# Physically calibrated: water/dense canopy is cooler, bare soil/built-up is warmer
LST_PALETTE = [
    (15.0, (30, 80, 200, 220), "Water Body / Very Cool (< 18°C)"),
    (22.0, (60, 180, 210, 225), "Dense Forest / Moist Canopy (18 - 24°C)"),
    (28.0, (160, 220, 80, 230), "Vegetated Agricultural Land (24 - 30°C)"),
    (34.0, (245, 180, 40, 235), "Open Soil / Fallow Field (30 - 36°C)"),
    (40.0, (230, 60, 30, 240), "Built-up / Hard Surface (36 - 42°C)"),
    (50.0, (140, 10, 20, 250), "High Heat / Barren Rock (> 42°C)")
]

# Anomaly Z-Score Palette (Standard deviations from multi-year median baseline)
ANOMALY_PALETTE = [
    (-3.0, (190, 30, 30, 240), "Severe Negative Anomaly (Z ≤ -2.0)"),
    (-1.5, (235, 130, 50, 230), "Moderate Negative Deviation (-1.5σ)"),
    (0.0, (240, 240, 200, 180), "Normal Baseline Condition (Z ≈ 0)"),
    (1.5, (90, 190, 90, 230), "Moderate Vegetation Gain (+1.5σ)"),
    (3.0, (15, 130, 35, 240), "Significant Greening Recovery (Z ≥ +2.0)")
]

# Slope Palette in degrees
SLOPE_PALETTE = [
    (0.0, (230, 245, 220, 200), "Gentle Slope (0 - 5°)"),
    (5.0, (255, 215, 100, 220), "Moderate Slope (5 - 15°)"),
    (15.0, (240, 130, 40, 230), "Steep Slope (15 - 30°)"),
    (45.0, (180, 30, 20, 250), "Very Steep Slope (> 30°)")
]


def get_palette_for_asset(asset_type: str) -> List[Tuple[float, Tuple[int, int, int, int], str]]:
    """Returns corresponding color palette for a given raster asset type."""
    atype = asset_type.lower()
    if "lst" in atype or "temp" in atype:
        return LST_PALETTE
    elif "anomaly" in atype or "zscore" in atype or "dev" in atype:
        return ANOMALY_PALETTE
    elif "slope" in atype:
        return SLOPE_PALETTE
    elif "ndwi" in atype:
        return NDWI_PALETTE
    else:
        return NDVI_PALETTE


def interpolate_colormap(val: float, palette: List[Tuple[float, Tuple[int, int, int, int], str]]) -> Tuple[int, int, int, int]:
    """Linearly interpolates RGBA color between defined color stops."""
    if np.isnan(val) or val <= -999:
        return (0, 0, 0, 0)  # Transparent nodata
        
    val = float(np.clip(val, palette[0][0], palette[-1][0]))
    
    for i in range(len(palette) - 1):
        v_low, c_low, _ = palette[i]
        v_high, c_high, _ = palette[i + 1]
        
        if v_low <= val <= v_high:
            if abs(v_high - v_low) < 1e-6:
                return c_low
            t = (val - v_low) / (v_high - v_low)
            r = int(c_low[0] + t * (c_high[0] - c_low[0]))
            g = int(c_low[1] + t * (c_high[1] - c_low[1]))
            b = int(c_low[2] + t * (c_high[2] - c_low[2]))
            a = int(c_low[3] + t * (c_high[3] - c_low[3]))
            return (r, g, b, a)
            
    return palette[-1][1]


def render_raster_to_png_bytes(geotiff_path: str, asset_type: str = "ndvi") -> bytes:
    """Reads GeoTIFF and renders a transparent colormapped PNG image."""
    with rasterio.open(geotiff_path) as src:
        arr = src.read(1)
        nodata = src.nodata

    palette = get_palette_for_asset(asset_type)

    height, width = arr.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)

    # Filter nodata and NaNs
    is_valid = ~np.isnan(arr)
    if nodata is not None:
        is_valid &= (arr != nodata)

    # Fast vectorized palette mapping via piecewise linear interpolation
    stops = np.array([p[0] for p in palette])
    colors = np.array([p[1] for p in palette], dtype=np.float32)

    clamped = np.clip(arr, stops[0], stops[-1])

    for ch in range(4):
        interp_ch = np.interp(clamped, stops, colors[:, ch])
        rgba[:, :, ch] = np.where(is_valid, interp_ch.astype(np.uint8), 0)

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def get_legend_data(asset_id: Any, asset_type: str = "ndvi") -> Dict[str, Any]:
    """Generates legend metadata and color intervals for UI display."""
    palette = get_palette_for_asset(asset_type)
    
    entries = []
    for i in range(len(palette) - 1):
        v_low, c_low, label = palette[i]
        v_high, _, _ = palette[i + 1]
        hex_col = f"#{c_low[0]:02x}{c_low[1]:02x}{c_low[2]:02x}"
        entries.append({
            "min": round(v_low, 2),
            "max": round(v_high, 2),
            "color": hex_col,
            "label": label
        })

    note = None
    if "lst" in asset_type.lower():
        note = "Thermal band natively 100m (TIRS), resampled to 30m by USGS."
    elif "anomaly" in asset_type.lower():
        note = "Per-pixel NDVI deviation from historical seasonal baseline. Pixels with < 3 observations are transparent."

    return {
        "asset_id": str(asset_id),
        "asset_type": asset_type,
        "min_value": palette[0][0],
        "max_value": palette[-1][0],
        "palette": f"{asset_type.upper()} Multi-stop Diverging",
        "entries": entries,
        "note": note
    }


def sample_raster_at_point(
    geotiff_path: str,
    lon: float,
    lat: float
) -> Tuple[Optional[float], Optional[float]]:
    """
    Samples pixel value at point (lon, lat) and 3x3 surrounding window mean.
    Returns: (pixel_val, window_3x3_mean)
    """
    try:
        with rasterio.open(geotiff_path) as src:
            py, px = src.index(lon, lat)
            arr = src.read(1)
            nodata = src.nodata

            h, w = arr.shape
            if py < 0 or py >= h or px < 0 or px >= w:
                return None, None

            val = float(arr[py, px])
            if np.isnan(val) or (nodata is not None and val == nodata):
                pixel_val = None
            else:
                pixel_val = val

            # Sample 3x3 window
            y_min, y_max = max(0, py - 1), min(h, py + 2)
            x_min, x_max = max(0, px - 1), min(w, px + 2)
            window = arr[y_min:y_max, x_min:x_max]

            valid_mask = ~np.isnan(window)
            if nodata is not None:
                valid_mask &= (window != nodata)

            valid_vals = window[valid_mask]
            window_mean = float(np.mean(valid_vals)) if valid_vals.size > 0 else None

            return pixel_val, window_mean
    except Exception as e:
        print(f"Error sampling raster: {e}")
        return None, None


def compute_zonal_stats(geotiff_path: str, polygon_geojson: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes zonal summary statistics (min, max, mean, std, valid_pct, valid_count)
    of a GeoTIFF raster within a GeoJSON polygon boundary.
    """
    from rasterio.mask import mask
    from shapely.geometry import shape

    geom = shape(polygon_geojson)
    with rasterio.open(geotiff_path) as src:
        out_image, out_transform = mask(src, [geom], crop=True)
        arr = out_image[0]
        nodata = src.nodata

        valid_mask = ~np.isnan(arr)
        if nodata is not None:
            valid_mask &= (arr != nodata)

        valid_vals = arr[valid_mask]
        total_pixels = arr.size
        valid_count = int(valid_vals.size)

        if valid_count == 0:
            return {
                "min": None,
                "max": None,
                "mean": None,
                "std": None,
                "valid_count": 0,
                "total_count": total_pixels,
                "valid_pct": 0.0
            }

        return {
            "min": float(np.min(valid_vals)),
            "max": float(np.max(valid_vals)),
            "mean": float(np.mean(valid_vals)),
            "std": float(np.std(valid_vals)),
            "valid_count": valid_count,
            "total_count": total_pixels,
            "valid_pct": float(valid_count / total_pixels * 100.0)
        }

