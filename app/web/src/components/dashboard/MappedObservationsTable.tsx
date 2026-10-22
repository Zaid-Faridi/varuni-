"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  Search,
  MapPin,
  Compass,
  Eye,
  Calendar,
  Layers,
} from "lucide-react";
import { fetchInterventions, InterventionInfo } from "@/lib/api";

interface MappedObservationsTableProps {
  onInspectObservation?: (item: InterventionInfo) => void;
}

export default function MappedObservationsTable({
  onInspectObservation,
}: MappedObservationsTableProps) {
  const [records, setRecords] = useState<InterventionInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterventions()
      .then((data) => setRecords(data))
      .catch((err) => console.error("Error loading observations:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredRecords = records.filter((item) => {
    const name = item.name || "";
    const type = item.type || "";
    const wsName = item.watershed_name || "";
    return (
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wsName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getStatusBadge = (rawStatus?: string) => {
    const status = (rawStatus || "OBSERVED").toUpperCase();
    switch (status) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>Verified</span>
          </span>
        );
      case "NEEDS_FIELD_VISIT":
      case "NEEDS_REVIEW":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            <span>Needs Visit</span>
          </span>
        );
      case "DISMISSED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>Dismissed</span>
          </span>
        );
      case "OBSERVED":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-950 border border-sky-300">
            <span className="w-2 h-2 rounded-full bg-sky-600" />
            <span>Observed</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded shadow-2xs overflow-hidden">
      {/* SECTION HEADER */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-800" />
            <h3 className="font-bold text-slate-900 text-sm">
              Mapped Field Observations
            </h3>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-mono font-bold border border-emerald-300">
              PostGIS Spatial Table
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Geocoded field photographs and physical water harvesting structures
          </p>
        </div>
      </div>

      {/* SEARCH TOOLBAR */}
      <div className="p-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search structure name, category, catchment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
          />
        </div>
      </div>

      {/* TABLE CONTENT */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-300 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Structure ID & Name</th>
              <th className="py-2.5 px-3">Catchment</th>
              <th className="py-2.5 px-3">Coordinates (Lat / Lon)</th>
              <th className="py-2.5 px-3">Observed Date</th>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  Loading field observations...
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  No mapped observations found. Upload field photos to populate.
                </td>
              </tr>
            ) : (
              filteredRecords.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`hover:bg-sky-50/60 transition-colors ${
                    idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  }`}
                >
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {getStatusBadge(item.review_status || item.status)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900">
                      {item.id.slice(0, 8)}...
                    </div>
                    <div className="text-slate-700 font-medium">
                      {item.name || item.type.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{item.watershed_name || "Catchment"}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                    {item.latitude && item.longitude ? (
                      <span className="flex items-center gap-1 font-semibold">
                        <MapPin className="w-3 h-3 text-emerald-700 shrink-0" />
                        {item.latitude.toFixed(4)}°N, {item.longitude.toFixed(4)}°E
                      </span>
                    ) : (
                      <span className="text-slate-400">No Coordinates</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{item.observed_at ? item.observed_at.split("T")[0] : "—"}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-[240px] truncate">
                    {item.description || "No description provided"}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <Link
                      href={`/interventions/${item.id}`}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded font-semibold text-[11px] inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3 h-3 text-emerald-700" />
                      <span>Inspect</span>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-2">
        <span>
          Displaying <strong>{filteredRecords.length}</strong> records
        </span>
        <Link
          href="/map"
          className="text-emerald-800 font-bold hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>View on WebGIS Map</span>
        </Link>
      </div>
    </div>
  );
}
