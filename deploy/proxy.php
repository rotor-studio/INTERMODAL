<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$REMOTE_BASE = 'https://tiempo-real.renfe.com';
$EMTUSA_BASE = 'https://emtusasiri.pub.gijon.es/emtusasiri';
$BICI_BASE = 'https://bici.gijon.es/api';
$BICI_AREA_ID = 'cggl7m2hi4pr8tm5lhgg';
$BICI_PARKING_BASE = 'https://observa.gijon.es/api/v2/catalog/datasets/aparcamientos-para-bicicletas/records';
$GUPPY_BASE = 'https://api.guppy.es/api/v2';
$GUPPY_BBOX = [
  'minLon' => -7.6,
  'minLat' => 42.5,
  'maxLon' => -4.5,
  'maxLat' => 44.2,
];
$CTA_DIR = __DIR__ . '/data/cta';

$CACHE_DIR = __DIR__ . '/cache';
$LOG_DIR = __DIR__ . '/logs';
if (!is_dir($CACHE_DIR)) {
  @mkdir($CACHE_DIR, 0755, true);
}
if (!is_dir($LOG_DIR)) {
  @mkdir($LOG_DIR, 0755, true);
}

function json_response($data, int $status = 200): void {
  http_response_code($status);
  if (is_string($data)) {
    echo $data;
  } else {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
  }
  exit;
}

function starts_with(string $haystack, string $needle): bool {
  return strncmp($haystack, $needle, strlen($needle)) === 0;
}

function cache_path(string $key): string {
  global $CACHE_DIR;
  return $CACHE_DIR . '/' . $key . '.json';
}

function cache_get(string $key, int $ttl): ?string {
  $file = cache_path($key);
  if (!file_exists($file)) return null;
  if (time() - filemtime($file) > $ttl) return null;
  return file_get_contents($file) ?: null;
}

function cache_set(string $key, string $data): void {
  $file = cache_path($key);
  file_put_contents($file, $data);
}

function http_request(string $url, array $headers = [], string $method = 'GET', ?string $body = null): array {
  $ch = curl_init();
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
  if ($body !== null) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  }
  if ($headers) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  }
  curl_setopt($ch, CURLOPT_TIMEOUT, 20);
  $response = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return ['status' => $status, 'body' => $response];
}

function proxy_json(string $url, array $headers = []): void {
  $res = http_request($url, $headers);
  if ($res['status'] < 200 || $res['status'] >= 300) {
    json_response(['error' => 'Upstream error', 'status' => $res['status']], $res['status'] ?: 502);
  }
  echo $res['body'];
  exit;
}

function get_emtusa_token(): ?string {
  global $EMTUSA_BASE;
  $cacheFile = cache_path('emtusa_token');
  if (file_exists($cacheFile)) {
    $data = json_decode(file_get_contents($cacheFile), true);
    if ($data && isset($data['token'], $data['expiresAt']) && time() < ($data['expiresAt'] - 30)) {
      return $data['token'];
    }
  }
  $url = $EMTUSA_BASE . '/login?grant_type=password&username=info%40vitesia.com&password=vitesia130';
  $res = http_request($url, [
    'Authorization: Basic YXBpOmFwaQ==',
    'Accept: application/json',
  ], 'POST');
  if ($res['status'] < 200 || $res['status'] >= 300) {
    return null;
  }
  $data = json_decode($res['body'], true);
  $token = $data['access_token'] ?? null;
  $expiresIn = (int)($data['expires_in'] ?? 300);
  if ($token) {
    file_put_contents($cacheFile, json_encode([
      'token' => $token,
      'expiresAt' => time() + $expiresIn,
    ]));
  }
  return $token;
}

function fetch_emtusa_json(string $path): ?array {
  global $EMTUSA_BASE;
  $token = get_emtusa_token();
  if (!$token) return null;
  $res = http_request($EMTUSA_BASE . $path, [
    'Authorization: Bearer ' . $token,
    'Accept: application/json',
  ]);
  if ($res['status'] < 200 || $res['status'] >= 300) return null;
  return json_decode($res['body'], true);
}

function build_emtusa_lines_geo(): ?array {
  $cached = cache_get('emtusa_lines_geo', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $linesResp = fetch_emtusa_json('/lineas/lineas');
  if (!$linesResp || !isset($linesResp['lineas'])) return null;

  $output = [
    'updated' => gmdate('c'),
    'lines' => [],
  ];
  $lineEntries = array_values($linesResp['lineas']);
  foreach ($lineEntries as $line) {
    $idlinea = $line['idlinea'] ?? null;
    $codigo = $line['codigo'] ?? '';
    $colorhex = $line['colorhex'] ?? $line['colorHex'] ?? '2c3e50';
    $nombre = trim((string)($line['descripcion'] ?? $line['nombreLinea'] ?? $codigo));
    if (!$idlinea) continue;

    $detail = fetch_emtusa_json('/lineas/lineas/' . $idlinea);
    $trayectos = (is_array($detail) && isset($detail[0]['trayectos'])) ? $detail[0]['trayectos'] : [];
    $coordsList = [];
    $slice = array_slice($trayectos, 0, 2);
    foreach ($slice as $tray) {
      $idtrayecto = $tray['idtrayecto'] ?? null;
      if (!$idtrayecto) continue;
      $trayectoResp = fetch_emtusa_json('/trayectos/trayectos/' . $idlinea . '/' . $idtrayecto);
      $paradas = $trayectoResp['paradas'] ?? [];
      $coords = [];
      foreach ($paradas as $p) {
        $lat = (float)($p['latitud'] ?? 0);
        $lon = (float)($p['longitud'] ?? 0);
        if (is_finite($lat) && is_finite($lon)) {
          $coords[] = [$lat, $lon];
        }
      }
      if (count($coords) >= 2) {
        $coordsList[] = [
          'idtrayecto' => $idtrayecto,
          'coords' => $coords,
        ];
      }
    }
    if ($coordsList) {
      $output['lines'][] = [
        'idlinea' => $idlinea,
        'codigo' => $codigo,
        'color' => (starts_with($colorhex, '#') ? $colorhex : '#' . $colorhex),
        'nombre' => $nombre,
        'trayectos' => $coordsList,
      ];
    }
  }

  cache_set('emtusa_lines_geo', json_encode($output));
  return $output;
}

function build_emtusa_lines_simple(): ?array {
  $cached = cache_get('emtusa_lines_simple', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $linesResp = fetch_emtusa_json('/lineas/lineas');
  if (!$linesResp || !isset($linesResp['lineas'])) return null;
  $lineEntries = array_values($linesResp['lineas']);
  $lines = array_map(function ($line) {
    return [
      'idlinea' => $line['idlinea'] ?? null,
      'codigo' => $line['codigo'] ?? null,
      'color' => $line['colorhex'] ?? $line['colorHex'] ?? '2c3e50',
      'nombre' => trim((string)($line['descripcion'] ?? $line['nombreLinea'] ?? $line['codigo'] ?? '')),
    ];
  }, $lineEntries);
  $data = ['updated' => gmdate('c'), 'lines' => $lines];
  cache_set('emtusa_lines_simple', json_encode($data));
  return $data;
}

function build_emtusa_stops(): ?array {
  $cached = cache_get('emtusa_stops', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $stopsResp = fetch_emtusa_json('/paradas/todasParadas');
  if (!is_array($stopsResp)) return null;
  $paradas = array_map(function ($stop) {
    return [
      'idparada' => $stop['idparada'] ?? null,
      'descripcion' => $stop['descripcion'] ?? '',
      'latitud' => (float)($stop['latitud'] ?? 0),
      'longitud' => (float)($stop['longitud'] ?? 0),
    ];
  }, $stopsResp);
  $data = ['updated' => gmdate('c'), 'paradas' => $paradas];
  cache_set('emtusa_stops', json_encode($data));
  return $data;
}

function get_emtusa_lines_for_stop($stopId): array {
  $cacheKey = 'emtusa_stop_lines_' . $stopId;
  $cached = cache_get($cacheKey, 6 * 60 * 60);
  if ($cached) {
    return json_decode($cached, true) ?: [];
  }
  $linesResp = fetch_emtusa_json('/paradas/lineasParada/' . $stopId);
  if (!is_array($linesResp)) return [];
  $lineIds = array_map(function ($line) {
    return (string)($line['idlinea'] ?? $line['idLinea'] ?? $line['codigo'] ?? '');
  }, $linesResp);
  cache_set($cacheKey, json_encode($lineIds));
  return $lineIds;
}

function build_emtusa_stops_by_line(string $lineId): ?array {
  $cacheKey = 'emtusa_stops_line_' . $lineId;
  $cached = cache_get($cacheKey, 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $all = build_emtusa_stops();
  if (!$all) return null;
  $filtered = [];
  foreach ($all['paradas'] as $stop) {
    $stopId = $stop['idparada'] ?? null;
    if (!$stopId) continue;
    $lineIds = get_emtusa_lines_for_stop($stopId);
    if (in_array((string)$lineId, $lineIds, true)) {
      $filtered[] = $stop;
    }
  }
  $data = ['updated' => gmdate('c'), 'paradas' => $filtered];
  cache_set($cacheKey, json_encode($data));
  return $data;
}

function parse_csv(string $text): array {
  $rows = [];
  $row = [];
  $field = '';
  $inQuotes = false;
  $len = strlen($text);
  for ($i = 0; $i < $len; $i++) {
    $char = $text[$i];
    $next = $i + 1 < $len ? $text[$i + 1] : '';
    if ($char === '"') {
      if ($inQuotes && $next === '"') {
        $field .= '"';
        $i++;
      } else {
        $inQuotes = !$inQuotes;
      }
      continue;
    }
    if ($char === ',' && !$inQuotes) {
      $row[] = $field;
      $field = '';
      continue;
    }
    if (($char === "\n" || $char === "\r") && !$inQuotes) {
      if ($char === "\r" && $next === "\n") $i++;
      $row[] = $field;
      if (count($row) > 1 || $row[0] !== '') {
        $rows[] = $row;
      }
      $row = [];
      $field = '';
      continue;
    }
    $field .= $char;
  }
  if ($field !== '' || $row) {
    $row[] = $field;
    $rows[] = $row;
  }
  if (!$rows) return [];
  $headers = array_map('trim', array_shift($rows));
  return array_map(function ($cols) use ($headers) {
    $obj = [];
    foreach ($headers as $idx => $h) {
      $obj[$h] = $cols[$idx] ?? '';
    }
    return $obj;
  }, $rows);
}

function build_cta_routes_geo(): ?array {
  global $CTA_DIR;
  $cached = cache_get('cta_routes_geo', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $routesText = @file_get_contents($CTA_DIR . '/routes.txt');
  $tripsText = @file_get_contents($CTA_DIR . '/trips.txt');
  $shapesText = @file_get_contents($CTA_DIR . '/shapes.txt');
  if ($routesText === false || $tripsText === false || $shapesText === false) return null;
  $routes = parse_csv($routesText);
  $trips = parse_csv($tripsText);
  $shapes = parse_csv($shapesText);

  $routeShape = [];
  foreach ($trips as $trip) {
    $routeId = $trip['route_id'] ?? '';
    if (!$routeId || isset($routeShape[$routeId])) continue;
    if (!empty($trip['shape_id'])) $routeShape[$routeId] = $trip['shape_id'];
  }

  $shapePoints = [];
  foreach ($shapes as $shape) {
    $shapeId = $shape['shape_id'] ?? '';
    if (!$shapeId) continue;
    $lat = (float)($shape['shape_pt_lat'] ?? 0);
    $lon = (float)($shape['shape_pt_lon'] ?? 0);
    $seq = (int)($shape['shape_pt_sequence'] ?? 0);
    if (!is_finite($lat) || !is_finite($lon)) continue;
    if (!isset($shapePoints[$shapeId])) $shapePoints[$shapeId] = [];
    $shapePoints[$shapeId][] = ['lat' => $lat, 'lon' => $lon, 'seq' => $seq];
  }

  $output = ['updated' => gmdate('c'), 'routes' => []];
  foreach ($routes as $route) {
    $routeId = $route['route_id'] ?? '';
    if (!$routeId) continue;
    $shapeId = $routeShape[$routeId] ?? null;
    if (!$shapeId || !isset($shapePoints[$shapeId])) continue;
    $points = $shapePoints[$shapeId];
    usort($points, fn($a, $b) => $a['seq'] <=> $b['seq']);
    $coords = array_map(fn($p) => [$p['lat'], $p['lon']], $points);
    if (count($coords) < 2) continue;
    $color = !empty($route['route_color']) ? '#' . $route['route_color'] : '#0b7285';
    $output['routes'][] = [
      'id' => $routeId,
      'shortName' => $route['route_short_name'] ?? '',
      'longName' => $route['route_long_name'] ?? '',
      'color' => $color,
      'coords' => $coords,
    ];
  }

  cache_set('cta_routes_geo', json_encode($output));
  return $output;
}

function build_cta_stops(): ?array {
  global $CTA_DIR;
  $cached = cache_get('cta_stops', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $routesText = @file_get_contents($CTA_DIR . '/routes.txt');
  $tripsText = @file_get_contents($CTA_DIR . '/trips.txt');
  $stopsText = @file_get_contents($CTA_DIR . '/stops.txt');
  $stopTimesText = @file_get_contents($CTA_DIR . '/stop_times.txt');
  if ($routesText === false || $tripsText === false || $stopsText === false || $stopTimesText === false) {
    return null;
  }
  $routes = parse_csv($routesText);
  $trips = parse_csv($tripsText);
  $stops = parse_csv($stopsText);
  $stopTimes = parse_csv($stopTimesText);

  $tripRoute = [];
  foreach ($trips as $trip) {
    if (!empty($trip['trip_id']) && !empty($trip['route_id'])) {
      $tripRoute[$trip['trip_id']] = $trip['route_id'];
    }
  }

  $stopRoutes = [];
  foreach ($stopTimes as $st) {
    $tripId = $st['trip_id'] ?? '';
    $stopId = $st['stop_id'] ?? '';
    $routeId = $tripRoute[$tripId] ?? '';
    if (!$routeId || !$stopId) continue;
    if (!isset($stopRoutes[$stopId])) $stopRoutes[$stopId] = [];
    $stopRoutes[$stopId][$routeId] = true;
  }

  $routesMeta = [];
  foreach ($routes as $route) {
    if (empty($route['route_id'])) continue;
    $routesMeta[] = [
      'id' => $route['route_id'],
      'shortName' => $route['route_short_name'] ?? '',
      'longName' => $route['route_long_name'] ?? '',
      'color' => !empty($route['route_color']) ? '#' . $route['route_color'] : '#0b7285',
    ];
  }

  $outputStops = array_map(function ($stop) use ($stopRoutes) {
    $id = $stop['stop_id'] ?? '';
    return [
      'id' => $id,
      'name' => $stop['stop_name'] ?? '',
      'desc' => $stop['stop_desc'] ?? '',
      'lat' => (float)($stop['stop_lat'] ?? 0),
      'lon' => (float)($stop['stop_lon'] ?? 0),
      'routeIds' => array_keys($stopRoutes[$id] ?? []),
    ];
  }, $stops);

  $output = [
    'updated' => gmdate('c'),
    'routes' => $routesMeta,
    'stops' => $outputStops,
  ];
  cache_set('cta_stops', json_encode($output));
  return $output;
}

function build_cta_route_stops(): ?array {
  global $CTA_DIR;
  $cached = cache_get('cta_route_stops', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $tripsText = @file_get_contents($CTA_DIR . '/trips.txt');
  $stopsText = @file_get_contents($CTA_DIR . '/stops.txt');
  $stopTimesText = @file_get_contents($CTA_DIR . '/stop_times.txt');
  if ($tripsText === false || $stopsText === false || $stopTimesText === false) {
    return null;
  }
  $trips = parse_csv($tripsText);
  $stops = parse_csv($stopsText);
  $stopTimes = parse_csv($stopTimesText);

  $stopMeta = [];
  foreach ($stops as $stop) {
    if (empty($stop['stop_id'])) continue;
    $stopMeta[$stop['stop_id']] = [
      'id' => $stop['stop_id'],
      'name' => $stop['stop_name'] ?? '',
      'desc' => $stop['stop_desc'] ?? '',
      'lat' => (float)($stop['stop_lat'] ?? 0),
      'lon' => (float)($stop['stop_lon'] ?? 0),
    ];
  }

  $routeTrip = [];
  foreach ($trips as $trip) {
    if (empty($trip['route_id']) || empty($trip['trip_id'])) continue;
    if (!isset($routeTrip[$trip['route_id']])) {
      $routeTrip[$trip['route_id']] = $trip['trip_id'];
    }
  }

  $tripStops = [];
  foreach ($stopTimes as $st) {
    $tripId = $st['trip_id'] ?? '';
    $stopId = $st['stop_id'] ?? '';
    if (!$tripId || !$stopId) continue;
    $seq = (int)($st['stop_sequence'] ?? 0);
    if (!isset($tripStops[$tripId])) $tripStops[$tripId] = [];
    $tripStops[$tripId][] = ['stopId' => $stopId, 'seq' => $seq];
  }

  $routeStops = [];
  foreach ($routeTrip as $routeId => $tripId) {
    $entries = $tripStops[$tripId] ?? [];
    usort($entries, fn($a, $b) => $a['seq'] <=> $b['seq']);
    $list = [];
    $seen = [];
    foreach ($entries as $entry) {
      $sid = $entry['stopId'];
      if (isset($seen[$sid])) continue;
      $meta = $stopMeta[$sid] ?? null;
      if (!$meta) continue;
      $seen[$sid] = true;
      $list[] = $meta + ['sequence' => $entry['seq']];
    }
    $routeStops[$routeId] = $list;
  }

  cache_set('cta_route_stops', json_encode($routeStops));
  return $routeStops;
}

function point_in_polygon(float $lon, float $lat, array $polygon): bool {
  $inside = false;
  $count = count($polygon);
  for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
    $xi = $polygon[$i][0];
    $yi = $polygon[$i][1];
    $xj = $polygon[$j][0];
    $yj = $polygon[$j][1];
    $intersects = (($yi > $lat) !== ($yj > $lat)) &&
      ($lon < (($xj - $xi) * ($lat - $yi)) / (($yj - $yi) ?: 1e-12) + $xi);
    if ($intersects) $inside = !$inside;
  }
  return $inside;
}

function build_bici_stations(): ?array {
  global $BICI_BASE, $BICI_AREA_ID;
  $cached = cache_get('bici_stations', 15);
  if ($cached) return json_decode($cached, true);

  $entities = http_request($BICI_BASE . '/client/entities', ['user-agent: intermodal-demo']);
  if ($entities['status'] < 200 || $entities['status'] >= 300) return null;
  $entitiesJson = json_decode($entities['body'], true);

  $areas = http_request($BICI_BASE . '/client/areas?ids=' . $BICI_AREA_ID, ['user-agent: intermodal-demo']);
  if ($areas['status'] < 200 || $areas['status'] >= 300) return null;
  $areasJson = json_decode($areas['body'], true);

  $stations = $entitiesJson['data']['stations'] ?? [];
  $polygon = $areasJson['data']['areas'][0]['coordinates'] ?? [];

  $filtered = $stations;
  if (count($polygon) >= 3) {
    $filtered = array_values(array_filter($stations, function ($station) use ($polygon) {
      $coords = $station['coordinates'] ?? [];
      if (count($coords) < 2) return false;
      return point_in_polygon((float)$coords[0], (float)$coords[1], $polygon);
    }));
  }
  $data = [
    'updated' => gmdate('c'),
    'stations' => $filtered,
    'area' => ['id' => $BICI_AREA_ID, 'coordinates' => $polygon],
  ];
  cache_set('bici_stations', json_encode($data));
  return $data;
}

function build_bike_parking(): ?array {
  global $BICI_PARKING_BASE;
  $cached = cache_get('bike_parking', 6 * 60 * 60);
  if ($cached) return json_decode($cached, true);
  $items = [];
  $offset = 0;
  $limit = 100;
  $totalCount = null;
  while ($totalCount === null || $offset < $totalCount) {
    $res = http_request($BICI_PARKING_BASE . '?limit=' . $limit . '&offset=' . $offset);
    if ($res['status'] < 200 || $res['status'] >= 300) return null;
    $data = json_decode($res['body'], true);
    $records = $data['records'] ?? [];
    if ($totalCount === null) {
      $totalCount = (int)($data['total_count'] ?? count($records));
    }
    foreach ($records as $record) {
      $fields = $record['record']['fields'] ?? [];
      $location = $fields['location'] ?? [];
      $lat = (float)($fields['latitud'] ?? $fields['lat'] ?? $location['lat'] ?? 0);
      $lon = (float)($fields['longitud'] ?? $fields['lon'] ?? $location['lon'] ?? 0);
      $items[] = [
        'id' => $record['record']['id'] ?? $record['record']['recordid'] ?? null,
        'latitud' => $lat,
        'longitud' => $lon,
        'address' => $fields['direccion'] ?? $fields['address'] ?? '',
      ];
    }
    if (!count($records)) break;
    $offset += $limit;
  }
  $data = ['updated' => gmdate('c'), 'items' => $items];
  cache_set('bike_parking', json_encode($data));
  return $data;
}

function point_in_bbox(float $lon, float $lat, array $bbox): bool {
  return $lon >= $bbox['minLon'] && $lon <= $bbox['maxLon'] && $lat >= $bbox['minLat'] && $lat <= $bbox['maxLat'];
}

function point_in_polygon_guppy(float $lon, float $lat, array $polygon): bool {
  return point_in_polygon($lon, $lat, $polygon);
}

function build_guppy_map(): ?array {
  global $GUPPY_BASE, $GUPPY_BBOX;
  $cached = cache_get('guppy_map', 15);
  if ($cached) return json_decode($cached, true);
  $res = http_request($GUPPY_BASE . '/vehicle/list/map', ['user-agent: intermodal-demo']);
  if ($res['status'] < 200 || $res['status'] >= 300) return null;
  $payload = json_decode($res['body'], true);
  $data = $payload['data'] ?? [];
  $areas = $data['available_areas'] ?? [];
  $vehicles = $data['vehicles'] ?? [];
  $pois = $data['points_of_interest'] ?? [];

  $areaCandidates = array_values(array_filter($areas, function ($area) use ($GUPPY_BBOX) {
    $points = $area['points'] ?? [];
    foreach ($points as $p) {
      if (point_in_bbox((float)$p['longitude'], (float)$p['latitude'], $GUPPY_BBOX)) {
        return true;
      }
    }
    return false;
  }));

  $allowedPolygons = [];
  foreach ($areaCandidates as $area) {
    if (!empty($area['excluded_area'])) continue;
    $points = $area['points'] ?? [];
    $poly = [];
    foreach ($points as $p) {
      $poly[] = [(float)$p['longitude'], (float)$p['latitude']];
    }
    $allowedPolygons[] = $poly;
  }

  $filteredVehicles = array_values(array_filter($vehicles, function ($car) use ($GUPPY_BBOX, $allowedPolygons) {
    $lon = (float)$car['longitude'];
    $lat = (float)$car['latitude'];
    if (!point_in_bbox($lon, $lat, $GUPPY_BBOX)) return false;
    foreach ($allowedPolygons as $poly) {
      if (count($poly) >= 3 && point_in_polygon_guppy($lon, $lat, $poly)) return true;
    }
    return false;
  }));

  $filteredPois = array_values(array_filter($pois, function ($poi) use ($GUPPY_BBOX) {
    return point_in_bbox((float)$poi['longitude'], (float)$poi['latitude'], $GUPPY_BBOX);
  }));

  $output = [
    'updated' => gmdate('c'),
    'areas' => $areaCandidates,
    'vehicles' => $filteredVehicles,
    'pois' => $filteredPois,
  ];
  cache_set('guppy_map', json_encode($output));
  return $output;
}

function read_request_body(): string {
  $body = file_get_contents('php://input');
  return $body ?: '';
}

$path = $_GET['path'] ?? '';
if (!$path) {
  json_response(['error' => 'Missing path'], 400);
}
$path = urldecode($path);
$parsed = parse_url($path);
$pathname = $parsed['path'] ?? '';
parse_str($parsed['query'] ?? '', $query);

if (!starts_with($pathname, '/api/')) {
  json_response(['error' => 'Invalid path'], 400);
}

switch (true) {
  case starts_with($pathname, '/api/flota'):
    proxy_json($REMOTE_BASE . '/renfe-visor/flota.json');
    break;
  case starts_with($pathname, '/api/lineas'):
    proxy_json($REMOTE_BASE . '/data/lineasnucleos.geojson');
    break;
  case starts_with($pathname, '/api/estaciones'):
    proxy_json($REMOTE_BASE . '/data/estaciones.geojson');
    break;
  case starts_with($pathname, '/api/salidas'):
    $station = $query['station'] ?? '';
    if (!$station) json_response(['error' => 'Missing station'], 400);
    proxy_json($REMOTE_BASE . '/renfe-json-cutter/write/salidas/estacion/' . $station . '.json');
    break;
  case starts_with($pathname, '/api/emtusa/buses'):
    $token = get_emtusa_token();
    if (!$token) json_response(['error' => 'No EMTUSA token'], 502);
    proxy_json($EMTUSA_BASE . '/autobuses/coordenadas', [
      'Authorization: Bearer ' . $token,
      'Accept: application/json',
    ]);
    break;
  case starts_with($pathname, '/api/emtusa/lineas-geo'):
    $data = build_emtusa_lines_geo();
    if (!$data) json_response(['error' => 'EMTUSA lineas failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/emtusa/lineas-simple'):
    $data = build_emtusa_lines_simple();
    if (!$data) json_response(['error' => 'EMTUSA lineas simple failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/emtusa/paradas-lineas'):
    $stopId = $query['parada'] ?? '';
    if (!$stopId) json_response(['error' => 'Missing parada'], 400);
    $linesResp = fetch_emtusa_json('/paradas/lineasParada/' . $stopId);
    if (!is_array($linesResp)) json_response(['error' => 'EMTUSA paradas lineas failed'], 502);
    json_response(['updated' => gmdate('c'), 'lineas' => $linesResp]);
    break;
  case starts_with($pathname, '/api/emtusa/paradas'):
    $lineId = $query['linea'] ?? '';
    $data = $lineId ? build_emtusa_stops_by_line($lineId) : build_emtusa_stops();
    if (!$data) json_response(['error' => 'EMTUSA paradas failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/bici/stations'):
    $data = build_bici_stations();
    if (!$data) json_response(['error' => 'Bici fetch failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/bici/parking'):
    $data = build_bike_parking();
    if (!$data) json_response(['error' => 'Bike parking fetch failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/guppy/map'):
    $data = build_guppy_map();
    if (!$data) json_response(['error' => 'Guppy fetch failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/cta/routes-geo'):
    $data = build_cta_routes_geo();
    if (!$data) json_response(['error' => 'CTA routes failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/cta/stops'):
    $data = build_cta_stops();
    if (!$data) json_response(['error' => 'CTA stops failed'], 502);
    json_response($data);
    break;
  case starts_with($pathname, '/api/cta/route-stops'):
    $routeId = $query['route'] ?? '';
    if (!$routeId) json_response(['error' => 'Missing route'], 400);
    $routeStops = build_cta_route_stops();
    if (!$routeStops) json_response(['error' => 'CTA route stops failed'], 502);
    $stops = $routeStops[$routeId] ?? [];
    json_response(['routeId' => $routeId, 'stops' => $stops]);
    break;
  case starts_with($pathname, '/api/debug-log'):
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
      json_response(['error' => 'Method not allowed'], 405);
    }
    $payload = json_decode(read_request_body(), true) ?: [];
    $entries = $payload['entries'] ?? [];
    if (!$entries) json_response(['ok' => true, 'count' => 0]);
    $file = $LOG_DIR . '/movement-log.txt';
    $timestamp = gmdate('c');
    $lines = array_map(function ($entry) use ($timestamp) {
      return '[' . $timestamp . '] ' . $entry;
    }, $entries);
    file_put_contents($file, implode("\n", $lines) . "\n", FILE_APPEND);
    json_response(['ok' => true, 'count' => count($entries)]);
    break;
  default:
    json_response(['error' => 'Unknown endpoint'], 404);
}
