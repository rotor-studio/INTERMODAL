import http.server
import socketserver
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 5178
REMOTE_BASE = "https://tiempo-real.renfe.com"
EMTUSA_BASE = "https://emtusasiri.pub.gijon.es/emtusasiri"
BICI_BASE = "https://bici.gijon.es/api"
BICI_AREA_ID = "cggl7m2hi4pr8tm5lhgg"
GUPPY_BASE = "https://api.guppy.es/api/v2"
GUPPY_BBOX = (-7.6, 42.5, -4.5, 44.2)
PUBLIC_DIR = Path(__file__).parent / "public"

emtusa_token = None
emtusa_token_expiry = 0
TIME = __import__("time")
JSON = __import__("json")
emtusa_lines_cache = None
emtusa_lines_expiry = 0
bici_cache = None
bici_expiry = 0
guppy_cache = None
guppy_expiry = 0

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


def proxy_json(handler, url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "renfe-mapa-demo"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        handler.wfile.write(data)
    except Exception:
        handler.send_response(502)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.end_headers()
        handler.wfile.write(b'{"error":"Proxy failed"}')


def get_emtusa_token():
    global emtusa_token, emtusa_token_expiry
    now = int(TIME.time())
    if emtusa_token and now < emtusa_token_expiry - 30:
        return emtusa_token

    url = (
        f"{EMTUSA_BASE}/login"
        "?grant_type=password&username=info%40vitesia.com&password=vitesia130"
    )
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": "Basic YXBpOmFwaQ==",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
    payload = JSON.loads(data.decode("utf-8"))
    emtusa_token = payload.get("access_token")
    expires_in = int(payload.get("expires_in", 300))
    emtusa_token_expiry = now + expires_in
    return emtusa_token


def fetch_emtusa_json(path):
    token = get_emtusa_token()
    if not token:
        return None
    req = urllib.request.Request(
        f"{EMTUSA_BASE}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
    return JSON.loads(data.decode("utf-8"))


def build_emtusa_lines_geo():
    global emtusa_lines_cache, emtusa_lines_expiry
    now = int(TIME.time())
    if emtusa_lines_cache and now < emtusa_lines_expiry:
        return emtusa_lines_cache

    lines_resp = fetch_emtusa_json("/lineas/lineas")
    if not lines_resp or "lineas" not in lines_resp:
        return None

    output = {"updated": TIME.strftime("%Y-%m-%dT%H:%M:%SZ", TIME.gmtime()), "lines": []}
    lines_map = lines_resp.get("lineas", {})

    for _, line in lines_map.items():
        try:
            idlinea = line.get("idlinea")
            codigo = line.get("codigo")
            colorhex = line.get("colorhex") or line.get("colorHex") or "2c3e50"
            name = (line.get("descripcion") or line.get("nombreLinea") or codigo or "").strip()
            if not idlinea:
                continue

            detail = fetch_emtusa_json(f"/lineas/lineas/{idlinea}")
            trayectos = []
            if isinstance(detail, list) and detail:
                trayectos = detail[0].get("trayectos", [])

            coords_list = []
            for tray in trayectos[:2]:
                idtrayecto = tray.get("idtrayecto")
                if not idtrayecto:
                    continue
                trayecto_resp = fetch_emtusa_json(f"/trayectos/trayectos/{idlinea}/{idtrayecto}")
                paradas = trayecto_resp.get("paradas", []) if trayecto_resp else []
                coords = []
                for p in paradas:
                    try:
                        lat = float(p.get("latitud"))
                        lon = float(p.get("longitud"))
                    except (TypeError, ValueError):
                        continue
                    coords.append([lat, lon])
                if len(coords) >= 2:
                    coords_list.append({"idtrayecto": idtrayecto, "coords": coords})

            if coords_list:
                output["lines"].append(
                    {
                        "idlinea": idlinea,
                        "codigo": codigo,
                        "color": f"#{colorhex}" if not str(colorhex).startswith("#") else colorhex,
                        "nombre": name,
                        "trayectos": coords_list,
                    }
                )
        except Exception:
            continue

    emtusa_lines_cache = output
    emtusa_lines_expiry = now + 6 * 60 * 60
    return output


def point_in_polygon(lon, lat, polygon):
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersects = (yi > lat) != (yj > lat) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def fetch_bici_json(path):
    req = urllib.request.Request(
        f"{BICI_BASE}{path}",
        headers={"User-Agent": "renfe-mapa-demo"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
    return JSON.loads(data.decode("utf-8"))


def build_bici_stations():
    global bici_cache, bici_expiry
    now = int(TIME.time())
    if bici_cache and now < bici_expiry:
        return bici_cache

    entities = fetch_bici_json("/client/entities")
    areas = fetch_bici_json(f"/client/areas?ids={BICI_AREA_ID}")
    stations = entities.get("data", {}).get("stations", []) if entities else []
    area_list = areas.get("data", {}).get("areas", []) if areas else []
    polygon = area_list[0].get("coordinates", []) if area_list else []

    filtered = []
    if polygon:
        for station in stations:
            coords = station.get("coordinates")
            if not coords or len(coords) < 2:
                continue
            if point_in_polygon(coords[0], coords[1], polygon):
                filtered.append(station)
    else:
        filtered = stations

    output = {
        "updated": TIME.strftime("%Y-%m-%dT%H:%M:%SZ", TIME.gmtime()),
        "stations": filtered,
        "area": {"id": BICI_AREA_ID, "coordinates": polygon},
    }
    bici_cache = output
    bici_expiry = now + 15
    return output


def point_in_bbox(lon, lat, bbox):
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def fetch_guppy_json(path):
    req = urllib.request.Request(
        f"{GUPPY_BASE}{path}",
        headers={"User-Agent": "renfe-mapa-demo"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
    return JSON.loads(data.decode("utf-8"))


def build_guppy_map():
    global guppy_cache, guppy_expiry
    now = int(TIME.time())
    if guppy_cache and now < guppy_expiry:
        return guppy_cache

    payload = fetch_guppy_json("/vehicle/list/map")
    data = payload.get("data", {}) if payload else {}
    areas = data.get("available_areas", [])
    vehicles = data.get("vehicles", [])
    pois = data.get("points_of_interest", [])

    area_candidates = []
    for area in areas:
        points = area.get("points", [])
        if any(point_in_bbox(p.get("longitude"), p.get("latitude"), GUPPY_BBOX) for p in points):
            area_candidates.append(area)

    allowed_polygons = [
        [(p.get("longitude"), p.get("latitude")) for p in area.get("points", [])]
        for area in area_candidates
        if not area.get("excluded_area")
    ]

    filtered_vehicles = []
    for car in vehicles:
        lon = car.get("longitude")
        lat = car.get("latitude")
        if lon is None or lat is None:
            continue
        if point_in_bbox(lon, lat, GUPPY_BBOX) and any(
            point_in_polygon(lon, lat, polygon) for polygon in allowed_polygons if len(polygon) >= 3
        ):
            filtered_vehicles.append(car)

    filtered_pois = []
    for poi in pois:
        lon = poi.get("longitude")
        lat = poi.get("latitude")
        if lon is None or lat is None:
            continue
        if point_in_bbox(lon, lat, GUPPY_BBOX):
            filtered_pois.append(poi)

    output = {
        "updated": TIME.strftime("%Y-%m-%dT%H:%M:%SZ", TIME.gmtime()),
        "areas": area_candidates,
        "vehicles": filtered_vehicles,
        "pois": filtered_pois,
    }
    guppy_cache = output
    guppy_expiry = now + 15
    return output


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/flota"):
            proxy_json(self, f"{REMOTE_BASE}/renfe-visor/flota.json")
            return
        if parsed.path.startswith("/api/lineas"):
            proxy_json(self, f"{REMOTE_BASE}/data/lineasnucleos.geojson")
            return
        if parsed.path.startswith("/api/estaciones"):
            proxy_json(self, f"{REMOTE_BASE}/data/estaciones.geojson")
            return
        if parsed.path.startswith("/api/salidas"):
            params = parse_qs(parsed.query)
            station = params.get("station", [""])[0]
            if not station:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"Missing station"}')
                return
            proxy_json(self, f"{REMOTE_BASE}/renfe-json-cutter/write/salidas/estacion/{station}.json")
            return
        if parsed.path.startswith("/api/emtusa/buses"):
            token = get_emtusa_token()
            if not token:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"No EMTUSA token"}')
                return
            try:
                req = urllib.request.Request(
                    f"{EMTUSA_BASE}/autobuses/coordenadas",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"EMTUSA fetch failed"}')
            return
        if parsed.path.startswith("/api/emtusa/lineas-geo"):
            data = build_emtusa_lines_geo()
            if not data:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"EMTUSA lineas failed"}')
                return
            payload = JSON.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=21600")
            self.end_headers()
            self.wfile.write(payload)
            return
        if parsed.path.startswith("/api/bici/stations"):
            try:
                data = build_bici_stations()
                payload = JSON.dumps(data).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(payload)
            except Exception:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"Bici fetch failed"}')
            return
        if parsed.path.startswith("/api/guppy/map"):
            try:
                data = build_guppy_map()
                payload = JSON.dumps(data).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(payload)
            except Exception:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(b'{"error":"Guppy fetch failed"}')
            return

        if parsed.path == "/":
            self.path = "/index.html"

        file_path = (PUBLIC_DIR / self.path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(PUBLIC_DIR.resolve())):
            self.send_response(403)
            self.end_headers()
            return

        if file_path.exists():
            content_type = CONTENT_TYPES.get(file_path.suffix, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.end_headers()
            with file_path.open("rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Servidor listo en http://localhost:{PORT}")
        httpd.serve_forever()
