"use client";

import React from "react";
import {
  Layers,
  MapPin,
  Camera,
  Activity,
  Droplets,
  ChevronDown,
  Info,
  Flame,
  TrendingUp,
  Sliders,
} from "lucide-react";
import { WatershedSummary, RasterAsset, RasterLegend, PointsDensityLegend } from "@/lib/api";
import LulcCard from "./LulcCard";

export interface LayerState {
  watershedBoundary: boolean;
  geocodedImages: boolean;
  interventions: boolean;
  drainageNetwork: boolean;
  slope: boolean;
  ndvi: boolean;
  ndwi: boolean;
  lst: boolean;
  anomaly: boolean;
  density: boolean;
}

interface GisSidebarProps {
  watersheds: WatershedSummary[];
  selectedWatershedId: string | null;
  onWatershedChange: (id: string) => void;
  baseMap: "street" | "satellite" | "terrain";
  onBaseMapChange: (base: "street" | "satellite" | "terrain") => void;
  layers: LayerState;
  onLayerToggle: (key: keyof LayerState) => void;
  rasterAssets: RasterAsset[];
  selectedRasterId: string | null;
  onRasterSelect: (id: string) => void;
  activeLegend: RasterLegend | null;
  opacity: number;
  onOpacityChange: (val: number) => void;
  densityBandwidth?: number;
  onDensityBandwidthChange?: (val: number) => void;
  densitySourceType?: "all" | "interventions" | "photos";
  onDensitySourceTypeChange?: (val: "all" | "interventions" | "photos") => void;
  densityLegend?: PointsDensityLegend | null;
  isOpen?: boolean;
}

export default function GisSidebar({
  watersheds,
  selectedWatershedId,
  onWatershedChange,
  baseMap,
  onBaseMapChange,
  layers,
  onLayerToggle,
  rasterAssets,
  selectedRasterId,
  onRasterSelect,
  activeLegend,
  opacity,
  onOpacityChange,
  densityBandwidth = 500,
  onDensityBandwidthChange,
  densitySourceType = "all",
  onDensitySourceTypeChange,
  densityLegend,
  isOpen = true,
}: GisSidebarProps) {
  const hasNdvi = rasterAssets.some((r) => r.asset_type === "ndvi" && !r.is_flagged);
  const hasNdwi = rasterAssets.some((r) => r.asset_type === "ndwi" && !r.is_flagged);
  const hasSlope = rasterAssets.some((r) => r.asset_type === "slope" && !r.is_flagged);
  const hasLst = rasterAssets.some((r) => r.asset_type === "lst" && !r.is_flagged);
  const hasAnomaly = rasterAssets.some((r) => r.asset_type === "anomaly" && !r.is_flagged);
  const selectedWatershed = watersheds.find((w) => w.id === selectedWatershedId);

  const isAnyRasterActive = layers.ndvi || layers.ndwi || layers.slope || layers.lst || layers.anomaly;

  return (
    <aside
      className={`w-72 bg-[#f8fafc] border-r border-slate-300 flex flex-col z-20 h-full overflow-y-auto shrink-0 text-xs text-slate-800 transition-all ${
        isOpen ? "block" : "hidden lg:block"
      }`}
    >
      {/* Header */}
      <div className="p-3 bg-[#0f2d59] text-white flex items-center justify-between border-b border-slate-300">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="font-bold text-xs tracking-wide">WebGIS Layers Control</h2>
            <p className="text-[10px] text-slate-300">PostGIS + 30m Satellite</p>
          </div>
        </div>
        <span className="text-[9px] font-mono bg-sky-900 text-sky-200 px-1.5 py-0.5 rounded border border-sky-700">
          GIS Active
        </span>
      </div>

      {/* Watershed Scope Selector */}
      <div className="p-3 bg-slate-100 border-b border-slate-300 space-y-2">
        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
          Monitored Catchment:
        </label>
        <div className="relative">
          <select
            value={selectedWatershedId || ""}
            onChange={(e) => onWatershedChange(e.target.value)}
            className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded px-2.5 py-1.5 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">-- All Watershed Boundaries --</option>
            {watersheds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.area_sqkm ? `(${w.area_sqkm.toFixed(1)} km²)` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Bhuvan LULC 50K AOI Context Card */}
      {selectedWatershedId && (
        <div className="p-2 border-b border-slate-300 bg-slate-50">
          <LulcCard
            watershedId={selectedWatershedId}
            watershedName={selectedWatershed?.name}
          />
        </div>
      )}

      {/* Base Map Selector */}
      <div className="p-3 border-b border-slate-300 bg-white">
        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Basemap Layer:
        </label>
        <div className="grid grid-cols-3 gap-1.5 font-medium text-[11px]">
          {(["satellite", "street", "terrain"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onBaseMapChange(mode)}
              className={`py-1.5 px-2 rounded border text-center capitalize transition-colors ${
                baseMap === mode
                  ? "bg-[#164e63] text-white border-[#0e3b4d] font-bold"
                  : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ─── ANALYSIS LAYERS (Heatmaps & Advanced Analytics) ─── */}
      <div className="p-3 border-b border-slate-300 bg-amber-50/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-900">
            Analysis Layers
          </span>
          <span className="text-[9px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300">
            GIS Heatmaps
          </span>
        </div>

        {/* 1. Real Land Surface Temperature (LST) */}
        <div className={`p-2 rounded border ${hasLst ? "bg-white border-amber-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
          <label className={`flex items-center justify-between ${hasLst ? "cursor-pointer" : "cursor-not-allowed"}`} title={hasLst ? "" : "Available after Landsat thermal ingestion"}>
            <div className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              <div>
                <span className="font-bold text-slate-900 block">Land Surface Temp (LST)</span>
                <span className="text-[9.5px] text-slate-500 block">Landsat C2-L2 Thermal (°C)</span>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!hasLst}
              checked={layers.lst && hasLst}
              onChange={() => onLayerToggle("lst")}
              className="rounded text-orange-600 focus:ring-orange-500"
            />
          </label>
          <p className="text-[9px] text-amber-800/80 mt-1 pl-5">
            * Thermal band natively 100m (TIRS), resampled to 30m by USGS.
          </p>
        </div>

        {/* 2. Seasonal Vegetation Anomaly Heatmap */}
        <div className={`p-2 rounded border ${hasAnomaly ? "bg-white border-emerald-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
          <label className={`flex items-center justify-between ${hasAnomaly ? "cursor-pointer" : "cursor-not-allowed"}`} title={hasAnomaly ? "" : "Available after baseline stack ingestion"}>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
              <div>
                <span className="font-bold text-slate-900 block">Seasonal Anomaly (Z-Score)</span>
                <span className="text-[9.5px] text-slate-500 block">NDVI baseline median & MAD deviation</span>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!hasAnomaly}
              checked={layers.anomaly && hasAnomaly}
              onChange={() => onLayerToggle("anomaly")}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* 3. Documentation Density Heatmap */}
        <div className="p-2 rounded border bg-white border-sky-200 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-sky-500 to-rose-500 inline-block" />
              <div>
                <span className="font-bold text-slate-900 block">Intervention Density Heatmap</span>
                <span className="text-[9.5px] text-slate-500 block">Kernel density of geotagged points</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={layers.density}
              onChange={() => onLayerToggle("density")}
              className="rounded text-rose-600 focus:ring-rose-500"
            />
          </label>

          {layers.density && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              {/* Density Source Filter */}
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-600 font-medium">Point Source:</span>
                <select
                  value={densitySourceType}
                  onChange={(e) => onDensitySourceTypeChange && onDensitySourceTypeChange(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
                >
                  <option value="all">All Points (Photos & Interventions)</option>
                  <option value="interventions">Interventions Only</option>
                  <option value="photos">Field Photos Only</option>
                </select>
              </div>

              {/* Bandwidth Slider */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-600 mb-0.5">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-slate-400" />
                    Bandwidth:
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {densityBandwidth >= 1000
                      ? `${(densityBandwidth / 1000).toFixed(1)} km`
                      : `${densityBandwidth} m`}
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={densityBandwidth}
                  onChange={(e) => onDensityBandwidthChange && onDensityBandwidthChange(parseFloat(e.target.value))}
                  className="w-full accent-rose-600"
                />
              </div>

              {/* Disclaimer Note */}
              <div className="p-1.5 bg-amber-50/70 border border-amber-200 rounded text-[9.5px] text-amber-900 leading-tight">
                <strong>Note:</strong> Shows where documentation & geotagged interventions are concentrated, not impact.
                {densityLegend && (
                  <div className="mt-1 font-mono text-[9px] text-slate-600">
                    Points: {densityLegend.total_count} ({densityLegend.interventions_count} itv, {densityLegend.photos_count} photos)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vector Layers */}
      <div className="p-3 border-b border-slate-300 bg-white space-y-2.5">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Vector Spatial Layers
        </span>

        <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs border border-emerald-600 bg-emerald-100" />
            <span className="font-semibold text-slate-800">Watershed Boundary</span>
          </div>
          <input
            type="checkbox"
            checked={layers.watershedBoundary}
            onChange={() => onLayerToggle("watershedBoundary")}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-semibold text-slate-800">Field Photographs (EXIF GPS)</span>
          </div>
          <input
            type="checkbox"
            checked={layers.geocodedImages}
            onChange={() => onLayerToggle("geocodedImages")}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-emerald-700" />
            <span className="font-semibold text-slate-800">Field Interventions</span>
          </div>
          <input
            type="checkbox"
            checked={layers.interventions}
            onChange={() => onLayerToggle("interventions")}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        {/* Drainage Network Vector Layer */}
        <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-sky-600 rounded-full" />
            <div>
              <span className="font-semibold text-slate-800 block">Drainage Network</span>
              <span className="text-[10px] text-slate-500 block">Strahler stream orders (D8 pysheds)</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={layers.drainageNetwork}
            onChange={() => onLayerToggle("drainageNetwork")}
            className="rounded text-sky-600 focus:ring-sky-500"
          />
        </label>
      </div>

      {/* Terrain & Satellite Overlays */}
      <div className="p-3 border-b border-slate-300 bg-slate-50/70 space-y-3">
        <div className="flex items-center justify-between">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-700">
            Copernicus 30m & Satellite Rasters
          </span>
          <span className="text-[10px] font-mono bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded border border-sky-200">
            30m DEM / Landsat
          </span>
        </div>

        {/* Slope Layer Toggle */}
        <div className={`p-2 rounded border ${hasSlope ? "bg-white border-slate-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
          <label className={`flex items-center justify-between ${hasSlope ? "cursor-pointer" : "cursor-not-allowed"}`} title={hasSlope ? "" : "Available after DEM processing"}>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-amber-600 flex items-center justify-center text-[9px] text-white font-bold">▲</span>
              <div>
                <span className="font-bold text-slate-900 block">Terrain Slope (Degrees)</span>
                <span className="text-[10px] text-slate-500 block">Copernicus GLO-30 Horn algorithm</span>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!hasSlope}
              checked={layers.slope && hasSlope}
              onChange={() => onLayerToggle("slope")}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
          </label>
        </div>

        {/* NDVI Layer Toggle */}
        <div className={`p-2 rounded border ${hasNdvi ? "bg-white border-slate-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
          <label className={`flex items-center justify-between ${hasNdvi ? "cursor-pointer" : "cursor-not-allowed"}`} title={hasNdvi ? "" : "Available after satellite ingestion"}>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-700" />
              <div>
                <span className="font-bold text-slate-900 block">Vegetation Index (NDVI)</span>
                <span className="text-[10px] text-slate-500 block">Cloud-masked Landsat 8/9 Level-2</span>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!hasNdvi}
              checked={layers.ndvi && hasNdvi}
              onChange={() => onLayerToggle("ndvi")}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* NDWI Layer Toggle */}
        <div className={`p-2 rounded border ${hasNdwi ? "bg-white border-slate-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
          <label className={`flex items-center justify-between ${hasNdwi ? "cursor-pointer" : "cursor-not-allowed"}`} title={hasNdwi ? "" : "Available after satellite ingestion"}>
            <div className="flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-sky-700" />
              <div>
                <span className="font-bold text-slate-900 block">Water Index (NDWI)</span>
                <span className="text-[10px] text-slate-500 block">McFeeters (Green-NIR) / (Green+NIR)</span>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!hasNdwi}
              checked={layers.ndwi && hasNdwi}
              onChange={() => onLayerToggle("ndwi")}
              className="rounded text-sky-600 focus:ring-sky-500"
            />
          </label>
        </div>

        {/* Layer Info & DEM Parameters Panel */}
        <div className="p-2.5 bg-sky-50 border border-sky-200 rounded space-y-1.5 text-[10px] text-sky-950">
          <div className="flex items-center gap-1 font-bold text-sky-900">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>DEM & Hydro Analysis Parameters</span>
          </div>
          <div className="grid grid-cols-2 gap-1 font-mono text-[9px] pt-1 border-t border-sky-200/60">
            <div>
              <span className="text-sky-700 block">DEM Source:</span>
              <span className="font-bold">Copernicus GLO-30</span>
            </div>
            <div>
              <span className="text-sky-700 block">DEM Resolution:</span>
              <span className="font-bold">30 meters (0.000277°)</span>
            </div>
            <div>
              <span className="text-sky-700 block">D8 Accumulation:</span>
              <span className="font-bold">≥ 150 cells (0.135 km²)</span>
            </div>
            <div>
              <span className="text-sky-700 block">Ordering Scheme:</span>
              <span className="font-bold">Strahler (pysheds)</span>
            </div>
          </div>
        </div>

        {/* Date Selector for Ingested Scenes */}
        {isAnyRasterActive && rasterAssets.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Select Ingested Scene Date / Raster:
            </label>
            <select
              value={selectedRasterId || ""}
              onChange={(e) => onRasterSelect(e.target.value)}
              className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              {rasterAssets
                .filter((r) => !r.is_flagged)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.asset_type.toUpperCase()}: {r.name.replace(/_/g, " ")} ({r.valid_pct != null ? `${r.valid_pct.toFixed(0)}% valid` : "30m"})
                  </option>
                ))}
            </select>

            {/* Opacity slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
                <span>Layer Opacity</span>
                <span>{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={opacity}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-700"
              />
            </div>
          </div>
        )}

        {/* Legend */}
        {activeLegend && isAnyRasterActive && (
          <div className="p-2.5 bg-white border border-slate-200 rounded space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] text-slate-800 block">
                {activeLegend.asset_type.toUpperCase()} Color Scale
              </span>
            </div>
            <div className="space-y-1">
              {activeLegend.entries.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: entry.color }} />
                    <span className="text-slate-700 font-medium">{entry.label}</span>
                  </div>
                  <span className="font-mono text-slate-500">[{entry.min}, {entry.max}]</span>
                </div>
              ))}
            </div>
            {activeLegend.note && (
              <p className="text-[9px] text-slate-500 italic pt-1 border-t border-slate-100">
                {activeLegend.note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Provenance */}
      <div className="p-3 mt-auto bg-slate-100 border-t border-slate-300 text-[10px] text-slate-500 space-y-1">
        <div className="flex items-center justify-between font-bold text-slate-700">
          <span>Data Provenance</span>
          <span>USGS Landsat & Copernicus DEM</span>
        </div>
        <p>Formula: McFeeters NDWI, NDVI, LST & Anomaly Z-Score. DEM Slope & D8 Streams via pysheds.</p>
      </div>
    </aside>
  );
}
