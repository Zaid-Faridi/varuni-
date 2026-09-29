"use client";

import React from "react";
import {
  Layers,
  MapPin,
  Camera,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { DashboardStats } from "@/lib/api";

interface StatCardsProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

export default function StatCards({ stats, loading }: StatCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded p-3.5 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Monitored Watersheds",
      value: stats ? stats.total_watersheds.toString() : "0",
      subtext: stats && stats.total_watersheds > 0 ? "PostGIS verified polygons" : "No watersheds loaded yet",
      icon: Layers,
      borderColor: "border-slate-300",
      accentBg: "bg-slate-100",
      iconColor: "text-slate-700",
      pillText: stats && stats.total_watersheds > 0 ? "Verified Boundary" : "Empty",
      pillClass: "bg-slate-200 text-slate-800",
    },
    {
      title: "Field Interventions",
      value: stats ? stats.total_interventions.toString() : "0",
      subtext: stats && stats.total_interventions > 0 ? "Observed water/soil structures" : "No interventions recorded",
      icon: MapPin,
      borderColor: "border-sky-300",
      accentBg: "bg-sky-50",
      iconColor: "text-sky-700",
      pillText: "Field Observations",
      pillClass: "bg-sky-100 text-sky-800",
    },
    {
      title: "Field Photographs",
      value: stats ? stats.total_images.toString() : "0",
      subtext: stats && stats.total_images > 0 ? "EXIF GPS geocoded photos" : "No photos uploaded",
      icon: Camera,
      borderColor: "border-emerald-300",
      accentBg: "bg-emerald-50",
      iconColor: "text-emerald-700",
      pillText: "Field Imagery",
      pillClass: "bg-emerald-100 text-emerald-800 font-bold",
    },
    {
      title: "Mean Catchment NDVI",
      value: stats && stats.avg_ndvi !== null ? stats.avg_ndvi.toFixed(3) : "No data",
      subtext: stats && stats.avg_ndvi !== null ? "Landsat 30m Level-2 index" : "Requires satellite ingestion",
      icon: Activity,
      borderColor: "border-emerald-300",
      accentBg: "bg-emerald-50",
      iconColor: "text-emerald-700",
      pillText: stats && stats.avg_ndvi !== null ? "Landsat 8/9" : "Pending Ingest",
      pillClass: stats && stats.avg_ndvi !== null ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
    },
    {
      title: "Quality Alerts",
      value: stats ? stats.quality_alerts.toString() : "0",
      subtext: stats && stats.quality_alerts > 0 ? "Cloud occlusion / missing GPS" : "All data validated",
      icon: AlertTriangle,
      borderColor: "border-amber-300",
      accentBg: "bg-amber-50",
      iconColor: "text-amber-700",
      pillText: stats && stats.quality_alerts > 0 ? "Action Required" : "Clear",
      pillClass: stats && stats.quality_alerts > 0 ? "bg-amber-100 text-amber-800 font-bold" : "bg-slate-100 text-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className={`bg-white border ${card.borderColor} rounded p-3.5 shadow-2xs flex flex-col justify-between hover:shadow-xs transition-shadow`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {card.title}
              </span>
              <div className={`p-1.5 rounded ${card.accentBg}`}>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black text-slate-900 tracking-tight font-sans">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                {card.subtext}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <span className={`px-1.5 py-0.5 rounded font-medium ${card.pillClass}`}>
                {card.pillText}
              </span>
              <span className="text-slate-400 font-mono">Live Telemetry</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
