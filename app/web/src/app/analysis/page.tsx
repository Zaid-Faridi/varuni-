"use client";

import React, { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import RecentAnalysisTable from "@/components/dashboard/RecentAnalysisTable";
import {
  fetchInterventions,
  fetchAnomalyAnalysis,
  runInterventionChangeDetection,
  InterventionInfo,
  AnomalyAnalysisResponse,
  ChangeDetectionResult,
} from "@/lib/api";
import {
  LineChart as ChartIcon,
  Satellite,
  Cpu,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Layers,
  ArrowRight,
  Info,
  Sliders,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Droplets,
  AlertCircle,
} from "lucide-react";

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<"change_detection" | "seasonal_anomaly">("change_detection");

  const [interventions, setInterventions] = useState<InterventionInfo[]>([]);
  const [selectedInterventionId, setSelectedInterventionId] = useState<string>("");

  // Change Detection state
  const [cdMetric, setCdMetric] = useState<"ndvi" | "ndwi">("ndvi");
  const [cdTreatedRadius, setCdTreatedRadius] = useState<number>(250);
  const [cdResult, setCdResult] = useState<ChangeDetectionResult | null>(null);
  const [isLoadingCd, setIsLoadingCd] = useState(false);
  const [swipePosition, setSwipePosition] = useState<number>(50);

  // Seasonal Anomaly state
  const [lat, setLat] = useState<number>(21.2584);
  const [lon, setLon] = useState<number>(81.6329);
  const [targetDate, setTargetDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [anomalyResult, setAnomalyResult] = useState<AnomalyAnalysisResponse | null>(null);
  const [isLoadingAnomaly, setIsLoadingAnomaly] = useState(false);

  useEffect(() => {
    fetchInterventions()
      .then((data) => {
        setInterventions(data);
        if (data.length > 0) {
          setSelectedInterventionId(data[0].id);
          if (data[0].latitude && data[0].longitude) {
            setLat(data[0].latitude);
            setLon(data[0].longitude);
          }
          if (data[0].observed_at) {
            setTargetDate(data[0].observed_at.split("T")[0]);
          }
        }
      })
      .catch((err) => console.error("Error loading interventions:", err));
  }, []);

  const handleInterventionSelect = (id: string) => {
    setSelectedInterventionId(id);
    const item = interventions.find((i) => i.id === id);
    if (item && item.latitude && item.longitude) {
      setLat(item.latitude);
      setLon(item.longitude);
      if (item.observed_at) {
        setTargetDate(item.observed_at.split("T")[0]);
      }
    }
  };

  const handleRunChangeDetection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterventionId) {
      alert("Please select an intervention to evaluate change detection.");
      return;
    }
    setIsLoadingCd(true);
    setCdResult(null);
    try {
      const res = await runInterventionChangeDetection(selectedInterventionId, {
        metric: cdMetric,
        treated_radius_m: cdTreatedRadius,
      });
      setCdResult(res);
    } catch (err: any) {
      alert(`Change detection execution error: ${err.message}`);
    } finally {
      setIsLoadingCd(false);
    }
  };

  const handleRunAnomalyEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingAnomaly(true);
    try {
      const res = await fetchAnomalyAnalysis({
        latitude: lat,
        longitude: lon,
        target_date: targetDate,
        metric: "ndvi",
        intervention_id: selectedInterventionId || undefined,
      });
      setAnomalyResult(res);
    } catch (err: any) {
      alert(`Anomaly calculation error: ${err.message}`);
    } finally {
      setIsLoadingAnomaly(false);
    }
  };

  const selectedIntervention = interventions.find((i) => i.id === selectedInterventionId);

  return (
    <AppLayout>
      {/* Header */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ChartIcon className="w-5 h-5 text-emerald-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Satellite Corroboration & Change Analysis
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Difference-in-Differences observed change detection and historical seasonal anomaly estimation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded">
            <Cpu className="w-3.5 h-3.5 text-emerald-700" />
            <span>USGS 30m Level-2 Engine</span>
          </span>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex border-b border-slate-300 gap-1 bg-slate-100 p-1 rounded-t">
        <button
          type="button"
          onClick={() => setActiveTab("change_detection")}
          className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-colors cursor-pointer ${
            activeTab === "change_detection"
              ? "bg-white text-emerald-800 shadow-2xs border border-slate-300 border-b-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-600" />
          <span>Observed Change Detection (Difference-in-Differences)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("seasonal_anomaly")}
          className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-colors cursor-pointer ${
            activeTab === "seasonal_anomaly"
              ? "bg-white text-emerald-800 shadow-2xs border border-slate-300 border-b-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Satellite className="w-4 h-4 text-sky-600" />
          <span>Deviation from Seasonal History (Robust Z-Score)</span>
        </button>
      </div>

      {/* ─── TAB 1: DIFFERENCE-IN-DIFFERENCES OBSERVED CHANGE ───────────── */}
      {activeTab === "change_detection" && (
        <div className="bg-white border border-slate-300 rounded-b p-5 shadow-2xs space-y-6">
          <div className="flex items-start justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Difference-in-Differences Multi-Temporal Change Evaluation</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Matches same seasonal window (±20 days) in year before and year after intervention across treated buffer vs surrounding control ring.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-sky-100 text-sky-900 px-2 py-1 rounded border border-sky-300 font-bold">
              DiD = ΔTreated - ΔControl
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleRunChangeDetection} className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs bg-slate-50 p-4 rounded border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Intervention
              </label>
              <select
                value={selectedInterventionId}
                onChange={(e) => handleInterventionSelect(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-medium"
                required
              >
                <option value="">-- Choose Field Structure --</option>
                {interventions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name || i.type} ({i.observed_at ? i.observed_at.split("T")[0] : "No date"})
                  </option>
                ))}
              </select>
              {selectedIntervention?.observed_at && (
                <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                  Observed: {selectedIntervention.observed_at.split("T")[0]}
                </span>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Spectral Index Metric
              </label>
              <select
                value={cdMetric}
                onChange={(e) => setCdMetric(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-medium"
              >
                <option value="ndvi">NDVI (Vegetation Vigour)</option>
                <option value="ndwi">NDWI (Surface Moisture & Water)</option>
              </select>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Landsat 8/9 Level-2 30m GSD
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Treated Buffer Radius (m)
              </label>
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={cdTreatedRadius}
                onChange={(e) => setCdTreatedRadius(parseInt(e.target.value) || 250)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Control ring: 500m to 1500m
              </span>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isLoadingCd || !selectedInterventionId}
                className="w-full py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {isLoadingCd ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Compute Observed Change</span>
              </button>
            </div>
          </form>

          {/* Results Display */}
          {cdResult && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Refused State */}
              {cdResult.status === "refused" ? (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded space-y-2 text-amber-950">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>Computation Refused — Scientific Integrity Guardrail</span>
                  </div>
                  <p className="text-xs leading-relaxed font-mono bg-white p-2.5 rounded border border-amber-200">
                    {cdResult.reason || "Insufficient clear pixels in baseline or comparison window (< 40% valid clear coverage)."}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    VARUNI strictly refuses to compute or synthesize values when satellite data does not meet clear-pixel thresholds.
                  </p>
                </div>
              ) : (
                /* Success State */
                <div className="space-y-5">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="bg-white p-3.5 rounded border border-slate-300 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                        Treated Buffer Δ
                      </span>
                      <span className="font-mono font-black text-slate-900 text-lg block mt-1">
                        {cdResult.results?.treated_delta !== undefined
                          ? (cdResult.results.treated_delta > 0 ? `+${cdResult.results.treated_delta.toFixed(4)}` : cdResult.results.treated_delta.toFixed(4))
                          : "—"}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {cdResult.results?.treated_pixels_count} pixels within {cdResult.results?.treated_buffer_m}m
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded border border-slate-300 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                        Control Ring Δ
                      </span>
                      <span className="font-mono font-black text-slate-700 text-lg block mt-1">
                        {cdResult.results?.control_delta !== undefined
                          ? (cdResult.results.control_delta > 0 ? `+${cdResult.results.control_delta.toFixed(4)}` : cdResult.results.control_delta.toFixed(4))
                          : "—"}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {cdResult.results?.control_pixels_count} pixels in {cdResult.results?.control_ring_m}
                      </span>
                    </div>

                    <div className="bg-emerald-50 p-3.5 rounded border border-emerald-300 shadow-2xs col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">
                          Net Observed Change (DiD)
                        </span>
                        <span className="text-[9px] font-mono bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">
                          {cdResult.metric?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-mono font-black text-emerald-950 text-2xl">
                          {cdResult.results?.did_observed_change !== undefined
                            ? (cdResult.results.did_observed_change > 0 ? `+${cdResult.results.did_observed_change.toFixed(4)}` : cdResult.results.did_observed_change.toFixed(4))
                            : "—"}
                        </span>
                        <span className="text-xs text-emerald-800 font-medium">
                          {cdResult.results?.did_observed_change && cdResult.results.did_observed_change > 0
                            ? "Relative increase compared to control ring"
                            : "Relative decrease compared to control ring"}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-800 block mt-1">
                        Empirical differential change between treated zone and surrounding watershed context.
                      </span>
                    </div>
                  </div>

                  {/* Side-by-Side Seasonal Period Comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Baseline Period */}
                    <div className="bg-slate-50 border border-slate-300 rounded p-4 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                          <span>Baseline Year ({cdResult.baseline_period?.year})</span>
                        </span>
                        <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                          {cdResult.baseline_period?.valid_pct.toFixed(0)}% Clear Pixels
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Acquisition Date:</span>
                          <strong className="text-slate-900">{cdResult.baseline_period?.date}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Treated Mean:</span>
                          <strong className="text-slate-900">{cdResult.baseline_period?.treated_mean.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Control Ring Mean:</span>
                          <strong className="text-slate-900">{cdResult.baseline_period?.control_mean.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Landsat Scene ID:</span>
                          <span className="text-[9px] text-slate-600 truncate block">{cdResult.baseline_period?.scene_id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Period */}
                    <div className="bg-emerald-50/50 border border-emerald-300 rounded p-4 space-y-2">
                      <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                        <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                          <span>Comparison Year ({cdResult.comparison_period?.year})</span>
                        </span>
                        <span className="text-[10px] font-mono bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                          {cdResult.comparison_period?.valid_pct.toFixed(0)}% Clear Pixels
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                        <div>
                          <span className="text-[10px] text-emerald-800 block">Acquisition Date:</span>
                          <strong className="text-emerald-950">{cdResult.comparison_period?.date}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-800 block">Treated Mean:</span>
                          <strong className="text-emerald-950">{cdResult.comparison_period?.treated_mean.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-800 block">Control Ring Mean:</span>
                          <strong className="text-emerald-950">{cdResult.comparison_period?.control_mean.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-800 block">Landsat Scene ID:</span>
                          <span className="text-[9px] text-emerald-900 truncate block">{cdResult.comparison_period?.scene_id}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Swipe / Comparison Visualizer */}
                  <div className="bg-slate-900 text-white p-4 rounded border border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-emerald-400" />
                        <span>Visual Multi-Temporal Transition ({cdResult.baseline_period?.year} ➔ {cdResult.comparison_period?.year})</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-300">
                        Swipe position: {swipePosition}%
                      </span>
                    </div>

                    <div className="relative h-36 bg-slate-800 rounded border border-slate-600 overflow-hidden flex items-center justify-center">
                      <div className="absolute inset-0 flex">
                        {/* Baseline half */}
                        <div
                          className="h-full bg-linear-to-r from-amber-950/60 to-slate-900/80 border-r-2 border-white flex flex-col justify-center px-4 relative"
                          style={{ width: `${swipePosition}%` }}
                        >
                          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                            Baseline ({cdResult.baseline_period?.date})
                          </span>
                          <span className="font-mono text-xs text-slate-200 mt-1">
                            Treated Mean: {cdResult.baseline_period?.treated_mean.toFixed(3)}
                          </span>
                        </div>

                        {/* Comparison half */}
                        <div
                          className="h-full bg-linear-to-l from-emerald-950/60 to-slate-900/80 flex flex-col justify-center px-4 items-end text-right flex-1"
                        >
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                            Comparison ({cdResult.comparison_period?.date})
                          </span>
                          <span className="font-mono text-xs text-slate-200 mt-1">
                            Treated Mean: {cdResult.comparison_period?.treated_mean.toFixed(3)}
                          </span>
                        </div>
                      </div>

                      {/* Slider handle indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize pointer-events-none"
                        style={{ left: `${swipePosition}%` }}
                      />
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swipePosition}
                      onChange={(e) => setSwipePosition(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Methodology & Limitations Panel */}
                  <div className="bg-sky-50 border border-sky-300 rounded p-4 space-y-2.5 text-xs text-sky-950">
                    <div className="flex items-center gap-2 font-bold text-sky-900 text-xs uppercase tracking-wider">
                      <Info className="w-4 h-4 text-sky-700" />
                      <span>Observed Change Methodology & Non-Causal Limitations</span>
                    </div>

                    <p className="text-slate-700 leading-relaxed">
                      {cdResult.methodology}
                    </p>

                    <div className="p-2.5 bg-white border border-sky-200 rounded font-mono text-[11px] text-slate-700">
                      <strong>Limitation Disclaimer: </strong>
                      {cdResult.limitations}
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-1 border-t border-sky-200">
                      <span>USGS Landsat 8/9 Level-2 Surface Reflectance (30m GSD)</span>
                      <span>Cloud Mask: QA_PIXEL Bitmasks (≥ 40% Clear Pixels Required)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: SEASONAL BASELINE ANOMALY DETECTION ────────────────── */}
      {activeTab === "seasonal_anomaly" && (
        <div className="bg-white border border-slate-300 rounded-b p-5 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Evaluate Deviation from Seasonal History at Location
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              ±20 Day Window across Historical Archive
            </span>
          </div>

          <form onSubmit={handleRunAnomalyEvaluation} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Select Intervention
              </label>
              <select
                value={selectedInterventionId}
                onChange={(e) => handleInterventionSelect(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-medium"
              >
                <option value="">Custom Coordinates</option>
                {interventions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} — {i.name || i.type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Latitude (°N)
              </label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Longitude (°E)
              </label>
              <input
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900"
                required
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-slate-900"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoadingAnomaly}
                className="px-4 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
              >
                {isLoadingAnomaly ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Evaluate</span>
              </button>
            </div>
          </form>

          {anomalyResult && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Scientific Evaluation Result:
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                    anomalyResult.status === "review"
                      ? "bg-rose-100 text-rose-950 border-rose-300"
                      : anomalyResult.status === "watch"
                      ? "bg-amber-100 text-amber-950 border-amber-300"
                      : anomalyResult.status === "normal"
                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                      : "bg-slate-200 text-slate-800 border-slate-300"
                  }`}
                >
                  {anomalyResult.status === "review" && "🔴 Review (|z| > 3)"}
                  {anomalyResult.status === "watch" && "🟡 Watch (2 ≤ |z| ≤ 3)"}
                  {anomalyResult.status === "normal" && "🟢 Normal (|z| < 2)"}
                  {anomalyResult.status === "insufficient_history" && "⚪ Insufficient History"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Observed NDVI
                  </span>
                  <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                    {anomalyResult.observed_value !== null && anomalyResult.observed_value !== undefined
                      ? anomalyResult.observed_value.toFixed(3)
                      : "No data"}
                  </span>
                  <span className="text-[9px] text-slate-400 block truncate">
                    {anomalyResult.nearest_scene_date || "Nearest clear scene"}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Baseline Median
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                    {anomalyResult.baseline_median !== null && anomalyResult.baseline_median !== undefined
                      ? anomalyResult.baseline_median.toFixed(3)
                      : "No data"}
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    MAD: ±{anomalyResult.baseline_mad?.toFixed(3) ?? "N/A"}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Historical Observations (n)
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                    {anomalyResult.baseline_n}
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    Min 4 required
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Robust Z-Score
                  </span>
                  <span
                    className={`font-mono font-black text-sm block mt-0.5 ${
                      anomalyResult.status === "review"
                        ? "text-rose-700"
                        : anomalyResult.status === "watch"
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {anomalyResult.z_score !== null && anomalyResult.z_score !== undefined
                      ? anomalyResult.z_score.toFixed(2)
                      : "N/A"}
                  </span>
                  <span className="text-[9px] text-slate-400 capitalize block">
                    {anomalyResult.status_label}
                  </span>
                </div>
              </div>

              {anomalyResult.baseline_observations.length > 0 && (
                <div className="text-xs space-y-1">
                  <span className="font-bold text-slate-700 text-[11px] block">
                    Historical Archive Observations Used (Provenance):
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[10px]">
                    {anomalyResult.baseline_observations.map((obs) => (
                      <div
                        key={obs.scene_id}
                        className="flex items-center justify-between text-slate-600 bg-white p-1 rounded border border-slate-200"
                      >
                        <span>{obs.date} (Year {obs.year})</span>
                        <span className="font-bold text-slate-800">NDVI: {obs.value.toFixed(3)}</span>
                        <span className="text-slate-400 truncate max-w-[150px]">{obs.scene_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent Analysis Table */}
      <RecentAnalysisTable />
    </AppLayout>
  );
}
