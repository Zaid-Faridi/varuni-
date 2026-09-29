"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  RefreshCw,
  Info,
  Clock,
  ShieldCheck,
  AlertCircle,
  Database,
  BarChart3,
} from "lucide-react";
import { fetchWatershedLulc, LulcStatsResponse, LulcClassItem } from "@/lib/api";

interface LulcCardProps {
  watershedId?: string;
  watershedName?: string;
}

// Visual color palette tailored for remote sensing LULC classes
const LULC_COLORS: Record<string, string> = {
  l01: "bg-rose-500 text-rose-500 border-rose-600", // Built-up
  l02: "bg-amber-500 text-amber-500 border-amber-600", // Kharif
  l03: "bg-yellow-500 text-yellow-500 border-yellow-600", // Rabi
  l04: "bg-lime-500 text-lime-500 border-lime-600", // Zaid
  l05: "bg-emerald-500 text-emerald-500 border-emerald-600", // Double crop
  l06: "bg-orange-400 text-orange-400 border-orange-500", // Fallow
  l07: "bg-teal-500 text-teal-500 border-teal-600", // Plantation
  l08: "bg-green-700 text-green-700 border-green-800", // Deciduous
  l09: "bg-emerald-800 text-emerald-800 border-emerald-900", // Evergreen
  l10: "bg-lime-700 text-lime-700 border-lime-800", // Scrub Forest
  l11: "bg-emerald-600 text-emerald-600 border-emerald-700", // Forest Plantation
  l12: "bg-green-400 text-green-400 border-green-500", // Grassland
  l13: "bg-amber-700 text-amber-700 border-amber-800", // Wasteland
  l14: "bg-red-700 text-red-700 border-red-800", // Gullied
  l15: "bg-yellow-600 text-yellow-600 border-yellow-700", // Scrubland
  l16: "bg-sky-500 text-sky-500 border-sky-600", // Water bodies
  l17: "bg-blue-600 text-blue-600 border-blue-700", // Stream/Canal
  l18: "bg-cyan-600 text-cyan-600 border-cyan-700", // Wetlands
  l19: "bg-slate-200 text-slate-400 border-slate-300", // Snow
  l20: "bg-orange-600 text-orange-600 border-orange-700", // Shifting
  l21: "bg-stone-600 text-stone-600 border-stone-700", // Mining
  l22: "bg-cyan-700 text-cyan-700 border-cyan-800", // Coastal Wetland
  l23: "bg-stone-400 text-stone-400 border-stone-500", // Salt pan
};

export default function LulcCard({ watershedId, watershedName }: LulcCardProps) {
  const [data, setData] = useState<LulcStatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!watershedId) {
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetchWatershedLulc(watershedId, isRefresh);
      setData(res);
    } catch (err: any) {
      console.error("LULC fetch error:", err);
      setError(err.message || "Failed to retrieve Bhuvan LULC context data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [watershedId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  if (!watershedId) {
    return (
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-slate-600 text-xs font-semibold">
          <Layers className="w-4 h-4 text-emerald-800" />
          <span>Bhuvan LULC 50K Land Cover Context</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Select a watershed to inspect its Land Use / Land Cover baseline.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-300 rounded shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="bg-[#0f2d59] text-white px-4 py-3 border-b border-slate-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <div>
            <h2 className="text-xs font-bold tracking-wide">
              Bhuvan LULC 50K AOI Context
            </h2>
            <p className="text-[10px] text-slate-300">
              {watershedName || "Catchment AOI Baseline"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.cached && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono bg-sky-950 text-sky-200 px-1.5 py-0.5 rounded border border-sky-800">
              <Database className="w-2.5 h-2.5" />
              Cached
            </span>
          )}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            title="Re-query live Bhuvan LULC API"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Institutional Disclaimer Banner */}
        <div className="p-2.5 bg-amber-50/80 border border-amber-300/80 rounded text-[11px] text-amber-950 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <span className="font-bold">Note:</span> Periodic map product, not current conditions.
            LULC units ({data?.units || "unverified"}) and vintage ({data?.vintage || "year not stated"}) are unverified by NRSC metadata.
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-8 flex flex-col items-center justify-center text-slate-500 space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-700" />
            <span className="text-xs font-medium">Fetching Bhuvan 50K AOI raster statistics...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Bhuvan Context Error</div>
              <div className="text-[11px] mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {data && !loading && (data.empty || !data.classes || data.classes.length === 0) && (
          <div className="py-8 text-center text-slate-500 space-y-2">
            <Layers className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs font-bold text-slate-700">No LULC Data Returned</div>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Bhuvan LULC 50K service returned no land cover classes for this watershed boundary.
            </p>
          </div>
        )}

        {/* Main Content: Bar Chart & Summary */}
        {data && !loading && data.classes && data.classes.length > 0 && (
          <div className="space-y-4">
            {/* Top Stat Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Sum</span>
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {data.total_area.toFixed(2)} <span className="text-[10px] font-sans text-slate-500">({data.units})</span>
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">LULC Classes</span>
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {data.classes.length} <span className="text-[10px] font-sans text-slate-500">detected</span>
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Source Vintage</span>
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {data.vintage}
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Provider Token</span>
                <span className="text-xs font-bold text-emerald-800 font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Token {data.token_used || "B"}
                </span>
              </div>
            </div>

            {/* Visual Class Bar Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-slate-600" />
                  Land Cover Distribution (50K Classification)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Area / Share</span>
              </div>

              {/* Stacked Proportional Bar */}
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-200">
                {data.classes.map((cls) => {
                  const colorClass = LULC_COLORS[cls.code]?.split(" ")[0] || "bg-slate-400";
                  return (
                    <div
                      key={cls.code}
                      className={`${colorClass} transition-all duration-300`}
                      style={{ width: `${Math.max(cls.percentage, 0.5)}%` }}
                      title={`${cls.name} (${cls.code}): ${cls.area} (${cls.percentage}%)`}
                    />
                  );
                })}
              </div>

              {/* Class-wise List */}
              <div className="space-y-1.5 pt-2 max-h-56 overflow-y-auto pr-1">
                {data.classes.map((cls) => {
                  const colorDot = LULC_COLORS[cls.code]?.split(" ")[0] || "bg-slate-400";
                  return (
                    <div
                      key={cls.code}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${colorDot} shrink-0`} />
                        <span className="font-semibold text-slate-800 truncate" title={cls.name}>
                          {cls.name}
                        </span>
                        <code className="text-[10px] font-mono text-slate-400 bg-white px-1 py-0.2 rounded border border-slate-200 shrink-0">
                          {cls.code}
                        </code>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                        <span className="text-slate-600">{cls.area.toFixed(2)}</span>
                        <span className="font-bold text-slate-900 w-12 text-right">
                          {cls.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Provenance & Metadata Details */}
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
              <div>
                Source: <span className="text-slate-700 font-semibold">{data.source}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Fetched: {new Date(data.fetched_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
