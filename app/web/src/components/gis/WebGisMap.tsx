"use client";

import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  ImageOverlay,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  fetchWatersheds,
  fetchWatershedGeoJSON,
  fetchInterventions,
  fetchImages,
  fetchRasterAssets,
  fetchRasterLegend,
  fetchWatershedStreams,
  fetchPointsDensity,
  getRasterOverlayUrl,
  getThumbnailUrl,
  WatershedSummary,
  GeoJSONFeatureCollection,
  InterventionInfo,
  ImageInfo,
  RasterAsset,
  RasterLegend,
  PointsDensityResponse,
} from "@/lib/api";
import GisSidebar, { LayerState } from "./GisSidebar";
import HeatMapLayer, { INTERVENTION_GRADIENT } from "./HeatMapLayer";
import InterventionDetailModal from "./InterventionDetailModal";

// Fix Leaflet marker icons in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const photoIcon = L.divIcon({
  className: "custom-photo-pin",
  html: `<div style="background-color: #0284c7; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 14px;">📷</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const interventionIcon = L.divIcon({
  className: "custom-itv-pin",
  html: `<div style="background-color: #166534; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 14px;">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.0 });
  }, [center, zoom, map]);
  return null;
}

interface WebGisMapProps {
  initialProjectId?: string | null;
  initialWatershedId?: string | null;
}

export default function WebGisMap({ initialWatershedId }: WebGisMapProps = {}) {
  const [watersheds, setWatersheds] = useState<WatershedSummary[]>([]);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeatureCollection | null>(null);
  const [interventions, setInterventions] = useState<InterventionInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [rasterAssets, setRasterAssets] = useState<RasterAsset[]>([]);
  const [selectedWatershedId, setSelectedWatershedId] = useState<string | null>(initialWatershedId || null);

  const [selectedRasterId, setSelectedRasterId] = useState<string | null>(null);
  const [activeLegend, setActiveLegend] = useState<RasterLegend | null>(null);
  const [opacity, setOpacity] = useState(0.85);

  const [streamsGeoJson, setStreamsGeoJson] = useState<GeoJSONFeatureCollection | null>(null);

  // Points Density Heatmap State
  const [densityData, setDensityData] = useState<PointsDensityResponse | null>(null);
  const [densityBandwidth, setDensityBandwidth] = useState<number>(500);
  const [densitySourceType, setDensitySourceType] = useState<"all" | "interventions" | "photos">("all");

  const [baseMap, setBaseMap] = useState<"street" | "satellite" | "terrain">("satellite");
  const [layers, setLayers] = useState<LayerState>({
    watershedBoundary: true,
    geocodedImages: true,
    interventions: true,
    drainageNetwork: true,
    slope: false,
    ndvi: false,
    ndwi: false,
    lst: false,
    anomaly: false,
    density: false,
  });

  const [selectedModalIntervention, setSelectedModalIntervention] = useState<InterventionInfo | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.5204, 73.8567]); // Default Pune / Maharashtra
  const [mapZoom, setMapZoom] = useState(11);

  const loadData = async () => {
    try {
      const [wsList, geo, itvs, imgs, rasters] = await Promise.all([
        fetchWatersheds().catch(() => []),
        fetchWatershedGeoJSON().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
        fetchInterventions().catch(() => []),
        fetchImages().catch(() => []),
        fetchRasterAssets().catch(() => []),
      ]);

      setWatersheds(wsList);
      setGeoJsonData(geo);
      setInterventions(itvs);
      setImages(imgs);
      setRasterAssets(rasters);

      if (wsList.length > 0) {
        if (!selectedWatershedId) {
          setSelectedWatershedId(wsList[0].id);
          if (wsList[0].centroid) {
            setMapCenter([wsList[0].centroid[1], wsList[0].centroid[0]]);
            setMapZoom(12);
          }
        }
      }

      if (rasters.length > 0 && !selectedRasterId) {
        const unflagged = rasters.filter((r) => !r.is_flagged);
        if (unflagged.length > 0) {
          setSelectedRasterId(unflagged[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading WebGIS map data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch stream network when selected watershed or drainageNetwork layer changes
  useEffect(() => {
    if (selectedWatershedId && layers.drainageNetwork) {
      fetchWatershedStreams(selectedWatershedId)
        .then((streams) => setStreamsGeoJson(streams))
        .catch((err) => {
          console.warn("Could not fetch stream network:", err);
          setStreamsGeoJson(null);
        });
    } else {
      setStreamsGeoJson(null);
    }
  }, [selectedWatershedId, layers.drainageNetwork]);

  // Fetch documentation density points when density layer is active
  useEffect(() => {
    if (selectedWatershedId && layers.density) {
      fetchPointsDensity(selectedWatershedId, {
        source_type: densitySourceType,
        bandwidth_m: densityBandwidth,
      })
        .then((res) => setDensityData(res))
        .catch((err) => {
          console.warn("Could not fetch point density:", err);
          setDensityData(null);
        });
    } else {
      setDensityData(null);
    }
  }, [selectedWatershedId, layers.density, densityBandwidth, densitySourceType]);

  // Fetch legend when active raster changes
  const isAnyRasterActive = layers.ndvi || layers.ndwi || layers.slope || layers.lst || layers.anomaly;
  useEffect(() => {
    if (selectedRasterId && isAnyRasterActive) {
      fetchRasterLegend(selectedRasterId)
        .then((leg) => setActiveLegend(leg))
        .catch(() => setActiveLegend(null));
    } else {
      setActiveLegend(null);
    }
  }, [selectedRasterId, layers.ndvi, layers.ndwi, layers.slope, layers.lst, layers.anomaly]);

  const handleWatershedChange = (id: string) => {
    setSelectedWatershedId(id || null);
    const target = watersheds.find((w) => w.id === id);
    if (target && target.centroid) {
      setMapCenter([target.centroid[1], target.centroid[0]]);
      setMapZoom(13);
    }
  };

  const handleLayerToggle = (key: keyof LayerState) => {
    setLayers((prev) => {
      const updated = { ...prev, [key]: !prev[key] };

      // Mutual exclusive spectral / elevation / analysis raster overlays
      const rasterKeys: (keyof LayerState)[] = ["ndvi", "ndwi", "slope", "lst", "anomaly"];
      if (rasterKeys.includes(key) && updated[key]) {
        for (const other of rasterKeys) {
          if (other !== key) {
            updated[other] = false;
          }
        }

        // Auto-select corresponding raster asset
        const matchType = key === "lst" ? "lst" : key === "anomaly" ? "anomaly" : key;
        const matchingAsset = rasterAssets.find((r) => r.asset_type === matchType && !r.is_flagged);
        if (matchingAsset) {
          setSelectedRasterId(matchingAsset.id);
        }
      }

      return updated;
    });
  };

  // Base map tile URLs
  const baseMapUrls = {
    street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    terrain: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  };

  const activeRaster = rasterAssets.find((r) => r.id === selectedRasterId);

  // Stream style function by Strahler order
  const getStreamStyle = (feature: any) => {
    const order = feature?.properties?.order || 1;
    const colors: Record<number, string> = {
      1: "#38bdf8", // Light sky blue
      2: "#0284c7", // Medium blue
      3: "#1d4ed8", // Deep blue
      4: "#1e1b4b", // Dark navy
    };
    const color = colors[order] || "#0369a1";
    const weight = Math.min(1.2 + order * 1.2, 5);
    return {
      color,
      weight,
      opacity: 0.9,
    };
  };

  return (
    <div className="flex h-[calc(100vh-93px)] w-full overflow-hidden relative">
      {/* Sidebar Controls */}
      <GisSidebar
        watersheds={watersheds}
        selectedWatershedId={selectedWatershedId}
        onWatershedChange={handleWatershedChange}
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        layers={layers}
        onLayerToggle={handleLayerToggle}
        rasterAssets={rasterAssets}
        selectedRasterId={selectedRasterId}
        onRasterSelect={setSelectedRasterId}
        activeLegend={activeLegend}
        opacity={opacity}
        onOpacityChange={setOpacity}
        densityBandwidth={densityBandwidth}
        onDensityBandwidthChange={setDensityBandwidth}
        densitySourceType={densitySourceType}
        onDensitySourceTypeChange={setDensitySourceType}
        densityLegend={densityData?.legend}
      />

      {/* Main Leaflet GIS Map Container */}
      <div className="flex-1 h-full w-full relative">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="h-full w-full z-10"
          zoomControl={true}
        >
          <MapFlyTo center={mapCenter} zoom={mapZoom} />

          {/* Base Map TileLayer */}
          <TileLayer
            key={baseMap}
            url={baseMapUrls[baseMap]}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, USGS Landsat & Copernicus DEM'
          />

          {/* 1. PostGIS Watershed Boundary Layer */}
          {layers.watershedBoundary && geoJsonData && geoJsonData.features.length > 0 && (
            <GeoJSON
              key={JSON.stringify(geoJsonData)}
              data={geoJsonData as any}
              style={{
                color: "#16a34a",
                weight: 3,
                opacity: 0.9,
                fillColor: "#22c55e",
                fillOpacity: 0.12,
                dashArray: "4 4",
              }}
            />
          )}

          {/* 2. D8 Strahler Drainage Stream Network */}
          {layers.drainageNetwork && streamsGeoJson && streamsGeoJson.features.length > 0 && (
            <GeoJSON
              key={`streams-${JSON.stringify(streamsGeoJson)}`}
              data={streamsGeoJson as any}
              style={getStreamStyle}
              onEachFeature={(feature, layer) => {
                const order = feature.properties?.order || 1;
                const len = feature.properties?.length_km || 0;
                layer.bindTooltip(
                  `<div class="text-[10px] font-mono"><strong>Strahler Order ${order}</strong><br/>Length: ${Number(len).toFixed(2)} km</div>`,
                  { sticky: true }
                );
              }}
            />
          )}

          {/* 3. Real Raster Overlays (NDVI, NDWI, Slope, LST, Anomaly) */}
          {isAnyRasterActive && activeRaster && activeRaster.bounds && (
            <ImageOverlay
              url={getRasterOverlayUrl(activeRaster.id)}
              bounds={[
                [activeRaster.bounds[1], activeRaster.bounds[0]], // [south, west]
                [activeRaster.bounds[3], activeRaster.bounds[2]], // [north, east]
              ]}
              opacity={opacity}
            />
          )}

          {/* 4. Intervention & Documentation Density Heatmap Layer */}
          {layers.density && densityData && densityData.heat_points.length > 0 && (
            <HeatMapLayer
              points={densityData.heat_points}
              radius={Math.max(25, Math.min(65, Math.round(densityBandwidth / 20)))}
              blur={Math.max(15, Math.min(45, Math.round(densityBandwidth / 30)))}
              gradient={INTERVENTION_GRADIENT}
              visible={true}
            />
          )}

          {/* 5. Field Interventions Marker Layer */}
          {layers.interventions &&
            interventions.map((itv) => {
              if (!itv.latitude || !itv.longitude) return null;
              return (
                <Marker
                  key={itv.id}
                  position={[itv.latitude, itv.longitude]}
                  icon={interventionIcon}
                >
                  <Popup>
                    <div className="text-xs space-y-1.5 p-1 max-w-[220px]">
                      <div className="font-bold text-slate-900">{itv.name || "Intervention"}</div>
                      <div className="text-[10px] text-slate-500 capitalize font-medium">
                        Type: {itv.type.replace(/_/g, " ")}
                      </div>
                      <div className="text-[10px] text-slate-600 font-mono">
                        {itv.latitude.toFixed(4)}, {itv.longitude.toFixed(4)}
                      </div>

                      {/* Terrain & Hydrology Provenance */}
                      <div className="pt-1 border-t border-slate-200 text-[10px] space-y-0.5 font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Dist to Stream:</span>
                          <span className="font-bold text-sky-800">
                            {itv.nearest_stream_distance_m != null
                              ? `${itv.nearest_stream_distance_m.toFixed(1)} m`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Upstream Area:</span>
                          <span className="font-bold text-sky-800">
                            {itv.upstream_catchment_area_sqkm != null
                              ? `${itv.upstream_catchment_area_sqkm.toFixed(3)} km²`
                              : "—"}
                          </span>
                        </div>
                        {itv.local_slope_deg != null && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Local Slope:</span>
                            <span className="font-bold text-amber-800">
                              {itv.local_slope_deg.toFixed(1)}°
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedModalIntervention(itv)}
                          className="w-full px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-bold text-center transition-colors cursor-pointer"
                        >
                          View Full Details & Review
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* 6. Geocoded Field Photos Layer */}
          {layers.geocodedImages &&
            images.map((img) => {
              if (!img.latitude || !img.longitude) return null;
              return (
                <Marker
                  key={img.id}
                  position={[img.latitude, img.longitude]}
                  icon={photoIcon}
                >
                  <Popup>
                    <div className="text-xs space-y-1.5 p-1 max-w-[200px]">
                      <div className="font-bold text-slate-900">Geocoded Field Photo</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {img.captured_at ? img.captured_at.split("T")[0] : "Recorded"}
                      </div>
                      {img.thumbnail_uri && (
                        <img
                          src={getThumbnailUrl(img.thumbnail_uri)}
                          alt="Thumbnail"
                          className="w-full h-24 object-cover rounded border border-slate-200"
                        />
                      )}
                      <p className="text-[10px] text-slate-600 font-mono">
                        {img.latitude.toFixed(4)}, {img.longitude.toFixed(4)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>

        {/* Map Telemetry Banner */}
        <div className="absolute bottom-4 right-4 z-20 bg-white/90 backdrop-blur-xs border border-slate-300 rounded p-2.5 shadow-md text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>PostGIS Vector & Copernicus 30m Hydro GIS</span>
          </div>
          <p className="text-[10px] text-slate-500">
            {watersheds.length} Catchments | {interventions.length} Interventions | {streamsGeoJson?.features?.length || 0} Stream Segments
          </p>
        </div>
      </div>

      {/* Intervention Detail Modal */}
      {selectedModalIntervention && (
        <InterventionDetailModal
          intervention={selectedModalIntervention}
          onClose={() => setSelectedModalIntervention(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
