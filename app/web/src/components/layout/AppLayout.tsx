"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { RefreshCw } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex flex-col items-center justify-center font-sans text-slate-800 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-800" />
        <p className="text-xs font-mono font-semibold text-slate-600">
          Verifying Session & Geospatial Authorization...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <Header
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        isSidebarOpen={sidebarOpen}
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex w-full">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>

      {/* Institutional Footer */}
      <footer className="w-full bg-white border-t border-slate-300 py-3 px-6 text-center text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-slate-800">VARUNI Geospatial Intelligence System</span>
          <span>•</span>
          <span>Logged in as: <strong>{user?.full_name || user?.username}</strong> ({user?.role})</span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          USGS Landsat 30m + Copernicus DEM • PostGIS RBAC Enforced
        </div>
      </footer>
    </div>
  );
}
