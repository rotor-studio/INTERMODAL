import http from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";

const PORT = process.env.PORT || 5178;
const PUBLIC_DIR = join(process.cwd(), "public");
const REMOTE_BASE = "https://tiempo-real.renfe.com";
const EMTUSA_BASE = "https://emtusasiri.pub.gijon.es/emtusasiri";
const BICI_BASE = "https://bici.gijon.es/api";
const BICI_PARKING_BASE = "https://observa.gijon.es/api/v2/catalog/datasets/aparcamientos-para-bicicletas/records";
const BICI_AREA_ID = "cggl7m2hi4pr8tm5lhgg";
const GUPPY_BASE = "https://api.guppy.es/api/v2";
const GUPPY_BBOX = { minLon: -7.6, minLat: 42.5, maxLon: -4.5, maxLat: 44.2 };
const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "movement-log.txt");

let emtusaToken = null;
let emtusaTokenExpiry = 0;
let emtusaLinesCache = null;
let emtusaLinesExpiry = 0;
let emtusaStopsCache = null;
let emtusaStopsExpiry = 0;
const emtusaStopsByLineCache = new Map();
const emtusaStopLineCache = new Map();
let biciCache = null;
let biciExpiry = 0;
let biciParkingCache = null;
let biciParkingExpiry = 0;
let guppyCache = null;
let guppyExpiry = 0;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function proxyJson(res, url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "renfe-mapa-demo",
      },
    });
    if (!response.ok) {
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Upstream error ${response.status}` }));
      return;
    }
    const data = await response.text();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy failed" }));
  }
}

async function getEmtusaToken() {
  const now = Date.now();
  if (emtusaToken && now < emtusaTokenExpiry - 30000) {
    return emtusaToken;
  }
  const url =
    `${EMTUSA_BASE}/login?grant_type=password&username=info%40vitesia.com&password=vitesia130`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic YXBpOmFwaQ==",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  emtusaToken = data.access_token || null;
  const expiresIn = Number(data.expires_in || 300);
  emtusaTokenExpiry = now + expiresIn * 1000;
  return emtusaToken;
}

async function fetchEmtusaJson(path) {
  const token = await getEmtusaToken();
  if (!token) return null;
  const response = await fetch(`${EMTUSA_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function buildEmtusaLinesGeo() {
  const now = Date.now();
  if (emtusaLinesCache && now < emtusaLinesExpiry) {
    return emtusaLinesCache;
  }
  const linesResp = await fetchEmtusaJson("/lineas/lineas");
  if (!linesResp || !linesResp.lineas) return null;

  const output = {
    updated: new Date().toISOString(),
    lines: [],
  };
  const linesMap = linesResp.lineas;
  const lineEntries = Object.values(linesMap);

  for (const line of lineEntries) {
    try {
      const idlinea = line.idlinea;
      const codigo = line.codigo;
      const colorhex = line.colorhex || line.colorHex || "2c3e50";
      const nombre = String(line.descripcion || line.nombreLinea || codigo || "").trim();
      if (!idlinea) continue;

      const detail = await fetchEmtusaJson(`/lineas/lineas/${idlinea}`);
      const trayectos = Array.isArray(detail) && detail.length ? detail[0].trayectos || [] : [];
      const coordsList = [];

      for (const tray of trayectos.slice(0, 2)) {
        const idtrayecto = tray.idtrayecto;
        if (!idtrayecto) continue;
        const trayectoResp = await fetchEmtusaJson(
          `/trayectos/trayectos/${idlinea}/${idtrayecto}`
        );
        const paradas = trayectoResp?.paradas || [];
        const coords = paradas
          .map((p) => [Number(p.latitud), Number(p.longitud)])
          .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
        if (coords.length >= 2) {
          coordsList.push({ idtrayecto, coords });
        }
      }

      if (coordsList.length) {
        output.lines.push({
          idlinea,
          codigo,
          color: colorhex.startsWith("#") ? colorhex : `#${colorhex}`,
          nombre,
          trayectos: coordsList,
        });
      }
    } catch (err) {
      continue;
    }
  }

  emtusaLinesCache = output;
  emtusaLinesExpiry = now + 6 * 60 * 60 * 1000;
  return output;
}

async function buildEmtusaStops() {
  const now = Date.now();
  if (emtusaStopsCache && now < emtusaStopsExpiry) {
    return emtusaStopsCache;
  }
  const stopsResp = await fetchEmtusaJson("/paradas/todasParadas");
  if (!Array.isArray(stopsResp)) return null;
  const paradas = stopsResp.map((stop) => ({
    idparada: stop.idparada,
    descripcion: stop.descripcion || "",
    latitud: Number(stop.latitud),
    longitud: Number(stop.longitud),
  }));
  emtusaStopsCache = { updated: new Date().toISOString(), paradas };
  emtusaStopsExpiry = now + 6 * 60 * 60 * 1000;
  return emtusaStopsCache;
}

async function getEmtusaLinesForStop(stopId) {
  const cached = emtusaStopLineCache.get(stopId);
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.lineIds;
  const linesResp = await fetchEmtusaJson(`/paradas/lineasParada/${stopId}`);
  if (!Array.isArray(linesResp)) return [];
  const lineIds = linesResp.map((line) => String(line.idlinea || line.idLinea || line.codigo));
  emtusaStopLineCache.set(stopId, {
    lineIds,
    expiresAt: now + 6 * 60 * 60 * 1000,
  });
  return lineIds;
}

async function buildEmtusaStopsByLine(lineId) {
  const key = String(lineId);
  const cached = emtusaStopsByLineCache.get(key);
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.data;
  const all = await buildEmtusaStops();
  if (!all) return null;
  const filtered = [];
  for (const stop of all.paradas) {
    const stopId = stop.idparada;
    if (!stopId) continue;
    const lineIds = await getEmtusaLinesForStop(stopId);
    if (lineIds.includes(key)) {
      filtered.push(stop);
    }
  }
  const data = { updated: new Date().toISOString(), paradas: filtered };
  emtusaStopsByLineCache.set(key, {
    data,
    expiresAt: now + 6 * 60 * 60 * 1000,
  });
  return data;
}

function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

async function fetchBiciJson(path) {
  const response = await fetch(`${BICI_BASE}${path}`, {
    headers: { "user-agent": "renfe-mapa-demo" },
  });
  if (!response.ok) return null;
  return response.json();
}

async function buildBiciStations() {
  const now = Date.now();
  if (biciCache && now < biciExpiry) {
    return biciCache;
  }
  const entities = await fetchBiciJson("/client/entities");
  const areas = await fetchBiciJson(`/client/areas?ids=${BICI_AREA_ID}`);
  const stations = entities?.data?.stations ?? [];
  const polygon = areas?.data?.areas?.[0]?.coordinates ?? [];

  let filtered = stations;
  if (polygon.length >= 3) {
    filtered = stations.filter((station) => {
      const coords = station.coordinates;
      if (!coords || coords.length < 2) return false;
      return pointInPolygon(coords[0], coords[1], polygon);
    });
  }

  biciCache = {
    updated: new Date().toISOString(),
    stations: filtered,
    area: { id: BICI_AREA_ID, coordinates: polygon },
  };
  biciExpiry = now + 15000;
  return biciCache;
}

async function buildBikeParking() {
  const now = Date.now();
  if (biciParkingCache && now < biciParkingExpiry) {
    return biciParkingCache;
  }
  const items = [];
  let offset = 0;
  const limit = 100;
  let totalCount = null;

  while (totalCount === null || offset < totalCount) {
    const response = await fetch(`${BICI_PARKING_BASE}?limit=${limit}&offset=${offset}`);
    if (!response.ok) return null;
    const data = await response.json();
    const records = Array.isArray(data.records) ? data.records : [];
    if (totalCount === null) {
      totalCount = Number(data.total_count ?? records.length);
    }
    records.forEach((record) => {
      const fields = record?.record?.fields || {};
      const location = fields.location || {};
      const lat = Number(fields.latitud ?? fields.lat ?? location.lat);
      const lon = Number(fields.longitud ?? fields.lon ?? location.lon);
      items.push({
        id: record?.record?.id || record?.record?.recordid,
        latitud: lat,
        longitud: lon,
        address: fields.direccion || fields.address || "",
      });
    });
    if (!records.length) break;
    offset += limit;
  }
  biciParkingCache = { updated: new Date().toISOString(), items };
  biciParkingExpiry = now + 6 * 60 * 60 * 1000;
  return biciParkingCache;
}

function pointInBbox(lon, lat, bbox) {
  return (
    lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat
  );
}

function pointInPolygonGuppy(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

async function fetchGuppyJson(path) {
  const response = await fetch(`${GUPPY_BASE}${path}`, {
    headers: { "user-agent": "renfe-mapa-demo" },
  });
  if (!response.ok) return null;
  return response.json();
}

async function buildGuppyMap() {
  const now = Date.now();
  if (guppyCache && now < guppyExpiry) {
    return guppyCache;
  }
  const payload = await fetchGuppyJson("/vehicle/list/map");
  const data = payload?.data ?? {};
  const areas = data.available_areas ?? [];
  const vehicles = data.vehicles ?? [];
  const pois = data.points_of_interest ?? [];

  const areaCandidates = areas.filter((area) =>
    (area.points || []).some((p) => pointInBbox(p.longitude, p.latitude, GUPPY_BBOX))
  );
  const allowedPolygons = areaCandidates
    .filter((area) => !area.excluded_area)
    .map((area) => (area.points || []).map((p) => [p.longitude, p.latitude]));

  const filteredVehicles = vehicles.filter((car) => {
    if (!pointInBbox(car.longitude, car.latitude, GUPPY_BBOX)) return false;
    return allowedPolygons.some(
      (poly) => poly.length >= 3 && pointInPolygonGuppy(car.longitude, car.latitude, poly)
    );
  });
  const filteredPois = pois.filter((poi) =>
    pointInBbox(poi.longitude, poi.latitude, GUPPY_BBOX)
  );

  guppyCache = {
    updated: new Date().toISOString(),
    areas: areaCandidates,
    vehicles: filteredVehicles,
    pois: filteredPois,
  };
  guppyExpiry = now + 15000;
  return guppyCache;
}

async function serveStatic(res, urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = join(PUBLIC_DIR, safePath);
  try {
    const data = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (req.url.startsWith("/api/flota")) {
    await proxyJson(res, `${REMOTE_BASE}/renfe-visor/flota.json`);
    return;
  }

  if (req.url.startsWith("/api/lineas")) {
    await proxyJson(res, `${REMOTE_BASE}/data/lineasnucleos.geojson`);
    return;
  }

  if (req.url.startsWith("/api/estaciones")) {
    await proxyJson(res, `${REMOTE_BASE}/data/estaciones.geojson`);
    return;
  }

  if (req.url.startsWith("/api/salidas")) {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
    const station = requestUrl.searchParams.get("station");
    if (!station) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing station" }));
      return;
    }
    await proxyJson(
      res,
      `${REMOTE_BASE}/renfe-json-cutter/write/salidas/estacion/${station}.json`
    );
    return;
  }

  if (req.url.startsWith("/api/emtusa/buses")) {
    const token = await getEmtusaToken();
    if (!token) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "No EMTUSA token" }));
      return;
    }
    const response = await fetch(`${EMTUSA_BASE}/autobuses/coordenadas`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "EMTUSA fetch failed" }));
      return;
    }
    const data = await response.text();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(data);
    return;
  }

  if (req.url.startsWith("/api/emtusa/lineas-geo")) {
    const data = await buildEmtusaLinesGeo();
    if (!data) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "EMTUSA lineas failed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=21600",
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url.startsWith("/api/emtusa/paradas")) {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
    const lineId = requestUrl.searchParams.get("linea");
    const data = lineId ? await buildEmtusaStopsByLine(lineId) : await buildEmtusaStops();
    if (!data) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "EMTUSA paradas failed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=21600",
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url.startsWith("/api/bici/stations")) {
    const data = await buildBiciStations();
    if (!data) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Bici fetch failed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url.startsWith("/api/bici/parking")) {
    const data = await buildBikeParking();
    if (!data) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Bike parking fetch failed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=21600",
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url.startsWith("/api/guppy/map")) {
    const data = await buildGuppyMap();
    if (!data) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Guppy fetch failed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url.startsWith("/api/debug-log")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const body = await readRequestBody(req);
      const payload = body ? JSON.parse(body) : {};
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (!entries.length) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: 0 }));
        return;
      }
      await mkdir(LOG_DIR, { recursive: true });
      const timestamp = new Date().toISOString();
      const lines = entries.map((entry) => `[${timestamp}] ${entry}`).join("\n") + "\n";
      await appendFile(LOG_FILE, lines, "utf8");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: entries.length }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Log write failed" }));
    }
    return;
  }

  await serveStatic(res, req.url);
});

server.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
