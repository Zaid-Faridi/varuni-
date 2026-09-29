"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import AppLayout from "@/components/layout/AppLayout";
import {
  fetchInterventionDetail,
  fetchImageDetail,
  fetchAnomalyAnalysis,
  reviewIntervention,
  InterventionInfo,
  ImageInfo,
  AnomalyAnalysisResponse,
  getImageUrl,
} from "@/lib/api";
import {
  MapPin,
  Calendar,
  Layers,
  Compass,
  ArrowLeft,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Building,
  Camera,
  RotateCcw,
  Sparkles,
  Cpu,
  Info,
  Satellite,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  UserCheck,
  XCircle,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Dynamic import with SSR disabled for Leaflet display map
const LocationDisplayMap = dynamic(
  () => import("@/components/gis/LocationDisplayMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-slate-900 rounded border border-slate-300 flex items-center justify-center text-white text-xs font-mono">
        Loading GIS Geo-spatial coordinates...
      </div>
    ),
  }
);

export default function InterventionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || "";

  const [intervention, setIntervention] = useState<InterventionInfo | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [anomaly, setAnomaly] = useState<AnomalyAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review state
  const [reviewerDecision, setReviewerDecision] = useState<"confirm" | "dismiss" | "needs_field_visit" | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    fetchInterventionDetail(id)
      .then(async (data) => {
        setIntervention(data);
        if (data.reviewer_decision) {
          setReviewerDecision(data.reviewer_decision as any);
        }

        // If intervention has a linked image, fetch image details
        if (data.image_id) {
          try {
            const img = await fetchImageDetail(data.image_id);
            setImageInfo(img);
          } catch (e) {
            console.warn("Could not fetch linked image:", e);
          }
        }

        // Fetch seasonal anomaly if coordinates available
        if (data.latitude && data.longitude) {
          try {
            const anom = await fetchAnomalyAnalysis({
              latitude: data.latitude,
              longitude: data.longitude,
              target_date: data.observed_at ? data.observed_at.split("T")[0] : undefined,
              intervention_id: data.id,
              metric: "ndvi",
            });
            setAnomaly(anom);
          } catch (e) {
            console.warn("Could not fetch anomaly:", e);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load intervention:", err);
        setError(err.message || "Intervention not found");
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleReviewSubmit = async (decision: "confirm" | "dismiss" | "needs_field_visit") => {
    setIsSubmittingReview(true);
    setReviewMessage(null);
    try {
      const updated = await reviewIntervention(id, {
        decision,
        reviewer_id: "reviewer_dev_01",
        notes: reviewerNotes.trim() || undefined,
      });
      setIntervention(updated);
      setReviewerDecision(decision);
      setReviewMessage(`Review recorded: ${decision.replace("_", " ")}`);
    } catch (err: any) {
      alert(`Failed to save review: ${err.message}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="bg-white border border-slate-300 rounded p-12 text-center text-slate-500 text-xs font-mono">
          Loading Intervention Spatial Record from PostGIS...
        </div>
      </AppLayout>
    );
  }

  if (error || !intervention) {
    return (
      <AppLayout>
        <div className="bg-white border border-slate-300 rounded p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">
            Intervention Record Not Found
          </h2>
          <p className="text-xs text-slate-500">
            {error || `No record matches identifier "${id}" in the database.`}
          </p>
          <Link
            href="/interventions"
            className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Catalog</span>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-300 rounded px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/interventions"
            className="text-slate-600 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Interventions</span>
          </Link>
          <span className="text-slate-400">/</span>
          <span className="font-mono font-bold text-slate-900">{intervention.id}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.push(`/map?watershed=${intervention.watershed_id || ""}`)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
            id="back-to-map-btn"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-700" />
            <span>Open in WebGIS Explorer</span>
          </button>
        </div>
      </div>

      {reviewMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 p-3 rounded text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{reviewMessage}</span>
        </div>
      )}

      {/* Main Intervention Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* ─── LEFT COLUMN: IMAGE & SPATIAL ATTRIBUTES ───────────────── */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 1. UPLOADED IMAGE CARD */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                <span>Field Geo-Coded Photograph</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 font-bold">
                {imageInfo ? `EXIF Verified (${imageInfo.quality_status})` : "Ground Survey Record"}
              </span>
            </div>

            {/* Display Image */}
            <div className="relative rounded border border-slate-300 overflow-hidden bg-slate-900 h-64 flex items-center justify-center">
              {imageInfo?.object_uri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getImageUrl(imageInfo.object_uri)}
                  alt={intervention.name || "Intervention photo"}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-center text-white px-4">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                  <span className="font-bold text-sm block">{intervention.type}</span>
                  <span className="text-xs text-slate-300 font-mono">
                    ID: {intervention.id}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    No photo uploaded with this record
                  </span>
                </div>
              )}
            </div>

            {/* Image Meta Bar */}
            {imageInfo && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 block truncate">
                    {imageInfo.object_uri}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Captured Date: {imageInfo.captured_at || "Not recorded in EXIF"}
                  </span>
                </div>
                {imageInfo.camera_model && (
                  <span className="text-[10px] font-mono text-slate-500">
                    Camera: {imageInfo.camera_model}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 2. DESCRIPTION & METADATA */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-2">
            <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider pb-2 border-b border-slate-200">
              <Info className="w-3.5 h-3.5 text-emerald-700" />
              <span>Description & Ground Observations</span>
            </span>
            <p className="text-xs text-slate-700 leading-relaxed pt-1">
              {intervention.description || "No additional field notes entered for this structure."}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono text-slate-600">
              <div>
                <span>Estimated Cost: </span>
                <strong className="text-slate-800">
                  {intervention.cost_estimate ? `₹${intervention.cost_estimate.toLocaleString()}` : "No data"}
                </strong>
              </div>
              <div>
                <span>Beneficiaries: </span>
                <strong className="text-slate-800">
                  {intervention.beneficiaries ? `${intervention.beneficiaries} households` : "No data"}
                </strong>
              </div>
            </div>
          </div>

          {/* 3. TERRAIN & HYDROLOGY CHARACTERISTICS (COPERNICUS 30M DEM) */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-sky-700" />
                <span>Hydrology & Topography (Copernicus 30m DEM)</span>
              </span>
              <span className="text-[10px] font-mono text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 font-bold">
                D8 Routing
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">
                  Nearest Stream
                </span>
                <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                  {intervention.nearest_stream_distance_m != null
                    ? `${intervention.nearest_stream_distance_m.toFixed(1)} m`
                    : "No data"}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5">
                  Strahler vector network
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">
                  Upstream Catchment
                </span>
                <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                  {intervention.upstream_catchment_area_sqkm != null
                    ? `${intervention.upstream_catchment_area_sqkm.toFixed(3)} km²`
                    : "No data"}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5">
                  Contributing drainage
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">
                  Local Slope
                </span>
                <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                  {intervention.local_slope_deg != null
                    ? `${intervention.local_slope_deg.toFixed(1)}°`
                    : "No data"}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5">
                  Horn slope angle
                </span>
              </div>
            </div>
          </div>

          {/* 3. LOCATION MAP CARD */}
          {intervention.latitude && intervention.longitude ? (
            <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Geospatial Position (PostGIS WGS84)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {intervention.latitude.toFixed(5)}°N, {intervention.longitude.toFixed(5)}°E
                </span>
              </div>

              <LocationDisplayMap
                latitude={intervention.latitude}
                longitude={intervention.longitude}
                title={intervention.name || intervention.type}
                type={intervention.type}
              />
            </div>
          ) : null}
        </div>

        {/* ─── RIGHT COLUMN: ANOMALY & SATELLITE CONTEXT ──────────────── */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 1. DEVIATION FROM SEASONAL HISTORY CARD */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 sm:p-5 space-y-4">
            
            {/* Status Header */}
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-300">
                    {intervention.id}
                  </span>
                  <span className="text-xs font-bold uppercase text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                    {intervention.type}
                  </span>
                </div>
                <h1 className="text-base font-black text-slate-900 mt-1.5 tracking-tight">
                  {intervention.name || `${intervention.type} Structure`}
                </h1>
              </div>

              {/* Anomaly Badge */}
              {anomaly && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold shadow-2xs border ${
                    anomaly.status === "review"
                      ? "bg-rose-100 text-rose-950 border-rose-300"
                      : anomaly.status === "watch"
                      ? "bg-amber-100 text-amber-950 border-amber-300"
                      : anomaly.status === "normal"
                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }`}
                >
                  <span>
                    {anomaly.status === "review"
                      ? "🔴 Review (|z| > 3)"
                      : anomaly.status === "watch"
                      ? "🟡 Watch (2 ≤ |z| ≤ 3)"
                      : anomaly.status === "normal"
                      ? "🟢 Normal (|z| < 2)"
                      : "⚪ Insufficient History"}
                  </span>
                </span>
              )}
            </div>

            {/* Scientific Anomaly Diagnosis */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Deviation from Seasonal History
              </span>

              {anomaly ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">
                        Observed NDVI
                      </span>
                      <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                        {anomaly.observed_value !== null && anomaly.observed_value !== undefined
                          ? anomaly.observed_value.toFixed(3)
                          : "No data"}
                      </span>
                      <span className="text-[9px] text-slate-400 block truncate">
                        {anomaly.nearest_scene_date || "Nearest clear scene"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">
                        Baseline Median (MAD)
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                        {anomaly.baseline_median !== null && anomaly.baseline_median !== undefined
                          ? `${anomaly.baseline_median.toFixed(3)} (±${anomaly.baseline_mad?.toFixed(3)})`
                          : "No data"}
                      </span>
                      <span className="text-[9px] text-slate-500 block">
                        n = {anomaly.baseline_n} historical scenes
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">
                        Robust Z-Score
                      </span>
                      <span
                        className={`font-mono font-black text-sm block mt-0.5 ${
                          anomaly.status === "review"
                            ? "text-rose-700"
                            : anomaly.status === "watch"
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {anomaly.z_score !== null && anomaly.z_score !== undefined
                          ? anomaly.z_score.toFixed(2)
                          : "N/A"}
                      </span>
                      <span className="text-[9px] text-slate-400 capitalize block">
                        {anomaly.status_label}
                      </span>
                    </div>
                  </div>

                  {anomaly.baseline_observations.length > 0 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                      <span className="font-bold text-slate-700 block text-[11px]">
                        Historical Baseline Observations (±20 days in prior years):
                      </span>
                      <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[10px]">
                        {anomaly.baseline_observations.map((obs) => (
                          <div key={obs.scene_id} className="flex items-center justify-between text-slate-600 bg-white p-1 rounded border border-slate-200">
                            <span>{obs.date} (Year {obs.year})</span>
                            <span className="font-bold text-slate-800">NDVI: {obs.value.toFixed(3)}</span>
                            <span className="text-slate-400 truncate max-w-[120px]">{obs.scene_id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {anomaly.status === "insufficient_history" && (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded text-xs">
                      <strong>Insufficient History:</strong> Minimum 4 clear historical scenes required to form a statistically robust baseline. Currently available: {anomaly.baseline_n}.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-500 text-xs font-mono">
                  No seasonal anomaly calculation available for this location.
                </div>
              )}
            </div>

            {/* 2. HUMAN REVIEWER DECISION FORM */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Human Reviewer Decision</span>
                </span>
                {intervention.reviewed_at && (
                  <span className="text-[10px] font-mono text-slate-500">
                    Reviewed: {new Date(intervention.reviewed_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div>
                <textarea
                  rows={2}
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Enter reviewer notes, ground survey instructions, or validation rationale..."
                  className="w-full text-xs bg-white border border-slate-300 rounded p-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReviewSubmit("confirm")}
                  className={`flex-1 py-2 px-3 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors ${
                    reviewerDecision === "confirm"
                      ? "bg-emerald-700 text-white"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReviewSubmit("needs_field_visit")}
                  className={`flex-1 py-2 px-3 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors ${
                    reviewerDecision === "needs_field_visit"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Needs Visit</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReviewSubmit("dismiss")}
                  className={`flex-1 py-2 px-3 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors ${
                    reviewerDecision === "dismiss"
                      ? "bg-rose-700 text-white"
                      : "bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100"
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. SATELLITE CONTEXT CARD */}
          {imageInfo?.satellite_context && (
            <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider pb-2 border-b border-slate-200">
                <Satellite className="w-3.5 h-3.5 text-emerald-700" />
                <span>Satellite Context (30m Landsat Pixel)</span>
              </span>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Nearest Clear Before
                  </span>
                  {imageInfo.satellite_context.nearest_before ? (
                    <div className="mt-1 space-y-0.5">
                      <span className="font-mono text-xs font-bold text-slate-900 block">
                        {imageInfo.satellite_context.nearest_before.date} ({imageInfo.satellite_context.nearest_before.day_gap}d gap)
                      </span>
                      <span className="text-[10px] text-slate-600 block">
                        NDVI: <strong>{imageInfo.satellite_context.nearest_before.ndvi?.toFixed(3) ?? "N/A"}</strong>
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic block mt-1">No clear scene before</span>
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Nearest Clear After
                  </span>
                  {imageInfo.satellite_context.nearest_after ? (
                    <div className="mt-1 space-y-0.5">
                      <span className="font-mono text-xs font-bold text-slate-900 block">
                        {imageInfo.satellite_context.nearest_after.date} ({imageInfo.satellite_context.nearest_after.day_gap}d gap)
                      </span>
                      <span className="text-[10px] text-slate-600 block">
                        NDVI: <strong>{imageInfo.satellite_context.nearest_after.ndvi?.toFixed(3) ?? "N/A"}</strong>
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic block mt-1">No clear scene after</span>
                  )}
                </div>
              </div>

              {/* Time Series Chart */}
              {imageInfo.satellite_context.time_series_at_pixel?.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">30m Pixel NDVI Time-Series</span>
                    <span className="text-emerald-700 font-mono text-[10px]">Photo Date Marked</span>
                  </div>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={imageInfo.satellite_context.time_series_at_pixel}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                        <YAxis domain={[-0.2, 1.0]} tick={{ fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ fontSize: "11px", backgroundColor: "#0f172a", color: "#fff", borderRadius: "4px" }}
                        />
                        {intervention.observed_at && (
                          <ReferenceLine
                            x={intervention.observed_at.split("T")[0]}
                            stroke="#dc2626"
                            strokeDasharray="4 4"
                            label={{ value: "Survey Date", fill: "#dc2626", fontSize: 10 }}
                          />
                        )}
                        <Line type="monotone" dataKey="value" stroke="#166534" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
