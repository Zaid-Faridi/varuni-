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
  fetchInterventionReviews,
  InterventionInfo,
  ImageInfo,
  AnomalyAnalysisResponse,
  ReviewEvent,
  getImageUrl,
} from "@/lib/api";
import {
  MapPin,
  AlertTriangle,
  ArrowLeft,
  Compass,
  CheckCircle2,
  Camera,
  Info,
  Layers,
  ShieldCheck,
  HelpCircle,
  XCircle,
  Clock,
  Satellite,
  X,
  FileText,
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

const LocationDisplayMap = dynamic(
  () => import("@/components/gis/LocationDisplayMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 bg-slate-100 flex items-center justify-center text-xs text-slate-400 font-mono">
        Loading PostGIS Leaflet Map...
      </div>
    ),
  }
);

function formatIST(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }) + " IST"
    );
  } catch {
    return dateStr;
  }
}

export default function InterventionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || "";

  const [intervention, setIntervention] = useState<InterventionInfo | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [anomaly, setAnomaly] = useState<AnomalyAnalysisResponse | null>(null);
  const [reviewsHistory, setReviewsHistory] = useState<ReviewEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review Dialog State
  const [activeReviewDecision, setActiveReviewDecision] = useState<"confirm" | "needs_visit" | "dismiss" | null>(null);
  const [modalNotes, setModalNotes] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadInterventionData = async () => {
    if (!id) return;
    try {
      const data = await fetchInterventionDetail(id);
      setIntervention(data);

      if (data.image_id) {
        fetchImageDetail(data.image_id).then(setImageInfo).catch(() => {});
      }

      if (data.latitude && data.longitude) {
        fetchAnomalyAnalysis({
          latitude: data.latitude,
          longitude: data.longitude,
          target_date: data.observed_at ? data.observed_at.split("T")[0] : undefined,
          intervention_id: data.id,
          metric: "ndvi",
        }).then(setAnomaly).catch(() => {});
      }

      fetchInterventionReviews(id).then(setReviewsHistory).catch(() => {});
    } catch (err: any) {
      console.error("Failed to load intervention:", err);
      setError(err.message || "Intervention not found");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadInterventionData();
  }, [id]);

  const openReviewModal = (decision: "confirm" | "needs_visit" | "dismiss") => {
    setActiveReviewDecision(decision);
    setModalNotes("");
    setModalError(null);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReviewDecision || !intervention) return;

    const currentStatus = (intervention.review_status || "OBSERVED").toUpperCase();
    const isFirstConfirm = (currentStatus === "OBSERVED" && activeReviewDecision === "confirm");
    const notesRequired = !isFirstConfirm;

    if (notesRequired && (!modalNotes || modalNotes.trim().length < 10)) {
      setModalError("Reviewer notes are required (minimum 10 characters) for this review action.");
      return;
    }

    setIsSubmittingReview(true);
    setModalError(null);

    try {
      await reviewIntervention(id, {
        decision: activeReviewDecision,
        notes: modalNotes.trim() || undefined,
        expected_status: intervention.review_status || "OBSERVED",
      });

      // Close modal
      setActiveReviewDecision(null);
      setModalNotes("");

      // Show toast
      let toast = "Record verified successfully";
      if (activeReviewDecision === "needs_visit") {
        toast = "Field visit requested";
      } else if (activeReviewDecision === "dismiss") {
        toast = "Record dismissed";
      }
      setToastMessage(toast);
      setTimeout(() => setToastMessage(null), 5000);

      // Refetch record and review history to update DB-backed state
      await loadInterventionData();
    } catch (err: any) {
      const errMsg = err.message || "Review submission failed.";
      if (errMsg.includes("401")) {
        setModalError("Authentication Required (401): Please log in with a reviewer or admin account.");
      } else if (errMsg.includes("403")) {
        setModalError("Permission Denied (403): Only users with 'reviewer' or 'admin' roles can review interventions.");
      } else if (errMsg.includes("409")) {
        setModalError("Status Conflict (409): The record status was modified by another reviewer. Please refresh the page.");
      } else if (errMsg.includes("422")) {
        setModalError("Validation Error (422): Notes must be at least 10 characters long.");
      } else {
        setModalError(errMsg);
      }
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

      {toastMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 p-3 rounded text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{toastMessage}</span>
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
                {imageInfo?.quality_status
                  ? `EXIF Verified (${imageInfo.quality_status})`
                  : (intervention.photo_path || intervention.image_id ? "Geo-Tagged Field Photo" : "Ground Survey Record")}
              </span>
            </div>

            {/* Display Image */}
            <div className="relative rounded border border-slate-300 overflow-hidden bg-slate-900 h-64 flex items-center justify-center">
              {(imageInfo?.object_uri || intervention.photo_path || intervention.image_id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getImageUrl(imageInfo?.object_uri || intervention.photo_path || (intervention.image_id ? `api/v1/images/${intervention.image_id}/file` : ""))}
                  alt={intervention.name || "Intervention photo"}
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    if (intervention.image_id) {
                      const fallback = getImageUrl(`api/v1/images/${intervention.image_id}/file`);
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }
                  }}
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
            {(imageInfo || intervention.photo_path || intervention.image_id) && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 truncate">
                    {imageInfo?.original_filename || intervention.photo_filename || imageInfo?.object_uri?.split("/").pop() || intervention.photo_path?.split("/").pop() || "Field Photo"}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                    {imageInfo?.gps_source || intervention.gps_source || "EXIF GPS"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 pt-1 border-t border-slate-200">
                  <div>
                    <span className="text-slate-500">Captured Date: </span>
                    <strong className="text-slate-800">
                      {imageInfo?.captured_at
                        ? new Date(imageInfo.captured_at).toLocaleDateString()
                        : (intervention.exif_timestamp
                            ? new Date(intervention.exif_timestamp).toLocaleDateString()
                            : (intervention.observed_at ? new Date(intervention.observed_at).toLocaleDateString() : "Not in EXIF"))}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">EXIF GPS: </span>
                    <strong className="text-slate-800">
                      {((imageInfo?.latitude ?? intervention.exif_latitude ?? intervention.latitude) !== undefined && (imageInfo?.longitude ?? intervention.exif_longitude ?? intervention.longitude) !== undefined)
                        ? `${Number(imageInfo?.latitude ?? intervention.exif_latitude ?? intervention.latitude).toFixed(4)}°, ${Number(imageInfo?.longitude ?? intervention.exif_longitude ?? intervention.longitude).toFixed(4)}°`
                        : "No GPS tag"}
                    </strong>
                  </div>
                  {imageInfo?.camera_model && (
                    <div className="col-span-2">
                      <span className="text-slate-500">Camera: </span>
                      <strong className="text-slate-800">{imageInfo.camera_model}</strong>
                    </div>
                  )}
                </div>
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

          {/* 4. LOCATION MAP CARD */}
          {intervention.latitude && intervention.longitude && (
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
          )}
        </div>

        {/* ─── RIGHT COLUMN: REVIEW STATUS, HISTORY, ANOMALY & SATELLITE CONTEXT ─── */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 1. PERMANENT REVIEW STATUS CARD (Requirement B6 & B7) */}
          <div className="bg-white border-2 border-slate-300 rounded shadow-sm p-4 sm:p-5 space-y-4" id="review-status-card">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-800" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                  Human Review Status
                </h2>
              </div>

              {/* Status Badge (Requirement B9) */}
              {(() => {
                const status = (intervention.review_status || "OBSERVED").toUpperCase();
                if (status === "VERIFIED") {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Verified</span>
                    </span>
                  );
                } else if (status === "NEEDS_FIELD_VISIT") {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      <span>Needs Field Visit</span>
                    </span>
                  );
                } else if (status === "DISMISSED") {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                      <XCircle className="w-3.5 h-3.5 text-slate-600" />
                      <span>Dismissed</span>
                    </span>
                  );
                } else {
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Observed / Pending review</span>
                    </span>
                  );
                }
              })()}
            </div>

            {/* VERIFIED Wording (Requirement B6: never claim "impact confirmed") */}
            {(intervention.review_status || "").toUpperCase() === "VERIFIED" && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs font-semibold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Evidence reviewed by a human reviewer</span>
              </div>
            )}

            {/* Reviewer Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Current Decision
                </span>
                <span className="font-bold text-slate-900 capitalize">
                  {intervention.reviewer_decision ? intervention.reviewer_decision.replace(/_/g, " ") : "Pending initial review"}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Reviewer Name / ID
                </span>
                <span className="font-bold text-slate-900">
                  {intervention.current_reviewer_id || intervention.reviewer_id || "Unassigned"}
                </span>
              </div>

              <div className="col-span-2 pt-1 border-t border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Reviewed At (IST)
                </span>
                <span className="font-mono text-slate-800 font-semibold">
                  {formatIST(intervention.reviewed_at)}
                </span>
              </div>

              <div className="col-span-2 pt-1 border-t border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Reviewer Notes / Rationale
                </span>
                <p className="text-slate-800 text-xs mt-0.5 whitespace-pre-wrap">
                  {intervention.current_notes || intervention.description || "No reviewer notes recorded."}
                </p>
              </div>
            </div>

            {/* Action Buttons: Confirm / Needs Visit / Dismiss (Requirement B7) */}
            <div className="pt-2 border-t border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                Take Review Action:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openReviewModal("confirm")}
                  className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors"
                  id="review-confirm-btn"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Confirm</span>
                </button>

                <button
                  type="button"
                  onClick={() => openReviewModal("needs_visit")}
                  className="flex-1 py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors"
                  id="review-needs-visit-btn"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Needs Visit</span>
                </button>

                <button
                  type="button"
                  onClick={() => openReviewModal("dismiss")}
                  className="flex-1 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 rounded text-xs font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors"
                  id="review-dismiss-btn"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-700" />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. REVIEW HISTORY TIMELINE (Requirement B8) */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 sm:p-5 space-y-3" id="review-history-card">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-800" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Review History Timeline (Append-Only)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold">
                {reviewsHistory.length} {reviewsHistory.length === 1 ? "Event" : "Events"}
              </span>
            </div>

            {reviewsHistory.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                No human review events recorded yet. Record is in initial observed state.
              </p>
            ) : (
              <div className="space-y-3 pt-1">
                {reviewsHistory.map((ev, index) => (
                  <div
                    key={ev.id || index}
                    className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {ev.reviewer_name || ev.reviewer_id}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {formatIST(ev.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold uppercase">
                        {ev.from_status}
                      </span>
                      <span className="text-slate-400">&rarr;</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                        ev.to_status === "VERIFIED"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : ev.to_status === "NEEDS_FIELD_VISIT"
                          ? "bg-amber-100 text-amber-950 border border-amber-300"
                          : "bg-rose-100 text-rose-950 border border-rose-300"
                      }`}>
                        {ev.to_status}
                      </span>
                    </div>

                    {ev.notes && (
                      <p className="text-slate-700 text-[11px] pt-1 border-t border-slate-200 whitespace-pre-wrap">
                        {ev.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. DEVIATION FROM SEASONAL HISTORY CARD */}
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
                        Baseline Median
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
          </div>

          {/* 4. SATELLITE CONTEXT CARD */}
          {(() => {
            const satCtx = intervention.satellite_context || imageInfo?.satellite_context;
            return (
              <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider pb-2 border-b border-slate-200">
                  <Satellite className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Satellite Context (Landsat 8/9 Level-2 30m)</span>
                </span>

                {satCtx && (satCtx.nearest_before || satCtx.nearest_after) ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">
                        Nearest Clear Before
                      </span>
                      {satCtx.nearest_before ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-slate-500">NDVI:</span>
                            <span className="font-mono font-bold text-emerald-800 text-xs">
                              {satCtx.nearest_before.ndvi != null
                                ? satCtx.nearest_before.ndvi.toFixed(3)
                                : "No valid observation available."}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-slate-700 truncate" title={satCtx.nearest_before.scene_id}>
                            {satCtx.nearest_before.scene_id}
                          </div>
                          <div className="text-[9px] text-slate-500 flex justify-between">
                            <span>{satCtx.nearest_before.date} ({satCtx.nearest_before.day_gap}d gap)</span>
                            <span>{satCtx.nearest_before.sensor || "OLI-TIRS"} ({satCtx.nearest_before.resolution_m || 30}m)</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic block mt-1">No valid observation available.</span>
                      )}
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">
                        Nearest Clear After
                      </span>
                      {satCtx.nearest_after ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-slate-500">NDVI:</span>
                            <span className="font-mono font-bold text-emerald-800 text-xs">
                              {satCtx.nearest_after.ndvi != null
                                ? satCtx.nearest_after.ndvi.toFixed(3)
                                : "No valid observation available."}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-slate-700 truncate" title={satCtx.nearest_after.scene_id}>
                            {satCtx.nearest_after.scene_id}
                          </div>
                          <div className="text-[9px] text-slate-500 flex justify-between">
                            <span>{satCtx.nearest_after.date} ({satCtx.nearest_after.day_gap}d gap)</span>
                            <span>{satCtx.nearest_after.sensor || "OLI-TIRS"} ({satCtx.nearest_after.resolution_m || 30}m)</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic block mt-1">No valid observation available.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 text-slate-500 rounded text-center text-xs font-mono">
                    {satCtx?.message || "No valid observation available."}
                  </div>
                )}

                {/* Time Series Chart */}
                {satCtx && satCtx.time_series_at_pixel?.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">30m Pixel NDVI Time-Series</span>
                      <span className="text-emerald-700 font-mono text-[10px]">Photo Date Marked</span>
                    </div>
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={satCtx.time_series_at_pixel}>
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
            );
          })()}
        </div>
      </div>

      {/* ─── REVIEW MODAL DIALOG (Requirement B7) ─── */}
      {activeReviewDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-lg border border-slate-300 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                {activeReviewDecision === "confirm" && <CheckCircle2 className="w-5 h-5 text-emerald-700" />}
                {activeReviewDecision === "needs_visit" && <HelpCircle className="w-5 h-5 text-amber-700" />}
                {activeReviewDecision === "dismiss" && <XCircle className="w-5 h-5 text-rose-700" />}
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900">
                  {activeReviewDecision === "confirm" && "Confirm & Verify Intervention"}
                  {activeReviewDecision === "needs_visit" && "Request Field Verification Visit"}
                  {activeReviewDecision === "dismiss" && "Dismiss Intervention Record"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingReview) setActiveReviewDecision(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div className="text-xs text-slate-600 space-y-1">
                <p>
                  Target Record: <strong className="text-slate-900">{intervention.name || intervention.type}</strong> ({intervention.id})
                </p>
                <p>
                  Current Status: <span className="font-mono font-bold text-slate-800">{intervention.review_status || "OBSERVED"}</span>
                </p>
                <p>
                  New Target Status:{" "}
                  <strong className={
                    activeReviewDecision === "confirm"
                      ? "text-emerald-800"
                      : activeReviewDecision === "needs_visit"
                      ? "text-amber-800"
                      : "text-rose-800"
                  }>
                    {activeReviewDecision === "confirm" ? "VERIFIED" : activeReviewDecision === "needs_visit" ? "NEEDS_FIELD_VISIT" : "DISMISSED"}
                  </strong>
                </p>
              </div>

              {/* Note / Rationale Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Reviewer Notes & Rationale{" "}
                  {(!((intervention.review_status || "OBSERVED").toUpperCase() === "OBSERVED" && activeReviewDecision === "confirm")) && (
                    <span className="text-rose-600">* (min 10 characters required)</span>
                  )}
                  {((intervention.review_status || "OBSERVED").toUpperCase() === "OBSERVED" && activeReviewDecision === "confirm") && (
                    <span className="text-slate-400 font-normal">(optional for initial verification)</span>
                  )}
                </label>
                <textarea
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  rows={4}
                  placeholder="Enter detailed observations, spatial verification rationale, or field visit requirements..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 outline-none resize-none font-sans"
                  disabled={isSubmittingReview}
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>{modalNotes.length} characters</span>
                  <span>Minimum 10 characters when required</span>
                </div>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveReviewDecision(null)}
                  disabled={isSubmittingReview}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className={`px-4 py-1.5 rounded text-xs font-bold text-white flex items-center gap-1.5 shadow-2xs ${
                    activeReviewDecision === "confirm"
                      ? "bg-emerald-700 hover:bg-emerald-800"
                      : activeReviewDecision === "needs_visit"
                      ? "bg-amber-700 hover:bg-amber-800"
                      : "bg-rose-700 hover:bg-rose-800"
                  } disabled:opacity-50`}
                >
                  {isSubmittingReview ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Review Decision</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
