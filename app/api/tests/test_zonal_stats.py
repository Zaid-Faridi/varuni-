import os
import tempfile
import numpy as np
import rasterio
from rasterio.transform import from_origin
import pytest
from satellite.zonal import compute_zonal_stats, sample_raster_at_point


@pytest.fixture
def tiny_synthetic_raster():
    """Creates a temporary 10x10 GeoTIFF raster with synthetic values [0.1 to 0.9]."""
    fd, path = tempfile.mkstemp(suffix=".tif")
    os.close(fd)

    # 10x10 grid covering (73.0, 18.0) to (73.01, 18.01)
    data = np.linspace(0.1, 0.9, 100, dtype=np.float32).reshape((10, 10))
    # Add a nodata / masked pixel
    data[0, 0] = -9999.0

    transform = from_origin(73.0, 18.01, 0.001, 0.001)

    with rasterio.open(
        path,
        'w',
        driver='GTiff',
        height=10,
        width=10,
        count=1,
        dtype=data.dtype,
        crs='EPSG:4326',
        transform=transform,
        nodata=-9999.0
    ) as dst:
        dst.write(data, 1)

    yield path

    if os.path.exists(path):
        os.remove(path)


def test_zonal_stats_computation(tiny_synthetic_raster):
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [[
            [73.001, 18.001],
            [73.008, 18.001],
            [73.008, 18.008],
            [73.001, 18.008],
            [73.001, 18.001]
        ]]
    }

    stats = compute_zonal_stats(tiny_synthetic_raster, polygon_geojson)
    assert stats["valid_count"] > 0
    assert 0.1 <= stats["mean"] <= 0.9
    assert stats["min"] <= stats["max"]
    assert stats["valid_pct"] > 0.0


def test_sample_raster_at_point(tiny_synthetic_raster):
    px_val, win_mean = sample_raster_at_point(tiny_synthetic_raster, 73.005, 18.005)
    assert px_val is not None
    assert 0.1 <= px_val <= 0.9
    assert win_mean is not None


def test_sample_raster_out_of_bounds(tiny_synthetic_raster):
    px_val, win_mean = sample_raster_at_point(tiny_synthetic_raster, 85.0, 28.0)
    assert px_val is None
    assert win_mean is None
