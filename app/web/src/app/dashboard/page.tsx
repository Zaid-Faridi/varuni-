"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import StatCards from "@/components/dashboard/StatCards";
import Charts from "@/components/dashboard/Charts";
import MappedObservationsTable from "@/components/dashboard/MappedObservationsTable";
import RecentInterventionsTable from "@/components/dashboard/RecentInterventionsTable";
import RecentAnalysisTable from "@/components/dashboard/RecentAnalysisTable";
import { fetchDashboardStats, DashboardStats, InterventionInfo } from "@/lib/api";
import {
  Compass,
  Camera,
  RefreshCw,
  Activity,
} from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      setError(null);
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err: any) {
      console.error("Error fetching dashboard stats:", err);
      setError("Unable to connect to FastAPI backend. Ensure PostGIS and API are running on port 8000.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadStats();
  };

  return (
    <AppLayout>
      {/* Top Command Action Bar */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Watershed Monitoring & Verification Command Center
            </h1>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 rounded">
              Operational
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real geospatial intelligence platform • 30m Landsat remote sensing & field photo interpretation
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRefresh}
            className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-700" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Button 1: Add Geo-tagged Image */}
          <Link
            href="/interventions/add"
            className="px-3 py-2 bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            id="add-geotagged-image-btn"
          >
            <Camera className="w-4 h-4 text-sky-700" />
            <span>Upload Field Photo</span>
          </Link>

          {/* Button 2: Open Map Explorer */}
          <Link
            href="/map"
            className="px-3.5 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            id="open-map-explorer-btn"
          >
            <Compass className="w-4 h-4 text-emerald-300" />
            <span>Open WebGIS Map</span>
          </Link>
        </div>
      </div>

      {/* Error alert if backend unreachable */}
      {error && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded text-xs font-medium">
          {error}
        </div>
      )}

      {/* 1. 5 KPI STAT CARDS */}
      <section aria-label="Key Performance Indicators">
        <StatCards stats={stats} loading={loading} />
      </section>

      {/* 2. RECHARTS VISUALIZATION GRIDS */}
      <section aria-label="Analytical Visualizations">
        <Charts />
      </section>

      {/* 3. MAPPED OBSERVATIONS TELEMETRY */}
      <section aria-label="Mapped Observations">
        <MappedObservationsTable />
      </section>

      {/* 4. RECENT OPERATIONAL TABLES */}
      <section className="space-y-5" aria-label="Recent Operational Records">
        {/* Recent Interventions Table */}
        <RecentInterventionsTable />

        {/* Recent Analysis Table */}
        <RecentAnalysisTable />
      </section>
    </AppLayout>
  );
}
