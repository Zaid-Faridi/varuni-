# KNOWN LIMITATIONS & SCIENTIFIC METHODOLOGY

**Project**: VARUNI — Integrated Geospatial & Remote Sensing Decision Support Platform  
**Version**: 1.0.0  
**Date**: September 2026  

---

## 1. Non-Negotiable Scientific Principles

1. **Zero-Synthetic Data Policy**: No mock, randomized, or simulated analytical values are generated in any running environment.
2. **Observed Change vs Causation**: All multi-temporal remote sensing findings are strictly designated as **"observed change"**. Remote sensing pixel differentials do not constitute statistical proof of direct human causal impact without controlled randomized trials and counterfactual adjustments.
3. **Refusal on Insufficient Data**: The platform explicitly refuses computation when cloud cover exceeds masking thresholds ($\ge 40\%$ clear valid pixels required).

---

## 2. Satellite Remote Sensing & Topographical Data Sources

### A. Current Production Operational Sources
- **Optical Multi-Spectral**: **USGS Landsat 8/9 Collection 2 Level-2 Surface Reflectance (30 m GSD)**
  - *STAC Catalog*: Microsoft Planetary Computer STAC API (`https://planetarycomputer.microsoft.com/api/stac/v1`) using signed SAS blob tokens (`planetary-computer` SDK) to avoid AWS requester-pays bucket charges.
  - *Bands Used*: Band 3 (Green, 0.53–0.59 µm), Band 4 (Red, 0.64–0.67 µm), Band 5 (NIR, 0.85–0.88 µm).
  - *Cloud Masking*: Bitmask decoding of USGS `QA_PIXEL` (Fill, Dilated Cloud, Cirrus, Cloud, Cloud Shadow).
  - *Scaling Factor*: Multiplier $0.0000275$ with offset $-0.2$ per official USGS Collection 2 specification.
- **Digital Elevation Model (DEM)**: **Copernicus DEM GLO-30 (30 m Resolution)**
  - *Catalog*: Open access via AWS Earth Search / Copernicus open data repositories.
  - *Grid*: Global 1-arcsecond (~30 m at equator) surface elevation model.
  - *Algorithms*: Horn's 8-neighborhood finite difference method for slope in degrees; D8 single-flow direction pit-filling and accumulation via `pysheds`.
  - *Threshold*: Minimum accumulation threshold of 150 cells ($0.135 \text{ km}^2$) for Strahler vector stream ordering.

### B. ISRO / SRISHTI-DRISHTI Readiness
- The platform architecture includes a modular provider interface (`app/api/satellite/providers/srishti_drishti.py`).
- Operational deployment using indigenous ISRO SRISHTI-DRISHTI 30 m data is fully supported by the schema and provider contract, and will be activated upon receipt of official ministry API access credentials and data-sharing agreements.
- *Official Monitoring Reference*: Real IWMP/WDC-PMKSY monitoring reports published by the Andhra Pradesh Space Applications Centre (`apsac.ap.gov.in`) for Srikakulam/Vizianagaram projects serve as operational benchmarks for micro-watershed activity categorization and before/after verification flows.

---

## 3. Photo Quality Control & Classification Limitations

- **Laplacian Blur Detection**: Uses variance of Laplacian via OpenCV with a threshold of $100.0$. Highly textured or grainy scenes with low illumination may occasionally score near the boundary.
- **Zero-Shot CLIP Classification**: Utilizes OpenCLIP ViT-B-32 with multi-prompt ensembling across a 7-class taxonomy. Predictions with top-1 confidence $< 0.50$ or top-1/top-2 margin $< 0.10$ are explicitly flagged as `"Unclear, needs human label"`. Reviewer corrections are archived into `image_ground_truth_labels` for supervised fine-tuning and are never auto-retrained.
- **EXIF GPS Dependency**: Photos captured on mobile devices with location services disabled or stripped by social media messaging apps are flagged with `no_gps` and require manual georeferencing.
- **Demonstration Field Photos**: Any demonstration sample photos with injected coordinate tags are explicitly labelled as demo/test samples in the dataset and audit log.

---

## 4. Difference-in-Differences Change Detection Limitations

- **Spatial Resolution (30 m Pixel)**: Structures with dimensions $< 30 \text{ m}$ (e.g. small farm bunds) influence sub-pixel reflectance. Buffer averaging (250 m radius) is used to capture surrounding ecological response.
- **Control Ring Assumptions**: The control ring (500 m to 1500 m) is assumed to share comparable agro-climatic conditions. Topographical variations in steep terrains may introduce environmental variance.
- **Seasonal Window Windowing**: Matched seasonal windows ($\pm 20 \text{ days}$ in prior and subsequent years) control for phenological seasonality, but cannot account for localized precipitation anomalies without external weather station inputs.

---

## 5. Security & Access Control

- **Role-Based Access Control (RBAC)**: All mutating endpoints enforce strict server-side authorization:
  - `admin`: Superuser access, user management, and security audit inspection.
  - `gis_analyst`: Watershed ingestion, DEM processing, and change analysis.
  - `field_officer`: Photo uploads and field observation registration.
  - `reviewer`: Human ground-truth verification and intervention status sign-off.
  - `viewer`: Read-only access to GIS layers, analytics, and exported reports.
- **Security Audit Trail**: Immutable logging in `audit_events` for all authentication attempts, photo uploads, ground truth reviews, and report downloads.
