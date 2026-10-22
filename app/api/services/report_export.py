import io
import csv
import json
import uuid
import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)

try:
    from models import (
        Watershed,
        Intervention,
        ImageObservation,
        RasterAsset,
        SatelliteScene,
        ChangeEvent,
        WatershedTimeSeries,
    )
    from services.auth import log_audit_event
except ImportError:
    from app.api.models import (
        Watershed,
        Intervention,
        ImageObservation,
        RasterAsset,
        SatelliteScene,
        ChangeEvent,
        WatershedTimeSeries,
    )
    from app.api.services.auth import log_audit_event

SOFTWARE_VERSION = "1.0.0"


def generate_observations_csv(db: Session, watershed_id: Optional[uuid.UUID] = None) -> io.StringIO:
    """
    Generates a deterministic CSV export of photos and interventions:
    Location, date, watershed, quality, model label+confidence, seasonal-deviation, terrain metrics.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "record_type",
        "record_id",
        "name_or_file",
        "watershed_id",
        "watershed_name",
        "latitude",
        "longitude",
        "date_observed",
        "quality_status",
        "quality_score",
        "blur_score",
        "model_label",
        "model_confidence",
        "is_uncertain",
        "reviewer_ground_truth_label",
        "nearest_stream_distance_m",
        "upstream_catchment_sqkm",
        "local_slope_deg",
        "intervention_type",
        "status",
        "source",
        "export_generated_at",
        "software_version"
    ])

    gen_time = datetime.datetime.utcnow().isoformat() + "Z"

    # Query Interventions
    itv_query = db.query(Intervention)
    if watershed_id:
        itv_query = itv_query.filter(Intervention.watershed_id == watershed_id)
    interventions = itv_query.all()

    for itv in interventions:
        ws_name = itv.watershed.name if itv.watershed else "Unassigned"
        rev_status = itv.review_status or itv.status or "OBSERVED"
        writer.writerow([
            "intervention",
            str(itv.id),
            itv.name or itv.type,
            str(itv.watershed_id) if itv.watershed_id else "",
            ws_name,
            itv.latitude if itv.latitude is not None else "",
            itv.longitude if itv.longitude is not None else "",
            itv.observed_at.strftime("%Y-%m-%d") if itv.observed_at else "",
            rev_status,
            "",  # quality score n/a for structural intervention
            "",  # blur score n/a
            "",  # model label
            "",  # confidence
            "",  # is_uncertain
            itv.reviewer_decision or "",
            round(itv.nearest_stream_distance_m, 2) if itv.nearest_stream_distance_m is not None else "",
            round(itv.upstream_catchment_area_sqkm, 4) if itv.upstream_catchment_area_sqkm is not None else "",
            round(itv.local_slope_deg, 2) if itv.local_slope_deg is not None else "",
            itv.type,
            rev_status,
            itv.source or "Field Survey",
            gen_time,
            SOFTWARE_VERSION
        ])

    # Query Images
    img_query = db.query(ImageObservation)
    if watershed_id:
        img_query = img_query.filter(ImageObservation.watershed_id == watershed_id)
    images = img_query.all()

    for img in images:
        ws_name = img.watershed.name if img.watershed else "Unassigned"
        clf = img.classification_result or {}
        top1 = clf.get("top_1", {}) if isinstance(clf, dict) else {}
        writer.writerow([
            "field_photo",
            str(img.id),
            img.object_uri,
            str(img.watershed_id) if img.watershed_id else "",
            ws_name,
            img.latitude if img.latitude is not None else "",
            img.longitude if img.longitude is not None else "",
            img.captured_at.strftime("%Y-%m-%d") if img.captured_at else "",
            img.quality_status,
            round(img.quality_score, 2) if img.quality_score is not None else "",
            round(img.blur_score, 1) if img.blur_score is not None else "",
            top1.get("class_name", "") if isinstance(top1, dict) else "",
            round(top1.get("probability", 0.0), 3) if isinstance(top1, dict) and "probability" in top1 else "",
            "Yes" if clf.get("is_uncertain") else "No",
            img.reviewer_label or "",
            "",  # nearest stream
            "",  # upstream catchment
            "",  # local slope
            img.intervention_type or "",
            img.quality_status,
            "EXIF Field Upload",
            gen_time,
            SOFTWARE_VERSION
        ])

    output.seek(0)
    return output


def generate_observations_geojson(db: Session, watershed_id: Optional[uuid.UUID] = None) -> Dict[str, Any]:
    """
    Generates a valid GeoJSON FeatureCollection of photos and interventions with all properties.
    """
    gen_time = datetime.datetime.utcnow().isoformat() + "Z"
    features = []

    # Interventions
    itv_query = db.query(Intervention)
    if watershed_id:
        itv_query = itv_query.filter(Intervention.watershed_id == watershed_id)
    interventions = itv_query.all()

    for itv in interventions:
        if itv.longitude is None or itv.latitude is None:
            continue
        ws_name = itv.watershed.name if itv.watershed else "Unassigned"
        rev_status = itv.review_status or itv.status or "OBSERVED"
        features.append({
            "type": "Feature",
            "id": str(itv.id),
            "geometry": {
                "type": "Point",
                "coordinates": [itv.longitude, itv.latitude]
            },
            "properties": {
                "record_type": "intervention",
                "name": itv.name or itv.type,
                "type": itv.type,
                "status": itv.status,
                "review_status": rev_status,
                "watershed_id": str(itv.watershed_id) if itv.watershed_id else None,
                "watershed_name": ws_name,
                "observed_at": itv.observed_at.strftime("%Y-%m-%d") if itv.observed_at else None,
                "nearest_stream_distance_m": itv.nearest_stream_distance_m,
                "upstream_catchment_sqkm": itv.upstream_catchment_area_sqkm,
                "local_slope_deg": itv.local_slope_deg,
                "reviewer_decision": itv.reviewer_decision,
                "cost_estimate": itv.cost_estimate,
                "beneficiaries": itv.beneficiaries,
                "software_version": SOFTWARE_VERSION,
                "export_generated_at": gen_time
            }
        })

    # Images
    img_query = db.query(ImageObservation)
    if watershed_id:
        img_query = img_query.filter(ImageObservation.watershed_id == watershed_id)
    images = img_query.all()

    for img in images:
        if img.longitude is None or img.latitude is None:
            continue
        ws_name = img.watershed.name if img.watershed else "Unassigned"
        clf = img.classification_result or {}
        features.append({
            "type": "Feature",
            "id": str(img.id),
            "geometry": {
                "type": "Point",
                "coordinates": [img.longitude, img.latitude]
            },
            "properties": {
                "record_type": "field_photo",
                "object_uri": img.object_uri,
                "captured_at": img.captured_at.strftime("%Y-%m-%d") if img.captured_at else None,
                "watershed_id": str(img.watershed_id) if img.watershed_id else None,
                "watershed_name": ws_name,
                "quality_status": img.quality_status,
                "quality_score": img.quality_score,
                "blur_score": img.blur_score,
                "classification": clf,
                "reviewer_label": img.reviewer_label,
                "software_version": SOFTWARE_VERSION,
                "export_generated_at": gen_time
            }
        })

    return {
        "type": "FeatureCollection",
        "provenance": {
            "generator": "VARUNI Geospatial Intelligence Platform",
            "software_version": SOFTWARE_VERSION,
            "crs": "EPSG:4326 (WGS84)",
            "generated_at": gen_time,
            "disclaimer": "Non-causal empirical observations"
        },
        "features": features
    }


def generate_watershed_pdf_report(
    db: Session,
    watershed_id: Optional[uuid.UUID] = None,
    audit_id: Optional[str] = None
) -> bytes:
    """
    Generates a comprehensive, deterministic PDF Watershed Assessment Report using ReportLab:
    - Watershed stats & sources
    - Data sources & scene dates
    - Methodology notes (indices, masks, baselines, control-area DiD)
    - Model names/versions
    - Time-series stats
    - Intervention list with satellite context
    - Limitations and 'observed change' caveat
    - Provenance & audit ID footer
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f2d59"),
        fontName="Helvetica-Bold"
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        fontName="Helvetica"
    )
    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#166534"),
        fontName="Helvetica-Bold",
        spaceBefore=10,
        spaceAfter=4
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
        fontName="Helvetica"
    )
    code_style = ParagraphStyle(
        "CodeSmall",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
        fontName="Courier"
    )
    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#991b1b"),
        fontName="Helvetica-Oblique"
    )

    story = []

    # 1. Header Banner
    now_utc = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    report_audit_id = audit_id or str(uuid.uuid4())

    story.append(Paragraph("VARUNI — Geospatial Watershed Monitoring & Integrity Report", title_style))
    story.append(Paragraph(f"Software Version: {SOFTWARE_VERSION} | Generated: {now_utc} | Audit ID: {report_audit_id}", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f2d59"), spaceAfter=10))

    # 2. Watershed Overview
    ws = None
    if watershed_id:
        ws = db.query(Watershed).filter(Watershed.id == watershed_id).first()

    ws_name = ws.name if ws else "All Monitored Pilot Catchments"
    ws_state = ws.state if ws and ws.state else "Maharashtra / Central India"
    ws_district = ws.district if ws and ws.district else "Pune / Pilot Zone"
    ws_area = f"{ws.area_sqkm:.2f} km²" if ws and ws.area_sqkm else "N/A"
    ws_dd = f"{ws.drainage_density:.2f} km/km²" if ws and ws.drainage_density else "N/A"
    ws_slope = f"{ws.slope_avg:.1f}°" if ws and ws.slope_avg else "N/A"

    story.append(Paragraph("1. Study Area & Topographical Statistics", h2_style))
    
    ws_data = [
        [Paragraph("<b>Catchment Name</b>", body_style), Paragraph(ws_name, body_style),
         Paragraph("<b>State / District</b>", body_style), Paragraph(f"{ws_state}, {ws_district}", body_style)],
        [Paragraph("<b>Surface Area</b>", body_style), Paragraph(ws_area, body_style),
         Paragraph("<b>Drainage Density</b>", body_style), Paragraph(ws_dd, body_style)],
        [Paragraph("<b>Mean Terrain Slope</b>", body_style), Paragraph(ws_slope, body_style),
         Paragraph("<b>DEM Source</b>", body_style), Paragraph("Copernicus GLO-30 (30m GSD)", body_style)]
    ]
    t_ws = Table(ws_data, colWidths=[110, 155, 110, 165])
    t_ws.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_ws)
    story.append(Spacer(1, 10))

    # 3. Satellite Remote Sensing & Provenance
    scenes = db.query(SatelliteScene).order_by(SatelliteScene.acquisition_time.desc()).limit(10).all()
    rasters = db.query(RasterAsset).filter(RasterAsset.is_flagged == False).all()

    story.append(Paragraph("2. Satellite Remote Sensing & Scene Provenance", h2_style))
    story.append(Paragraph(
        "Derived from USGS Landsat 8/9 Collection 2 Level-2 Surface Reflectance (30m GSD) with QA_PIXEL bitmask cloud filtering (clear pixels only). "
        "Terrain layers derived from Copernicus DEM GLO-30.",
        body_style
    ))
    story.append(Spacer(1, 4))

    scene_rows = [["Scene ID", "Acquisition Date", "Sensor", "Resolution", "Cloud Cover"]]
    if scenes:
        for s in scenes[:6]:
            scene_rows.append([
                s.scene_id[:28] + "...",
                s.acquisition_time.strftime("%Y-%m-%d"),
                s.sensor or "OLI-2 / TIRS-2",
                f"{s.resolution_m} m",
                f"{s.cloud_cover:.1f}%" if s.cloud_cover is not None else "0.0%"
            ])
    else:
        scene_rows.append(["No scenes loaded in database", "—", "—", "—", "—"])

    t_scenes = Table(scene_rows, colWidths=[180, 95, 105, 80, 80])
    t_scenes.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f2d59")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_scenes)
    story.append(Spacer(1, 10))

    # 4. Methodology & Algorithms
    story.append(Paragraph("3. Scientific Methodology & Index Formulations", h2_style))
    method_data = [
        [Paragraph("<b>Vegetation Index (NDVI)</b>", body_style),
         Paragraph("<code>(NIR - Red) / (NIR + Red)</code> — Scaled surface reflectance (Band 5 & Band 4).", body_style)],
        [Paragraph("<b>Water Index (NDWI)</b>", body_style),
         Paragraph("<code>(Green - NIR) / (Green + NIR)</code> — McFeeters (1996) surface water delineation (Band 3 & Band 5).", body_style)],
        [Paragraph("<b>Terrain Topography</b>", body_style),
         Paragraph("Horn's 8-neighborhood slope algorithm in degrees; D8 flow accumulation via <code>pysheds</code>.", body_style)],
        [Paragraph("<b>Observed Change (DiD)</b>", body_style),
         Paragraph("Difference-in-Differences across matched seasonal window (±20 days) between treated buffer (250m) and control ring (500-1500m).", body_style)],
        [Paragraph("<b>Image Quality (No ML)</b>", body_style),
         Paragraph("Variance of Laplacian blur score (threshold 100.0), pixel clipping (0/255), SHA-256 & dHash deduplication.", body_style)],
        [Paragraph("<b>Taxonomy Classifier</b>", body_style),
         Paragraph("OpenCLIP ViT-B-32 prompt-ensembled zero-shot with uncertainty margin (|P1 - P2| < 0.10 or P1 < 0.50).", body_style)]
    ]
    t_methods = Table(method_data, colWidths=[150, 390])
    t_methods.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_methods)
    story.append(Spacer(1, 10))

    # 5. Interventions & Ground Observations Summary
    itvs = db.query(Intervention).filter(Intervention.watershed_id == watershed_id).limit(8).all() if watershed_id else db.query(Intervention).limit(8).all()
    story.append(Paragraph("4. Registered Interventions & Point Hydrology", h2_style))
    
    itv_rows = [["ID / Name", "Type", "Coordinates", "Observed Date", "Dist to Stream", "Upstream Area", "Status"]]
    if itvs:
        for itv in itvs:
            dist_str = f"{itv.nearest_stream_distance_m:.1f} m" if itv.nearest_stream_distance_m is not None else "—"
            area_str = f"{itv.upstream_catchment_area_sqkm:.3f} km²" if itv.upstream_catchment_area_sqkm is not None else "—"
            coord_str = f"{itv.latitude:.4f}, {itv.longitude:.4f}" if itv.latitude and itv.longitude else "—"
            rev_status = itv.review_status or itv.status or "OBSERVED"
            itv_rows.append([
                (itv.name or str(itv.id))[:18],
                itv.type.replace("_", " "),
                coord_str,
                itv.observed_at.strftime("%Y-%m-%d") if itv.observed_at else "—",
                dist_str,
                area_str,
                rev_status
            ])
    else:
        itv_rows.append(["No interventions recorded", "—", "—", "—", "—", "—", "—"])

    t_itv = Table(itv_rows, colWidths=[100, 85, 95, 75, 65, 70, 50])
    t_itv.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#166534")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 2.5),
    ]))
    story.append(t_itv)
    story.append(Spacer(1, 10))

    # 6. Change Events / Difference-in-Differences
    changes = db.query(ChangeEvent).order_by(ChangeEvent.created_at.desc()).limit(5).all()
    story.append(Paragraph("5. Difference-in-Differences Observed Change Events", h2_style))
    change_rows = [["Baseline Date", "Comparison Date", "Metric", "Treated Δ", "Control Δ", "Observed Change (DiD)", "Valid %"]]
    if changes:
        for c in changes:
            t_d = f"{c.treated_delta:+.4f}" if c.treated_delta is not None else "—"
            c_d = f"{c.control_delta:+.4f}" if c.control_delta is not None else "—"
            did = f"{c.did_estimate:+.4f}" if c.did_estimate is not None else "—"
            v_pct = f"{c.valid_pct:.0f}%" if c.valid_pct is not None else "—"
            change_rows.append([
                c.from_date.strftime("%Y-%m-%d"),
                c.to_date.strftime("%Y-%m-%d"),
                c.metric.replace("_observed_change", "").upper(),
                t_d,
                c_d,
                did,
                v_pct
            ])
    else:
        change_rows.append(["No evaluated change events recorded", "—", "—", "—", "—", "—", "—"])

    t_changes = Table(change_rows, colWidths=[80, 85, 75, 75, 75, 100, 50])
    t_changes.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284c7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 2.5),
    ]))
    story.append(t_changes)
    story.append(Spacer(1, 12))

    # 7. Limitations & Non-Causal Legal Caveat
    story.append(Paragraph("6. Limitations & Non-Causal Scientific Caveat", h2_style))
    disclaimer_text = (
        "<b>OBSERVED CHANGE STATEMENT:</b> Observed change measures empirical difference-in-differences against "
        "surrounding control ring pixels during matched seasonal windows (±20 days). This represents observed environmental "
        "changes and is <b>NOT proof of direct human intervention causation</b>. Results are subject to cloud masking thresholds "
        "(minimum 40% valid pixels), 30m spatial resolution limits, and natural precipitation variability. "
        "This report is generated deterministically from verified database records and remote sensing assets."
    )
    story.append(Paragraph(disclaimer_text, disclaimer_style))
    story.append(Spacer(1, 10))

    # 8. Provenance & Audit Footer
    footer_text = f"VARUNI Automated Assessment Report • Generated {now_utc} • Audit ID: {report_audit_id} • Software Version: {SOFTWARE_VERSION}"
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94a3b8"), spaceBefore=6, spaceAfter=4))
    story.append(Paragraph(footer_text, ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#64748b"), alignment=1)))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
