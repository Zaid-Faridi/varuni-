"use client";

import React, { useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import RecentInterventionsTable from "@/components/dashboard/RecentInterventionsTable";
import ActionNoticeModal from "@/components/dashboard/ActionNoticeModal";
import { MapPin, Camera, Download, Filter } from "lucide-react";

export default function InterventionsPage() {
  const [modalType, setModalType] = useState<"map" | "upload" | null>(null);

  return (
    <AppLayout>
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Geo-Tagged Field Interventions Catalog
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete inventory of physical soil, water, and afforestation structures
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/interventions/add"
            className="px-3.5 py-2 bg-[#166534] hover:bg-[#14532d] text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            id="add-geotagged-image-btn"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-300" />
            <span>Add Geo-tagged Image</span>
          </Link>
        </div>
      </div>

      <RecentInterventionsTable />

      <ActionNoticeModal
        type={modalType}
        onClose={() => setModalType(null)}
      />
    </AppLayout>
  );
}
