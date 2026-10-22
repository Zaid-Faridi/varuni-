"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import {
  uploadFieldPhoto,
  createIntervention,
  fetchWatersheds,
  fetchAnomalyAnalysis,
  WatershedSummary,
  ImageInfo,
  InterventionInfo,
  AnomalyAnalysisResponse,
  getImageUrl,
} from "@/lib/api";
import {
  UploadCloud,
  Image as ImageIcon,
  MapPin,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  FileCheck,
  Compass,
  ArrowRight,
  Info,
  RefreshCw,
  Activity,
  Satellite,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Clock,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Dynamic import with SSR disabled for Leaflet picker
const LocationPickerMap = dynamic(
  () => import("@/components/gis/LocationPickerMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-slate-900 rounded border border-slate-300 flex items-center justify-center text-white text-xs font-mono">
        Loading GIS Coordinate Picker...
      </div>
    ),
  }
);

export default function AddInterventionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmationPanelRef = useRef<HTMLDivElement | null>(null);

  // Watersheds list from backend
  const [watersheds, setWatersheds] = useState<WatershedSummary[]>([]);
  const [selectedWatershedId, setSelectedWatershedId] = useState<string>("");

  // Form State
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Check Dam");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [costEstimate, setCostEstimate] = useState<string>("");
  const [beneficiaries, setBeneficiaries] = useState<string>("");

  // Coordinates State
  const [latitude, setLatitude] = useState<number>(21.2584);
  const [longitude, setLongitude] = useState<number>(81.6329);

  // Upload & EXIF state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadedImage, setUploadedImage] = useState<ImageInfo | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Anomaly analysis state
  const [anomaly, setAnomaly] = useState<AnomalyAnalysisResponse | null>(null);
  const [isLoadingAnomaly, setIsLoadingAnomaly] = useState(false);

  // Idempotency & Submission state (Part A)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [registeredRecord, setRegisteredRecord] = useState<InterventionInfo | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Load watersheds on mount
  useEffect(() => {
    fetchWatersheds()
      .then((data) => {
        setWatersheds(data);
        if (data.length > 0) {
          setSelectedWatershedId(data[0].id);
          if (data[0].centroid) {
            setLatitude(data[0].centroid[0]);
            setLongitude(data[0].centroid[1]);
          }
        }
      })
      .catch((err) => console.error("Error fetching watersheds:", err));
  }, []);

  // Fetch seasonal anomaly when coordinates or date change
  useEffect(() => {
    if (!latitude || !longitude) return;
    setIsLoadingAnomaly(true);
    fetchAnomalyAnalysis({
      latitude,
      longitude,
      target_date: date,
      metric: "ndvi",
      image_id: uploadedImage?.id,
    })
      .then((res) => setAnomaly(res))
      .catch((err) => {
        console.warn("Could not fetch seasonal anomaly:", err);
        setAnomaly(null);
      })
      .finally(() => setIsLoadingAnomaly(false));
  }, [latitude, longitude, date, uploadedImage?.id]);

  const handleCoordinatesChange = (newLat: number, newLng: number) => {
    const roundedLat = Number(newLat.toFixed(6));
    const roundedLng = Number(newLng.toFixed(6));
    setLatitude(roundedLat);
    setLongitude(roundedLng);
  };

  // Upload photo to backend
  const handleFileProcess = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/i)) {
      setUploadError("Please upload a valid image file (JPG, JPEG, or PNG).");
      return;
    }

    setImageFile(file);
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    if (selectedWatershedId) {
      formData.append("watershed_id", selectedWatershedId);
    }

    try {
      const imgInfo = await uploadFieldPhoto(formData);
      setUploadedImage(imgInfo);

      if (imgInfo.latitude && imgInfo.longitude) {
        setLatitude(imgInfo.latitude);
        setLongitude(imgInfo.longitude);
      }
      if (imgInfo.captured_at) {
        setDate(imgInfo.captured_at.split("T")[0]);
      }
      if (imgInfo.watershed_id) {
        setSelectedWatershedId(imgInfo.watershed_id);
      }
    } catch (err: any) {
      console.error("Failed to upload photo:", err);
      setUploadError(err.message || "Failed to process photo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setUploadedImage(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Reset entire form only on "Register another"
  const handleRegisterAnother = () => {
    setName("");
    setType("Check Dam");
    setDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setCostEstimate("");
    setBeneficiaries("");
    setImageFile(null);
    setUploadedImage(null);
    setUploadError(null);
    setSaveError(null);
    setFieldErrors({});
    setRegisteredRecord(null);
    setShowToast(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Generate new idempotency key for new registration
    const newKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    setIdempotencyKey(newKey);
  };

  // Submit intervention (Part A)
  const handleSaveIntervention = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return; // Prevent double submission

    setSaveError(null);
    setFieldErrors({});
    setIsSaving(true);

    // Validate fields
    const errors: Record<string, string> = {};
    if (latitude === undefined || latitude === null || isNaN(latitude)) {
      errors.latitude = "Valid latitude is required";
    }
    if (longitude === undefined || longitude === null || isNaN(longitude)) {
      errors.longitude = "Valid longitude is required";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError("Please check validation errors on the form.");
      setIsSaving(false);
      return;
    }

    try {
      const created = await createIntervention({
        name: name.trim() || `${type} Structure`,
        type,
        status: "observed",
        latitude: Number(latitude),
        longitude: Number(longitude),
        watershed_id: selectedWatershedId || undefined,
        description: description.trim() || `Field surveyed ${type}.`,
        cost_estimate: costEstimate ? parseFloat(costEstimate) : undefined,
        beneficiaries: beneficiaries ? parseInt(beneficiaries, 10) : undefined,
        source: uploadedImage ? "Geo-Tagged Field Photo" : "Manual Ground Survey",
        image_id: uploadedImage?.id,
        photo_path: uploadedImage?.object_uri,
        photo_filename: uploadedImage?.original_filename || imageFile?.name,
        exif_latitude: uploadedImage?.latitude,
        exif_longitude: uploadedImage?.longitude,
        exif_timestamp: uploadedImage?.captured_at,
        gps_source: uploadedImage ? (uploadedImage.latitude ? (uploadedImage.gps_source || "EXIF GPS") : "Manual Location") : "Manual Ground Survey",
        idempotency_key: idempotencyKey,
      }, idempotencyKey);

      // Verify server record and ID exist
      if (!created || !created.id) {
        throw new Error("Server did not return a valid persistent record.");
      }

      setRegisteredRecord(created);
      setShowToast(true);

      // Shift focus to confirmation panel for accessibility
      setTimeout(() => {
        confirmationPanelRef.current?.focus();
      }, 50);
    } catch (err: any) {
      const errMsg = err.message || "Failed to register intervention.";
      if (errMsg.includes("401")) {
        setSaveError("Authentication error (401): Please ensure you are logged in.");
      } else if (errMsg.includes("403")) {
        setSaveError("Permission denied (403): You do not have permission to register interventions.");
      } else if (errMsg.includes("409")) {
        setSaveError("Conflict (409): A record with this idempotency key or identifier already exists.");
      } else if (errMsg.includes("422")) {
        setSaveError("Validation Error (422): Server rejected the payload. Please verify field formats.");
      } else if (errMsg.includes("500") || errMsg.includes("502") || errMsg.includes("503")) {
        setSaveError("Server Error (5xx): The backend database encountered an issue. Please try again.");
      } else {
        setSaveError(errMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const currentWatershed = useMemo(
    () => watersheds.find((w) => w.id === selectedWatershedId) || watersheds[0],
    [watersheds, selectedWatershedId]
  );


  return (
    <AppLayout>
      {/* Toast Announcement Banner */}
      {showToast && registeredRecord && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 bg-emerald-800 text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top duration-300 border border-emerald-600"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <div>
            <div className="text-xs font-bold">Intervention registered successfully</div>
            <div className="text-[11px] text-emerald-200 font-mono">Server ID: {registeredRecord.id}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowToast(false)}
            className="ml-2 text-emerald-300 hover:text-white text-xs font-bold"
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-300 rounded p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-700" />
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Register Geo-Tagged Field Photo & Intervention
            </h1>
            <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
              VARUNI Real EXIF Pipeline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Server-side EXIF GPS parsing, PostGIS ST_Contains watershed spatial join, and 30m Landsat satellite context
          </p>
        </div>

        <Link
          href="/interventions"
          className="text-xs font-semibold text-slate-600 hover:text-emerald-800 flex items-center gap-1 self-start sm:self-auto hover:underline"
        >
          <span>&larr; Catalog</span>
        </Link>
      </div>

      {/* Persistent Confirmation Panel (Requirement A3 & A7) */}
      {registeredRecord && (
        <div
          ref={confirmationPanelRef}
          tabIndex={-1}
          role="region"
          aria-live="polite"
          className="bg-emerald-50 border-2 border-emerald-500 rounded-lg p-5 shadow-sm space-y-4 mb-5 focus:outline-none focus:ring-2 focus:ring-emerald-600 animate-in fade-in duration-200"
          id="registration-confirmation-panel"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-emerald-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-emerald-950">
                  Intervention registered successfully
                </h2>
                <p className="text-xs text-emerald-800">
                  Record persisted in PostgreSQL / PostGIS database.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Observed / Pending review
            </span>
          </div>

          {/* Record Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white/80 p-3.5 rounded border border-emerald-200 text-xs">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Record Name</span>
              <span className="font-bold text-slate-900">{registeredRecord.name}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Server ID</span>
              <span className="font-mono font-semibold text-slate-800 break-all select-all">{registeredRecord.id}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Intervention Type</span>
              <span className="font-semibold text-slate-900 capitalize">{registeredRecord.type.replace(/_/g, " ")}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Coordinates</span>
              <span className="font-mono text-slate-900">
                {registeredRecord.latitude?.toFixed(5)}° N, {registeredRecord.longitude?.toFixed(5)}° E
              </span>
            </div>
          </div>

          {/* Photo & GPS Source */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 p-3.5 rounded border border-emerald-200 text-xs">
            <div className="flex items-center gap-3">
              {registeredRecord.photo_path ? (
                <div className="relative w-14 h-14 rounded border border-emerald-300 overflow-hidden bg-slate-100 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(registeredRecord.photo_path)}
                    alt="Uploaded field photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="font-bold text-slate-900">
                  {registeredRecord.photo_path ? "Field Photo Uploaded & Linked" : "No photo uploaded (Manual Ground Survey)"}
                </div>
                <div className="text-slate-600 text-[11px]">
                  GPS Source: <strong className="text-slate-900">{registeredRecord.gps_source || "Manual Ground Survey"}</strong>
                </div>
              </div>
            </div>

            {/* Satellite Analysis Status Line (Requirement A4) */}
            <div className="text-right sm:border-l sm:border-emerald-200 sm:pl-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Satellite Pipeline</span>
              <div className="text-xs font-semibold text-slate-700 mt-0.5">
                {isLoadingAnomaly
                  ? "Satellite analysis: running..."
                  : anomaly
                  ? "Satellite analysis: complete"
                  : "Satellite analysis: queued / no data"}
              </div>
            </div>
          </div>

          {/* Action Buttons (Requirement A3) */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={`/interventions/${registeredRecord.id}`}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>View record</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleRegisterAnother}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold rounded shadow-2xs transition-colors"
            >
              + Register another
            </button>
            <Link
              href="/gis-map"
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold rounded shadow-2xs transition-colors"
            >
              Go to map &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* Failure Error Alert (Requirement A5) */}
      {saveError && (
        <div
          role="alert"
          className="bg-rose-50 border-2 border-rose-400 text-rose-900 p-4 rounded-lg text-xs space-y-2 mb-5 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2 font-bold text-sm text-rose-950">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Registration Error</span>
          </div>
          <p className="text-rose-800">{saveError}</p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => handleSaveIntervention()}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded font-bold text-xs shadow-2xs transition-colors cursor-pointer disabled:opacity-75"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveIntervention} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* ─── LEFT COLUMN: IMAGE UPLOAD & EXIF GPS ───────────────────── */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 1. IMAGE UPLOAD CARD */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                <span>1. Field Photograph (EXIF GPS Extraction)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">JPG, JPEG, PNG</span>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Dropzone */}
            {!uploadedImage ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center space-y-2 ${
                  isDragOver
                    ? "border-emerald-600 bg-emerald-50/60"
                    : "border-slate-300 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-400"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {isUploading ? "Uploading & Extracting EXIF on Server..." : "Drag & drop field photo here"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    or click to browse from local workstation
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded font-semibold text-xs shadow-2xs mt-1"
                >
                  {isUploading ? "Processing..." : "Browse Files"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              /* Image Preview & Meta */
              <div className="space-y-3">
                <div className="relative rounded border border-slate-300 overflow-hidden bg-slate-900 max-h-72 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(uploadedImage.object_uri)}
                    alt="Uploaded field intervention"
                    className="max-h-72 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-slate-900/80 hover:bg-rose-900 text-white p-1 rounded border border-slate-600 transition-colors cursor-pointer"
                    title="Remove Image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* File Name & EXIF Result */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 truncate">
                      {imageFile?.name || uploadedImage.object_uri}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        uploadedImage.quality_status === "good"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : uploadedImage.quality_status === "no_gps"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-rose-100 text-rose-900 border border-rose-300"
                      }`}
                    >
                      {uploadedImage.quality_status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200 font-mono">
                    <div>
                      <span>Camera: </span>
                      <strong className="text-slate-800">{uploadedImage.camera_model || "Not recorded"}</strong>
                    </div>
                    <div>
                      <span>Altitude: </span>
                      <strong className="text-slate-800">
                        {uploadedImage.altitude !== null && uploadedImage.altitude !== undefined
                          ? `${uploadedImage.altitude.toFixed(1)}m`
                          : "No data"}
                      </strong>
                    </div>
                    <div>
                      <span>Captured: </span>
                      <strong className="text-slate-800">{uploadedImage.captured_at || "No EXIF date"}</strong>
                    </div>
                    <div>
                      <span>Watershed: </span>
                      <strong className="text-slate-800">
                        {uploadedImage.watershed_name || "Outside monitored area"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. GEOLOCATION & POSTGIS SPATIAL JOIN */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Compass className="w-3.5 h-3.5 text-emerald-700" />
                <span>2. Geolocation Coordinates (PostGIS ST_Contains)</span>
              </span>
            </div>

            {uploadedImage?.quality_status === "no_gps" && (
              <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 rounded text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <HelpCircle className="w-4 h-4 text-amber-700" />
                  <span>No GPS metadata in photograph — manual location placement.</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Click on the interactive map below or drag the marker to pinpoint the exact structure location.
                </p>
              </div>
            )}

            {uploadedImage?.quality_status === "outside_monitored_area" && (
              <div className="p-3 bg-rose-50 border border-rose-300 text-rose-950 rounded text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                  <span>Outside Monitored Watershed Boundary</span>
                </div>
                <p className="text-[11px] text-rose-800">
                  GPS coordinates fall outside any currently monitored watershed polygon. It will be recorded without snapping.
                </p>
              </div>
            )}

            <div>
              <LocationPickerMap
                latitude={latitude}
                longitude={longitude}
                onChange={handleCoordinatesChange}
                isGpsExtracted={uploadedImage?.quality_status === "good"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-2.5 rounded">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Latitude (°N, EPSG:4326)
                </label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => handleCoordinatesChange(parseFloat(e.target.value) || 0, longitude)}
                  className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 mt-0.5"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Longitude (°E, EPSG:4326)
                </label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => handleCoordinatesChange(latitude, parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 mt-0.5"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: SATELLITE CONTEXT & DEVIATION FROM SEASONAL HISTORY */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 3. SATELLITE CONTEXT AT LOCATION */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 space-y-3.5">
            <div className="pb-2 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Satellite className="w-4 h-4 text-emerald-700" />
                  <span>3. Satellite Context at This Location (30m Pixel)</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Landsat 8/9 Collection 2 Surface Reflectance sampling at coordinate window
                </p>
              </div>
            </div>

            {uploadedImage?.satellite_context ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Nearest Clear Scene Before
                    </span>
                    {uploadedImage.satellite_context.nearest_before ? (
                      <div className="mt-1 space-y-0.5">
                        <span className="font-mono text-xs font-bold text-slate-900 block">
                          {uploadedImage.satellite_context.nearest_before.date} ({uploadedImage.satellite_context.nearest_before.day_gap}d gap)
                        </span>
                        <span className="text-[10px] text-slate-600 block">
                          Pixel NDVI: <strong>{uploadedImage.satellite_context.nearest_before.ndvi?.toFixed(3) ?? "N/A"}</strong> | 3x3: <strong>{uploadedImage.satellite_context.nearest_before.window_3x3_mean_ndvi?.toFixed(3) ?? "N/A"}</strong>
                        </span>
                        {uploadedImage.satellite_context.nearest_before.is_far_gap && (
                          <span className="text-[9px] text-amber-700 font-bold block">
                            ⚠ Scene is &gt;30 days before photo
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic block mt-1">No clear scene before</span>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Nearest Clear Scene After
                    </span>
                    {uploadedImage.satellite_context.nearest_after ? (
                      <div className="mt-1 space-y-0.5">
                        <span className="font-mono text-xs font-bold text-slate-900 block">
                          {uploadedImage.satellite_context.nearest_after.date} ({uploadedImage.satellite_context.nearest_after.day_gap}d gap)
                        </span>
                        <span className="text-[10px] text-slate-600 block">
                          Pixel NDVI: <strong>{uploadedImage.satellite_context.nearest_after.ndvi?.toFixed(3) ?? "N/A"}</strong> | 3x3: <strong>{uploadedImage.satellite_context.nearest_after.window_3x3_mean_ndvi?.toFixed(3) ?? "N/A"}</strong>
                        </span>
                        {uploadedImage.satellite_context.nearest_after.is_far_gap && (
                          <span className="text-[9px] text-amber-700 font-bold block">
                            ⚠ Scene is &gt;30 days after photo
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic block mt-1">No clear scene after</span>
                    )}
                  </div>
                </div>

                {/* Pixel Time-Series Chart */}
                {uploadedImage.satellite_context.time_series_at_pixel?.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">30m Pixel NDVI Time-Series</span>
                      <span className="text-emerald-700 font-mono text-[10px]">Photo Date Marked</span>
                    </div>
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={uploadedImage.satellite_context.time_series_at_pixel}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                          <YAxis domain={[-0.2, 1.0]} tick={{ fontSize: 9 }} />
                          <Tooltip
                            contentStyle={{ fontSize: "11px", backgroundColor: "#0f172a", color: "#fff", borderRadius: "4px" }}
                          />
                          <ReferenceLine x={date} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "Photo", fill: "#dc2626", fontSize: 10 }} />
                          <Line type="monotone" dataKey="value" stroke="#166534" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-500 text-xs font-mono">
                Satellite context will be sampled upon photo upload or coordinate entry.
              </div>
            )}
          </div>

          {/* 4. DEVIATION FROM SEASONAL HISTORY */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 sm:p-5 space-y-3.5">
            <div className="pb-2 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-700" />
                  <span>4. Deviation from Seasonal History</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Robust z-score (median & MAD) against calendar window (±20 days) in prior years (≥4 observations required)
                </p>
              </div>

              {anomaly && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold border ${
                    anomaly.status === "review"
                      ? "bg-rose-100 text-rose-950 border-rose-300"
                      : anomaly.status === "watch"
                      ? "bg-amber-100 text-amber-950 border-amber-300"
                      : anomaly.status === "normal"
                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }`}
                >
                  {anomaly.status === "review" && "🔴 Review (|z| > 3)"}
                  {anomaly.status === "watch" && "🟡 Watch (2 ≤ |z| ≤ 3)"}
                  {anomaly.status === "normal" && "🟢 Normal (|z| < 2)"}
                  {anomaly.status === "insufficient_history" && "⚪ Insufficient History"}
                </span>
              )}
            </div>

            {isLoadingAnomaly ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-500 text-xs font-mono flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Computing seasonal baseline from Landsat archive...</span>
              </div>
            ) : anomaly ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">
                      Observed NDVI
                    </span>
                    <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                      {anomaly.observed_value !== null && anomaly.observed_value !== undefined
                        ? anomaly.observed_value.toFixed(3)
                        : "No data"}
                    </span>
                    <span className="text-[9px] text-slate-400 block truncate">
                      {anomaly.nearest_scene_date || "Nearest clear scene"}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">
                      Baseline Median (MAD)
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-sm block mt-0.5">
                      {anomaly.baseline_median !== null && anomaly.baseline_median !== undefined
                        ? `${anomaly.baseline_median.toFixed(3)} (±${anomaly.baseline_mad?.toFixed(3)})`
                        : "No data"}
                    </span>
                    <span className="text-[9px] text-slate-500 block">
                      n = {anomaly.baseline_n} historical scenes
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">
                      Robust Z-Score
                    </span>
                    <span
                      className={`font-mono font-black text-sm block mt-0.5 ${
                        anomaly.status === "review"
                          ? "text-rose-700"
                          : anomaly.status === "watch"
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {anomaly.z_score !== null && anomaly.z_score !== undefined
                        ? anomaly.z_score.toFixed(2)
                        : "N/A"}
                    </span>
                    <span className="text-[9px] text-slate-400 capitalize block">
                      {anomaly.status_label}
                    </span>
                  </div>
                </div>

                {anomaly.status === "insufficient_history" && (
                  <div className="p-3 bg-slate-50 border border-slate-300 text-slate-700 rounded text-xs">
                    <strong>Insufficient History: </strong> Found {anomaly.baseline_n} clear scenes in historical calendar window (minimum 4 required for robust statistical evaluation).
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* 5. ADMINISTRATIVE & INTERVENTION DETAILS FORM */}
          <div className="bg-white border border-slate-300 rounded shadow-2xs p-4 sm:p-5 space-y-4">
            <div className="pb-2 border-b border-slate-200">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>5. Structure Attributes</span>
              </h2>
            </div>

            {/* Watershed Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Watershed Catchment Unit:
              </label>
              <select
                value={selectedWatershedId}
                onChange={(e) => setSelectedWatershedId(e.target.value)}
                className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded px-3 py-2 shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
              >
                {watersheds.length === 0 ? (
                  <option value="">No watersheds registered</option>
                ) : (
                  watersheds.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.area_sqkm ? `${ws.area_sqkm.toFixed(1)} km²` : "Pilot"}) — {ws.district}, {ws.state}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Intervention Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Intervention Type:
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded px-3 py-2 shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                  required
                >
                  <option value="Check Dam">Check Dam (Masonry / Earthen)</option>
                  <option value="Farm Pond">Farm Pond (Individual / Community)</option>
                  <option value="Plantation">Plantation (Afforestation / Ridge)</option>
                  <option value="Contour Trench">Contour Trench (CCT / Deep Bunding)</option>
                  <option value="Drainage Structure">Drainage Structure (Gabion / Dyke)</option>
                  <option value="Other">Other (Gully Plug / Percolation)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observation Date:
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono font-medium"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Structure Name / Identifier:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Masonry Check Dam CD-01 (Sukhi Nadi Reach)"
                className="w-full text-xs bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-medium"
              />
            </div>

            {/* Cost & Beneficiaries */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Cost Estimate (₹):
                </label>
                <input
                  type="number"
                  step="1000"
                  value={costEstimate}
                  onChange={(e) => setCostEstimate(e.target.value)}
                  placeholder="e.g. 450000"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Beneficiary Households:
                </label>
                <input
                  type="number"
                  value={beneficiaries}
                  onChange={(e) => setBeneficiaries(e.target.value)}
                  placeholder="e.g. 85"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-medium"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Field Observation Notes:
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter catchment condition, water storage state, upstream silt level, or beneficiary notes..."
                className="w-full text-xs bg-white border border-slate-300 rounded p-2.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-medium"
              />
            </div>

            {/* Submit */}
            <div className="pt-2 border-t border-slate-200">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 px-4 bg-[#166534] hover:bg-[#14532d] text-white rounded font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                id="save-intervention-btn"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Register Intervention</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
