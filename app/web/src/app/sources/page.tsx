"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  Satellite,
  Layers,
  Cpu,
  FileCode,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Info,
  ExternalLink,
  BookOpen,
} from "lucide-react";

export default function SourcesAndMethodsPage() {
  return (
    <AppLayout>
      {/* Header Banner */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Data Sources, Processing Pipeline & Scientific Methods
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete transparency of satellite sensors, digital elevation models, index formulations, and non-causal guardrails
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Zero Mock Values Guaranteed</span>
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* 1. SATELLITE SENSORS & DEM SOURCES */}
        <div className="bg-white border border-slate-300 rounded shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Satellite className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                1. Satellite Remote Sensing & Topographical Data Sources
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500">30m Spatial GSD</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Landsat */}
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">
                  USGS Landsat 8/9 Collection 2 Level-2
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded text-[10px] font-bold border border-emerald-300">
                  Operational
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Atmospherically corrected Surface Reflectance (SR) products delivered at 30-meter resolution across India, queried via Microsoft Planetary Computer STAC with signed SAS blob URLs.
              </p>
              <div className="pt-2 border-t border-slate-200 space-y-1 font-mono text-[11px] text-slate-700">
                <div>• Catalog: Planetary Computer STAC (<code>landsat-c2-l2</code>)</div>
                <div>• Band 3 (Green, 0.53–0.59 µm) — NDWI component</div>
                <div>• Band 4 (Red, 0.64–0.67 µm) — NDVI chlorophyll absorption</div>
                <div>• Band 5 (NIR, 0.85–0.88 µm) — Vegetation scattering & water absorption</div>
                <div>• QA_PIXEL: Bitmask cloud, shadow, and cirrus mask decoding</div>
                <div>• Scale Factor: <code>DN × 0.0000275 - 0.2</code></div>
              </div>
            </div>

            {/* Copernicus DEM */}
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">
                  Copernicus DEM GLO-30
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded text-[10px] font-bold border border-emerald-300">
                  Operational
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Global 30-meter surface elevation model used for catchment slope calculation, watershed flow direction, and drainage stream generation.
              </p>
              <div className="pt-2 border-t border-slate-200 space-y-1 font-mono text-[11px] text-slate-700">
                <div>• Spatial Resolution: 1 arc-second (~30 m at equator)</div>
                <div>• Slope Algorithm: Horn&apos;s finite-difference 8-neighborhood</div>
                <div>• Hydrological Routing: D8 pit-filling via <code>pysheds</code></div>
                <div>• Stream Threshold: ≥ 150 cells (0.135 km²) for Strahler ordering</div>
              </div>
            </div>
          </div>

          {/* SRISHTI-DRISHTI Readiness Notice */}
          <div className="p-4 bg-sky-50 border border-sky-300 rounded space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-sky-950">
              <Info className="w-4 h-4 text-sky-700 shrink-0" />
              <span>ISRO SRISHTI-DRISHTI 30m Data Provider Adapter Readiness</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              VARUNI includes an architected provider interface for ISRO / NRSC SRISHTI-DRISHTI 30 m data (<code className="bg-sky-100 px-1 py-0.5 rounded text-sky-900 font-mono">app/api/satellite/providers/srishti_drishti.py</code>). To maintain scientific integrity, the platform currently executes against USGS Landsat 8/9 and Copernicus DEM data until formal ministry API credentials and institutional access agreements are finalized.
            </p>
          </div>
        </div>

        {/* 2. SPECTRAL INDICES & FORMULAS */}
        <div className="bg-white border border-slate-300 rounded shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                2. Spectral Index Formulas & Topographical Analysis
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5">
              <span className="font-bold text-slate-900 block text-sm">
                Normalized Difference Vegetation Index (NDVI)
              </span>
              <div className="font-mono bg-white p-2 rounded border border-slate-200 text-emerald-950 text-xs font-bold">
                (NIR - Red) / (NIR + Red)
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Quantifies photosynthetic activity and vegetation density. Cloud/shadow pixels filtered using QA_PIXEL.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5">
              <span className="font-bold text-slate-900 block text-sm">
                Normalized Difference Water Index (NDWI)
              </span>
              <div className="font-mono bg-white p-2 rounded border border-slate-200 text-sky-950 text-xs font-bold">
                (Green - NIR) / (Green + NIR)
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                McFeeters (1996) formulation maximizing water feature reflectance while suppressing soil and vegetation noise.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5">
              <span className="font-bold text-slate-900 block text-sm">
                Terrain Slope (Horn Algorithm)
              </span>
              <div className="font-mono bg-white p-2 rounded border border-slate-200 text-amber-950 text-xs font-bold">
                arctan(√(dz/dx² + dz/dy²)) × 180 / π
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Computes rate of maximum elevation change over 8 neighbors in degrees using 30 m cell scaling.
              </p>
            </div>
          </div>
        </div>

        {/* 3. DIFFERENCE-IN-DIFFERENCES & OBSERVED CHANGE */}
        <div className="bg-white border border-slate-300 rounded shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                3. Difference-in-Differences Multi-Temporal Change Detection
              </h2>
            </div>
            <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-bold">
              DiD = ΔTreated - ΔControl
            </span>
          </div>

          <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <p>
              To isolate seasonal environmental variations from localized watershed dynamics, VARUNI implements an empirical Difference-in-Differences (DiD) framework:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Matched Seasonal Window</span>
                <span>±20 days around intervention anniversary across baseline and comparison years.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Treated Buffer Zone</span>
                <span>250-meter circular radius directly surrounding the geo-tagged intervention.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Control Buffer Ring</span>
                <span>500m to 1500m surrounding doughnut ring, excluding overlapping interventions.</span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded text-amber-950 font-medium">
              <strong>Non-Causal Disclaimer: </strong>
              Observed change measures empirical difference-in-differences against surrounding control ring pixels during matched seasonal windows. This represents observed environmental changes and is <strong>NOT proof of direct human intervention causation</strong>.
            </div>
          </div>
        </div>

        {/* 4. AI & QUALITY CONTROL PIPELINES */}
        <div className="bg-white border border-slate-300 rounded shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                4. Quality Control (Deterministic, No ML) & Zero-Shot Classification
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 text-sm block">
                Deterministic Photo Quality Control
              </span>
              <p className="text-slate-600">
                Evaluated synchronously upon upload without neural network inference:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-mono text-[11px] text-slate-700">
                <li>Laplacian Blur Score: Variance of Laplacian matrix (threshold &lt; 100.0)</li>
                <li>Exposure: Mean brightness and clipped pixel percentage at bounds (0 / 255)</li>
                <li>Deduplication: SHA-256 exact hash and Difference Hash (dHash) with Hamming distance ≤ 5</li>
                <li>Metadata Sanity: Bulk same-GPS/same-time flag and bounding box checks</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 text-sm block">
                Zero-Shot CLIP Classification
              </span>
              <p className="text-slate-600">
                OpenCLIP ViT-B-32 with prompt ensembling across 7 watershed taxonomy classes:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-mono text-[11px] text-slate-700">
                <li>Classes: <code>check_dam</code>, <code>farm_pond</code>, <code>contour_trench</code>, <code>plantation_vegetation</code>, <code>bare_degraded_land</code>, <code>water_body</code>, <code>other_unclear</code></li>
                <li>Uncertainty Rule: If Top-1 &lt; 0.50 or |P1 - P2| &lt; 0.10 ➔ Flagged for Human Review</li>
                <li>Ground Truth: Reviewer decisions saved in separate ground truth tables without auto-retrain</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
