"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  MapPin,
  Compass,
  LineChart,
  FileSpreadsheet,
  ChevronDown,
  Layers,
  Database,
  ShieldAlert,
} from "lucide-react";
import { fetchWatersheds, WatershedSummary } from "@/lib/api";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [watersheds, setWatersheds] = useState<WatershedSummary[]>([]);
  const [selectedWatershed, setSelectedWatershed] = useState("all");

  useEffect(() => {
    fetchWatersheds()
      .then((data) => setWatersheds(data))
      .catch((err) => console.error("Error fetching watersheds in sidebar:", err));
  }, []);

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: "Live",
    },
    {
      name: "Projects",
      href: "/projects",
      icon: FolderKanban,
      badge: `${watersheds.length} Active`,
    },
    {
      name: "WebGIS Map",
      href: "/map",
      icon: Compass,
      badge: "GIS View",
    },
    {
      name: "Interventions",
      href: "/interventions",
      icon: MapPin,
    },
    {
      name: "Analysis",
      href: "/analysis",
      icon: LineChart,
      badge: "Landsat 30m",
    },
    {
      name: "Data Quality",
      href: "/quality",
      icon: ShieldAlert,
      badge: "QC & CLIP",
    },
    {
      name: "Reports",
      href: "/reports",
      icon: FileSpreadsheet,
      badge: "MIS Export",
    },
    {
      name: "Data Sources",
      href: "/sources",
      icon: Database,
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 z-20 lg:hidden backdrop-blur-2xs transition-opacity"
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 lg:top-[93px] left-0 h-full lg:h-[calc(100vh-93px)] w-64 bg-[#f8fafc] border-r border-slate-300 flex flex-col z-20 transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Project Selector Box */}
        <div className="p-3 bg-slate-100 border-b border-slate-300">
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Watershed Scope</span>
            <span className="text-[10px] text-emerald-700 font-semibold lowercase">
              {watersheds.length > 0 ? `${watersheds.length} monitored` : "no data"}
            </span>
          </label>
          <div className="relative">
            <select
              value={selectedWatershed}
              onChange={(e) => setSelectedWatershed(e.target.value)}
              className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded px-2.5 py-1.5 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 shadow-2xs cursor-pointer"
            >
              <option value="all">All Monitored Watersheds</option>
              {watersheds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.district ? `(${w.district})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-2.5 pointer-events-none" />
          </div>
          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <Database className="w-3 h-3 text-slate-400" />
            <span>Watersheds: {watersheds.length} loaded</span>
          </p>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-2 overflow-y-auto">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            System Navigation
          </div>
          <nav className="space-y-0.5 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => {
                    if (onClose) onClose();
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded border transition-colors ${
                    isActive
                      ? "bg-[#164e63] text-white border-[#0e3b4d] shadow-2xs font-semibold"
                      : "text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? "text-emerald-300" : "text-slate-500 group-hover:text-slate-700"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Active Map Layers Info */}
          <div className="mt-5 px-3">
            <div className="p-2.5 bg-white border border-slate-300 rounded text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px] mb-1.5 pb-1 border-b border-slate-200">
                <Layers className="w-3.5 h-3.5 text-emerald-700" />
                <span>Active Data Layers</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-600">
                <li className="flex items-center justify-between">
                  <span>PostGIS Catchment Boundary</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-600" title="Active" />
                </li>
                <li className="flex items-center justify-between">
                  <span>Geo-Tagged Field Photos</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-600" title="Active" />
                </li>
                <li className="flex items-center justify-between">
                  <span>Landsat 30m NDVI / NDWI</span>
                  <span className="w-2 h-2 rounded-full bg-sky-600" title="Active" />
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* System Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-300 text-[11px] text-slate-600">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">
              System Build
            </span>
            <span className="font-mono text-[10px] bg-slate-200 px-1 rounded text-slate-700 font-bold">
              v1.0.0
            </span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Integrated PostGIS + FastAPI + 30m Satellite Remote Sensing.
          </p>
        </div>
      </aside>
    </>
  );
}
