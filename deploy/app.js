const NUCLEO_ID = "20"; // Asturias
const UPDATE_MS = 15000;
const ANIMATION_MS = Math.max(UPDATE_MS - 2000, 4000);
const API_PROXY = window.API_PROXY || "";

function apiUrl(path) {
  if (!API_PROXY) return path;
  const joiner = API_PROXY.includes("?") ? "&" : "?";
  return `${API_PROXY}${joiner}path=${encodeURIComponent(path)}`;
}

function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}

const statusEl = document.getElementById("status");
const legendEl = document.getElementById("lines-legend");
const btnAll = document.getElementById("btn-all");
const btnNone = document.getElementById("btn-none");
const busLinesToggle = document.getElementById("bus-lines-toggle");
const busLinesCountEl = document.getElementById("bus-lines-count");
const busToggle = document.getElementById("bus-toggle");
const busCountEl = document.getElementById("bus-count");
const busLinesLegendEl = document.getElementById("bus-lines-legend");
const busLinesAllBtn = document.getElementById("bus-lines-all");
const busLinesNoneBtn = document.getElementById("bus-lines-none");
const busStopsToggle = document.getElementById("bus-stops-toggle");
const busStopsCountEl = document.getElementById("bus-stops-count");
const bikeToggle = document.getElementById("bike-toggle");
const bikeCountEl = document.getElementById("bike-count");
const bikeParkingToggle = document.getElementById("bike-parking-toggle");
const bikeParkingCountEl = document.getElementById("bike-parking-count");
const carZonesToggle = document.getElementById("car-zones-toggle");
const carZonesCountEl = document.getElementById("car-zones-count");
const carToggle = document.getElementById("car-toggle");
const carCountEl = document.getElementById("car-count");
const carPoiToggle = document.getElementById("car-poi-toggle");
const carPoiCountEl = document.getElementById("car-poi-count");
const stationSelect = document.getElementById("station-select");
const stationSearch = document.getElementById("station-search");
const departuresEl = document.getElementById("departures");
const trainCardEl = document.getElementById("train-card");
const busCardEl = document.getElementById("bus-card");
const busStopCardEl = document.getElementById("bus-stop-card");
const bikeCardEl = document.getElementById("bike-card");
const carCardEl = document.getElementById("car-card");
const tabs = Array.from(document.querySelectorAll(".panel-tab"));
const panelTrain = document.getElementById("panel-train");
const panelBus = document.getElementById("panel-bus");
const panelBike = document.getElementById("panel-bike");
const panelCar = document.getElementById("panel-car");
const panelIntermodal = document.getElementById("panel-intermodal");
const intermodalUseBusBtn = document.getElementById("intermodal-use-bus");
const intermodalUseUserBtn = document.getElementById("intermodal-use-user");
const intermodalClearBtn = document.getElementById("intermodal-clear");
const intermodalBusLabel = document.getElementById("intermodal-bus-label");
const intermodalRange = document.getElementById("intermodal-range");
const intermodalRangeValue = document.getElementById("intermodal-range-value");
const intermodalTrainToggle = document.getElementById("intermodal-train-toggle");
const intermodalBusToggle = document.getElementById("intermodal-bus-toggle");
const intermodalBikeToggle = document.getElementById("intermodal-bike-toggle");
const intermodalParkingToggle = document.getElementById("intermodal-parking-toggle");
const intermodalStopsToggle = document.getElementById("intermodal-stops-toggle");
const intermodalCarToggle = document.getElementById("intermodal-car-toggle");
const intermodalStatus = document.getElementById("intermodal-status");
const debugTrainEl = document.getElementById("debug-train");
const debugTrainDot = document.getElementById("debug-train-dot");
const debugBusEl = document.getElementById("debug-bus");
const debugBusDot = document.getElementById("debug-bus-dot");
const debugLogEl = document.getElementById("debug-log");
const debugFloat = document.querySelector(".debug-float");
const disclaimerPop = document.querySelector(".disclaimer-pop");
const mapFullscreenToggle = document.getElementById("map-fullscreen-toggle");

const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const lineLayerGroup = L.layerGroup().addTo(map);
const trainLayerGroup = L.layerGroup().addTo(map);
const busLinesLayerGroup = L.layerGroup().addTo(map);
const busLayerGroup = L.layerGroup().addTo(map);
const busStopsLayerGroup = L.layerGroup().addTo(map);
const bikeLayerGroup = L.layerGroup().addTo(map);
const bikeParkingLayerGroup = L.layerGroup().addTo(map);
const carZonesLayerGroup = L.layerGroup().addTo(map);
const carLayerGroup = L.layerGroup().addTo(map);
const carPoiLayerGroup = L.layerGroup().addTo(map);
const trainMarkers = new Map();
const busMarkers = new Map();
const busStopMarkers = new Map();
const bikeMarkers = new Map();
const bikeParkingMarkers = new Map();
const carMarkers = new Map();
const carPoiMarkers = new Map();
const linePolylines = new Map();
const lineMeta = new Map();
const selectedLines = new Set();
const busLinePolylines = new Map();
const busLineMeta = new Map();
const busSelectedLines = new Set();
let lastTrenes = [];
const stationNames = new Map();
let stationList = [];
let selectedTrainId = null;
let selectedTrainLine = null;
let lastBusCount = 0;
let lastBusLineCount = 0;
let lastBusStopCount = 0;
let busLinesLoaded = false;
let busStopsLoaded = false;
let busStopsLoadedKey = "";
let selectedBusId = null;
let selectedBusLineId = null;
let lastBikeCount = 0;
let selectedBikeId = null;
let lastBikeStations = [];
let lastBikeParkingCount = 0;
let lastCarCount = 0;
let lastCarZonesCount = 0;
let lastCarPoiCount = 0;
let selectedCarId = null;
let lastCarData = null;
let intermodalBusId = null;
let intermodalAlertText = "";
let intermodalRangeMeters = 500;
let intermodalCircle = null;
let intermodalMode = "bus";
let intermodalUserMarker = null;
let intermodalUserWatch = null;
let intermodalUserPos = null;
let lastTrainUpdateAt = 0;
let lastTrainMoveAt = 0;
let lastBusUpdateAt = 0;
let lastBusMoveAt = 0;
const lastTrainPositions = new Map();
const lastBusPositions = new Map();
const debugLog = [];
const debugLogQueue = [];
let debugLogTimer = null;
let intermodalRecalcTimer = null;

function setStatus(text, ok = true) {
  statusEl.textContent = text;
  statusEl.style.background = ok ? "#d6f2dc" : "#f3d5d1";
  statusEl.style.color = ok ? "#1f5e2d" : "#7a2017";
}

function updateStatus(trainCount, ok = true) {
  const totalLines = lineMeta.size;
  const selectedCount = selectedLines.size;
  const selLabel = totalLines ? `${selectedCount}/${totalLines}` : "0/0";
  const busLabel = busToggle?.checked ? `Buses: ${lastBusCount}` : "Buses: off";
  const bikeLabel = bikeToggle?.checked ? `Bicis: ${lastBikeCount}` : "Bicis: off";
  const carLabel = carToggle?.checked ? `Coches: ${lastCarCount}` : "Coches: off";
  setStatus(
    `Lineas: ${totalLines} (sel ${selLabel}) | Trenes: ${trainCount} | ${busLabel} | ${bikeLabel} | ${carLabel}`,
    ok
  );
}

function setTrainCard(tren) {
  if (!trainCardEl) return;
  if (!tren) {
    trainCardEl.innerHTML = '<div class="empty">Haz click en un tren del mapa.</div>';
    return;
  }
  const lineCode = String(tren.codLinea || "").toUpperCase();
  const color = lineMeta.get(lineCode)?.color || "#999";
  const retraso = tren.retrasoMin ?? "-";
  const estAct = stationNames.get(String(tren.codEstAct)) || tren.codEstAct || "-";
  const estSig = stationNames.get(String(tren.codEstSig)) || tren.codEstSig || "-";
  const estOrig = stationNames.get(String(tren.codEstOrig)) || tren.codEstOrig || "-";
  const estDest = stationNames.get(String(tren.codEstDest)) || tren.codEstDest || "-";
  const via = tren.via || "-";
  const nextVia = tren.nextVia || "-";
  const llegada = tren.horaLlegadaSigEst || "-";

  trainCardEl.innerHTML = `
    <div class="title">
      <span>Tren ${tren.codTren || "-"}</span>
      <span class="line-pill" style="background:${color}; color:#fff;">${lineCode || "-"}</span>
    </div>
    <div class="row"><span>Origen</span><span>${estOrig}</span></div>
    <div class="row"><span>Destino</span><span>${estDest}</span></div>
    <div class="row"><span>Actual</span><span>${estAct}</span></div>
    <div class="row"><span>Siguiente</span><span>${estSig}</span></div>
    <div class="row"><span>Via</span><span>${via} -> ${nextVia}</span></div>
    <div class="row"><span>Retraso</span><span>${retraso} min</span></div>
    <div class="row"><span>ETA sig.</span><span>${llegada}</span></div>
  `;
}

function setBusCard(bus) {
  if (!busCardEl) return;
  if (!bus) {
    busCardEl.innerHTML = '<div class="empty">Haz click en un bus del mapa.</div>';
    return;
  }
  const color = bus.colorhex ? `#${bus.colorhex}` : "#2c3e50";
  const linea = bus.codigo || "-";
  const nombre = bus.nombreLinea || "-";
  const origen = bus.origen || "-";
  const destino = bus.destino || "-";
  const numBus = bus.numBus || "-";
  const lat = bus.latitud?.toFixed ? bus.latitud.toFixed(5) : bus.latitud;
  const lon = bus.longitud?.toFixed ? bus.longitud.toFixed(5) : bus.longitud;

  busCardEl.innerHTML = `
    <div class="title">
      <span>Bus ${numBus}</span>
      <span class="line-pill" style="background:${color}; color:#fff;">${linea}</span>
    </div>
    <div class="row"><span>Linea</span><span>${nombre}</span></div>
    <div class="row"><span>Origen</span><span>${origen}</span></div>
    <div class="row"><span>Destino</span><span>${destino}</span></div>
    <div class="row"><span>Coord</span><span>${lat}, ${lon}</span></div>
  `;
}

function setBusStopCard(stop, lines) {
  if (!busStopCardEl) return;
  if (!stop) {
    busStopCardEl.innerHTML = '<div class="empty">Haz click en una parada del mapa.</div>';
    return;
  }
  if (lines == null) {
    busStopCardEl.innerHTML = '<div class="empty">Cargando lineas...</div>';
    return;
  }
  const name = stop.descripcion || `Parada ${stop.idparada || "-"}`;
  const lineLabels = Array.isArray(lines) && lines.length
    ? lines.map((line) => line.codigo || line.idlinea || line.idLinea || "-").join(", ")
    : "Sin datos";
  busStopCardEl.innerHTML = `
    <div class="title">
      <span>${name}</span>
      <span class="line-pill" style="background:#0b7285; color:#fff;">P</span>
    </div>
    <div class="row"><span>Lineas</span><span>${lineLabels}</span></div>
  `;
}

function setBikeCard(station) {
  if (!bikeCardEl) return;
  if (!station) {
    bikeCardEl.innerHTML =
      '<div class="empty">Haz click en una estacion del mapa.</div>';
    return;
  }
  const bikes = station.availableBikes ?? 0;
  const slots = station.availableSlots ?? 0;
  const status = station.isClosed ? "Cerrada" : "Operativa";
  const type = station.isVirtual ? "Virtual" : "Fisica";
  const lat = station.coordinates?.[1]?.toFixed
    ? station.coordinates[1].toFixed(5)
    : station.coordinates?.[1];
  const lon = station.coordinates?.[0]?.toFixed
    ? station.coordinates[0].toFixed(5)
    : station.coordinates?.[0];

  bikeCardEl.innerHTML = `
    <div class="title">
      <span>${station.label || "Estacion"}</span>
      <span class="line-pill" style="background:#2c7a7b; color:#fff;">Bici</span>
    </div>
    <div class="row"><span>Estado</span><span>${status}</span></div>
    <div class="row"><span>Tipo</span><span>${type}</span></div>
    <div class="row"><span>Bicis</span><span>${bikes}</span></div>
    <div class="row"><span>Plazas</span><span>${slots}</span></div>
    <div class="row"><span>Coord</span><span>${lat}, ${lon}</span></div>
  `;
}

function setCarCard(item) {
  if (!carCardEl) return;
  if (!item) {
    carCardEl.innerHTML = '<div class="empty">Haz click en un coche o punto guppy.</div>';
    return;
  }
  if (item.type === "poi") {
    const free = item.free_parking_spaces ?? 0;
    const total = item.parking_spaces ?? 0;
    const city = item.city?.name || "-";
    carCardEl.innerHTML = `
      <div class="title">
        <span>${item.name || "Punto guppy"}</span>
        <span class="line-pill" style="background:#0b7285; color:#fff;">P</span>
      </div>
      <div class="row"><span>Ciudad</span><span>${city}</span></div>
      <div class="row"><span>Plazas libres</span><span>${free}</span></div>
      <div class="row"><span>Total</span><span>${total}</span></div>
    `;
    return;
  }
  const lat = item.latitude?.toFixed ? item.latitude.toFixed(5) : item.latitude;
  const lon = item.longitude?.toFixed ? item.longitude.toFixed(5) : item.longitude;
  carCardEl.innerHTML = `
    <div class="title">
      <span>${item.name || "Coche guppy"}</span>
      <span class="line-pill" style="background:#1864ab; color:#fff;">C</span>
    </div>
    <div class="row"><span>Coord</span><span>${lat}, ${lon}</span></div>
  `;
}

function setActiveTab(tabName) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  if (panelTrain) {
    panelTrain.classList.toggle("active", tabName === "train");
  }
  if (panelBus) {
    panelBus.classList.toggle("active", tabName === "bus");
  }
  if (panelBike) {
    panelBike.classList.toggle("active", tabName === "bike");
  }
  if (panelCar) {
    panelCar.classList.toggle("active", tabName === "car");
  }
  if (panelIntermodal) {
    panelIntermodal.classList.toggle("active", tabName === "intermodal");
  }
}

function updateIntermodalLabel(bus) {
  if (!intermodalBusLabel) return;
  if (!bus) {
    intermodalBusLabel.textContent = "Sin bus seleccionado";
    return;
  }
  const linea = bus.codigo || "-";
  const numBus = bus.numBus || "-";
  intermodalBusLabel.textContent = `Linea ${linea} · Bus ${numBus}`;
}

function formatIntermodalRow(label, value) {
  return `<div class="row"><span>${label}</span><span>${value}</span></div>`;
}

function updateIntermodalCircle(latlng, range) {
  if (!latlng) return;
  if (!intermodalCircle) {
    intermodalCircle = L.circle(latlng, {
      radius: range,
      color: "#111",
      weight: 1,
      fillColor: "#111",
      fillOpacity: 0.08,
      opacity: 0.5,
    }).addTo(map);
  } else {
    intermodalCircle.setLatLng(latlng);
    intermodalCircle.setRadius(range);
  }
}

function scheduleIntermodalRecalc() {
  if (intermodalRecalcTimer) return;
  intermodalRecalcTimer = window.setTimeout(() => {
    intermodalRecalcTimer = null;
    updateIntermodalAlerts();
  }, 400);
}

function updateIntermodalCirclePosition(latlng) {
  if (!intermodalCircle || !latlng) return;
  intermodalCircle.setLatLng(latlng);
  if (intermodalCircle.getTooltip()) {
    intermodalCircle.getTooltip().setLatLng(latlng);
  }
}

function setDebugState(dotEl, state) {
  if (!dotEl) return;
  dotEl.classList.remove("ok", "idle", "stale");
  if (state) dotEl.classList.add(state);
}

function stopUserTracking() {
  if (intermodalUserWatch != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(intermodalUserWatch);
  }
  intermodalUserWatch = null;
  intermodalUserPos = null;
  if (intermodalUserMarker) {
    map.removeLayer(intermodalUserMarker);
    intermodalUserMarker = null;
  }
}

function centerOnUser(latlng) {
  if (!latlng) return;
  const nextZoom = Math.max(map.getZoom(), 14);
  map.setView(latlng, nextZoom, { animate: false });
}

function geoErrorMessage(error) {
  if (!error) return "No se pudo obtener la ubicacion.";
  switch (error.code) {
    case 1:
      return "Permiso denegado para la ubicacion.";
    case 2:
      return "Ubicacion no disponible.";
    case 3:
      return "Tiempo de espera agotado.";
    default:
      return "No se pudo obtener la ubicacion.";
  }
}

function addDebugLog(entry) {
  if (!entry) return;
  const timestamp = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  debugLog.push(`[${timestamp}] ${entry}`);
  if (debugLog.length > 30) {
    debugLog.shift();
  }
  if (debugLogEl) {
    debugLogEl.textContent = debugLog.join("\n");
  }
  debugLogQueue.push(entry);
  if (!debugLogTimer) {
    debugLogTimer = window.setTimeout(flushDebugLogQueue, 3000);
  }
}

async function flushDebugLogQueue() {
  debugLogTimer = null;
  if (!debugLogQueue.length) return;
  const entries = debugLogQueue.splice(0, debugLogQueue.length);
  try {
    await apiFetch("/api/debug-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch (err) {
    debugLogQueue.unshift(...entries);
  }
}

function updateDebugUI(kind, updateAt, moveAt, isOff = false) {
  const now = Date.now();
  const textEl = kind === "train" ? debugTrainEl : debugBusEl;
  const dotEl = kind === "train" ? debugTrainDot : debugBusDot;
  if (!textEl || !dotEl) return;
  if (isOff) {
    textEl.textContent = "off";
    setDebugState(dotEl, "stale");
    return;
  }
  if (!updateAt) {
    textEl.textContent = "--";
    setDebugState(dotEl, "stale");
    return;
  }
  const updateAge = Math.round((now - updateAt) / 1000);
  const moveAge = moveAt ? Math.round((now - moveAt) / 1000) : null;
  textEl.textContent = `act ${updateAge}s · mov ${moveAge ?? "--"}s`;
  if (now - updateAt > UPDATE_MS * 2) {
    setDebugState(dotEl, "stale");
  } else if (moveAt && now - moveAt > UPDATE_MS * 2) {
    setDebugState(dotEl, "idle");
  } else {
    setDebugState(dotEl, "ok");
  }
}

function toggleMarkerNearby(marker, isNearby) {
  const el = marker?.getElement?.();
  if (!el) return;
  el.classList.toggle("marker-nearby", isNearby);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function updateIntermodalAlerts() {
  const usingUser = intermodalMode === "user";
  if (usingUser && !intermodalUserPos) {
    intermodalAlertText = "";
    updateIntermodalLabel(null);
    if (intermodalCircle) {
      map.removeLayer(intermodalCircle);
      intermodalCircle = null;
    }
    trainMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    bikeMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    bikeParkingMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    busStopMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    carMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    if (intermodalStatus) {
      intermodalStatus.innerHTML = '<div class="empty">Activa tu ubicacion para ver alertas.</div>';
    }
    return;
  }

  if (!usingUser && (!intermodalBusId || !busMarkers.has(intermodalBusId))) {
    intermodalAlertText = "";
    updateIntermodalLabel(null);
    if (intermodalCircle) {
      map.removeLayer(intermodalCircle);
      intermodalCircle = null;
    }
    trainMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    bikeMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    bikeParkingMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    busStopMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    carMarkers.forEach((marker) => toggleMarkerNearby(marker, false));
    if (intermodalStatus) {
      intermodalStatus.innerHTML = '<div class="empty">Sin alertas activas.</div>';
    }
    return;
  }

  const marker = usingUser ? null : busMarkers.get(intermodalBusId);
  const bus = marker?._bus;
  if (!usingUser) {
    updateIntermodalLabel(bus);
  } else if (intermodalBusLabel) {
    intermodalBusLabel.textContent = "Mi ubicacion";
  }

  const position = usingUser ? intermodalUserPos : marker.getLatLng();
  const lat = position.lat;
  const lon = position.lng;
  const range = intermodalRangeMeters;
  const parts = [];
  const rows = [];
  const nearbyBuses = new Set();
  const nearbyTrains = new Set();
  const nearbyBikes = new Set();
  const nearbyParking = new Set();
  const nearbyStops = new Set();
  const nearbyCars = new Set();
  let busCount = 0;
  let trainCount = 0;
  let bikeCount = 0;
  let parkingCount = 0;
  let stopCount = 0;
  let carCount = 0;
  const showBus = intermodalBusToggle?.checked ?? true;

  if (showBus) {
    busMarkers.forEach((busMarker, id) => {
      if (!usingUser && id === intermodalBusId) return;
      const busPos = busMarker.getLatLng();
      if (haversineMeters(lat, lon, busPos.lat, busPos.lng) <= range) {
        busCount += 1;
        nearbyBuses.add(id);
      }
    });
    rows.push(formatIntermodalRow("Buses cercanos", String(busCount)));
    if (busCount > 0) parts.push(`Bus ${busCount}`);
  }

  if (intermodalTrainToggle?.checked) {
    trainMarkers.forEach((trainMarker, id) => {
      const trainPos = trainMarker.getLatLng();
      if (haversineMeters(lat, lon, trainPos.lat, trainPos.lng) <= range) {
        trainCount += 1;
        nearbyTrains.add(id);
      }
    });
    rows.push(formatIntermodalRow("Trenes cercanos", String(trainCount)));
    if (trainCount > 0) parts.push(`Tren ${trainCount}`);
  }

  if (intermodalBikeToggle?.checked) {
    bikeMarkers.forEach((bikeMarker, id) => {
      const bikePos = bikeMarker.getLatLng();
      if (haversineMeters(lat, lon, bikePos.lat, bikePos.lng) <= range) {
        bikeCount += bikeMarker?._station?.availableBikes ?? 0;
        nearbyBikes.add(id);
      }
    });
    rows.push(formatIntermodalRow("Bicis disponibles", String(bikeCount)));
    if (bikeCount > 0) parts.push(`Bici ${bikeCount}`);
  }

  if (intermodalParkingToggle?.checked) {
    bikeParkingMarkers.forEach((parkingMarker, id) => {
      const parkPos = parkingMarker.getLatLng();
      if (haversineMeters(lat, lon, parkPos.lat, parkPos.lng) <= range) {
        parkingCount += 1;
        nearbyParking.add(id);
      }
    });
    rows.push(formatIntermodalRow("Aparcabicis", String(parkingCount)));
    if (parkingCount > 0) parts.push(`Aparca ${parkingCount}`);
  }

  if (intermodalStopsToggle?.checked) {
    busStopMarkers.forEach((stopMarker, id) => {
      const stopPos = stopMarker.getLatLng();
      if (haversineMeters(lat, lon, stopPos.lat, stopPos.lng) <= range) {
        stopCount += 1;
        nearbyStops.add(id);
      }
    });
    rows.push(formatIntermodalRow("Paradas", String(stopCount)));
    if (stopCount > 0) parts.push(`Parada ${stopCount}`);
  }

  if (intermodalCarToggle?.checked) {
    carMarkers.forEach((carMarker, id) => {
      const carPos = carMarker.getLatLng();
      if (haversineMeters(lat, lon, carPos.lat, carPos.lng) <= range) {
        carCount += 1;
        nearbyCars.add(id);
      }
    });
    rows.push(formatIntermodalRow("Coches cercanos", String(carCount)));
    if (carCount > 0) parts.push(`Coche ${carCount}`);
  }

  trainMarkers.forEach((trainMarker, id) => {
    toggleMarkerNearby(trainMarker, nearbyTrains.has(id));
  });
  bikeMarkers.forEach((bikeMarker, id) => {
    toggleMarkerNearby(bikeMarker, nearbyBikes.has(id));
  });
  bikeParkingMarkers.forEach((parkingMarker, id) => {
    toggleMarkerNearby(parkingMarker, nearbyParking.has(id));
  });
  busStopMarkers.forEach((stopMarker, id) => {
    toggleMarkerNearby(stopMarker, nearbyStops.has(id));
  });
  carMarkers.forEach((carMarker, id) => {
    toggleMarkerNearby(carMarker, nearbyCars.has(id));
  });
  busMarkers.forEach((busMarker, id) => {
    if (!usingUser && id === intermodalBusId) {
      toggleMarkerNearby(busMarker, false);
      return;
    }
    toggleMarkerNearby(busMarker, nearbyBuses.has(id));
  });

  if (showBus) {
    updateIntermodalCircle(position, range);
  } else if (intermodalCircle) {
    map.removeLayer(intermodalCircle);
    intermodalCircle = null;
  }

  intermodalAlertText = showBus ? parts.join(" · ") : "";
  if (marker && bus) {
    marker._onStep = (latlng) => {
      updateIntermodalCirclePosition(latlng);
      scheduleIntermodalRecalc();
    };
    marker.setIcon(buildBusIcon(bus));
  } else if (usingUser) {
    const labelParts = [];
    if (showBus) labelParts.push(`Bus ${busCount}`);
    if (intermodalTrainToggle?.checked) labelParts.push(`Tren ${trainCount}`);
    if (intermodalBikeToggle?.checked) labelParts.push(`Bici ${bikeCount}`);
    if (intermodalParkingToggle?.checked) labelParts.push(`Aparca ${parkingCount}`);
    if (intermodalStopsToggle?.checked) labelParts.push(`Parada ${stopCount}`);
    if (intermodalCarToggle?.checked) labelParts.push(`Coche ${carCount}`);
    const label = labelParts.length ? labelParts.join(" · ") : "Sin medios";
    if (intermodalUserMarker) {
      intermodalUserMarker.setIcon(buildUserIcon(label));
    }
    updateIntermodalCirclePosition(position);
  }

  if (intermodalStatus) {
    if (!rows.length || !parts.length) {
      intermodalStatus.innerHTML = '<div class="empty">Sin alertas activas.</div>';
    } else {
      intermodalStatus.innerHTML = rows.join("");
    }
  }
}

function focusTrain(marker) {
  if (!marker) return;
  const target = marker.getLatLng();
  const currentZoom = map.getZoom();
  const nextZoom = Math.max(currentZoom, 12);
  map.flyTo(target, nextZoom, { duration: 0.6 });
}

function polylineForFeature(feature, color) {
  if (!feature || !feature.geometry) return null;
  if (feature.geometry.type !== "LineString") return null;
  const latlngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return L.polyline(latlngs, {
    color,
    weight: 4,
    opacity: 0.9,
  });
}

function renderLegend() {
  if (!legendEl) return;
  legendEl.innerHTML = "";
  const codes = Array.from(lineMeta.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  codes.forEach((code) => {
    const meta = lineMeta.get(code);
    if (!meta) return;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    if (!selectedLines.has(code)) {
      item.classList.add("inactive");
    }
    item.dataset.line = code;
    const label = document.createElement("span");
    label.textContent = meta.name || code;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = meta.color;
    item.append(label, swatch);
    legendEl.appendChild(item);
  });
}

function renderBusLegend() {
  if (!busLinesLegendEl) return;
  busLinesLegendEl.innerHTML = "";
  const ids = Array.from(busLineMeta.keys()).sort((a, b) => a.localeCompare(b));
  ids.forEach((id) => {
    const meta = busLineMeta.get(id);
    if (!meta) return;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    if (!busSelectedLines.has(id)) {
      item.classList.add("inactive");
    }
    item.dataset.busLine = id;
    const label = document.createElement("span");
    label.textContent = meta.name || id;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = meta.color;
    item.append(label, swatch);
    busLinesLegendEl.appendChild(item);
  });
}

function applyLineStyles() {
  const hasHighlight = Boolean(selectedTrainLine);
  for (const [code, polylines] of linePolylines.entries()) {
    const meta = lineMeta.get(code);
    const isSelected = selectedTrainLine && code === selectedTrainLine;
    polylines.forEach((polyline) => {
      polyline.setStyle({
        color: meta?.color || "#c0392b",
        weight: hasHighlight ? (isSelected ? 6 : 3) : 4,
        opacity: hasHighlight ? (isSelected ? 1 : 0.6) : 0.9,
      });
    });
  }
}

async function loadBusLineMeta() {
  if (busLineMeta.size) {
    renderBusLegend();
    return;
  }
  const response = await apiFetch("/api/emtusa/lineas-simple");
  if (!response.ok) {
    return;
  }
  const data = await response.json();
  const lines = Array.isArray(data.lines) ? data.lines : [];
  lines.forEach((line) => {
    const id = String(line.idlinea || line.codigo || "");
    if (!id) return;
    if (!busLineMeta.has(id)) {
      const color = line.color || "#2c3e50";
      busLineMeta.set(id, { color: color.startsWith("#") ? color : `#${color}`, name: line.codigo || line.nombre || id });
    }
  });
  if (!busSelectedLines.size) {
    for (const id of busLineMeta.keys()) {
      busSelectedLines.add(id);
    }
  }
  renderBusLegend();
}

function applyBusLineVisibility() {
  busLinesLayerGroup.clearLayers();
  for (const [id, polylines] of busLinePolylines.entries()) {
    if (!busSelectedLines.has(id)) continue;
    polylines.forEach((polyline) => polyline.addTo(busLinesLayerGroup));
  }
  renderBusLegend();
}

function applyLineVisibility() {
  lineLayerGroup.clearLayers();
  for (const [code, polylines] of linePolylines.entries()) {
    if (!selectedLines.has(code)) continue;
    polylines.forEach((polyline) => polyline.addTo(lineLayerGroup));
  }
  applyLineStyles();
  updateMarkers(filterTrenes(lastTrenes));
  renderLegend();
}

function buildLines(features) {
  lineLayerGroup.clearLayers();
  linePolylines.clear();
  lineMeta.clear();
  const allPolylines = [];
  features.forEach((feature) => {
    const code = String(feature.properties.CODIGO || "").toUpperCase();
    const color = feature.properties.COLOR || "#c0392b";
    const name = feature.properties.NOMBRE || code;
    if (!lineMeta.has(code)) {
      lineMeta.set(code, { color, name });
    }
    const polyline = polylineForFeature(feature, color);
    if (polyline) {
      if (!linePolylines.has(code)) {
        linePolylines.set(code, []);
      }
      linePolylines.get(code).push(polyline);
      allPolylines.push(polyline);
    }
  });

  selectedLines.clear();
  for (const code of lineMeta.keys()) {
    selectedLines.add(code);
  }
  applyLineVisibility();

  if (allPolylines.length > 0) {
    const bounds = L.featureGroup(allPolylines).getBounds();
    map.fitBounds(bounds.pad(0.1));
  }
}

function animateMarker(marker, from, to, duration) {
  if (marker._animFrame) {
    cancelAnimationFrame(marker._animFrame);
    marker._animFrame = null;
  }
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const lat = from[0] + (to[0] - from[0]) * t;
    const lng = from[1] + (to[1] - from[1]) * t;
    marker.setLatLng([lat, lng]);
    if (marker._onStep) {
      marker._onStep(marker.getLatLng());
    }
    if (t < 1) {
      marker._animFrame = requestAnimationFrame(step);
    }
  }

  marker._animFrame = requestAnimationFrame(step);
}

async function loadLineas() {
  const response = await apiFetch("/api/lineas");
  if (!response.ok) {
    throw new Error("No se pudieron cargar las lineas");
  }
  const data = await response.json();
  const features = data.features || [];
  const filtered = features.filter(
    (f) => String(f.properties.IDNUCLEO) === NUCLEO_ID
  );
  buildLines(filtered);
  return filtered;
}

async function loadEstaciones() {
  if (!stationSelect) return;
  const response = await apiFetch("/api/estaciones");
  if (!response.ok) {
    throw new Error("No se pudieron cargar las estaciones");
  }
  const data = await response.json();
  const features = data.features || [];
  const filtered = features.filter(
    (f) => String(f.properties.NUCLEO) === NUCLEO_ID
  );
  stationNames.clear();
  stationList = filtered
    .map((f) => ({
      code: String(f.properties.CODIGO_ESTACION),
      name: String(f.properties.NOMBRE_ESTACION || "").trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  stationList.forEach((item) => {
    if (!item.code) return;
    stationNames.set(item.code, item.name || item.code);
  });
  renderStationOptions("");
}

function renderStationOptions(query) {
  if (!stationSelect) return;
  const term = String(query || "").toLowerCase();
  const current = stationSelect.value;
  const list = stationList.filter((item) =>
    item.name.toLowerCase().includes(term)
  );
  stationSelect.innerHTML = '<option value="">Elige una estacion</option>';
  list.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.code;
    opt.textContent = item.name || item.code;
    stationSelect.appendChild(opt);
  });
  if (current) {
    stationSelect.value = current;
  }
}

function trainPopup(tren) {
  const estOrig = stationNames.get(String(tren.codEstOrig)) || tren.codEstOrig || "-";
  const estDest = stationNames.get(String(tren.codEstDest)) || tren.codEstDest || "-";
  return `
    <strong>${tren.codLinea || "Linea"}</strong><br />
    Tren: ${tren.codTren || "-"}<br />
    ${estOrig} -> ${estDest}<br />
    Retraso: ${tren.retrasoMin ?? "-"} min
  `;
}

function buildTrainIcon(tren) {
  const lineCode = String(tren.codLinea || "").toUpperCase();
  const color = lineMeta.get(lineCode)?.color || "#e74c3c";
  const html = `<div class="marker marker-train" style="--marker-color:${color}"></div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function busMarkerId(bus) {
  return String(bus.numBus || `${bus.idlinea}-${bus.latitud}-${bus.longitud}`);
}

function buildBusIcon(bus) {
  const color = bus.colorhex ? `#${bus.colorhex}` : "#2c3e50";
  const id = busMarkerId(bus);
  const code = String(bus.codigo ?? "").trim();
  const digits = code.match(/\d+/)?.[0];
  const labelCode = digits || code || "-";
  const label = `L${labelCode}`;
  const showBus = intermodalBusToggle?.checked ?? true;
  const badge =
    showBus && intermodalAlertText && intermodalBusId === id
      ? `<span class="marker-alert">${intermodalAlertText}</span>`
      : "";
  const html = `<div class="marker marker-bus" style="--marker-color:${color}">${label}${badge}</div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function buildBusStopIcon() {
  const html = '<div class="marker marker-bus-stop" style="--marker-color:#0b7285">P</div>';
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function bikeCountLabel(count) {
  if (count == null) return "0";
  const num = Number(count);
  if (!Number.isFinite(num)) return "0";
  if (num > 99) return "99+";
  return String(num);
}

function buildBikeIcon(station) {
  const bikes = station.availableBikes ?? 0;
  const color = bikeMarkerColor(station);
  const html = `<div class="marker marker-bike" style="--marker-color:${color}">${bikeCountLabel(bikes)}</div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function buildBikeParkingIcon() {
  const html = '<div class="marker marker-bike-parking" style="--marker-color:#5c7cfa">P</div>';
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function buildUserIcon(label) {
  const badge = label
    ? `<span class="marker-alert marker-alert-user">${label}</span>`
    : "";
  const html = `<div class="marker marker-user" style="--marker-color:#111">${badge}</div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function updateMarkers(trenes) {
  const activeIds = new Set();
  const now = Date.now();

  trenes.forEach((tren) => {
    const id = tren.tripId;
    activeIds.add(id);

    const next = [tren.latitud, tren.longitud];
    const existing = trainMarkers.get(id);

    const lineCode = String(tren.codLinea || "").toUpperCase();
    if (!existing) {
      const marker = L.marker(next, {
        icon: buildTrainIcon(tren),
        keyboard: false,
      })
        .addTo(trainLayerGroup)
        .bindPopup(trainPopup(tren));

      marker._lastPos = next;
      marker._lastUpdateAt = now;
      marker._train = tren;
      marker.on("click", () => {
        selectedTrainId = id;
        selectedTrainLine = lineCode;
        applyLineStyles();
        setTrainCard(marker._train);
        focusTrain(marker);
        setActiveTab("train");
      });
      trainMarkers.set(id, marker);
    } else {
      const from = existing._lastPos || next;
      existing._onStep = null;
      animateMarker(existing, from, next, ANIMATION_MS);
      existing._lastPos = next;
      existing._lastUpdateAt = now;
      existing._train = tren;
      existing.setIcon(buildTrainIcon(tren));
      existing.setPopupContent(trainPopup(tren));
    }
  });

  for (const [id, marker] of trainMarkers.entries()) {
    if (!activeIds.has(id)) {
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
      }
      trainLayerGroup.removeLayer(marker);
      trainMarkers.delete(id);
      if (selectedTrainId === id) {
        selectedTrainId = null;
        selectedTrainLine = null;
        applyLineStyles();
        setTrainCard(null);
      }
    }
  }
}

function updateBusMarkers(buses) {
  const activeIds = new Set();
  const now = Date.now();
  buses.forEach((bus) => {
    const id = busMarkerId(bus);
    activeIds.add(id);
    const next = [bus.latitud, bus.longitud];
    const existing = busMarkers.get(id);

    if (!existing) {
      const marker = L.marker(next, {
        icon: buildBusIcon(bus),
        keyboard: false,
      })
        .addTo(busLayerGroup)
        .bindPopup(
          `<strong>Linea ${bus.codigo || "-"}</strong><br />` +
            `${bus.nombreLinea || "-"}<br />` +
            `Bus ${bus.numBus || "-"}`
        );
      marker._lastPos = next;
      marker._lastUpdateAt = now;
      marker._bus = bus;
      marker.on("click", () => {
        selectedBusId = id;
        selectedBusLineId = bus.idlinea ?? bus.idLinea ?? bus.codigo ?? null;
        setBusCard(marker._bus);
        setActiveTab("bus");
        busStopsLoaded = false;
        busStopsLoadedKey = "";
        loadBusStops();
      });
      busMarkers.set(id, marker);
    } else {
      const from = existing._lastPos || next;
      existing._onStep =
        intermodalBusId === id
          ? (latlng) => {
              updateIntermodalCirclePosition(latlng);
              scheduleIntermodalRecalc();
            }
          : null;
      animateMarker(existing, from, next, ANIMATION_MS);
      existing._lastPos = next;
      existing._lastUpdateAt = now;
      existing._bus = bus;
      existing.setIcon(buildBusIcon(bus));
      existing.setPopupContent(
        `<strong>Linea ${bus.codigo || "-"}</strong><br />` +
          `${bus.nombreLinea || "-"}<br />` +
          `Bus ${bus.numBus || "-"}`
      );
    }
  });

  for (const [id, marker] of busMarkers.entries()) {
    if (!activeIds.has(id)) {
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
      }
      busLayerGroup.removeLayer(marker);
      busMarkers.delete(id);
      if (selectedBusId === id) {
        selectedBusId = null;
        selectedBusLineId = null;
        setBusCard(null);
      }
    }
  }
}

function updateBusStopMarkers(stops) {
  const activeIds = new Set();
  stops.forEach((stop) => {
    const id = String(stop.idparada || stop.id);
    const lat = Number(stop.latitud);
    const lon = Number(stop.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const next = [lat, lon];
    activeIds.add(id);
    const existing = busStopMarkers.get(id);

    if (!existing) {
      const marker = L.marker(next, {
        icon: buildBusStopIcon(),
        keyboard: false,
      })
        .addTo(busStopsLayerGroup)
        .bindPopup(`<strong>Parada ${stop.descripcion || stop.idparada || "-"}</strong>`);
      marker._stop = stop;
      marker.on("click", async () => {
        setActiveTab("bus");
        const cachedLines = marker._lines;
        if (cachedLines) {
          setBusStopCard(stop, cachedLines);
          return;
        }
        setBusStopCard(stop, null);
        const stopLines = await loadBusStopLines(stop.idparada);
        marker._lines = stopLines;
        setBusStopCard(stop, stopLines);
      });
      busStopMarkers.set(id, marker);
    } else {
      existing.setLatLng(next);
      existing._stop = stop;
      existing.setPopupContent(
        `<strong>Parada ${stop.descripcion || stop.idparada || "-"}</strong>`
      );
    }
  });

  for (const [id, marker] of busStopMarkers.entries()) {
    if (!activeIds.has(id)) {
      busStopsLayerGroup.removeLayer(marker);
      busStopMarkers.delete(id);
    }
  }
}

function bikePopup(station) {
  const bikes = station.availableBikes ?? 0;
  const slots = station.availableSlots ?? 0;
  const status = station.isClosed ? "Cerrada" : "Operativa";
  return `
    <strong>${station.label || "Estacion"}</strong><br />
    ${status} | Bicis: ${bikes} | Plazas: ${slots}
  `;
}

function bikeMarkerColor(station) {
  if (station.isClosed) return "#8c8c8c";
  const bikes = station.availableBikes ?? 0;
  if (bikes === 0) return "#c0392b";
  if (bikes <= 2) return "#f39c12";
  return "#2e8b57";
}

function bikeParkingPopup(parking) {
  return `<strong>Aparcabicis</strong><br />${parking.address || "Ubicacion"}`;
}

function carMarkerColor() {
  return "#1864ab";
}

function buildCarIcon(car) {
  const color = carMarkerColor(car);
  const html = `<div class="marker marker-car" style="--marker-color:${color}"></div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function buildCarPoiIcon(poi) {
  const free = poi.free_parking_spaces ?? 0;
  const html = `<div class="marker marker-car-poi" style="--marker-color:#0b7285">${bikeCountLabel(free)}</div>`;
  return L.divIcon({
    className: "marker-wrap",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function carPopup(car) {
  return `<strong>${car.name || "Guppy"}</strong><br />Coche disponible`;
}

function carPoiPopup(poi) {
  const free = poi.free_parking_spaces ?? 0;
  const total = poi.parking_spaces ?? 0;
  return `<strong>${poi.name || "Punto guppy"}</strong><br />Plazas libres: ${free}/${total}`;
}

function updateBikeMarkers(stations) {
  const activeIds = new Set();
  stations.forEach((station) => {
    const id = String(station.id || station.label);
    if (!station.coordinates || station.coordinates.length < 2) return;
    const next = [station.coordinates[1], station.coordinates[0]];
    activeIds.add(id);
    const existing = bikeMarkers.get(id);

    if (!existing) {
      const marker = L.marker(next, {
        icon: buildBikeIcon(station),
        keyboard: false,
      })
        .addTo(bikeLayerGroup)
        .bindPopup(bikePopup(station));
      marker._station = station;
      marker._lastPos = next;
      marker.on("click", () => {
        selectedBikeId = id;
        setBikeCard(marker._station);
        setActiveTab("bike");
      });
      bikeMarkers.set(id, marker);
    } else {
      const from = existing._lastPos || next;
      animateMarker(existing, from, next, ANIMATION_MS);
      existing._lastPos = next;
      existing._station = station;
      existing.setIcon(buildBikeIcon(station));
      existing.setPopupContent(bikePopup(station));
    }
  });

  for (const [id, marker] of bikeMarkers.entries()) {
    if (!activeIds.has(id)) {
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
      }
      bikeLayerGroup.removeLayer(marker);
      bikeMarkers.delete(id);
      if (selectedBikeId === id) {
        selectedBikeId = null;
        setBikeCard(null);
      }
    }
  }
}

function updateBikeParkingMarkers(items) {
  const activeIds = new Set();
  items.forEach((parking, index) => {
    const id = String(parking.id || parking.recordId || index);
    const lat = parking.latitud ?? parking.lat;
    const lon = parking.longitud ?? parking.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const next = [lat, lon];
    activeIds.add(id);
    const existing = bikeParkingMarkers.get(id);

    if (!existing) {
      const marker = L.marker(next, {
        icon: buildBikeParkingIcon(),
        keyboard: false,
      })
        .addTo(bikeParkingLayerGroup)
        .bindPopup(bikeParkingPopup(parking));
      marker._parking = parking;
      bikeParkingMarkers.set(id, marker);
    } else {
      existing.setLatLng(next);
      existing._parking = parking;
      existing.setPopupContent(bikeParkingPopup(parking));
    }
  });

  for (const [id, marker] of bikeParkingMarkers.entries()) {
    if (!activeIds.has(id)) {
      bikeParkingLayerGroup.removeLayer(marker);
      bikeParkingMarkers.delete(id);
    }
  }
}

function updateCarMarkers(vehicles) {
  const activeIds = new Set();
  vehicles.forEach((car) => {
    const id = String(car.name || `${car.latitude}-${car.longitude}`);
    activeIds.add(id);
    const next = [car.latitude, car.longitude];
    const existing = carMarkers.get(id);
    if (!existing) {
      const marker = L.marker(next, {
        icon: buildCarIcon(car),
        keyboard: false,
      })
        .addTo(carLayerGroup)
        .bindPopup(carPopup(car));
      marker._car = car;
      marker._lastPos = next;
      marker.on("click", () => {
        selectedCarId = id;
        setCarCard({ ...car, type: "car" });
        setActiveTab("car");
      });
      carMarkers.set(id, marker);
    } else {
      const from = existing._lastPos || next;
      animateMarker(existing, from, next, ANIMATION_MS);
      existing._lastPos = next;
      existing._car = car;
      existing.setIcon(buildCarIcon(car));
      existing.setPopupContent(carPopup(car));
    }
  });

  for (const [id, marker] of carMarkers.entries()) {
    if (!activeIds.has(id)) {
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
      }
      carLayerGroup.removeLayer(marker);
      carMarkers.delete(id);
      if (selectedCarId === id) {
        selectedCarId = null;
        setCarCard(null);
      }
    }
  }
}

function updateCarPoiMarkers(pois) {
  const activeIds = new Set();
  pois.forEach((poi) => {
    const id = String(poi.id || poi.name);
    activeIds.add(id);
    const next = [poi.latitude, poi.longitude];
    const existing = carPoiMarkers.get(id);
    if (!existing) {
      const marker = L.marker(next, {
        icon: buildCarPoiIcon(poi),
        keyboard: false,
      })
        .addTo(carPoiLayerGroup)
        .bindPopup(carPoiPopup(poi));
      marker._poi = poi;
      marker._lastPos = next;
      marker.on("click", () => {
        selectedCarId = id;
        setCarCard({ ...poi, type: "poi" });
        setActiveTab("car");
      });
      carPoiMarkers.set(id, marker);
    } else {
      const from = existing._lastPos || next;
      animateMarker(existing, from, next, ANIMATION_MS);
      existing._lastPos = next;
      existing._poi = poi;
      existing.setIcon(buildCarPoiIcon(poi));
      existing.setPopupContent(carPoiPopup(poi));
    }
  });

  for (const [id, marker] of carPoiMarkers.entries()) {
    if (!activeIds.has(id)) {
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
      }
      carPoiLayerGroup.removeLayer(marker);
      carPoiMarkers.delete(id);
      if (selectedCarId === id) {
        selectedCarId = null;
        setCarCard(null);
      }
    }
  }
}

function drawCarZones(areas) {
  carZonesLayerGroup.clearLayers();
  if (!Array.isArray(areas)) {
    lastCarZonesCount = 0;
    if (carZonesCountEl) carZonesCountEl.textContent = "0";
    return;
  }
  let count = 0;
  areas.forEach((area) => {
    const points = area.points || [];
    if (points.length < 3) return;
    const latlngs = points.map((p) => [p.latitude, p.longitude]);
    const isExcluded = Boolean(area.excluded_area);
    const polygon = L.polygon(latlngs, {
      color: isExcluded ? "#c0392b" : "#0b7285",
      weight: 2,
      opacity: isExcluded ? 0.6 : 0.7,
      fillOpacity: isExcluded ? 0.05 : 0.08,
      dashArray: isExcluded ? "4 6" : null,
    });
    polygon.addTo(carZonesLayerGroup);
    count += 1;
  });
  lastCarZonesCount = count;
  if (carZonesCountEl) carZonesCountEl.textContent = String(count);
}

function drawBusLines(data) {
  busLinesLayerGroup.clearLayers();
  busLinePolylines.clear();
  if (!data || !Array.isArray(data.lines)) {
    lastBusLineCount = 0;
    if (busLinesCountEl) busLinesCountEl.textContent = "0";
    return;
  }
  const polylines = [];
  data.lines.forEach((linea) => {
    const id = String(linea.idlinea || linea.idLinea || linea.codigo || "");
    if (!id) return;
    const color = linea.color || "#2c3e50";
    const name = linea.codigo || linea.nombre || id;
    if (!busLineMeta.has(id)) {
      busLineMeta.set(id, { color, name });
    } else {
      const existing = busLineMeta.get(id);
      busLineMeta.set(id, { color: existing?.color || color, name: existing?.name || name });
    }
    (linea.trayectos || []).forEach((trayecto) => {
      const coords = trayecto.coords || [];
      if (coords.length < 2) return;
      const polyline = L.polyline(coords, {
        color,
        weight: 3,
        opacity: 0.6,
      });
      if (!busLinePolylines.has(id)) {
        busLinePolylines.set(id, []);
      }
      busLinePolylines.get(id).push(polyline);
      polylines.push(polyline);
    });
  });
  if (!busSelectedLines.size) {
    for (const id of busLineMeta.keys()) {
      busSelectedLines.add(id);
    }
  }
  applyBusLineVisibility();
  lastBusLineCount = polylines.length;
  if (busLinesCountEl) busLinesCountEl.textContent = String(lastBusLineCount);
}

function filterTrenes(trenes) {
  if (!selectedLines.size) return [];
  if (selectedLines.size === lineMeta.size) return trenes;
  return trenes.filter((tren) =>
    selectedLines.has(String(tren.codLinea || "").toUpperCase())
  );
}

function filterBuses(buses) {
  if (!busLineMeta.size) return buses;
  if (!busSelectedLines.size) return [];
  if (busSelectedLines.size === busLineMeta.size) return buses;
  return buses.filter((bus) => {
    const id = String(bus.idlinea || bus.idLinea || bus.codigo || "");
    return busSelectedLines.has(id);
  });
}

async function loadTrenes() {
  const response = await apiFetch("/api/flota");
  if (!response.ok) {
    addDebugLog("Tren: respuesta no OK.");
    throw new Error("No se pudieron cargar los trenes");
  }
  const data = await response.json();
  const trenes = (data.trenes || []).filter(
    (tren) => String(tren.nucleo) === NUCLEO_ID
  );
  const now = Date.now();
  let movedCount = 0;
  const sampleTrain = trenes[0];
  const sampleTrainCoords = sampleTrain
    ? `${Number(sampleTrain.latitud).toFixed(6)},${Number(sampleTrain.longitud).toFixed(6)}`
    : "n/a";
  trenes.forEach((tren) => {
    const id = tren.tripId;
    const lat = tren.latitud;
    const lon = tren.longitud;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (lastTrainPositions.get(id) !== key) {
      movedCount += 1;
    }
    lastTrainPositions.set(id, key);
  });
  lastTrainUpdateAt = now;
  if (movedCount > 0) {
    lastTrainMoveAt = now;
    addDebugLog(
      `Tren: update ok (${trenes.length} trenes, mov ${movedCount}, sample ${sampleTrainCoords}).`
    );
  } else if (trenes.length > 0) {
    addDebugLog(
      `Tren: 0 movimientos en ${trenes.length} trenes (sample ${sampleTrainCoords}).`
    );
  }
  lastTrenes = trenes;
  const visibles = filterTrenes(trenes);
  updateMarkers(visibles);
  if (selectedTrainId && trainMarkers.has(selectedTrainId)) {
    setTrainCard(trainMarkers.get(selectedTrainId)._train);
  }
  updateIntermodalAlerts();
  updateDebugUI("train", lastTrainUpdateAt, lastTrainMoveAt);
  return visibles.length;
}

async function loadBuses() {
  if (!busToggle?.checked) {
    lastBusCount = 0;
    busLayerGroup.clearLayers();
    busMarkers.clear();
    selectedBusId = null;
    selectedBusLineId = null;
    busStopsLoaded = false;
    busStopsLoadedKey = "";
    setBusCard(null);
    setBusStopCard(null, null);
    if (busCountEl) busCountEl.textContent = "0";
    updateIntermodalAlerts();
    updateDebugUI("bus", 0, 0, true);
    return 0;
  }
  const response = await apiFetch("/api/emtusa/buses");
  if (!response.ok) {
    addDebugLog("Bus: respuesta no OK.");
    return 0;
  }
  const rawBuses = await response.json();
  if (!Array.isArray(rawBuses)) {
    addDebugLog("Bus: respuesta invalida.");
    return 0;
  }
  const buses = filterBuses(rawBuses);
  const now = Date.now();
  let movedCount = 0;
  const sampleBus = buses[0];
  const sampleBusCoords = sampleBus
    ? `${Number(sampleBus.latitud).toFixed(6)},${Number(sampleBus.longitud).toFixed(6)}`
    : "n/a";
  buses.forEach((bus) => {
    const id = busMarkerId(bus);
    const lat = bus.latitud;
    const lon = bus.longitud;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (lastBusPositions.get(id) !== key) {
      movedCount += 1;
    }
    lastBusPositions.set(id, key);
  });
  lastBusUpdateAt = now;
  if (movedCount > 0) {
    lastBusMoveAt = now;
    addDebugLog(
      `Bus: update ok (${buses.length} buses, mov ${movedCount}, sample ${sampleBusCoords}).`
    );
  } else if (buses.length > 0) {
    addDebugLog(
      `Bus: 0 movimientos en ${buses.length} buses (sample ${sampleBusCoords}).`
    );
  }
  updateBusMarkers(buses);
  if (selectedBusId && busMarkers.has(selectedBusId)) {
    setBusCard(busMarkers.get(selectedBusId)._bus);
  }
  lastBusCount = buses.length;
  if (busCountEl) busCountEl.textContent = String(lastBusCount);
  updateIntermodalAlerts();
  updateDebugUI("bus", lastBusUpdateAt, lastBusMoveAt);
  return lastBusCount;
}

async function loadBikeStations() {
  if (!bikeToggle?.checked) {
    lastBikeCount = 0;
    lastBikeStations = [];
    bikeLayerGroup.clearLayers();
    bikeMarkers.clear();
    selectedBikeId = null;
    setBikeCard(null);
    if (bikeCountEl) bikeCountEl.textContent = "0";
    updateIntermodalAlerts();
    return 0;
  }
  const response = await apiFetch("/api/bici/stations");
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  const stations = Array.isArray(data.stations) ? data.stations : [];
  lastBikeStations = stations;
  updateBikeMarkers(stations);
  if (selectedBikeId && bikeMarkers.has(selectedBikeId)) {
    setBikeCard(bikeMarkers.get(selectedBikeId)._station);
  }
  lastBikeCount = stations.length;
  if (bikeCountEl) bikeCountEl.textContent = String(lastBikeCount);
  updateIntermodalAlerts();
  return lastBikeCount;
}

async function loadBikeParking() {
  if (!bikeParkingToggle?.checked) {
    lastBikeParkingCount = 0;
    bikeParkingLayerGroup.clearLayers();
    bikeParkingMarkers.clear();
    if (bikeParkingCountEl) bikeParkingCountEl.textContent = "0";
    return 0;
  }
  const response = await apiFetch("/api/bici/parking");
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];
  updateBikeParkingMarkers(items);
  lastBikeParkingCount = items.length;
  if (bikeParkingCountEl) bikeParkingCountEl.textContent = String(lastBikeParkingCount);
  return lastBikeParkingCount;
}

async function loadCarData() {
  const response = await apiFetch("/api/guppy/map");
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  lastCarData = data;
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  const areas = Array.isArray(data.areas) ? data.areas : [];
  const pois = Array.isArray(data.pois) ? data.pois : [];

  if (carZonesToggle?.checked) {
    if (!map.hasLayer(carZonesLayerGroup)) {
      carZonesLayerGroup.addTo(map);
    }
    drawCarZones(areas);
  } else if (map.hasLayer(carZonesLayerGroup)) {
    map.removeLayer(carZonesLayerGroup);
    if (carZonesCountEl) carZonesCountEl.textContent = "0";
  }

  if (carToggle?.checked) {
    updateCarMarkers(vehicles);
    lastCarCount = vehicles.length;
    if (carCountEl) carCountEl.textContent = String(lastCarCount);
  } else {
    carLayerGroup.clearLayers();
    carMarkers.clear();
    lastCarCount = 0;
    if (carCountEl) carCountEl.textContent = "0";
  }

  if (carPoiToggle?.checked) {
    updateCarPoiMarkers(pois);
    lastCarPoiCount = pois.length;
    if (carPoiCountEl) carPoiCountEl.textContent = String(lastCarPoiCount);
  } else {
    carPoiLayerGroup.clearLayers();
    carPoiMarkers.clear();
    lastCarPoiCount = 0;
    if (carPoiCountEl) carPoiCountEl.textContent = "0";
  }

  updateIntermodalAlerts();
  return lastCarCount;
}

async function loadBusLines() {
  if (!busLinesToggle?.checked) {
    if (map.hasLayer(busLinesLayerGroup)) {
      map.removeLayer(busLinesLayerGroup);
    }
    if (busLinesCountEl) busLinesCountEl.textContent = "0";
    return 0;
  }
  if (busLinesLoaded) {
    busLinesLayerGroup.addTo(map);
    if (busLinesCountEl) busLinesCountEl.textContent = String(lastBusLineCount);
    await loadBusLineMeta();
    return lastBusLineCount;
  }
  const response = await apiFetch("/api/emtusa/lineas-geo");
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  drawBusLines(data);
  await loadBusLineMeta();
  busLinesLoaded = true;
  return lastBusLineCount;
}

async function loadBusStops() {
  const shouldLoad = (busStopsToggle?.checked ?? false) || (intermodalStopsToggle?.checked ?? false);
  if (!shouldLoad) {
    if (map.hasLayer(busStopsLayerGroup)) {
      map.removeLayer(busStopsLayerGroup);
    }
    busStopMarkers.clear();
    busStopsLayerGroup.clearLayers();
    lastBusStopCount = 0;
    busStopsLoaded = false;
    if (busStopsCountEl) busStopsCountEl.textContent = "0";
    return 0;
  }
  const totalLines = busLineMeta.size;
  const selectedLineIds = Array.from(busSelectedLines);
  if (totalLines && !selectedLineIds.length) {
    busStopMarkers.clear();
    busStopsLayerGroup.clearLayers();
    lastBusStopCount = 0;
    busStopsLoaded = false;
    if (busStopsCountEl) busStopsCountEl.textContent = "0";
    return 0;
  }
  const stopsKey =
    !totalLines || selectedLineIds.length === totalLines
      ? "all"
      : selectedLineIds.sort().join(",");
  if (busStopsLoaded && busStopsLoadedKey === stopsKey) {
    if (busStopsToggle?.checked && !map.hasLayer(busStopsLayerGroup)) {
      busStopsLayerGroup.addTo(map);
    }
    if (!busStopsToggle?.checked && map.hasLayer(busStopsLayerGroup)) {
      map.removeLayer(busStopsLayerGroup);
    }
    if (busStopsCountEl) busStopsCountEl.textContent = String(lastBusStopCount);
    return lastBusStopCount;
  }
  const stops = [];
  if (stopsKey === "all") {
    const response = await apiFetch("/api/emtusa/paradas");
    if (!response.ok) {
      return 0;
    }
    const data = await response.json();
    stops.push(...(Array.isArray(data.paradas) ? data.paradas : []));
  } else {
    const responses = await Promise.all(
      selectedLineIds.map(async (lineId) => {
        const response = await apiFetch(`/api/emtusa/paradas?linea=${encodeURIComponent(lineId)}`);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data.paradas) ? data.paradas : [];
      })
    );
    const stopMap = new Map();
    responses.flat().forEach((stop) => {
      const id = String(stop.idparada || stop.id);
      if (!stopMap.has(id)) stopMap.set(id, stop);
    });
    stops.push(...stopMap.values());
  }
  updateBusStopMarkers(stops);
  busStopsLoaded = true;
  busStopsLoadedKey = stopsKey;
  lastBusStopCount = stops.length;
  if (busStopsCountEl) busStopsCountEl.textContent = String(lastBusStopCount);
  if (busStopsToggle?.checked) {
    busStopsLayerGroup.addTo(map);
  }
  return lastBusStopCount;
}

async function loadBusStopLines(stopId) {
  if (!stopId) return [];
  const response = await apiFetch(`/api/emtusa/paradas-lineas?parada=${encodeURIComponent(stopId)}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.lineas) ? data.lineas : [];
}

function renderDeparturesEmpty(message) {
  if (!departuresEl) return;
  departuresEl.innerHTML = `<div class="empty">${message}</div>`;
}

function minutesUntil(dateStr) {
  if (!dateStr) return "-";
  const [fecha, hora] = dateStr.split(" ");
  if (!fecha || !hora) return "-";
  const [dia, mes, anio] = fecha.split("-").map(Number);
  const [h, m, s] = hora.split(":").map(Number);
  const target = new Date(anio, (mes || 1) - 1, dia, h || 0, m || 0, s || 0);
  if (Number.isNaN(target.getTime())) return "-";
  const diffMin = Math.round((target - new Date()) / 60000);
  return diffMin >= 0 ? `${diffMin} min` : `${diffMin + 1440} min`;
}

async function loadSalidas(stationCode) {
  if (!stationCode) {
    renderDeparturesEmpty("Sin estacion seleccionada.");
    return;
  }
  const response = await apiFetch(`/api/salidas?station=${stationCode}`);
  if (!response.ok) {
    renderDeparturesEmpty("No se pudieron cargar salidas.");
    return;
  }
  const data = await response.json();
  const salidas = data?.estacion?.salidas || [];
  if (!salidas.length) {
    renderDeparturesEmpty("No hay salidas disponibles.");
    return;
  }
  const rows = salidas
    .slice(0, 6)
    .map(
      (salida) => `
        <tr>
          <td>${minutesUntil(salida.horaSalida)}</td>
          <td>${salida.linea || "-"}</td>
          <td>${salida.destinoNombre || "-"}</td>
          <td>${salida.via || "-"}</td>
        </tr>
      `
    )
    .join("");

  departuresEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>En</th>
          <th>Linea</th>
          <th>Destino</th>
          <th>Via</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function init() {
  try {
    setStatus("Cargando linea...", true);
    await loadLineas();
    await loadEstaciones();

    await loadBusLineMeta();
    const total = await loadTrenes();
    await loadBusLines();
    await loadBuses();
    await loadBusStops();
    await loadBikeStations();
    await loadBikeParking();
    await loadCarData();
    updateIntermodalAlerts();
    updateStatus(total, true);

    setInterval(() => {
      updateDebugUI("train", lastTrainUpdateAt, lastTrainMoveAt);
      updateDebugUI("bus", lastBusUpdateAt, lastBusMoveAt, !busToggle?.checked);
    }, 1000);

    setInterval(async () => {
      try {
        const count = await loadTrenes();
        updateStatus(count, true);
      } catch (err) {
        setStatus("Error al actualizar trenes", false);
        addDebugLog("Tren: fallo de actualizacion.");
      }
    }, UPDATE_MS);

    setInterval(async () => {
      try {
        await loadBusLines();
        await loadBuses();
        await loadBusStops();
      } catch (err) {
        setStatus("Error al actualizar buses", false);
        addDebugLog("Bus: fallo de actualizacion.");
      }
    }, UPDATE_MS);

    setInterval(async () => {
      try {
        await loadBikeStations();
        await loadBikeParking();
      } catch (err) {
        setStatus("Error al actualizar bicis", false);
      }
    }, UPDATE_MS);

    setInterval(async () => {
      try {
        await loadCarData();
      } catch (err) {
        setStatus("Error al actualizar car sharing", false);
      }
    }, UPDATE_MS);
  } catch (err) {
    setStatus("Error al cargar datos", false);
  }
}

legendEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-line]");
  if (!button) return;
  const code = button.dataset.line;
  if (selectedLines.has(code)) {
    selectedLines.delete(code);
  } else {
    selectedLines.add(code);
  }
  applyLineVisibility();
  updateStatus(filterTrenes(lastTrenes).length, true);
});

btnAll?.addEventListener("click", () => {
  selectedLines.clear();
  for (const code of lineMeta.keys()) {
    selectedLines.add(code);
  }
  applyLineVisibility();
  updateStatus(filterTrenes(lastTrenes).length, true);
});

btnNone?.addEventListener("click", () => {
  selectedLines.clear();
  applyLineVisibility();
  updateStatus(0, true);
});

stationSelect?.addEventListener("change", (event) => {
  const code = event.target.value;
  loadSalidas(code);
});

stationSearch?.addEventListener("input", (event) => {
  renderStationOptions(event.target.value);
});

busToggle?.addEventListener("change", async () => {
  await loadBuses();
  updateStatus(filterTrenes(lastTrenes).length, true);
});

busLinesToggle?.addEventListener("change", async () => {
  await loadBusLines();
});

busLinesLegendEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-bus-line]");
  if (!button) return;
  const id = button.dataset.busLine;
  if (busSelectedLines.has(id)) {
    busSelectedLines.delete(id);
  } else {
    busSelectedLines.add(id);
  }
  applyBusLineVisibility();
  await loadBuses();
  busStopsLoaded = false;
  busStopsLoadedKey = "";
  await loadBusStops();
});

busLinesAllBtn?.addEventListener("click", async () => {
  busSelectedLines.clear();
  for (const id of busLineMeta.keys()) {
    busSelectedLines.add(id);
  }
  applyBusLineVisibility();
  await loadBuses();
  busStopsLoaded = false;
  busStopsLoadedKey = "";
  await loadBusStops();
});

busLinesNoneBtn?.addEventListener("click", async () => {
  busSelectedLines.clear();
  applyBusLineVisibility();
  await loadBuses();
  busStopsLoaded = false;
  busStopsLoadedKey = "";
  await loadBusStops();
});

busStopsToggle?.addEventListener("change", async () => {
  await loadBusStops();
});

bikeToggle?.addEventListener("change", async () => {
  await loadBikeStations();
  updateStatus(filterTrenes(lastTrenes).length, true);
});

bikeParkingToggle?.addEventListener("change", async () => {
  await loadBikeParking();
});

carZonesToggle?.addEventListener("change", async () => {
  await loadCarData();
});

carToggle?.addEventListener("change", async () => {
  await loadCarData();
  updateStatus(filterTrenes(lastTrenes).length, true);
});

carPoiToggle?.addEventListener("change", async () => {
  await loadCarData();
});

intermodalUseBusBtn?.addEventListener("click", () => {
  if (!selectedBusId || !busMarkers.has(selectedBusId)) {
    if (intermodalStatus) {
      intermodalStatus.innerHTML = '<div class="empty">Selecciona un bus en el mapa.</div>';
    }
    return;
  }
  intermodalMode = "bus";
  intermodalBusId = selectedBusId;
  intermodalAlertText = "";
  stopUserTracking();
  updateIntermodalAlerts();
  setActiveTab("intermodal");
});

intermodalUseUserBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    if (intermodalStatus) {
      intermodalStatus.innerHTML = '<div class="empty">Geolocalizacion no disponible.</div>';
    }
    return;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    if (intermodalStatus) {
      intermodalStatus.innerHTML =
        '<div class="empty">La ubicacion requiere HTTPS en movil.</div>';
    }
    return;
  }
  intermodalMode = "user";
  intermodalBusId = null;
  intermodalAlertText = "";
  stopUserTracking();
  const onPosition = (pos) => {
    intermodalUserPos = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
    if (!intermodalUserMarker) {
      intermodalUserMarker = L.marker(intermodalUserPos, {
        icon: buildUserIcon("Sin medios"),
        keyboard: false,
      }).addTo(map);
    } else {
      intermodalUserMarker.setLatLng(intermodalUserPos);
    }
    centerOnUser(intermodalUserPos);
    updateIntermodalAlerts();
  };
  navigator.geolocation.getCurrentPosition(
    onPosition,
    (err) => {
      if (intermodalStatus) {
        intermodalStatus.innerHTML = `<div class="empty">${geoErrorMessage(err)}</div>`;
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
  intermodalUserWatch = navigator.geolocation.watchPosition(
    onPosition,
    (err) => {
      if (intermodalStatus) {
        intermodalStatus.innerHTML = `<div class="empty">${geoErrorMessage(err)}</div>`;
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  setActiveTab("intermodal");
});

intermodalClearBtn?.addEventListener("click", () => {
  const previousId = intermodalBusId;
  intermodalMode = "bus";
  intermodalBusId = null;
  intermodalAlertText = "";
  if (previousId && busMarkers.has(previousId)) {
    const marker = busMarkers.get(previousId);
    if (marker?._bus) {
      marker.setIcon(buildBusIcon(marker._bus));
    }
  }
  stopUserTracking();
  updateIntermodalAlerts();
});

intermodalRange?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  intermodalRangeMeters = Number.isFinite(value) ? value : 500;
  if (intermodalRangeValue) {
    intermodalRangeValue.textContent = `${intermodalRangeMeters} m`;
  }
  updateIntermodalAlerts();
});

intermodalTrainToggle?.addEventListener("change", () => {
  updateIntermodalAlerts();
});

intermodalBusToggle?.addEventListener("change", () => {
  updateIntermodalAlerts();
});

intermodalBikeToggle?.addEventListener("change", () => {
  updateIntermodalAlerts();
});

intermodalParkingToggle?.addEventListener("change", () => {
  updateIntermodalAlerts();
});

intermodalStopsToggle?.addEventListener("change", async () => {
  await loadBusStops();
  updateIntermodalAlerts();
});

intermodalCarToggle?.addEventListener("change", () => {
  updateIntermodalAlerts();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "t" && event.key !== "T") return;
  if (!debugFloat) return;
  debugFloat.classList.toggle("hidden");
});

disclaimerPop?.addEventListener("click", () => {
  disclaimerPop.classList.toggle("collapsed");
});

mapFullscreenToggle?.addEventListener("click", () => {
  const isFull = document.body.classList.toggle("map-fullscreen");
  if (mapFullscreenToggle) {
    mapFullscreenToggle.textContent = isFull ? "Cerrar" : "Mapa";
  }
  setTimeout(() => map.invalidateSize(), 200);
});

setActiveTab("train");
init();
