"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

// Extend Leaflet types for the heat layer
declare module "leaflet" {
  function heatLayer(
    latlngs: [number, number, number][],
    options?: {
      radius?: number;
      blur?: number;
      maxZoom?: number;
      max?: number;
      minOpacity?: number;
      gradient?: Record<number, string>;
    }
  ): L.Layer;
}

interface HeatMapLayerProps {
  /** Array of [lat, lng, intensity] — intensity should be 0–1 */
  points: [number, number, number][];
  /** Pixel radius of each data point */
  radius?: number;
  /** Gaussian blur radius in pixels */
  blur?: number;
  /** Maximum zoom level at which heatmap is full intensity */
  maxZoom?: number;
  /** Minimum opacity of the heatmap */
  minOpacity?: number;
  /** Whether this layer is visible */
  visible?: boolean;
  /** Colour gradient — keys are 0–1, values are CSS colours */
  gradient?: Record<number, string>;
}

/**
 * Classic vibrant heat map gradient — matches professional GIS heatmaps.
 * Transparent edges → green halo → yellow transition → orange buildup → bold red core.
 * Inspired by the Google Maps / ISRO Bhuvan style.
 */
export const LST_GRADIENT: Record<number, string> = {
  0.0: "rgba(0, 0, 255, 0)",        // fully transparent — no data
  0.05: "rgba(0, 0, 255, 0.08)",     // faintest blue tinge
  0.1: "rgba(0, 100, 255, 0.2)",     // cool blue edge
  0.2: "rgba(0, 180, 255, 0.4)",     // cyan fringe
  0.3: "rgba(0, 210, 140, 0.55)",    // teal-green transition
  0.4: "rgba(50, 220, 50, 0.65)",    // vivid green
  0.5: "rgba(160, 230, 50, 0.7)",    // yellow-green
  0.6: "rgba(255, 240, 0, 0.78)",    // bright yellow
  0.7: "rgba(255, 180, 0, 0.85)",    // warm orange
  0.8: "rgba(255, 120, 0, 0.9)",     // deep orange
  0.9: "rgba(255, 50, 0, 0.95)",     // strong red
  1.0: "rgba(200, 0, 0, 1.0)",       // saturated dark red — hotspot core
};

/**
 * Intervention density gradient — vivid green with transparent outer edges.
 */
export const INTERVENTION_GRADIENT: Record<number, string> = {
  0.0: "rgba(0, 180, 80, 0)",        // fully transparent
  0.1: "rgba(0, 200, 100, 0.15)",    // faint green edge
  0.2: "rgba(50, 220, 100, 0.3)",    // light green halo
  0.35: "rgba(80, 200, 80, 0.5)",    // medium green
  0.5: "rgba(50, 180, 50, 0.65)",    // forest green
  0.65: "rgba(255, 220, 0, 0.75)",   // yellow transition
  0.8: "rgba(255, 140, 0, 0.85)",    // orange buildup
  0.9: "rgba(240, 60, 20, 0.92)",    // red-orange
  1.0: "rgba(200, 0, 0, 1.0)",       // dark red — hotspot core
};

export default function HeatMapLayer({
  points,
  radius = 45,
  blur = 30,
  maxZoom = 18,
  minOpacity = 0.55,
  visible = true,
  gradient = LST_GRADIENT,
}: HeatMapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Remove previous layer if it exists
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || points.length === 0) return;

    const heat = L.heatLayer(points, {
      radius,
      blur,
      maxZoom,
      max: 1.0,
      minOpacity,
      gradient,
    });

    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, radius, blur, maxZoom, minOpacity, visible, gradient]);

  return null;
}
