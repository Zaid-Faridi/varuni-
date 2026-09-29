"use client";

import React from "react";

interface VaruniLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export default function VaruniLogo({
  size = "md",
  showText = true,
  className = "",
}: VaruniLogoProps) {
  const sizeMap = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12",
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Official VARUNI Crest SVG */}
      <div
        className={`${sizeMap[size]} rounded border-2 border-emerald-700 bg-gradient-to-br from-[#0a2342] via-[#0f2d59] to-[#166534] flex items-center justify-center p-1.5 shadow-xs shrink-0 relative overflow-hidden`}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Orbital Satellite Ellipse */}
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="18"
            stroke="#38bdf8"
            strokeWidth="3.5"
            strokeDasharray="6 3"
            transform="rotate(-25 50 50)"
            opacity="0.85"
          />

          {/* Sacred Ridge-to-Valley Topographic Contours */}
          <path
            d="M15 78 C 30 65, 45 75, 55 60 C 65 45, 80 55, 90 78"
            stroke="#22c55e"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M22 84 C 35 74, 48 80, 58 70 C 68 60, 80 68, 85 84"
            stroke="#15803d"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />

          {/* Central Water Confluence Drop / Basin Core */}
          <path
            d="M50 18 C 50 18, 32 44, 32 58 C 32 68, 40 76, 50 76 C 60 76, 68 68, 68 58 C 68 44, 50 18, 50 18 Z"
            fill="url(#varuniWaterGradient)"
            stroke="#ffffff"
            strokeWidth="2.5"
          />

          {/* Satellite Sensor Beacon Node */}
          <circle cx="78" cy="32" r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />

          {/* Gradients */}
          <defs>
            <linearGradient id="varuniWaterGradient" x1="50" y1="18" x2="50" y2="76" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="0.6" stopColor="#0284c7" />
              <stop offset="1" stopColor="#0369a1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-black tracking-tight text-slate-900 font-sans text-base">
              VARUNI
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium tracking-tight">
            Watershed Monitoring & Efficiency Optimizing System
          </p>
        </div>
      )}
    </div>
  );
}
