"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { fetchWatersheds, WatershedSummary } from "@/lib/api";
import {
  FolderKanban,
  Search,
  MapPin,
  Layers,
  Compass,
  ArrowRight,
  Activity,
} from "lucide-react";

function ProjectsContent() {
  const router = useRouter();
  const [watersheds, setWatersheds] = useState<WatershedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("all");

  useEffect(() => {
    fetchWatersheds()
      .then((data) => setWatersheds(data))
      .catch((err) => console.error("Error fetching watersheds:", err))
      .finally(() => setLoading(false));
  }, []);

  const availableStates = useMemo(() => {
    const states = watersheds.map((w) => w.state).filter((s): s is string => Boolean(s));
    return Array.from(new Set(states)).sort();
  }, [watersheds]);

  const filteredWatersheds = useMemo(() => {
    return watersheds.filter((w) => {
      const matchesSearch =
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.district || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.state || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.source || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchesState = selectedState === "all" || w.state === selectedState;
      return matchesSearch && matchesState;
    });
  }, [watersheds, searchTerm, selectedState]);

  return (
    <AppLayout>
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* Header Bar */}
        <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-emerald-700" />
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Monitored Watersheds Directory
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 rounded">
                PostGIS Real Data
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Real watershed boundaries loaded into PostGIS database with UTM geodesic area calculations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1 rounded">
              {filteredWatersheds.length} Watersheds Monitored
            </span>
            <Link
              href="/map"
              className="px-3.5 py-1.5 bg-[#166534] hover:bg-[#14532d] text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Open WebGIS</span>
            </Link>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-slate-300 rounded p-3.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search watersheds by name, district, or state..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded pl-8 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700"
            />
          </div>

          {availableStates.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 whitespace-nowrap">State:</label>
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
              >
                <option value="all">All States ({availableStates.length})</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          )}

          {(searchTerm || selectedState !== "all") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedState("all");
              }}
              className="text-xs text-rose-700 hover:text-rose-900 font-semibold px-2 py-1.5"
            >
              Reset
            </button>
          )}
        </div>

        {/* Watershed Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full bg-white border border-slate-300 rounded p-8 text-center text-slate-400 text-xs">
              Loading watersheds from database...
            </div>
          ) : filteredWatersheds.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-300 rounded p-8 text-center text-slate-500 text-xs space-y-2">
              <Layers className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">No Watersheds Loaded in Database</p>
              <p className="text-slate-500 max-w-md mx-auto">
                Load an official boundary GeoJSON using the CLI:
                <code className="block bg-slate-100 p-2 rounded text-slate-800 font-mono text-[11px] mt-2">
                  python -m tools.load_watershed --geojson path/to/boundary.geojson --name &quot;Pilot Catchment&quot;
                </code>
              </p>
            </div>
          ) : (
            filteredWatersheds.map((w) => (
              <div
                key={w.id}
                className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col justify-between hover:shadow-xs hover:border-slate-400 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                    <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded border border-sky-300">
                      ID: {w.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      {w.source || "Survey"}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base tracking-tight group-hover:text-emerald-900 transition-colors">
                    {w.name}
                  </h3>

                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      <strong>{w.district || "District"}</strong>, {w.state || "State"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">
                        Area (UTM Projected)
                      </span>
                      <span className="font-bold text-slate-900 text-sm">
                        {w.area_sqkm ? `${w.area_sqkm.toFixed(1)} km²` : "No data"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">
                        Current NDVI
                      </span>
                      <span className="font-bold text-emerald-800 text-sm">
                        {w.ndvi_current !== null && w.ndvi_current !== undefined ? w.ndvi_current.toFixed(3) : "No data"}
                      </span>
                    </div>
                  </div>

                  {w.elevation_min !== null && w.elevation_max !== null && (
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Elevation: {w.elevation_min}m – {w.elevation_max}m</span>
                    </div>
                  )}
                </div>

                <div className="pt-3.5 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    href={`/map?watershed=${w.id}`}
                    className="px-3.5 py-1.5 bg-[#166534] hover:bg-[#14532d] text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <span>Inspect on WebGIS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs">Loading Directory...</div>}>
      <ProjectsContent />
    </Suspense>
  );
}
