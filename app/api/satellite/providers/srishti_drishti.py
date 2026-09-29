"""
ISRO / SRISHTI-DRISHTI Satellite Data Provider Adapter (STUB)
Official access, licensing, and STAC/API endpoints must be verified with the responsible authority
before production implementation.
"""
from typing import List, Dict, Any
from datetime import datetime
from .base import SatelliteProvider


class SrishtiDrishtiProvider(SatelliteProvider):
    """
    Adapter for ISRO / SRISHTI-DRISHTI 30m Satellite Data.
    Access to official endpoints and auth credentials must be configured.
    """

    @property
    def provider_name(self) -> str:
        return "SRISHTI-DRISHTI"

    @property
    def native_resolution_m(self) -> float:
        return 30.0

    def search_scenes(
        self,
        bbox: List[float],
        start_date: datetime,
        end_date: datetime,
        max_cloud_cover: float = 30.0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(
            "SRISHTI-DRISHTI data provider adapter is pending official data access and API credentials "
            "from the national data custodian (ISRO / NRSC / Ministry). "
            "Please configure Landsat 8/9 provider or configure authorized ISRO STAC endpoint."
        )

    def get_band_urls(self, scene_metadata: Dict[str, Any]) -> Dict[str, str]:
        raise NotImplementedError(
            "SRISHTI-DRISHTI band URL resolution requires verified data repository access."
        )
