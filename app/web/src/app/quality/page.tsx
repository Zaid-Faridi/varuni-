"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import {
  fetchFlaggedImages,
  reviewImageLabel,
  ImageInfo,
  getImageUrl,
} from "@/lib/api";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Camera,
  RefreshCw,
  Sparkles,
  Eye,
  Info,
  Copy,
  Sliders,
  UserCheck,
  Search,
} from "lucide-react";

export default function DataQualityPage() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  
  // Reviewer label state
  const [reviewerLabel, setReviewerLabel] = useState<string>("");
  const [reviewerNotes, setReviewerNotes] = useState<string>("");
  const [isSavingLabel, setIsSavingLabel] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadData = () => {
    setIsLoading(true);
    fetchFlaggedImages(filterType === "all" ? undefined : filterType)
      .then((data) => setImages(data))
      .catch((err) => console.error("Error loading flagged images:", err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [filterType]);

  const handleSaveGroundTruth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage || !reviewerLabel) return;

    setIsSavingLabel(true);
    setSaveMessage(null);
    try {
      const updated = await reviewImageLabel(selectedImage.id, {
        assigned_label: reviewerLabel,
        reviewer_id: "reviewer_analyst_01",
        notes: reviewerNotes.trim() || undefined,
      });
      setSelectedImage(updated);
      setSaveMessage("Ground truth label saved to dataset for future fine-tuning.");
      loadData();
    } catch (err: any) {
      alert(`Error saving ground truth: ${err.message}`);
    } finally {
      setIsSavingLabel(false);
    }
  };

  return (
    <AppLayout>
      {/* Header Banner */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Deterministic Photo Quality Control & Data Integrity
            </h1>
            <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
              No Silent Discard Rule
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic Laplacian sharpness, exposure, duplicate tracking, and Zero-Shot CLIP uncertainty inspection
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
          <span>Refresh Audit</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: "all", label: "All Flagged Photos" },
          { id: "blurry", label: "Blurry / Low Sharpness" },
          { id: "underexposed", label: "Exposure Issues" },
          { id: "duplicate", label: "Duplicate Photos" },
          { id: "resolution", label: "Low Resolution" },
          { id: "no_gps", label: "Missing GPS / Boundary" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 rounded font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
              filterType === tab.id
                ? "bg-[#166534] text-white border-emerald-800 shadow-2xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Photo List */}
        <div className="lg:col-span-7 space-y-3">
          {isLoading ? (
            <div className="bg-white border border-slate-300 rounded p-12 text-center text-slate-500 text-xs font-mono">
              Running deterministic QC inspection...
            </div>
          ) : images.length === 0 ? (
            <div className="bg-white border border-slate-300 rounded p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h3 className="font-bold text-slate-900 text-sm">No Quality Violations Found</h3>
              <p className="text-xs text-slate-500">
                All uploaded field photographs pass sharpness, exposure, resolution, and uniqueness checks.
              </p>
            </div>
          ) : (
            images.map((img) => (
              <div
                key={img.id}
                onClick={() => {
                  setSelectedImage(img);
                  setReviewerLabel(img.reviewer_label || img.classification_result?.top_1 || "check_dam");
                  setSaveMessage(null);
                }}
                className={`bg-white border rounded p-3.5 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer flex flex-col sm:flex-row gap-3.5 ${
                  selectedImage?.id === img.id
                    ? "border-emerald-700 ring-1 ring-emerald-700"
                    : "border-slate-300"
                }`}
              >
                {/* Thumbnail */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-900 rounded overflow-hidden shrink-0 border border-slate-200 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(img.object_uri)}
                    alt="QC Photo"
                    className="w-full h-full object-cover"
                  />
                  {img.duplicate_of_id && (
                    <span className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-bold px-1 rounded">
                      DUPLICATE
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 truncate">
                      {img.object_uri.split("/").pop()}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                        img.quality_status === "good"
                          ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                          : img.quality_status === "duplicate"
                          ? "bg-rose-100 text-rose-950 border-rose-300"
                          : "bg-amber-100 text-amber-950 border-amber-300"
                      }`}
                    >
                      {img.quality_status} (Score: {img.quality_score ?? "N/A"})
                    </span>
                  </div>

                  {/* Quality Reasons */}
                  {img.quality_reasons && img.quality_reasons.length > 0 && (
                    <div className="space-y-0.5">
                      {img.quality_reasons.map((r, i) => (
                        <div key={i} className="text-[11px] text-rose-800 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600 mt-0.5" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Technical Readout */}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-600 pt-1 border-t border-slate-100">
                    <div>
                      <span>Blur (Laplacian): </span>
                      <strong className="text-slate-900">{img.blur_score?.toFixed(1) ?? "N/A"}</strong>
                    </div>
                    <div>
                      <span>Brightness: </span>
                      <strong className="text-slate-900">{img.exposure_mean?.toFixed(1) ?? "N/A"}</strong>
                    </div>
                    <div>
                      <span>Resolution: </span>
                      <strong className="text-slate-900">
                        {img.resolution_w ? `${img.resolution_w}x${img.resolution_h}` : "N/A"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Photo Inspector & Ground Truth Labeller */}
        <div className="lg:col-span-5 space-y-4">
          {selectedImage ? (
            <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-700" />
                  <span>QC & Model Classification Inspector</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">{selectedImage.id}</span>
              </div>

              {/* Full Image Preview */}
              <div className="rounded border border-slate-300 overflow-hidden bg-slate-900 h-56 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageUrl(selectedImage.object_uri)}
                  alt="Full preview"
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Zero-Shot CLIP Predictions */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Model classification (zero-shot CLIP)</span>
                  </span>
                  {selectedImage.classification_result?.is_uncertain && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded border border-amber-300">
                      Unclear, needs human label
                    </span>
                  )}
                </div>

                {selectedImage.classification_result?.top_3?.map((pred, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700">
                        {idx + 1}. {pred.display_name}
                      </span>
                      <span className="font-mono font-bold text-slate-900">{pred.percentage}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full ${idx === 0 ? "bg-emerald-700" : "bg-slate-400"}`}
                        style={{ width: `${pred.probability * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Ground Truth Reviewer Form */}
              <form onSubmit={handleSaveGroundTruth} className="p-3 bg-emerald-50/70 border border-emerald-200 rounded space-y-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span>Reviewer Ground Truth Correction (No Auto-Retrain)</span>
                </div>

                {saveMessage && (
                  <div className="text-[11px] text-emerald-900 bg-emerald-100 p-1.5 rounded font-semibold">
                    {saveMessage}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Assign Official Label:
                  </label>
                  <select
                    value={reviewerLabel}
                    onChange={(e) => setReviewerLabel(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-900"
                  >
                    <option value="check_dam">Check Dam (Masonry/Earthen)</option>
                    <option value="farm_pond">Farm Pond / Percolation Tank</option>
                    <option value="contour_trench">Contour Trench / Bunding</option>
                    <option value="plantation_vegetation">Plantation / Afforestation</option>
                    <option value="bare_degraded_land">Bare / Degraded Land</option>
                    <option value="water_body">Open Water Body / Reservoir</option>
                    <option value="other_unclear">Other / Unclear</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Reviewer Notes:
                  </label>
                  <textarea
                    rows={2}
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Rationale for label assignment or ground anomaly..."
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingLabel}
                  className="w-full py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded font-bold text-xs flex items-center justify-center gap-1 shadow-2xs cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSavingLabel ? "Saving..." : "Accept & Save Ground Truth"}</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-slate-300 rounded p-10 text-center text-slate-500 text-xs font-mono">
              Select a photo from the audit list to inspect quality parameters and verify model predictions.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
