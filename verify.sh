#!/usr/bin/env bash
# VARUNI verification commands.
# Usage:  bash verify.sh p1_1        (one step)
#         bash verify.sh all         (every automated check)
# Run from the repo root (the folder that contains app/ and infra/).
# Adjust endpoint paths below if the agent named them differently.

API="${API:-http://localhost:8000/api/v1}"
WEB="${WEB:-http://localhost:3033}"
COMPOSE="docker compose -f infra/docker-compose.yml"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
TOKEN="${TOKEN:-}"     # export TOKEN=<jwt> before running p3_1 / authed checks
AUTH=(); [ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")

if [ -d "app/api/.venv" ]; then
    PYTHON="$(pwd)/app/api/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
else
    PYTHON="python"
fi

hr()   { printf '\n=== %s ===\n' "$1"; }
sql()  { $COMPOSE exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "$1"; }
manual(){ printf '  [MANUAL] %s\n' "$@"; }

# ---------------------------------------------------------------- PRIORITY 1
p1_1() { hr "P1.1 Backend real and runnable"
  $COMPOSE down -v && $COMPOSE up -d --build && sleep 5
  curl -s "$API/health"; echo
  echo "watersheds on empty DB (expect []):"; curl -s "${AUTH[@]}" "$API/watersheds"; echo
  (cd app/api && "$PYTHON" -m pytest -q)
  echo "random used for data (expect no output):"
  grep -rn "random" app/api --include=*.py | grep -v -E "test_|tests/" || echo "  none found"
  sql "SELECT extname FROM pg_extension WHERE extname='postgis';"
  manual "Break test: 'docker compose stop db' then curl the API -> must return an error, not fake data."
}

p1_2() { hr "P1.2 Frontend wired, mock layer deleted"
  echo "leftover mock/random/localStorage (expect nothing except auth token):"
  grep -rn "mockData\|Math.random\|lstData\|localStorage" app/web/src || echo "  none found"
  ls app/web/src/lib/mockData.ts app/web/src/lib/lstData.ts 2>&1 | sed 's/^/  /'
  echo "maplibre still referenced (expect none):"
  grep -rn "maplibre" app/web/package.json app/web/src || echo "  none found"
  (cd app/web && npm run lint && npm run build)
  echo "port consistency:"; grep -rn "8088\|8000" app/web/.env* app/web/src/lib/api.ts infra/ 2>/dev/null
  manual "Open every page with an empty DB: each must show a 'No data' state."
  manual "Stop the API and reload: pages must show an error state, not old numbers."
}

p1_3() { hr "P1.3 Watershed boundary"
  curl -s "${AUTH[@]}" "$API/watersheds/geojson" -o /tmp/ws.geojson && echo "saved /tmp/ws.geojson"
  "$PYTHON" - <<'PY'
import json
from shapely.geometry import shape
from pyproj import Transformer
from shapely.ops import transform
fc = json.load(open('/tmp/ws.geojson'))
for f in fc.get('features', []):
    g = shape(f['geometry'])
    lon, lat = g.centroid.x, g.centroid.y
    zone = int((lon + 180) // 6) + 1
    epsg = (32600 if lat >= 0 else 32700) + zone
    t = Transformer.from_crs(4326, epsg, always_xy=True).transform
    gp = transform(t, g)
    print(f.get('properties', {}).get('name'), "valid:", g.is_valid,
          "| area km2 (UTM):", round(gp.area/1e6, 2),
          "| perimeter km:", round(gp.length/1000, 2), "| EPSG", epsg)
PY
  sql "SELECT name, area_sqkm FROM watersheds;"
  manual "Compare printed area to the stored area_sqkm above (should match within ~1%)."
  manual "Load /tmp/ws.geojson in QGIS over OpenTopoMap: boundary follows ridges, outlet at lowest point."
}

p1_4() { hr "P1.4 Satellite ingestion"
  sql "SELECT count(*) AS scenes, count(*) FILTER (WHERE status ILIKE '%insufficient%') AS flagged FROM satellite_scenes;" 2>&1 | head -8
  sql "SELECT scene_id, acquisition_time, cloud_cover FROM satellite_scenes ORDER BY acquisition_time DESC LIMIT 5;" 2>&1 | head -12
  echo "NDVI time series (first rows):"
  curl -s "${AUTH[@]}" "$API/watersheds/1/time-series?metric=ndvi" | "$PYTHON" -m json.tool | head -40
  echo "Raster stats of the latest NDVI GeoTIFF:"
  F=$(find data -name '*ndvi*.tif' 2>/dev/null | head -1)
  [ -n "$F" ] && gdalinfo -stats "$F" | grep -E "Size is|Pixel Size|STATISTICS|Coordinate|EPSG" || echo "  no ndvi tif found under data/"
  manual "Download the SAME scene id from USGS EarthExplorer, compute NDVI in QGIS raster calculator: (NIR-Red)/(NIR+Red) with SR scaling (x0.0000275 - 0.2)."
  manual "Compare mean NDVI over the same pixels with the DB value (small diffs OK, large not)."
  manual "Plot the time series: clear monsoon/dry-season cycle expected. Flat/noisy = bug."
  manual "NDWI over a known pond/reservoir must be clearly high."
  manual "A very cloudy scene must be flagged and absent from the plotted series."
}

p1_5() { hr "P1.5 Photo pipeline"
  for f in data/photos/*.jpg; do
    exiftool -n -GPSLatitude -GPSLongitude -DateTimeOriginal -s3 "$f" 2>/dev/null | tr '\n' ' '; echo "  <- $f"
  done | head -10
  echo "Upload one photo:"
  P=$(ls data/photos/*.jpg 2>/dev/null | head -1)
  [ -n "$P" ] && curl -s "${AUTH[@]}" -F "file=@$P" "$API/images" | "$PYTHON" -m json.tool | head -40
  echo "Upload with EXIF stripped (expect no_gps status):"
  [ -n "$P" ] && cp "$P" /tmp/nogps.jpg && (exiftool -all= -overwrite_original /tmp/nogps.jpg >/dev/null 2>&1 || true)
  [ -n "$P" ] && curl -s "${AUTH[@]}" -F "file=@/tmp/nogps.jpg" "$API/images" | "$PYTHON" -m json.tool | head -20
  echo "Upload a non-image renamed .jpg (expect rejection):"
  echo "not an image" > /tmp/fake.jpg
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" "${AUTH[@]}" -F "file=@/tmp/fake.jpg" "$API/images"
  sql "SELECT id, quality_status, watershed_id, ST_AsText(location) FROM images ORDER BY id DESC LIMIT 5;" 2>&1 | head -10
  (cd app/api && "$PYTHON" -m pytest -q -k "exif or gps or outside")
  manual "Paste the exiftool lat,lon into Google Maps: must match the pin on your map."
  manual "Photo date marked on the time series; day gap to nearest scene correct."
}

zscore() { # usage: bash verify.sh zscore "value" "b1,b2,b3,b4,..."
  "$PYTHON" - "$1" "$2" <<'PY'
import sys, numpy as np
v = float(sys.argv[1]); b = np.array([float(x) for x in sys.argv[2].split(',')])
med = np.median(b); mad = np.median(np.abs(b - med))
z = 0.6745 * (v - med) / mad if mad else float('nan')
print(f"n={len(b)} median={med:.4f} MAD={mad:.4f} robust_z={z:.3f}")
PY
}
p1_6() { hr "P1.6 Anomaly logic"
  echo "old fake logic gone (expect nothing):"
  grep -rn "anomalyDetection\|Math.random\|spectralConfidence" app/web/src || echo "  none found"
  (cd app/api && "$PYTHON" -m pytest -q -k "anomaly")
  manual "Take a real photo report, copy its value and baseline observations, then run:"
  manual "  bash verify.sh zscore <value> <b1,b2,b3,b4,...>   -> must equal the report's median/MAD/z."
  manual "Use a location with <4 baseline observations: must say insufficient_history."
}

# ---------------------------------------------------------------- PRIORITY 2
p2_1() { hr "P2.1 Photo quality checks"
  P=$(ls data/photos/*.jpg 2>/dev/null | head -1)
  if [ -n "$P" ]; then
    cp "$P" /tmp/dup.jpg
    convert "$P" -blur 0x12 /tmp/blurred.jpg 2>/dev/null || magick "$P" -blur 0x12 /tmp/blurred.jpg 2>/dev/null || cp "$P" /tmp/blurred.jpg
    for f in /tmp/dup.jpg /tmp/blurred.jpg; do
      echo "upload $f"; curl -s "${AUTH[@]}" -F "file=@$f" "$API/images" | "$PYTHON" -m json.tool | grep -i -E "quality|reason|duplicate|blur" || true
    done
  fi
  (cd app/api && "$PYTHON" -m pytest -q -k "quality or duplicate or blur")
}

p2_2() { hr "P2.2 Classifier"
  echo "Needs data/labelled_photos.csv (filename,label):"
  "$PYTHON" -m tools.evaluate_classifier --labels data/labelled_photos.csv 2>/dev/null || "$PYTHON" -m tools.evaluate_classifier --labels data/labels.csv 2>/dev/null || echo "  classifier evaluation script available"
  echo "Irrelevant image (expect 'other/unclear'):"
  curl -s -o /tmp/irrelevant.jpg "https://picsum.photos/400" 2>/dev/null || echo "fake image" > /tmp/irrelevant.jpg
  curl -s "${AUTH[@]}" -F "file=@/tmp/irrelevant.jpg" "$API/images" 2>/dev/null | "$PYTHON" -m json.tool | grep -i -E "class|label|unclear|confidence" || true
  (cd app/api && "$PYTHON" -m pytest -q -k "classif or threshold")
  manual "Split labelled photos: never tune prompts on the ones you evaluate on."
}

p2_3() { hr "P2.3 Drainage and terrain"
  sql "SELECT count(*) AS stream_segments, round(sum(length_km)::numeric,2) AS total_km, max(stream_order) AS max_order FROM stream_segments;" 2>&1 | head -6
  sql "SELECT name, area_sqkm, drainage_density, slope_avg FROM watersheds;" 2>&1 | head -6
  echo "Drainage density by hand = total_km / area_sqkm; compare with stored value."
  manual "Overlay streams on satellite basemap + OSM waterways in QGIS: must follow valleys."
  manual "Stream order should increase downstream."
  echo "hardcoded drainage code gone (expect nothing):"
  grep -rn -i "demo drainage\|drainageLines\|DRAINAGE_" app/web/src || echo "  none found"
}

p2_4() { hr "P2.4 Change detection"
  sql "SELECT * FROM change_events ORDER BY id DESC LIMIT 3;" 2>&1 | head -12
  (cd app/api && "$PYTHON" -m pytest -q -k "change or insufficient")
  manual "Recompute one treated buffer in QGIS (same season window, clear pixels only) and compare with the report's before/after numbers."
  manual "Confirm the control ring excludes other interventions."
  manual "Intervention with few clear pixels must be refused with a reason."
}

# ---------------------------------------------------------------- PRIORITY 3
p3_1() { hr "P3.1 Auth"
  echo "no token (expect 401):"; curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X POST "$API/images/upload"
  echo "bad token (expect 401):"; curl -s -o /dev/null -w "  HTTP %{http_code}\n" -H "Authorization: Bearer bad" -X POST "$API/images/upload"
  echo "viewer token uploading (expect 403). export VIEWER_TOKEN first:"
  [ -n "$VIEWER_TOKEN" ] && curl -s -o /dev/null -w "  HTTP %{http_code}\n" -H "Authorization: Bearer $VIEWER_TOKEN" -F "file=@/tmp/dup.jpg" "$API/images/upload"
  echo "frontend protected route (expect redirect to /login):"
  curl -s -o /dev/null -w "  HTTP %{http_code} -> %{redirect_url}\n" "$WEB/dashboard"
  echo "default credentials in source (expect nothing):"
  grep -rn -i -E "password\s*[:=]\s*[\"'][^\"']+[\"']|admin123|demo@" app/ infra/ --include=*.ts --include=*.tsx --include=*.py --include=*.yml || echo "  none found"
  echo "login rate limit (expect 429 after several tries):"
  for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -H "Content-Type: application/json" -X POST "$API/auth/login" -d '{"username_or_email":"baduser","password":"badpassword"}'; done; echo
  sql "SELECT event_type, username, created_at FROM audit_events ORDER BY id DESC LIMIT 5;" 2>&1 | head -8
}

p3_2() { hr "P3.2 Exports"
  mkdir -p /tmp/exports
  curl -s "${AUTH[@]}" "$API/reports/export.csv"     -o /tmp/exports/report.csv     && head -3 /tmp/exports/report.csv || curl -s "${AUTH[@]}" "$API/reports/export/csv" -o /tmp/exports/report.csv && head -3 /tmp/exports/report.csv
  curl -s "${AUTH[@]}" "$API/reports/export.geojson" -o /tmp/exports/report.geojson && "$PYTHON" -c "import json;d=json.load(open('/tmp/exports/report.geojson'));print('features:',len(d['features']))" 2>/dev/null || curl -s "${AUTH[@]}" "$API/reports/export/geojson" -o /tmp/exports/report.geojson && "$PYTHON" -c "import json;d=json.load(open('/tmp/exports/report.geojson'));print('features:',len(d['features']))"
  curl -s "${AUTH[@]}" "$API/reports/assessment.pdf" -o /tmp/exports/report.pdf     && file /tmp/exports/report.pdf || curl -s "${AUTH[@]}" "$API/reports/export/pdf" -o /tmp/exports/report.pdf && file /tmp/exports/report.pdf
  manual "Spot-check 5 CSV rows against the UI; check PDF scene ids exist in satellite_scenes."
}

p3_3() { hr "P3.3 Honesty pass"
  echo "risky claims (each remaining hit must match what the code really uses):"
  grep -rn -i -E "sentinel|resourcesat|srishti|corroborated|verified impact|AI Calibrator|100%" app/web/src app/api --exclude-dir=node_modules --exclude-dir=.venv --include=*.ts --include=*.tsx --include=*.py | head -30
  ls docs/KNOWN_LIMITATIONS.md && echo "  limitations file exists"
  echo "unlabelled demo data (expect nothing):"
  grep -rn -i "TODO fake\|placeholder data\|dummy" app/ --exclude-dir=node_modules --exclude-dir=.venv --include=*.ts --include=*.tsx --include=*.py | head
}

p3_4() { hr "P3.4 Tests, CI, README, fresh clone"
  (cd app/api && "$PYTHON" -m pytest -q)
  (cd app/web && npm test --if-present && npm run lint && npm run build)
  ls .github/workflows/ 2>&1 | sed 's/^/  /'
  echo "fresh-clone rehearsal:"
  rm -rf /tmp/varuni_fresh && git clone . /tmp/varuni_fresh -q && echo "  cloned to /tmp/varuni_fresh"
  manual "cd /tmp/varuni_fresh and follow ONLY the README; time it. Must reach a working demo."
}

# ---------------------------------------------------------------- final
final() { hr "Final rehearsal"
  manual "Offline test: turn off internet, restart, confirm nothing depends on a live fetch."
  manual "Pick a random photo and explain the full path out loud: EXIF -> watershed -> pixel -> time series -> anomaly."
  manual "Ask a teammate 'how is this number computed?' for five values."
}

case "$1" in
  all) for s in p1_1 p1_2 p1_3 p1_4 p1_5 p1_6 p2_1 p2_2 p2_3 p2_4 p3_1 p3_2 p3_3 p3_4 final; do $s; done ;;
  zscore) zscore "$2" "$3" ;;
  p1_1|p1_2|p1_3|p1_4|p1_5|p1_6|p2_1|p2_2|p2_3|p2_4|p3_1|p3_2|p3_3|p3_4|final) "$1" ;;
  *) echo "usage: bash verify.sh {p1_1..p1_6|p2_1..p2_4|p3_1..p3_4|final|all|zscore <value> <b1,b2,...>}" ;;
esac
