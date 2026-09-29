"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3, PieChart as PieIcon, Layers } from "lucide-react";
import { fetchInterventions, InterventionInfo } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  verified: "#166534",   // Dark green
  observed: "#0284c7",   // Sky blue
  proposed: "#64748b",   // Slate gray
  needs_review: "#d97706", // Amber
  archived: "#94a3b8",   // Light slate
};

export default function Charts() {
  const [interventions, setInterventions] = useState<InterventionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterventions()
      .then((data) => setInterventions(data))
      .catch((err) => console.error("Error loading interventions for charts:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-300 rounded p-4 h-80 flex items-center justify-center text-slate-400 text-xs animate-pulse">
          Loading Real Intervention Distribution...
        </div>
        <div className="bg-white border border-slate-300 rounded p-4 h-80 flex items-center justify-center text-slate-400 text-xs animate-pulse">
          Loading Verification Status Distribution...
        </div>
      </div>
    );
  }

  // Aggregate by type
  const typeMap: Record<string, { total: number; verified: number }> = {};
  const statusMap: Record<string, number> = {};

  interventions.forEach((item) => {
    const t = item.type || "other";
    const formattedType = t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (!typeMap[formattedType]) {
      typeMap[formattedType] = { total: 0, verified: 0 };
    }
    typeMap[formattedType].total += 1;
    if (item.status === "verified") {
      typeMap[formattedType].verified += 1;
    }

    const s = item.status || "proposed";
    statusMap[s] = (statusMap[s] || 0) + 1;
  });

  const typeData = Object.entries(typeMap).map(([type, counts]) => ({
    type,
    verified: counts.verified,
    unverified: counts.total - counts.verified,
  }));

  const statusData = Object.entries(statusMap).map(([name, count]) => ({
    name: name.replace(/_/g, " ").toUpperCase(),
    value: count,
    color: STATUS_COLORS[name] || "#64748b",
  }));

  const totalCount = interventions.length;
  const verifiedCount = statusMap["verified"] || 0;
  const verifiedPct = totalCount > 0 ? ((verifiedCount / totalCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 1. INTERVENTION TYPE BAR CHART */}
      <div className="lg:col-span-2 bg-white border border-slate-300 rounded p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-sm">
                Intervention Types & Status Breakdown
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Geo-tagged field structures categorized by physical type and review status
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-700" /> Verified
            </span>
            <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-500" /> Observed / Proposed
            </span>
          </div>
        </div>

        <div className="h-72 w-full flex items-center justify-center">
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="type" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: "#475569" }} />
                <YAxis tick={{ fontSize: 11, fill: "#475569" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#cbd5e1",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="verified" name="Verified" stackId="a" fill="#166534" />
                <Bar dataKey="unverified" name="Observed/Proposed" stackId="a" fill="#64748b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-10">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">No Interventions Recorded</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Upload geocoded photos or record field structures to view analytics.</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. VERIFICATION STATUS PIE CHART */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 mb-2 border-b border-slate-200">
            <PieIcon className="w-4 h-4 text-sky-800" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Verification Status</h3>
              <p className="text-[11px] text-slate-500">Database field audit distribution</p>
            </div>
          </div>

          <div className="h-52 w-full relative flex items-center justify-center">
            {statusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`${val} structures`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-slate-900">{verifiedPct}%</span>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Verified</span>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-500">No Status Data</p>
                <p className="text-[11px] text-slate-400">Empty Database</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Breakdown Legend */}
        {statusData.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
            {statusData.map((status) => (
              <div key={status.name} className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: status.color }} />
                  <span className="font-medium text-slate-800">{status.name}</span>
                </div>
                <span className="font-mono text-slate-600 font-semibold">{status.value} units</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
