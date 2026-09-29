"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Satellite,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Cpu,
} from "lucide-react";
import { fetchAnalysisJobs, AnalysisJob } from "@/lib/api";

export default function RecentAnalysisTable() {
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalysisJobs()
      .then((data) => setJobs(data))
      .catch((err) => console.error("Error fetching analysis jobs:", err))
      .finally(() => setLoading(false));
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            Succeeded
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300 animate-pulse">
            <Clock className="w-3 h-3 text-sky-700" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertTriangle className="w-3 h-3 text-rose-700" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            Queued
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded shadow-2xs overflow-hidden">
      {/* Table Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-800" />
            <h3 className="font-bold text-slate-900 text-sm">
              Satellite Analysis Pipeline Jobs
            </h3>
            <span className="bg-sky-100 text-sky-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold border border-sky-200">
              Landsat 8/9 C2L2 Feed
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Zonal mean spectral index calculation and seasonal deviation detection
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Cpu className="w-3 h-3 text-emerald-600" />
            <span>Analysis Engine: Operational</span>
          </span>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-300 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Job ID</th>
              <th className="py-2.5 px-3">Analysis Type</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Stage</th>
              <th className="py-2.5 px-3">Progress</th>
              <th className="py-2.5 px-3">Started At</th>
              <th className="py-2.5 px-3">Completed At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  Loading analysis jobs from backend...
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  No analysis jobs submitted yet. Trigger ingestion or seasonal deviation jobs to populate.
                </td>
              </tr>
            ) : (
              jobs.map((job, idx) => (
                <tr
                  key={job.id}
                  className={`hover:bg-sky-50/50 transition-colors ${
                    idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {job.id.slice(0, 8)}...
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 capitalize">
                    {job.type.replace(/_/g, " ")}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 capitalize">
                    {job.stage || "—"}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${(job.progress || 0) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-800">
                        {Math.round((job.progress || 0) * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {job.started_at ? job.started_at.replace("T", " ").slice(0, 19) : "—"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {job.completed_at ? job.completed_at.replace("T", " ").slice(0, 19) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-medium">
        <span>Landsat 8/9 Automated Processing Jobs</span>
        <span className="font-mono text-[10px]">Verified Pipeline</span>
      </div>
    </div>
  );
}
