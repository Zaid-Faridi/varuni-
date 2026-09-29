"use client";

import React, { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  FileSpreadsheet,
  Download,
  FileText,
  CheckCircle2,
  RefreshCw,
  FileDown,
  Layers,
  ShieldCheck,
  Calendar,
  AlertCircle
} from "lucide-react";
import {
  fetchWatersheds,
  fetchReportsSummary,
  WatershedSummary,
  ReportSummaryResponse,
} from "@/lib/api";

export default function ReportsPage() {
  const [watersheds, setWatersheds] = useState<WatershedSummary[]>([]);
  const [selectedWatershedId, setSelectedWatershedId] = useState<string>("");
  const [reportData, setReportData] = useState<ReportSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  useEffect(() => {
    fetchWatersheds()
      .then((data) => {
        setWatersheds(data);
        if (data.length > 0) {
          setSelectedWatershedId(data[0].id);
        }
      })
      .catch((err) => console.error("Error fetching watersheds for reports:", err));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchReportsSummary(selectedWatershedId || undefined)
      .then((res) => setReportData(res))
      .catch((err) => {
        console.error("Error fetching report summary:", err);
        setReportData(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectedWatershedId]);

  const handleExport = async (format: "csv" | "geojson" | "pdf") => {
    setDownloadingFormat(format);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const q = selectedWatershedId ? `?watershed_id=${selectedWatershedId}` : "";
      const res = await fetch(`${apiBase}/api/v1/reports/export/${format}${q}`);
      
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extension = format === "geojson" ? "geojson" : format;
      a.download = `varuni_${selectedWatershedId ? "watershed" : "all"}_export.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error exporting ${format.toUpperCase()}: ${err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <AppLayout>
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              MIS & Scientific Assessment Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic data exports, PDF assessment dossiers, and PostGIS vector layers (PMKSY-WDC 2.0)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedWatershedId}
            onChange={(e) => setSelectedWatershedId(e.target.value)}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded px-3 py-1.5 shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-700"
          >
            <option value="">All Watersheds (Aggregated)</option>
            {watersheds.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.district || "Pilot"}, {ws.state || "India"})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-300 rounded p-12 text-center text-slate-500 text-xs font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
          <span>Generating MIS Summary Report from PostGIS Database...</span>
        </div>
      ) : reportData ? (
        <div className="space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white border border-slate-300 rounded p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Interventions
              </span>
              <span className="font-mono font-black text-slate-900 text-lg block mt-1">
                {reportData.metrics.interventions_total}
              </span>
              <span className="text-[10px] text-slate-500">
                {reportData.metrics.interventions_verified} verified by analyst
              </span>
            </div>

            <div className="bg-white border border-slate-300 rounded p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Field Photos (GPS)
              </span>
              <span className="font-mono font-black text-slate-900 text-lg block mt-1">
                {reportData.metrics.field_photos_total}
              </span>
              <span className="text-[10px] text-emerald-700 font-bold">
                {reportData.metrics.field_photos_with_gps} with valid EXIF GPS
              </span>
            </div>

            <div className="bg-white border border-slate-300 rounded p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Landsat 8/9 Scenes
              </span>
              <span className="font-mono font-black text-slate-900 text-lg block mt-1">
                {reportData.metrics.satellite_scenes_ingested}
              </span>
              <span className="text-[10px] text-slate-500">
                {reportData.metrics.clear_raster_assets} clear 30m rasters
              </span>
            </div>

            <div className="bg-white border border-slate-300 rounded p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Mean Catchment NDVI
              </span>
              <span className="font-mono font-black text-slate-900 text-lg block mt-1">
                {reportData.metrics.mean_ndvi !== null && reportData.metrics.mean_ndvi !== undefined
                  ? reportData.metrics.mean_ndvi.toFixed(3)
                  : "No data"}
              </span>
              <span className="text-[10px] text-slate-500">
                NDWI: {reportData.metrics.mean_ndwi !== null && reportData.metrics.mean_ndwi !== undefined
                  ? reportData.metrics.mean_ndwi.toFixed(3)
                  : "No data"}
              </span>
            </div>
          </div>

          {/* Report Downloads Suite */}
          <div className="space-y-3">
            {/* 1. PDF Dossier */}
            <div className="bg-white border-2 border-emerald-700/40 rounded p-4.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-linear-to-r from-emerald-50/40 to-white">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-emerald-800 text-white px-2 py-0.5 rounded">
                    DOC-PDF-ASSESSMENT
                  </span>
                  <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                    Official Assessment Dossier
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Deterministic Watershed Assessment Report (PDF)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                  Comprehensive printable PDF containing catchment topography, DEM slope statistics, D8 stream network orders, satellite scene acquisition dates, intervention point hydrology, and difference-in-differences observed change tables.
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingFormat === "pdf"}
                onClick={() => handleExport("pdf")}
                className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded text-xs font-bold flex items-center gap-2 shadow-2xs shrink-0 self-start sm:self-auto cursor-pointer transition-colors disabled:opacity-50"
              >
                {downloadingFormat === "pdf" ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>{downloadingFormat === "pdf" ? "Generating..." : "Download PDF Report"}</span>
              </button>
            </div>

            {/* 2. CSV Export */}
            <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-xs transition-shadow">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-300">
                    REP-MIS-WDC
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                    CSV Format
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-1">
                  Field Intervention Verification & Quality Audit Trail (CSV)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabular export of geo-tagged structures and field photos with coordinates, QC sharpness scores, zero-shot model labels, confidence, and point hydrology.
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingFormat === "csv"}
                onClick={() => handleExport("csv")}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50"
              >
                {downloadingFormat === "csv" ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                )}
                <span>{downloadingFormat === "csv" ? "Exporting..." : "Download CSV"}</span>
              </button>
            </div>

            {/* 3. GeoJSON Export */}
            <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-xs transition-shadow">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-300">
                    REP-GEO-POSTGIS
                  </span>
                  <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded">
                    GeoJSON Layer
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-1">
                  Watershed Boundary & Structures Spatial Export (GeoJSON)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Spatial vector layers for QGIS, ArcGIS, and Bhuvan GIS compliance with EPSG:4326 geometries and verified attribute tables.
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingFormat === "geojson"}
                onClick={() => handleExport("geojson")}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50"
              >
                {downloadingFormat === "geojson" ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                )}
                <span>{downloadingFormat === "geojson" ? "Exporting..." : "Download GeoJSON"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded p-8 text-center text-slate-500 text-xs">
          No report data available. Ingest satellite scenes or add field photos.
        </div>
      )}
    </AppLayout>
  );
}
