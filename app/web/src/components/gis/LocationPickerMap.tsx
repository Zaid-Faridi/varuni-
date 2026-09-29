"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

interface LocationPickerMapProps {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
  isGpsExtracted?: boolean;
}

// Controller to fly when coordinates change externally
function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 14, { duration: 0.8 });
  }, [center, map]);
  return null;
}

// Click handler on map
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  isGpsExtracted = false,
}: LocationPickerMapProps) {
  const markerRef = useRef<L.Marker | null>(null);

  // Custom draggable Leaflet pin
  const customPinIcon = useMemo(() => {
    const bgColor = isGpsExtracted ? "#166534" : "#0284c7";
    const symbol = isGpsExtracted ? "GPS" : "📍";

    return L.divIcon({
      className: "location-picker-pin",
      html: `
        <div style="position:relative;width:32px;height:32px;cursor:grab;">
          <div style="width:30px;height:30px;background:${bgColor};border:2px solid #ffffff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,0.4), 0 0 0 3px rgba(2, 132, 199, 0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;font-family:sans-serif;">
            ${symbol}
          </div>
          <div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bgColor};"></div>
        </div>
      `,
      iconSize: [32, 36],
      iconAnchor: [16, 36],
    });
  }, [isGpsExtracted]);

  // Event handlers for dragging marker
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          onChange(pos.lat, pos.lng);
        }
      },
    }),
    [onChange]
  );

  return (
    <div className="w-full h-64 rounded border border-slate-300 overflow-hidden relative shadow-2xs">
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full z-10"
        style={{ height: "100%", width: "100%" }}
      >
        <MapCenterController center={[latitude, longitude]} />
        <MapClickHandler onClick={onChange} />

        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri, Earthstar Geographics, ISRO"
          maxZoom={19}
        />

        <Marker
          draggable={true}
          eventHandlers={eventHandlers}
          position={[latitude, longitude]}
          ref={markerRef}
          icon={customPinIcon}
        />
      </MapContainer>

      {/* Helper floating pill */}
      <div className="absolute bottom-2 left-2 z-20 bg-slate-900/90 text-white text-[10px] font-mono px-2.5 py-1 rounded border border-slate-700 shadow-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Click map or drag pin to adjust coordinates</span>
      </div>
    </div>
  );
}
