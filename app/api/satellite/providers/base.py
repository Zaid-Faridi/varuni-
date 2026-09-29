"""
Base satellite data provider interface.
Defines the contract for querying scenes, downloading band windows, and metadata parsing.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime


class SatelliteProvider(ABC):
    """Abstract base class for all satellite imagery providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g. 'Landsat', 'Sentinel', 'SRISHTI-DRISHTI')."""
        pass

    @property
    @abstractmethod
    def native_resolution_m(self) -> float:
        """Spatial resolution in meters."""
        pass

    @abstractmethod
    def search_scenes(
        self,
        bbox: List[float],  # [west, south, east, north]
        start_date: datetime,
        end_date: datetime,
        max_cloud_cover: float = 30.0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Search catalog for scenes matching spatial bbox, date range, and cloud threshold.
        Returns list of standardized scene metadata dictionaries.
        """
        pass

    @abstractmethod
    def get_band_urls(self, scene_metadata: Dict[str, Any]) -> Dict[str, str]:
        """
        Extracts verified COG URLs for required bands (e.g. 'red', 'green', 'nir', 'qa_pixel').
        """
        pass
