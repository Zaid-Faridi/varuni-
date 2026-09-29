"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  X,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  ExternalLink,
} from "lucide-react";
import { InterventionInfo, reviewIntervention } from "@/lib/api";

interface InterventionDetailModalProps {
  intervention: InterventionInfo | null;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function InterventionDetailModal({
  intervention,
  onClose,
  onUpdate,
}: InterventionDetailModalProps) {
  const [reviewing, setReviewing] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<"confirm" | "dismiss" | "needs_field_visit">("confirm");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  if (!intervention) return null;

  const handleReviewSubmit = async () => {
    setReviewing(true);
    try {
      await reviewIntervention(intervention.id, {
        decision: selectedDecision,
        reviewer_id: "field_officer",
        notes: reviewerNotes,
      });
      setStatusMsg("Review submitted successfully.");
      onUpdate?.();
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#0f2d59] text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold bg-sky-900 text-sky-200 px-1.5 py-0.5 rounded border border-sky-700">
                {intervention.id.slice(0, 8)}...
              </span>
              <span className="text-xs text-emerald-300 font-bold uppercase">
                {intervention.type.replace(/_/g, " ")}
              </span>
            </div>
            <h3 className="font-bold text-base mt-1 tracking-tight">
              {intervention.name || "Field Structure"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs text-slate-700">
          {/* Spatial Info */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
            <div>
              <span className="font-bold text-slate-500 uppercase text-[10px] block">
                Watershed Catchment
              </span>
              <span className="font-semibold text-slate-900 text-xs">
                {intervention.watershed_name || "Assigned Catchment"}
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-500 uppercase text-[10px] block">
                Status
              </span>
              <span className="font-semibold text-emerald-800 capitalize text-xs">
                {intervention.status.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-500 uppercase text-[10px] block">
                Coordinates
              </span>
              <span className="font-mono text-slate-800 text-xs flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                {intervention.latitude?.toFixed(4)}, {intervention.longitude?.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-500 uppercase text-[10px] block">
                Observed Date
              </span>
              <span className="font-mono text-slate-800 text-xs">
                {intervention.observed_at ? intervention.observed_at.split("T")[0] : "—"}
              </span>
            </div>
          </div>

          {/* Terrain & Hydrology Metrics (Copernicus 30m DEM) */}
          <div className="p-3 bg-sky-50/70 border border-sky-200 rounded space-y-2">
            <span className="font-bold text-sky-950 uppercase text-[10px] block tracking-wider">
              Terrain & Hydrological Characteristics (Copernicus 30m DEM)
            </span>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="bg-white p-2 rounded border border-sky-100">
                <span className="text-[9px] text-slate-500 block uppercase">Nearest Stream</span>
                <span className="font-bold text-slate-900">
                  {intervention.nearest_stream_distance_m != null
                    ? `${intervention.nearest_stream_distance_m.toFixed(1)} m`
                    : "No data"}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-sky-100">
                <span className="text-[9px] text-slate-500 block uppercase">Upstream Area</span>
                <span className="font-bold text-slate-900">
                  {intervention.upstream_catchment_area_sqkm != null
                    ? `${intervention.upstream_catchment_area_sqkm.toFixed(3)} km²`
                    : "No data"}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-sky-100">
                <span className="text-[9px] text-slate-500 block uppercase">Local Slope</span>
                <span className="font-bold text-slate-900">
                  {intervention.local_slope_deg != null
                    ? `${intervention.local_slope_deg.toFixed(1)}°`
                    : "No data"}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {intervention.description && (
            <div className="p-3 bg-white border border-slate-200 rounded">
              <span className="font-bold text-slate-800 block mb-1">Observation Notes</span>
              <p className="text-slate-600 whitespace-pre-line">{intervention.description}</p>
            </div>
          )}

          {/* Human Review Decision Section */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
            <span className="font-bold text-slate-800 block text-xs">
              Human Reviewer Decision
            </span>
            {intervention.reviewer_decision ? (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-700">
                  Decision: <strong className="capitalize">{intervention.reviewer_decision.replace(/_/g, " ")}</strong>
                </p>
                <p className="text-[10px] text-slate-500">
                  Reviewed by {intervention.reviewer_id} on {intervention.reviewed_at?.replace("T", " ").slice(0, 19)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {(["confirm", "needs_field_visit", "dismiss"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDecision(d)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors capitalize ${
                        selectedDecision === d
                          ? "bg-[#164e63] text-white border-[#0e3b4d]"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {d.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Optional review notes..."
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded p-2 text-xs"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={handleReviewSubmit}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold text-xs"
                >
                  {reviewing ? "Submitting..." : "Submit Review"}
                </button>
                {statusMsg && <p className="text-xs text-slate-700">{statusMsg}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <Link
            href={`/interventions/${intervention.id}`}
            className="text-emerald-800 font-bold hover:underline flex items-center gap-1 text-xs"
          >
            <span>Full Detail & Satellite Context</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-semibold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
