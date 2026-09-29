"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { LogOut, ShieldCheck, Clock, Radio } from "lucide-react";
import VaruniLogo from "@/components/common/VaruniLogo";
import { fetchCurrentUser, CurrentUser } from "@/lib/api";

interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => setCurrentUser(u))
      .catch(() => {
        // Fallback placeholder when unauthenticated
        setCurrentUser({
          id: "dev-01",
          username: "dev_user",
          name: "Unauthenticated (dev)",
          role: "Field Officer",
          organization: "Pilot Division"
        });
      });
  }, []);

  const displayName = user?.full_name || user?.username || currentUser?.name || "System User";
  const displayRole = user?.role ? user.role.toUpperCase().replace("_", " ") : (currentUser?.role || "Field Officer");

  return (
    <header className="w-full bg-white border-b border-slate-300 shadow-xs z-30 sticky top-0">
      {/* Top Institutional Bar */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-200 bg-slate-50/60">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Toggle Sidebar"
              aria-label="Toggle Navigation Sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Official VARUNI Branding Crest */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <VaruniLogo size="md" showText={true} />
          </Link>
        </div>

        {/* Right Section: System status, User details, and Logout */}
        <div className="flex items-center gap-4 text-xs">
          {/* Telemetry pill */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-sky-50 border border-sky-200 rounded text-sky-800">
            <Radio className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
            <span className="font-medium">Sensor Stream: Landsat 8/9 (30m OLI)</span>
            <span className="inline-block w-1.5 h-1.5 bg-emerald-600 rounded-full" />
          </div>

          {/* User profile */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs">
              {displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="hidden sm:block text-left">
              <div className="font-semibold text-slate-900 leading-tight">
                {displayName}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {displayRole}
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded font-medium transition-colors shadow-2xs"
              title="Logout from VARUNI"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-[11px]">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-header Ribbon */}
      <div className="px-4 py-1.5 bg-[#0f2d59] text-white flex items-center justify-between text-[11px] font-medium tracking-wide">
        <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>National Geo-Platform</span>
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-200">
            Catchment Monitoring: <strong className="text-white">PostGIS Spatial Verification</strong>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3 text-slate-300">
          <span className="flex items-center gap-1 text-[10px]">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Real-time DB Sync</span>
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-[10px] bg-sky-900/80 px-2 py-0.5 rounded border border-sky-700/60 text-sky-200">
            FastAPI + PostGIS Core
          </span>
        </div>
      </div>
    </header>
  );
}
