"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  Search,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  Clock,
  Eye,
  MapPin,
} from "lucide-react";
import { fetchInterventions, InterventionInfo } from "@/lib/api";

interface RecentInterventionsTableProps {
  onViewIntervention?: (item: InterventionInfo) => void;
}

export default function RecentInterventionsTable({
  onViewIntervention,
}: RecentInterventionsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords] = useState<InterventionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterventions()
      .then((data) => setRecords(data))
      .catch((err) => console.error("Error fetching interventions table:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredInterventions = records.filter((item) => {
    const name = item.name || "";
    const type = item.type || "";
    const wsName = item.watershed_name || "";
    const matchesSearch =
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wsName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            Verified
          </span>
        );
      case "needs_review":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertTriangle className="w-3 h-3 text-rose-700" />
            Needs Review
          </span>
        );
      case "observed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300">
            <Clock className="w-3 h-3 text-sky-700" />
            Observed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            Proposed
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded shadow-2xs overflow-hidden">
      {/* Table Header and Toolbar */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-emerald-800" />
            <h3 className="font-bold text-slate-900 text-sm">
              Recent Geo-Tagged Interventions
            </h3>
            <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
              {filteredInterventions.length} records
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Field surveyed structures stored in PostGIS database
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search name, type, basin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1.5 w-48 sm:w-56 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>

          {/* Status selector */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
            >
              <option value="all">All Statuses</option>
              <option value="verified">Verified</option>
              <option value="observed">Observed</option>
              <option value="needs_review">Needs Review</option>
              <option value="proposed">Proposed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-300 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Structure ID</th>
              <th className="py-2.5 px-3">Type & Name</th>
              <th className="py-2.5 px-3">Watershed</th>
              <th className="py-2.5 px-3">Coordinates</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Observed Date</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  Loading field interventions from PostGIS...
                </td>
              </tr>
            ) : filteredInterventions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  No interventions recorded in the database yet.
                </td>
              </tr>
            ) : (
              filteredInterventions.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`hover:bg-sky-50/50 transition-colors ${
                    idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  }`}
                >
                  <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {item.id.slice(0, 8)}...
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-900">{item.name || "Structure"}</div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Type: {item.type.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-700">
                    <span className="font-medium">{item.watershed_name || "Catchment"}</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {item.latitude && item.longitude ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-slate-400">No GPS</span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                    {item.observed_at ? item.observed_at.split("T")[0] : "—"}
                  </td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => onViewIntervention?.(item)}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-medium text-[11px] inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination / Footer Info */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-medium">
        <span>Showing {filteredInterventions.length} records</span>
        <span className="font-mono text-[10px]">PostGIS Spatial Layer</span>
      </div>
    </div>
  );
}
