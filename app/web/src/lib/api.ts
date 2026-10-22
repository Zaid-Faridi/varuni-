/**
 * API client for the VARUNI Watershed Geospatial Intelligence Platform.
 * Connects to FastAPI backend at port 8000.
 * Strict typing matching backend Pydantic schemas without synthetic values.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const AUTH_TOKEN_KEY = "varuni_auth_token";
export const AUTH_USER_KEY = "varuni_auth_user";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      window.location.href = "/login";
    }
    const errorText = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${res.statusText} ${errorText}`);
  }
  return res.json();
}

// ─── Dashboard ───────────────────────────────────────────
export const fetchDashboardStats = () => apiFetch<DashboardStats>("/api/v1/dashboard/stats");
export const fetchRecentChanges = (limit = 10) => apiFetch<ChangeEvent[]>(`/api/v1/dashboard/recent-changes?limit=${limit}`);
export const fetchQualityAlerts = (limit = 15) => apiFetch<QualityAlert[]>(`/api/v1/dashboard/quality-alerts?limit=${limit}`);

// ─── Watersheds & Streams ─────────────────────────────────
export const fetchWatersheds = () => apiFetch<WatershedSummary[]>("/api/v1/watersheds/");
export const fetchWatershedGeoJSON = () => apiFetch<GeoJSONFeatureCollection>("/api/v1/watersheds/geojson");
export const fetchWatershedDetail = (id: string) => apiFetch<WatershedDetail>(`/api/v1/watersheds/${id}`);
export const fetchWatershedTimeSeries = (id: string, metric = "ndvi") =>
  apiFetch<WatershedTimeSeriesResponse>(`/api/v1/watersheds/${id}/time-series?metric=${metric.toLowerCase()}`);
export const fetchWatershedLulc = (id: string, refresh = false) =>
  apiFetch<LulcStatsResponse>(`/api/v1/watersheds/${id}/lulc?refresh=${refresh}`);
export const fetchWatershedStreams = (id: string) =>
  apiFetch<GeoJSONFeatureCollection>(`/api/v1/watersheds/${id}/streams`);
export const fetchPointHydrology = (id: string, lat: number, lon: number) =>
  apiFetch<PointHydrology>(`/api/v1/watersheds/${id}/point-hydrology?latitude=${lat}&longitude=${lon}`);
export const triggerTerrainProcessing = (id: string, threshold = 150) =>
  apiFetch<Record<string, unknown>>(`/api/v1/watersheds/${id}/terrain?accumulation_threshold=${threshold}`, { method: "POST" });
export const createWatershed = (payload: WatershedCreatePayload) =>
  apiFetch<WatershedDetail>("/api/v1/watersheds/", { method: "POST", body: JSON.stringify(payload) });

// ─── Interventions & Change Detection ─────────────────────
export const fetchInterventions = (filters?: { watershed_id?: string; type?: string; status?: string }) => {
  const params = new URLSearchParams();
  if (filters?.watershed_id) params.set("watershed_id", filters.watershed_id);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.status) params.set("status", filters.status);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<InterventionInfo[]>(`/api/v1/interventions/${q}`);
};
export const fetchInterventionDetail = (id: string) => apiFetch<InterventionInfo>(`/api/v1/interventions/${id}`);
export const createIntervention = (payload: InterventionCreatePayload, idempotencyKey?: string) => {
  const headers: Record<string, string> = {};
  const effectiveKey = idempotencyKey || payload.idempotency_key;
  if (effectiveKey) {
    headers["Idempotency-Key"] = effectiveKey;
  }
  return apiFetch<InterventionInfo>("/api/v1/interventions/", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, idempotency_key: effectiveKey }),
  });
};
export const reviewIntervention = (
  id: string,
  review: { decision: "confirm" | "needs_visit" | "dismiss"; notes?: string; expected_status: string }
) =>
  apiFetch<InterventionInfo>(`/api/v1/interventions/${id}/review`, {
    method: "POST",
    body: JSON.stringify(review),
  });
export const fetchInterventionReviews = (id: string) =>
  apiFetch<ReviewEvent[]>(`/api/v1/interventions/${id}/reviews`);
export const runInterventionChangeDetection = (id: string, params?: { metric?: string; treated_radius_m?: number }) => {
  const q = new URLSearchParams();
  if (params?.metric) q.set("metric", params.metric);
  if (params?.treated_radius_m) q.set("treated_radius_m", params.treated_radius_m.toString());
  return apiFetch<ChangeDetectionResult>(`/api/v1/interventions/${id}/change-detection?${q.toString()}`, { method: "POST" });
};

// ─── Images & Quality Control ─────────────────────────────
export const uploadFieldPhoto = async (formData: FormData): Promise<ImageInfo> => {
  const res = await fetch(`${API_BASE}/api/v1/images/`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Upload Error ${res.status}: ${res.statusText} ${errorText}`);
  }
  return res.json();
};
export const fetchImages = (watershedId?: string, qualityStatus?: string) => {
  const params = new URLSearchParams();
  if (watershedId) params.set("watershed_id", watershedId);
  if (qualityStatus) params.set("quality_status", qualityStatus);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ImageInfo[]>(`/api/v1/images/${q}`);
};
export const fetchFlaggedImages = (reasonFilter?: string) => {
  const q = reasonFilter ? `?reason_filter=${encodeURIComponent(reasonFilter)}` : "";
  return apiFetch<ImageInfo[]>(`/api/v1/images/quality/flagged${q}`);
};
export const fetchImageDetail = (id: string) => apiFetch<ImageInfo>(`/api/v1/images/${id}`);
export const reviewImageLabel = (id: string, payload: { assigned_label: string; reviewer_id: string; notes?: string }) =>
  apiFetch<ImageInfo>(`/api/v1/images/${id}/label`, { method: "POST", body: JSON.stringify(payload) });
export const setManualImageLocation = (id: string, lat: number, lon: number) =>
  apiFetch<ImageInfo>(`/api/v1/images/${id}/manual-location?latitude=${lat}&longitude=${lon}`, { method: "PUT" });
export const getImageUrl = (objectUri?: string | null) => {
  if (!objectUri) return "/placeholder.jpg";
  if (objectUri.startsWith("http://") || objectUri.startsWith("https://")) return objectUri;
  if (objectUri.startsWith("/data/")) return `${API_BASE}${objectUri}`;
  if (objectUri.startsWith("data/")) return `${API_BASE}/${objectUri}`;
  if (objectUri.startsWith("/")) return `${API_BASE}${objectUri}`;
  return `${API_BASE}/data/${objectUri}`;
};
export const getThumbnailUrl = (thumbUri?: string | null) => {
  if (!thumbUri) return "/placeholder.jpg";
  return getImageUrl(thumbUri);
};

// ─── Satellite & Rasters ─────────────────────────────────
export const fetchSatelliteScenes = () => apiFetch<SatelliteScene[]>("/api/v1/satellite/scenes");
export const fetchRasterAssets = (filters?: { watershed_id?: string; asset_type?: string }) => {
  const params = new URLSearchParams();
  if (filters?.watershed_id) params.set("watershed_id", filters.watershed_id);
  if (filters?.asset_type) params.set("asset_type", filters.asset_type);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<RasterAsset[]>(`/api/v1/satellite/rasters${q}`);
};
export const getRasterOverlayUrl = (assetId: string) => `${API_BASE}/api/v1/rasters/${assetId}/overlay.png`;
export const fetchRasterLegend = (assetId: string) => apiFetch<RasterLegend>(`/api/v1/rasters/${assetId}/legend`);

// ─── Analysis & Anomaly Detection ────────────────────────
export const fetchAnalysisJobs = () => apiFetch<AnalysisJob[]>("/api/v1/analysis/jobs");
export const createAnalysisJob = (payload: { type: string; input_refs?: Record<string, unknown> }) =>
  apiFetch<AnalysisJob>("/api/v1/analysis/jobs", { method: "POST", body: JSON.stringify(payload) });
export const fetchAnomalyAnalysis = (params: { latitude?: number; longitude?: number; target_date?: string; image_id?: string; intervention_id?: string; metric?: string }) => {
  const q = new URLSearchParams();
  if (params.latitude !== undefined) q.set("latitude", params.latitude.toString());
  if (params.longitude !== undefined) q.set("longitude", params.longitude.toString());
  if (params.target_date) q.set("target_date", params.target_date);
  if (params.image_id) q.set("image_id", params.image_id);
  if (params.intervention_id) q.set("intervention_id", params.intervention_id);
  if (params.metric) q.set("metric", params.metric);
  return apiFetch<AnomalyAnalysisResponse>(`/api/v1/analysis/anomaly?${q.toString()}`);
};

// ─── Reports & User ──────────────────────────────────────
export const fetchReportsSummary = (watershedId?: string) => {
  const q = watershedId ? `?watershed_id=${watershedId}` : "";
  return apiFetch<ReportSummaryResponse>(`/api/v1/reports/summary${q}`);
};
export const fetchPointsDensity = (
  watershedId: string,
  params?: {
    source_type?: "all" | "interventions" | "photos";
    intervention_type?: string;
    from_date?: string;
    to_date?: string;
    bandwidth_m?: number;
  }
) => {
  const q = new URLSearchParams();
  if (params?.source_type) q.set("source_type", params.source_type);
  if (params?.intervention_type) q.set("intervention_type", params.intervention_type);
  if (params?.from_date) q.set("from_date", params.from_date);
  if (params?.to_date) q.set("to_date", params.to_date);
  if (params?.bandwidth_m) q.set("bandwidth_m", params.bandwidth_m.toString());
  const queryStr = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<PointsDensityResponse>(`/api/v1/watersheds/${watershedId}/points-density${queryStr}`);
};
export const fetchCurrentUser = () => apiFetch<CurrentUser>("/api/v1/auth/me");

// ─── TypeScript Data Types ───────────────────────────────
export interface DashboardStats {
  total_watersheds: number;
  total_images: number;
  total_interventions: number;
  total_analyses: number;
  avg_ndvi: number | null;
  avg_ndwi: number | null;
  total_water_area_sqkm: number | null;
  quality_alerts: number;
  verified_interventions?: number;
  needs_visit_interventions?: number;
  dismissed_interventions?: number;
  observed_interventions?: number;
}

export interface WatershedSummary {
  id: string;
  name: string;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  area_sqkm?: number | null;
  ndvi_current?: number | null;
  ndwi_current?: number | null;
  elevation_min?: number | null;
  elevation_max?: number | null;
  source?: string | null;
  centroid?: [number, number] | null;
}

export interface WatershedDetail extends WatershedSummary {
  perimeter_km?: number | null;
  slope_avg?: number | null;
  drainage_density?: number | null;
  version?: string | null;
  landcover_dominant?: string | null;
  population?: number | null;
  provenance?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  geometry_geojson?: GeoJSONGeometry | null;
}

export interface WatershedCreatePayload {
  name: string;
  state?: string;
  district?: string;
  block?: string;
  geometry_geojson: GeoJSONGeometry;
  source?: string;
  version?: string;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: any;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  scene_id?: string | null;
  std?: number | null;
  min_val?: number | null;
  max_val?: number | null;
  valid_pct?: number | null;
}

export interface WatershedTimeSeriesResponse {
  watershed_id: string;
  metric: string;
  unit: string;
  provenance?: Record<string, unknown> | null;
  data: TimeSeriesPoint[];
}

export interface PointHydrology {
  latitude: number;
  longitude: number;
  distance_to_nearest_stream_m: number;
  nearest_stream_order: number;
  nearest_stream_name: string;
  upstream_contributing_area_sqkm: number;
  dem_resolution_m: number;
  cell_area_sqkm: number;
}

export interface ReviewEvent {
  id: string;
  intervention_id: string;
  from_status: string;
  to_status: string;
  decision: string;
  notes?: string | null;
  reviewer_id: string;
  reviewer_name?: string | null;
  created_at: string;
}

export interface InterventionInfo {
  id: string;
  name?: string | null;
  type: string;
  status: string; // proposed, observed, verified, needs_review, archived
  review_status: "OBSERVED" | "VERIFIED" | "NEEDS_FIELD_VISIT" | "DISMISSED" | string;
  current_reviewer_id?: string | null;
  current_notes?: string | null;
  idempotency_key?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  watershed_id?: string | null;
  watershed_name?: string | null;
  observed_at?: string | null;
  source?: string | null;
  description?: string | null;
  cost_estimate?: number | null;
  beneficiaries?: number | null;
  nearest_stream_distance_m?: number | null;
  upstream_catchment_area_sqkm?: number | null;
  local_slope_deg?: number | null;
  reviewer_decision?: string | null;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  image_id?: string | null;
  photo_path?: string | null;
  photo_filename?: string | null;
  exif_latitude?: number | null;
  exif_longitude?: number | null;
  exif_timestamp?: string | null;
  gps_source?: string | null;
  satellite_context?: ImageSatelliteContext | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InterventionCreatePayload {
  name?: string | null;
  type: string;
  status?: string | null;
  latitude: number;
  longitude: number;
  watershed_id?: string | null;
  description?: string | null;
  cost_estimate?: number | null;
  beneficiaries?: number | null;
  source?: string | null;
  image_id?: string | null;
  photo_path?: string | null;
  photo_filename?: string | null;
  exif_latitude?: number | null;
  exif_longitude?: number | null;
  exif_timestamp?: string | null;
  gps_source?: string | null;
  idempotency_key?: string | null;
}

export interface InterventionReviewPayload {
  decision: "confirm" | "needs_visit" | "dismiss";
  expected_status: string;
  notes?: string;
}

export interface PredictionEntry {
  class_name: string;
  display_name: string;
  probability: number;
  percentage: string;
}

export interface ClassificationResult {
  top_1: string;
  top_1_display: string;
  confidence: number;
  top_3: PredictionEntry[];
  is_uncertain: boolean;
  status_label: string;
  confidence_threshold: number;
  margin: number;
  model_metadata: {
    model_name: string;
    checkpoint_id: string;
    version: string;
    prompt_templates: Record<string, string[]>;
    taxonomy: string[];
  };
}

export interface SatelliteContextScene {
  scene_id: string;
  date: string;
  day_gap: number;
  ndvi?: number | null;
  ndwi?: number | null;
  window_3x3_mean_ndvi?: number | null;
  window_3x3_mean_ndwi?: number | null;
  is_far_gap: boolean;
  sensor?: string | null;
  resolution_m?: number | null;
}

export interface ImageSatelliteContext {
  nearest_before?: SatelliteContextScene | null;
  nearest_after?: SatelliteContextScene | null;
  time_series_at_pixel: TimeSeriesPoint[];
  message?: string | null;
}

export interface ImageInfo {
  id: string;
  object_uri: string;
  original_filename?: string | null;
  thumbnail_uri?: string | null;
  captured_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_source?: string | null;
  watershed_id?: string | null;
  watershed_name?: string | null;
  quality_status: string; // good, poor, duplicate, no_gps, outside_monitored_area, pending
  quality_score?: number | null;
  quality_reasons?: string[] | null;
  blur_score?: number | null;
  exposure_mean?: number | null;
  clipped_pixel_pct?: number | null;
  resolution_w?: number | null;
  resolution_h?: number | null;
  sha256_hash?: string | null;
  perceptual_hash?: string | null;
  duplicate_of_id?: string | null;
  classification_result?: ClassificationResult | null;
  reviewer_label?: string | null;
  reviewer_label_notes?: string | null;
  reviewer_label_at?: string | null;
  privacy_status: string;
  intervention_type?: string | null;
  camera_model?: string | null;
  altitude?: number | null;
  bearing?: number | null;
  is_manual_location: boolean;
  satellite_context?: ImageSatelliteContext | null;
  created_at?: string | null;
}

export interface SatelliteScene {
  id: string;
  scene_id: string;
  provider: string;
  sensor?: string | null;
  acquisition_time: string;
  cloud_cover?: number | null;
  resolution_m?: number | null;
  processing_level?: string | null;
  crs?: string;
  bands?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface RasterAsset {
  id: string;
  scene_id?: string | null;
  watershed_id?: string | null;
  name: string;
  asset_type: string; // ndvi, ndwi, lulc, dem, slope, flow_accum
  crs: string;
  resolution_m?: number | null;
  bounds?: [number, number, number, number] | null;
  stats?: { min?: number; max?: number; mean?: number; std?: number; valid_count?: number } | null;
  valid_pct?: number | null;
  is_flagged: boolean;
  flag_reason?: string | null;
  checksum?: string | null;
  version?: string | null;
  created_at?: string | null;
}

export interface RasterLegendEntry {
  min: number;
  max: number;
  color: string;
  label: string;
}

export interface RasterLegend {
  asset_id: string;
  asset_type: string;
  min_value: number;
  max_value: number;
  palette: string;
  entries: RasterLegendEntry[];
  note?: string | null;
}

export interface DensityPointItem {
  lat: number;
  lng: number;
  weight: number;
  id?: string | null;
  source: "intervention" | "photo";
  type?: string | null;
  date?: string | null;
  label?: string | null;
}

export interface PointsDensityLegend {
  total_count: number;
  bandwidth_m: number;
  interventions_count: number;
  photos_count: number;
  disclaimer: string;
}

export interface PointsDensityResponse {
  watershed_id: string;
  source_type: string;
  total_points: number;
  bandwidth_m: number;
  points: DensityPointItem[];
  heat_points: [number, number, number][];
  legend: PointsDensityLegend;
}

export interface BaselineObservation {
  scene_id: string;
  date: string;
  year: number;
  value: number;
}

export interface AnomalyAnalysisResponse {
  location: [number, number];
  target_date: string;
  nearest_scene_id?: string | null;
  nearest_scene_date?: string | null;
  observed_value?: number | null;
  metric: string;
  baseline_median?: number | null;
  baseline_mad?: number | null;
  baseline_n: number;
  z_score?: number | null;
  status: "normal" | "watch" | "review" | "insufficient_history";
  status_label: string;
  baseline_observations: BaselineObservation[];
  provenance: Record<string, unknown>;
}

export interface ChangeDetectionResult {
  status: "success" | "refused";
  can_compute: boolean;
  reason?: string;
  intervention_id?: string;
  intervention_name?: string;
  metric?: string;
  baseline_period?: {
    year: number;
    scene_id: string;
    date: string;
    treated_mean: number;
    control_mean: number;
    valid_pct: number;
  };
  comparison_period?: {
    year: number;
    scene_id: string;
    date: string;
    treated_mean: number;
    control_mean: number;
    valid_pct: number;
  };
  results?: {
    treated_delta: number;
    control_delta: number;
    did_observed_change: number;
    treated_pixels_count: number;
    control_pixels_count: number;
    treated_buffer_m: number;
    control_ring_m: string;
  };
  terminology: string;
  methodology: string;
  limitations: string;
}

export interface AnalysisJob {
  id: string;
  type: string;
  status: string;
  stage?: string | null;
  progress?: number | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result_summary?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface ChangeEvent {
  id: string;
  watershed_id?: string | null;
  watershed_name?: string | null;
  intervention_id?: string | null;
  from_date: string;
  to_date: string;
  metric: string;
  delta?: number | null;
  treated_delta?: number | null;
  control_delta?: number | null;
  did_estimate?: number | null;
  from_value?: number | null;
  to_value?: number | null;
  confidence?: number | null;
  severity?: string | null;
  methodology?: string | null;
  limitations_disclaimer?: string | null;
  provenance?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface QualityAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  detail: string;
  created_at?: string | null;
}

export interface ReportSummaryResponse {
  watershed: {
    id?: string | null;
    name: string;
    state?: string | null;
    district?: string | null;
    area_sqkm?: number | null;
    source?: string | null;
  };
  metrics: {
    mean_ndvi?: number | null;
    mean_ndwi?: number | null;
    interventions_total: number;
    interventions_verified: number;
    field_photos_total: number;
    field_photos_with_gps: number;
    satellite_scenes_ingested: number;
    clear_raster_assets: number;
    flagged_cloud_raster_assets: number;
  };
  provenance: Record<string, unknown>;
}

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: string;
  organization: string;
}

export interface LulcClassItem {
  code: string;
  name: string;
  area: number;
  percentage: number;
}

export interface LulcStatsResponse {
  watershed_id?: string | null;
  geometry_hash: string;
  source: string;
  vintage: string;
  units: string;
  token_used?: string | null;
  fetched_at: string;
  disclaimer: string;
  total_area: number;
  classes: LulcClassItem[];
  per_state: Record<string, Record<string, number>>;
  raw_json?: any;
  cached: boolean;
  empty: boolean;
  message?: string | null;
}
