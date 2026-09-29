"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import { Compass, RotateCcw } from "lucide-react";
import Link from "next/link";

// Dynamic import with SSR disabled to prevent Leaflet window reference errors
const WebGisMap = dynamic(() => import("@/components/gis/WebGisMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 w-full h-[calc(100vh-93px)] bg-slate-900 flex flex-col items-center justify-center text-white space-y-3 font-sans">
      <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-sm font-semibold tracking-wide">
        Loading WebGIS Core & Leaflet Spatial Layers...
      </div>
      <p className="text-xs text-slate-400 font-mono">
        Watershed Monitoring & Evaluation Engine
      </p>
    </div>
  ),
});

function MapContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const watershedId = searchParams.get("watershed");

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <Header />

      {/* Secondary WebGIS Sub-strip */}
      <div className="bg-slate-100 border-b border-slate-300 px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="text-slate-600 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Projects Directory</span>
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href="/dashboard"
            className="text-slate-600 hover:text-emerald-800 font-medium text-[11px]"
          >
            Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900 text-[11px] flex items-center gap-1">
            <Compass className="w-3 h-3 text-emerald-700" />
            <span>WebGIS Interactive Viewer</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600">
          <span>Leaflet + React-Leaflet</span>
          <span>•</span>
          <span className="text-emerald-700 font-bold">Part 2 Active</span>
        </div>
      </div>

      {/* Main Map View */}
      <main className="flex-1 flex w-full relative">
        <WebGisMap
          initialProjectId={projectId}
          initialWatershedId={watershedId}
        />
      </main>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs font-mono">
          Initializing WebGIS session...
        </div>
      }
    >
      <MapContent />
    </Suspense>
  );
}
