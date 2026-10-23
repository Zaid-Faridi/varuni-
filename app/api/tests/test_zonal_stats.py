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


def test_zonal_stats_known_answer_hand_computed_mean():
    """
    Scientific Known-Answer Test:
    Verifies zonal statistics against a hand-computed expected mean on a small
    synthetic raster.

    TEST FIXTURE: Generated strictly in-test within a temporary directory;
    NEVER written to data/.

    Grid: 4x4 array covering (73.0, 18.0) to (73.04, 18.04), cell size = 0.01 deg.
    Values:
        [0.10, 0.20, 0.30, 0.40],
        [0.50, 0.60, 0.70, 0.80],
        [0.90, 1.00, 1.10, 1.20],
        [1.30, 1.40, 1.50, 1.60]
    Polygon covers precisely the 2x2 central cells:
        x in [73.01, 73.03], y in [73.01, 73.03]
        Intersecting pixel values: [0.60, 0.70, 1.00, 1.10]
        Hand-computed sum: 0.60 + 0.70 + 1.00 + 1.10 = 3.40
        Hand-computed mean: 3.40 / 4 = 0.85
        Hand-computed min: 0.60
        Hand-computed max: 1.10
        Hand-computed std: sqrt(((0.60-0.85)^2 + (0.70-0.85)^2 + (1.00-0.85)^2 + (1.10-0.85)^2) / 4)
                         = sqrt(0.0425) ~= 0.206155
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        synth_raster_path = os.path.join(tmpdir, "synth_zonal_known_answer.tif")
        data = np.array([
            [0.10, 0.20, 0.30, 0.40],
            [0.50, 0.60, 0.70, 0.80],
            [0.90, 1.00, 1.10, 1.20],
            [1.30, 1.40, 1.50, 1.60],
        ], dtype=np.float32)

        transform = from_origin(73.0, 18.04, 0.01, 0.01)
        with rasterio.open(
            synth_raster_path,
            'w',
            driver='GTiff',
            height=4,
            width=4,
            count=1,
            dtype=data.dtype,
            crs='EPSG:4326',
            transform=transform,
            nodata=-9999.0
        ) as dst:
            dst.write(data, 1)

        polygon_geojson = {
            "type": "Polygon",
            "coordinates": [[
                [73.01, 18.01],
                [73.03, 18.01],
                [73.03, 18.03],
                [73.01, 18.03],
                [73.01, 18.01]
            ]]
        }

        stats = compute_zonal_stats(synth_raster_path, polygon_geojson)
        assert stats["valid_count"] == 4
        assert stats["min"] == pytest.approx(0.60, abs=1e-4)
        assert stats["max"] == pytest.approx(1.10, abs=1e-4)
        assert stats["mean"] == pytest.approx(0.85, abs=1e-4)
        assert stats["std"] == pytest.approx(0.206155, abs=1e-4)
        assert stats["valid_pct"] == pytest.approx(100.0, abs=1e-4)

