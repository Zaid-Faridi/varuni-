"use client";

import React from "react";
import { Compass, Camera, X, CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ActionNoticeModalProps {
  type: "map" | "upload" | null;
  onClose: () => void;
}

export default function ActionNoticeModal({ type, onClose }: ActionNoticeModalProps) {
  if (!type) return null;

  const isMap = type === "map";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
      <div className="bg-white border border-slate-300 rounded shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#0f2d59] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMap ? (
              <Compass className="w-5 h-5 text-emerald-400" />
            ) : (
              <Camera className="w-5 h-5 text-sky-400" />
            )}
            <h3 className="font-bold text-sm">
              {isMap ? "Open Map Explorer (GIS)" : "Add Geo-tagged Image"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 text-xs text-slate-700">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded font-medium flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[12px]">System Specification</p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                {isMap
                  ? "Map Explorer module is ready for full Leaflet / PostGIS vector layer binding."
                  : "Field geo-tagged image upload & EXIF extraction pipeline connected to FastAPI."}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
            <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
              Planned Capabilities:
            </span>
            <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
              {isMap ? (
                <>
                  <li>Bhuvan WMS / WMTS Base Layers & IRS Indian Satellite Basemap</li>
                  <li>Multi-temporal NDVI & NDWI raster layers with time-slider</li>
                  <li>GeoJSON micro-watershed polygon boundaries with hydrological metrics</li>
                  <li>Interactive pin inspector with field survey ground photographs</li>
                </>
              ) : (
                <>
                  <li>Mobile/Desktop EXIF metadata extraction (lat, long, azimuth, elevation)</li>
                  <li>Real-time bounding box distance check against watershed master layer</li>
                  <li>Image tamper prevention and digital cryptographic timestamping</li>
                  <li>Automated queueing for multi-temporal satellite observation matching</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">VARUNI Decision Support</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded font-medium text-xs shadow-2xs"
            >
              Close
            </button>
            {isMap && (
              <Link
                href="/map-explorer"
                onClick={onClose}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-semibold text-xs flex items-center gap-1.5 shadow-2xs"
              >
                <span>Go to Map View</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
