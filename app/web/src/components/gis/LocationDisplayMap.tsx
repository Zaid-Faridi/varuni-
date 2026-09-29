"use client";

import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface LocationDisplayMapProps {
  latitude: number;
  longitude: number;
  title: string;
  type: string;
}

export default function LocationDisplayMap({
  latitude,
  longitude,
  title,
  type,
}: LocationDisplayMapProps) {
  const pinIcon = L.divIcon({
    className: "location-display-pin",
    html: `
      <div style="position:relative;width:30px;height:30px;">
        <div style="width:28px;height:28px;background:#166534;border:2px solid #ffffff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,0.4), 0 0 0 3px rgba(22, 101, 52, 0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:12px;font-weight:900;">
          ✓
        </div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });

  return (
    <div className="w-full h-64 rounded border border-slate-300 overflow-hidden relative shadow-2xs">
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        scrollWheelZoom={false}
        className="w-full h-full z-10"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri, Earthstar Geographics, ISRO"
          maxZoom={19}
        />
        <Marker position={[latitude, longitude]} icon={pinIcon}>
          <Popup>
            <div className="text-xs font-sans p-1">
              <strong className="block text-slate-900">{title}</strong>
              <span className="text-[10px] text-slate-500 font-mono">
                {latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E
              </span>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      <div className="absolute bottom-2 right-2 z-20 bg-slate-900/85 text-white text-[10px] font-mono px-2.5 py-1 rounded border border-slate-700 shadow-xs">
        {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E • EPSG:4326
      </div>
    </div>
  );
}
