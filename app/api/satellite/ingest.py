"""
Satellite Scene Ingestion & Spectral Index Pipeline
Processes Landsat 8/9 Collection 2 Level-2 Surface Reflectance scenes.

Scientific Formulas & Provenance:
1. USGS Landsat Collection 2 Level-2 Surface Reflectance (SR) Scaling:
   Source: USGS Landsat Collection 2 Level 2 Science Product Guide (https://www.usgs.gov/media/files/landsat-collection-2-level-2-science-product-guide)
   Formula: Surface_Reflectance = DN * 0.0000275 - 0.2

2. Cloud & Shadow Masking via QA_PIXEL:
   Source: USGS Landsat Collection 2 QA_PIXEL Bit Definitions.
   - Bit 1 (1<<1 = 2): Dilated Cloud
   - Bit 2 (1<<2 = 4): Cirrus
   - Bit 3 (1<<3 = 8): Cloud
   - Bit 4 (1<<4 = 16): Cloud Shadow
   - Bit 5 (1<<5 = 32): Snow
   Pixels flagged by any of these bits are masked as nodata.

3. Normalized Difference Vegetation Index (NDVI):
   Formula: NDVI = (NIR - Red) / (NIR + Red) = (B5 - B4) / (B5 + B4)
   Range: [-1.0, +1.0]

4. Normalized Difference Water Index (NDWI - McFeeters 1996):
   Source: McFeeters, S. K. (1996). The use of the Normalized Difference Water Index (NDWI) in the delineation of open water features.
   Formula: NDWI = (Green - NIR) / (Green + NIR) = (B3 - B5) / (B3 + B5)
   Range: [-1.0, +1.0]
"""
import os
import hashlib
import json
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.features import geometry_mask
from shapely.geometry import shape, mapping
from typing import Dict, Any, Tuple, Optional, List
from datetime import datetime

# USGS Level 2 Surface Reflectance scale and offset factors
SCALE_FACTOR = 0.0000275
ADD_OFFSET = -0.2

# QA_PIXEL Bitmask for cloud, dilated cloud, cirrus, shadow, and snow
CLOUD_SHADOW_MASK_BITS = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5)


def compute_sha256(filepath: str) -> str:
    """Computes SHA-256 checksum of an asset file for data integrity and provenance."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def process_spectral_indices(
    red_dn: np.ndarray,
    green_dn: np.ndarray,
    nir_dn: np.ndarray,
    qa_pixel: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """
    Applies USGS scale/offset, masks clouds/shadows via QA_PIXEL, and calculates NDVI & NDWI.
    
    Returns: (ndvi, ndwi, valid_mask, valid_pct)
    """
    # Scale DN to Surface Reflectance (SR)
    red_sr = np.where(red_dn > 0, red_dn * SCALE_FACTOR + ADD_OFFSET, np.nan)
    green_sr = np.where(green_dn > 0, green_dn * SCALE_FACTOR + ADD_OFFSET, np.nan)
    nir_sr = np.where(nir_dn > 0, nir_dn * SCALE_FACTOR + ADD_OFFSET, np.nan)

    # Valid reflectance range check (physical bounds [0.0, 1.0])
    valid_range = (
        (red_sr >= 0.0) & (red_sr <= 1.0) &
        (green_sr >= 0.0) & (green_sr <= 1.0) &
        (nir_sr >= 0.0) & (nir_sr <= 1.0)
    )

    # Cloud & shadow masking
    if qa_pixel is not None:
        is_clear = (qa_pixel & CLOUD_SHADOW_MASK_BITS) == 0
        valid_mask = valid_range & is_clear
    else:
        valid_mask = valid_range

    total_pixels = valid_mask.size
    valid_pixels = np.count_nonzero(valid_mask)
    valid_pct = (valid_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0

    # Compute NDVI = (NIR - Red) / (NIR + Red)
    denom_ndvi = nir_sr + red_sr
    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = np.where((denom_ndvi > 1e-6) & valid_mask, (nir_sr - red_sr) / denom_ndvi, np.nan)
        ndvi = np.clip(ndvi, -1.0, 1.0)

    # Compute NDWI = (Green - NIR) / (Green + NIR) [McFeeters 1996]
    denom_ndwi = green_sr + nir_sr
    with np.errstate(divide='ignore', invalid='ignore'):
        ndwi = np.where((denom_ndwi > 1e-6) & valid_mask, (green_sr - nir_sr) / denom_ndwi, np.nan)
        ndwi = np.clip(ndwi, -1.0, 1.0)

    return ndvi, ndwi, valid_mask, valid_pct


def process_surface_temperature(
    thermal_dn: np.ndarray,
    qa_pixel: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Computes Land Surface Temperature (LST) in Celsius from Landsat Collection 2 Level-2 thermal band.

    Scientific Scaling & Documentation:
    - Source: USGS Landsat 8-9 Collection 2 Level 2 Science Product Guide
      (https://www.usgs.gov/media/files/landsat-collection-2-level-2-science-product-guide)
      Section 5.2 Surface Temperature (ST) Product.
    - Formula:
        LST_Kelvin = DN * 0.00341802 + 149.0
        LST_Celsius = LST_Kelvin - 273.15 = DN * 0.00341802 - 124.15
    - Valid Range: Physical Earth surface temperatures roughly -20°C to +75°C (253.15 K to 348.15 K).
    - Resolution Note: Band 10 thermal data is acquired natively at 100m (TIRS) and resampled to 30m by USGS.
    - Cloud/Shadow Mask: QA_PIXEL bitmask excludes cloud, cloud shadow, cirrus, and snow pixels.

    Returns: (lst_celsius, valid_mask, valid_pct)
    """
    # Scale DN to Kelvin and convert to Celsius
    # Scale factor = 0.00341802, Additive offset = 149.0
    # LST_C = DN * 0.00341802 + 149.0 - 273.15
    ST_SCALE = 0.00341802
    ST_OFFSET = 149.0
    KELVIN_TO_CELSIUS = 273.15

    with np.errstate(invalid='ignore'):
        lst_k = np.where(thermal_dn > 0, thermal_dn * ST_SCALE + ST_OFFSET, np.nan)
        lst_c = np.where(~np.isnan(lst_k), lst_k - KELVIN_TO_CELSIUS, np.nan)

    # Physical Earth surface temperature bounds check (-30°C to 80°C)
    valid_range = (~np.isnan(lst_c)) & (lst_c >= -30.0) & (lst_c <= 80.0)

    # Apply QA_PIXEL cloud and shadow mask
    if qa_pixel is not None:
        is_clear = (qa_pixel & CLOUD_SHADOW_MASK_BITS) == 0
        valid_mask = valid_range & is_clear
    else:
        valid_mask = valid_range

    total_pixels = valid_mask.size
    valid_pixels = np.count_nonzero(valid_mask)
    valid_pct = (valid_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0

    lst_c_masked = np.where(valid_mask, lst_c, np.nan)
    return lst_c_masked, valid_mask, valid_pct


def compute_pixel_anomaly(
    current_ndvi: np.ndarray,
    historical_ndvi_stack: List[np.ndarray],
    min_observations: int = 3
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Computes per-pixel NDVI deviation from historical same-season baseline using Median and MAD Z-score.

    Scientific Formula:
    - Median: m = median(historical_stack)
    - Median Absolute Deviation (MAD): MAD = median(|historical_stack - m|)
    - Robust Standard Deviation: sigma_mad = 1.4826 * MAD
    - Z-Score: Z = (current_ndvi - m) / max(sigma_mad, 0.02)
    - Pixels with < min_observations valid historical records are set to NaN (transparent nodata).

    Returns: (anomaly_z_grid, valid_mask, stats_dict)
    """
    if not historical_ndvi_stack or len(historical_ndvi_stack) < min_observations:
        # Insufficient history for entire grid
        empty_grid = np.full(current_ndvi.shape, np.nan, dtype=np.float32)
        return empty_grid, np.zeros(current_ndvi.shape, dtype=bool), {
            "min": None, "max": None, "mean": None, "std": None, "valid_count": 0, "status": "insufficient_history"
        }

    stack = np.array(historical_ndvi_stack, dtype=np.float32)  # Shape: (N, H, W)
    valid_counts = np.sum(~np.isnan(stack), axis=0)
    has_min_history = valid_counts >= min_observations

    # Compute median along time axis ignoring NaNs
    with np.errstate(invalid='ignore'):
        hist_median = np.nanmedian(stack, axis=0)
        abs_diff = np.abs(stack - hist_median)
        hist_mad = np.nanmedian(abs_diff, axis=0)
        sigma_mad = np.maximum(1.4826 * hist_mad, 0.02)

        # Compute Z-score
        valid_current = ~np.isnan(current_ndvi)
        eligible = has_min_history & valid_current
        z_grid = np.where(eligible, (current_ndvi - hist_median) / sigma_mad, np.nan)
        z_grid = np.clip(z_grid, -4.0, 4.0)

    valid_mask = eligible & ~np.isnan(z_grid)
    valid_data = z_grid[valid_mask]

    stats = {
        "min": float(np.min(valid_data)) if valid_data.size > 0 else None,
        "max": float(np.max(valid_data)) if valid_data.size > 0 else None,
        "mean": float(np.mean(valid_data)) if valid_data.size > 0 else None,
        "std": float(np.std(valid_data)) if valid_data.size > 0 else None,
        "valid_count": int(valid_data.size),
        "status": "computed" if valid_data.size > 0 else "insufficient_history"
    }

    return z_grid, valid_mask, stats


def compute_raster_stats(data: np.ndarray, mask: np.ndarray) -> Dict[str, Any]:
    """Computes mean, std, min, max on clear unmasked pixels."""
    valid_data = data[mask & ~np.isnan(data)]
    if valid_data.size == 0:
        return {"min": None, "max": None, "mean": None, "std": None, "valid_count": 0}
    return {
        "min": float(np.min(valid_data)),
        "max": float(np.max(valid_data)),
        "mean": float(np.mean(valid_data)),
        "std": float(np.std(valid_data)),
        "valid_count": int(valid_data.size)
    }


def save_geotiff(
    data: np.ndarray,
    bounds: List[float],  # [west, south, east, north]
    out_path: str,
    crs: str = "EPSG:4326",
    nodata: float = -9999.0
) -> str:
    """Writes a 2D float array to GeoTIFF with CRS and Affine transform."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    height, width = data.shape
    transform = from_bounds(bounds[0], bounds[1], bounds[2], bounds[3], width, height)

    out_data = np.where(np.isnan(data), nodata, data).astype(np.float32)

    with rasterio.open(
        out_path,
        'w',
        driver='GTiff',
        height=height,
        width=width,
        count=1,
        dtype='float32',
        crs=crs,
        transform=transform,
        nodata=nodata,
        compress='lzw'
    ) as dst:
        dst.write(out_data, 1)

    return out_path
