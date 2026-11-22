// Membuat halaman HTML berisi peta MapLibre GL (tampilan meniru MitraDarat).
// Peta dasar: OpenFreeMap "positron" (abu-abu bersih; data OpenStreetMap, gratis, tanpa kunci API).
// Mau lebih berwarna? Ganti STYLE_URL ke .../styles/liberty.
// Halaman ini dijalankan di dalam WebView (HP) atau iframe (web).
//
// Tampilan bus (seperti MitraDarat):
// - zoom jauh  : panah sewarna rute, menunjuk arah jalan bus
// - zoom dekat : simbol bus + pil okupansi "28/40" berwarna status
//
// Komunikasi dua arah:
// - Aplikasi -> peta : perintah MapCommand (HP: window.__cmd(...), web: postMessage)
// - Peta -> aplikasi : pesan JSON { type: 'stop', id } saat halte diketuk.

export type Stop = { id: string; name: string; lat: number; lng: number };
export type RouteGeometry = { stops: Stop[]; path: [number, number][] };
export type MapRoute = RouteGeometry & { route_id: string; color: string };

// Status kepadatan dari backend: low <40%, light 40–<70%, medium 70–<100%, high >=100%.
export type BusStatus = 'low' | 'light' | 'medium' | 'high';
export type BusPosition = {
  bus_id: string;
  route_id: string;
  lat: number;
  lng: number;
  heading: number; // derajat dari utara, searah jarum jam
  status: BusStatus;
  passengers: number;
  capacity: number;
};
export type LatLng = { lat: number; lng: number };

export type MapCommand =
  | { type: 'buses'; buses: BusPosition[] }
  | { type: 'select'; routeId: string | null } // null = tampilkan semua rute
  | { type: 'me'; position: LatLng; center: boolean }; // lokasi pengguna
export type MapMessage = { type: 'stop'; id: string };

export const STATUS_COLOR: Record<BusStatus, string> = {
  low: '#1E8E3E', // hijau
  light: '#6A9F1E', // hijau kekuningan
  medium: '#E8A200', // kuning
  high: '#D93025', // merah
};

// Mulai zoom berapa panah berubah jadi simbol bus.
export const BUS_ICON_ZOOM = 14.5;

export type MapOptions = {
  topInset: number; // ruang di atas yang tertutup bilah atas + status bar
  bottomInset: number; // ruang di bawah yang tertutup tab bar
};

// Props komponen <LeafletMap> (sama untuk versi HP dan web).
export type LeafletMapProps = MapOptions & {
  routes: MapRoute[];
  selectedRouteId: string | null; // null = semua rute
  buses: BusPosition[];
  myLocation: LatLng | null;
  centerKey: number; // naik 1 setiap tombol lokasi ditekan -> peta dipusatkan ke lokasi
  onStopPress: (stopId: string) => void;
};

// JSON aman untuk disisipkan ke dalam <script> (mencegah "</script>" memutus kode).
function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export function buildMapHtml(routes: MapRoute[], options: MapOptions) {
  const top = Math.round(options.topInset);
  const bottom = Math.round(options.bottomInset);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css" />
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: #f2efe9; }
  body { font-family: -apple-system, Roboto, sans-serif; }
  /* Atribusi di atas tab bar supaya tetap terbaca. */
  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: ${bottom}px; }
  .maplibregl-ctrl-attrib { font-size: 10px; background: rgba(255,255,255,.75); }
  .note { position: absolute; z-index: 10; left: 12px; right: 12px; bottom: ${bottom + 28}px;
    padding: 8px 10px; border-radius: 10px; background: #FDECEA; color: #B3261E;
    font-size: 13px; text-align: center; display: none; }
  /* Simbol bus saat zoom dekat. */
  .bus { display: flex; align-items: center; cursor: default; }
  .bus .ic { width: 26px; height: 26px; border-radius: 8px; border: 2px solid #fff;
    display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .bus .occ { margin-left: -4px; padding: 2px 7px 2px 9px; border-radius: 0 10px 10px 0;
    color: #fff; font: 700 11px/15px -apple-system, Roboto, sans-serif; border: 2px solid #fff;
    border-left: 0; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
  .hide-bus .bus { display: none; }
  .me { width: 16px; height: 16px; border-radius: 50%; background: #1A73E8; border: 3px solid #fff;
    box-shadow: 0 0 0 10px rgba(26,115,232,.18), 0 1px 3px rgba(0,0,0,.3); }
</style>
</head>
<body>
<div id="map"></div>
<div id="note" class="note"></div>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script>
(function () {
  var ROUTES = ${safeJson(routes)};
  var STATUS = ${safeJson(STATUS_COLOR)};
  var BUS_ZOOM = ${BUS_ICON_ZOOM};
  var PADDING = { top: ${top + 20}, bottom: ${bottom + 28}, left: 28, right: 28 };
  var NONE = '__none__';
  var note = document.getElementById('note');
  var noteShown = false;
  function showNote(text) { if (noteShown) return; noteShown = true; note.textContent = text; note.style.display = 'block'; }

  // Kirim pesan ke aplikasi (WebView di HP, atau halaman induk di web).
  function send(msg) {
    var text = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent !== window) window.parent.postMessage(text, '*');
  }

  // Keadaan terakhir dari aplikasi (disimpan dulu kalau peta belum siap).
  var state = { selected: null, buses: [], me: null };
  window.__cmd = function (msg) {
    try {
      if (!msg) return;
      if (msg.type === 'buses') { state.buses = msg.buses || []; if (ready) drawBuses(); }
      else if (msg.type === 'select') { state.selected = msg.routeId; if (ready) applySelect(true); }
      else if (msg.type === 'me') { state.me = msg.position; if (ready) drawMe(msg.center); }
    } catch (e) {}
  };
  // Versi web: perintah datang lewat postMessage dari halaman induk.
  window.addEventListener('message', function (e) {
    try { window.__cmd(typeof e.data === 'string' ? JSON.parse(e.data) : e.data); } catch (err) {}
  });

  // Kalau MapLibre gagal diunduh (mis. offline), tampilkan pesan, jangan crash.
  if (typeof maplibregl === 'undefined') { showNote('Peta gagal dimuat. Periksa koneksi internet.'); return; }

  var routeColor = {};
  var routeBounds = {};
  var allBounds = null;
  ROUTES.forEach(function (r) {
    routeColor[r.route_id] = r.color;
    var b = new maplibregl.LngLatBounds();
    r.path.forEach(function (p) { b.extend([p[1], p[0]]); });
    routeBounds[r.route_id] = b;
    if (!allBounds) allBounds = new maplibregl.LngLatBounds(b.getSouthWest(), b.getNorthEast());
    else allBounds.extend(b);
  });

  var map;
  try {
    var opts = {
      container: 'map',
      style: '${STYLE_URL}',
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false
    };
    // Jangan isi center/zoom dengan undefined: MapLibre menganggapnya nilai (NaN).
    if (allBounds) { opts.bounds = allBounds; opts.fitBoundsOptions = { padding: PADDING }; }
    else { opts.center = [107.6191, -6.9175]; opts.zoom = 13; }
    map = new maplibregl.Map(opts);
    map.touchZoomRotate.disableRotation();
  } catch (e) {
    showNote('Peta tidak bisa ditampilkan di perangkat ini.');
    return;
  }

  // Gambar/tile gagal dimuat: beri tahu sekali saja, aplikasi tidak crash.
  map.on('error', function () { showNote('Sebagian gambar peta gagal dimuat.'); });

  // Gambar panah (menghadap ke atas/utara), warnanya diatur lewat icon-color.
  function arrowImage() {
    var s = 48, c = document.createElement('canvas');
    c.width = s; c.height = s;
    var g = c.getContext('2d');
    g.beginPath();
    g.moveTo(24, 4); g.lineTo(42, 42); g.lineTo(24, 32); g.lineTo(6, 42); g.closePath();
    g.fillStyle = '#000'; g.fill();
    return g.getImageData(0, 0, s, s);
  }

  var BUS_SVG = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" fill-rule="evenodd" d="M6 2h12a3 3 0 0 1 3 3v12a2 2 0 0 1-1 1.7V21h-3v-2H7v2H4v-2.3A2 2 0 0 1 3 17V5a3 3 0 0 1 3-3zM5 6v5h14V6H5zm2 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';

  var ready = false;
  map.on('load', function () {
    map.addImage('bus-arrow', arrowImage(), { sdf: true, pixelRatio: 2 });

    // Garis rute.
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: ROUTES.map(function (r) {
      return { type: 'Feature', properties: { route_id: r.route_id, color: r.color },
        geometry: { type: 'LineString', coordinates: r.path.map(function (p) { return [p[1], p[0]]; }) } };
    }) } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'routes',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'line-opacity': 0.95 } });

    // Halte (hanya tampil untuk rute yang dipilih).
    var stopFeatures = [];
    ROUTES.forEach(function (r) {
      r.stops.forEach(function (s) {
        stopFeatures.push({ type: 'Feature', properties: { id: s.id, name: s.name, route_id: r.route_id, color: r.color },
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] } });
      });
    });
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: stopFeatures } });
    map.addLayer({ id: 'stop-circle', type: 'circle', source: 'stops',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 9], 'circle-color': '#fff',
        'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 } });
    map.addLayer({ id: 'stop-label', type: 'symbol', source: 'stops', minzoom: 14,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
        'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#202124', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    map.on('click', 'stop-circle', function (e) {
      var f = e.features && e.features[0];
      if (f) send({ type: 'stop', id: f.properties.id });
    });

    // Bus saat zoom jauh: panah sewarna rute, diputar sesuai arah jalan.
    map.addSource('buses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'bus-arrow', type: 'symbol', source: 'buses', maxzoom: BUS_ZOOM,
      layout: { 'icon-image': 'bus-arrow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 1.3, 14, 1.7],
        'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': '#ffffff', 'icon-halo-width': 1.5 } });

    // Simbol bus saat zoom dekat (penanda HTML), disembunyikan saat zoom jauh.
    map.on('zoom', updateBusVisibility);
    updateBusVisibility();

    ready = true;
    applySelect(false);
    drawBuses();
    if (state.me) drawMe(false);
  });

  function applySelect(animate) {
    var id = state.selected;
    map.setFilter('route-line', id ? ['==', ['get', 'route_id'], id] : null);
    map.setFilter('stop-circle', ['==', ['get', 'route_id'], id || NONE]);
    map.setFilter('stop-label', ['==', ['get', 'route_id'], id || NONE]);
    var b = id && routeBounds[id] ? routeBounds[id] : allBounds;
    if (b && (animate || id)) map.fitBounds(b, { padding: PADDING, duration: animate ? 600 : 0 });
  }

  function updateBusVisibility() {
    document.body.classList.toggle('hide-bus', map.getZoom() < BUS_ZOOM);
  }

  var busMarkers = {};
  function busHtml(b) {
    var rc = routeColor[b.route_id] || '#555';
    var sc = STATUS[b.status] || '#555';
    return '<div class="ic" style="background:' + rc + '">' + BUS_SVG + '</div>' +
      '<div class="occ" style="background:' + sc + '">' + b.passengers + '/' + b.capacity + '</div>';
  }
  function drawBuses() {
    var buses = state.buses;
    map.getSource('buses').setData({ type: 'FeatureCollection', features: buses.map(function (b) {
      return { type: 'Feature', properties: { heading: b.heading || 0, color: routeColor[b.route_id] || '#555' },
        geometry: { type: 'Point', coordinates: [b.lng, b.lat] } };
    }) });
    var seen = {};
    buses.forEach(function (b) {
      seen[b.bus_id] = true;
      var m = busMarkers[b.bus_id];
      if (!m) {
        var el = document.createElement('div');
        el.className = 'bus';
        m = busMarkers[b.bus_id] = new maplibregl.Marker({ element: el, anchor: 'left', offset: [-15, 0] })
          .setLngLat([b.lng, b.lat]).addTo(map);
      }
      m.setLngLat([b.lng, b.lat]);
      m.getElement().innerHTML = busHtml(b);
      m.getElement().title = b.bus_id + ' · ' + b.passengers + '/' + b.capacity + ' · ' + b.status;
    });
    Object.keys(busMarkers).forEach(function (id) {
      if (!seen[id]) { busMarkers[id].remove(); delete busMarkers[id]; }
    });
  }

  // Titik biru lokasi pengguna.
  var meMarker = null;
  function drawMe(center) {
    var ll = [state.me.lng, state.me.lat];
    if (!meMarker) {
      var el = document.createElement('div');
      el.className = 'me';
      meMarker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
    } else meMarker.setLngLat(ll);
    if (center) map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 15), padding: PADDING, duration: 600 });
  }
})();
</script>
</body>
</html>`;
}

// Membaca pesan dari peta dengan aman (abaikan pesan yang bukan milik kita).
export function parseMapMessage(raw: unknown): MapMessage | null {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (msg && msg.type === 'stop' && typeof msg.id === 'string') return msg;
  } catch {
    // bukan JSON
  }
  return null;
}
