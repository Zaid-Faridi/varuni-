"""
Landsat 8/9 Collection 2 Level-2 STAC Provider
Primary: Microsoft Planetary Computer STAC API (https://planetarycomputer.microsoft.com/api/stac/v1)
Signed with Planetary Computer SAS tokens to avoid AWS requester-pays restrictions.
Fallback: Element84 Earth Search STAC API (https://earth-search.aws.element84.com/v1)

Dynamically resolves STAC assets, band mapping, and scale factors from STAC Item metadata.
"""
import os
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
from .base import SatelliteProvider

PLANETARY_COMPUTER_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
EARTH_SEARCH_STAC_URL = "https://earth-search.aws.element84.com/v1"
LANDSAT_COLLECTION = "landsat-c2-l2"


class LandsatSTACProvider(SatelliteProvider):
    """
    Landsat 8 and Landsat 9 Collection 2 Level-2 STAC Client.
    Resolution: 30 meters.
    """

    def __init__(self, stac_url: str = PLANETARY_COMPUTER_STAC_URL):
        self.stac_url = stac_url.rstrip("/")

    @property
    def provider_name(self) -> str:
        return "Landsat"

    @property
    def native_resolution_m(self) -> float:
        return 30.0

    def search_scenes(
        self,
        bbox: List[float],  # [west, south, east, north]
        start_date: datetime,
        end_date: datetime,
        max_cloud_cover: float = 30.0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Queries STAC API search endpoint using pystac_client with Planetary Computer signing,
        or falling back to standard HTTP STAC queries.
        """
        time_format = "%Y-%m-%dT00:00:00Z"
        datetime_range = f"{start_date.strftime(time_format)}/{end_date.strftime(time_format)}"

        # 1. Try using pystac_client + planetary_computer
        try:
            import planetary_computer as pc
            from pystac_client import Client

            client = Client.open(self.stac_url, modifier=pc.sign_inplace)
            search = client.search(
                collections=[LANDSAT_COLLECTION],
                bbox=bbox,
                datetime=datetime_range,
                query={"eo:cloud_cover": {"lt": max_cloud_cover}},
                limit=limit
            )
            item_collection = search.item_collection()
            scenes = []

            for item in item_collection:
                props = item.properties
                scene_id = item.id
                cloud_cover = props.get("eo:cloud_cover", props.get("cloud_cover", 0.0))
                acq_time_str = props.get("datetime", props.get("created"))

                assets_dict = {k: {"href": v.href, "title": v.title, "type": v.media_type} for k, v in item.assets.items()}
                band_map = self._resolve_asset_keys(assets_dict)

                if not (band_map.get("red") and band_map.get("green") and band_map.get("nir")):
                    continue

                scenes.append({
                    "scene_id": scene_id,
                    "provider": "Landsat",
                    "sensor": props.get("instruments", ["OLI-TIRS"])[0] if isinstance(props.get("instruments"), list) else "OLI-TIRS",
                    "platform": props.get("platform", "landsat-8/9"),
                    "acquisition_time": acq_time_str,
                    "cloud_cover": float(cloud_cover),
                    "resolution_m": 30.0,
                    "footprint": item.geometry,
                    "bbox": item.bbox or bbox,
                    "source_uri": item.self_href or "",
                    "processing_level": "Collection 2 Level-2",
                    "assets": assets_dict,
                    "band_urls": band_map
                })

            if scenes:
                return scenes

        except Exception as e:
            print(f"Notice: pystac_client search on {self.stac_url}: {e}. Trying direct HTTP search...")

        # 2. HTTP POST / GET Search Fallback
        search_endpoint = f"{self.stac_url}/search"
        query_payload = {
            "collections": [LANDSAT_COLLECTION],
            "bbox": bbox,
            "datetime": datetime_range,
            "query": {
                "eo:cloud_cover": {"lte": max_cloud_cover}
            },
            "limit": limit,
            "sortby": [{"field": "properties.datetime", "direction": "desc"}]
        }

        try:
            resp = requests.post(search_endpoint, json=query_payload, timeout=25)
            if resp.status_code != 200:
                params = {
                    "collections": LANDSAT_COLLECTION,
                    "bbox": ",".join(map(str, bbox)),
                    "datetime": datetime_range,
                    "limit": limit
                }
                resp = requests.get(search_endpoint, params=params, timeout=25)

            if resp.status_code != 200:
                print(f"STAC search returned status {resp.status_code}: {resp.text}")
                return []

            data = resp.json()
            features = data.get("features", [])
            scenes = []

            for feat in features:
                props = feat.get("properties", {})
                scene_id = feat.get("id")
                cloud_cover = props.get("eo:cloud_cover", props.get("cloud_cover", 0.0))
                acq_time_str = props.get("datetime", props.get("created"))

                assets = feat.get("assets", {})
                band_map = self._resolve_asset_keys(assets)

                if not (band_map.get("red") and band_map.get("green") and band_map.get("nir")):
                    continue

                scenes.append({
                    "scene_id": scene_id,
                    "provider": "Landsat",
                    "sensor": props.get("instruments", ["OLI-TIRS"])[0] if isinstance(props.get("instruments"), list) else "OLI-TIRS",
                    "platform": props.get("platform", "landsat-8/9"),
                    "acquisition_time": acq_time_str,
                    "cloud_cover": float(cloud_cover),
                    "resolution_m": 30.0,
                    "footprint": feat.get("geometry"),
                    "bbox": feat.get("bbox", bbox),
                    "source_uri": feat.get("links", [{}])[0].get("href", ""),
                    "processing_level": "Collection 2 Level-2",
                    "assets": assets,
                    "band_urls": band_map
                })

            return scenes

        except Exception as e:
            print(f"Error querying Landsat STAC API: {e}")
            return []

    def _resolve_asset_keys(self, assets: Dict[str, Any]) -> Dict[str, str]:
        """
        Dynamically detects band asset URLs from STAC item assets.
        Checks standard aliases (red, green, nir, qa_pixel, etc.).
        """
        band_urls = {}

        # Red band (B4)
        for key in ["red", "SR_B4.TIF", "B4", "b4"]:
            if key in assets:
                band_urls["red"] = assets[key].get("href")
                break

        # Green band (B3)
        for key in ["green", "SR_B3.TIF", "B3", "b3"]:
            if key in assets:
                band_urls["green"] = assets[key].get("href")
                break

        # NIR band (B5)
        for key in ["nir08", "nir", "SR_B5.TIF", "B5", "b5"]:
            if key in assets:
                band_urls["nir"] = assets[key].get("href")
                break

        # QA_PIXEL band
        for key in ["qa", "qa_pixel", "QA_PIXEL.TIF", "pixel_qa"]:
            if key in assets:
                band_urls["qa_pixel"] = assets[key].get("href")
                break

        return band_urls

    def get_band_urls(self, scene_metadata: Dict[str, Any]) -> Dict[str, str]:
        if "band_urls" in scene_metadata and scene_metadata["band_urls"]:
            return scene_metadata["band_urls"]
        return self._resolve_asset_keys(scene_metadata.get("assets", {}))
