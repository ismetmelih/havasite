// Basit, bagimliliksiz Node.js sunucusu.
// - /public altindaki dosyalari statik olarak sunar
// - /api/quakes  -> Kandilli (canli deprem) verisini proxy'ler
// - /api/fires   -> NASA FIRMS (canli yangin/aktif ates tespiti) verisini proxy'ler
// Node >= 18 gereklidir (global fetch kullanilir).

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PUBLIC_DIR = path.join(__dirname, "public");
let CONFIG = { FIRMS_MAP_KEY: "", PORT: 3000 };

function loadConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "config.json"), "utf8");
    CONFIG = { ...CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("[uyari] config.json okunamadi, varsayilanlar kullaniliyor:", err.message);
  }
}
loadConfig();

const PORT = process.env.PORT || CONFIG.PORT || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ---- basit bellek-ici cache ----
const cache = new Map(); // key -> { data, expires }
function getCache(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return null;
}
function setCache(key, data, ttlMs) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

async function fetchWithTimeout(resource, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

// ---------- /api/quakes ----------
// Kaynak: api.orhanaydogdu.com.tr (Kandilli verisini yayinlayan, herkese acik, anahtarsiz servis)
async function handleQuakes(req, res, query) {
  const limit = Math.min(parseInt(query.limit, 10) || 150, 500);
  const cacheKey = `quakes:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  try {
    const upstream = `https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=${limit}`;
    const r = await fetchWithTimeout(upstream);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    const result = (data.result || []).map(normalizeQuake).filter((q) => q.lat !== null && q.lon !== null);

    const payload = { ok: true, updated: new Date().toISOString(), count: result.length, data: result };
    setCache(cacheKey, payload, 25000); // 25 sn
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 200, { ok: false, reason: "fetch_failed", detail: String(err.message || err), data: [] });
  }
}

function normalizeQuake(q) {
  return {
    id: q.earthquake_id,
    title: q.title,
    mag: q.mag,
    depth: q.depth,
    date: q.date_time,
    lat: q.geojson?.coordinates?.[1] ?? null,
    lon: q.geojson?.coordinates?.[0] ?? null,
    closestCity: q.location_properties?.closestCity?.name || null,
    epiCenter: q.location_properties?.epiCenter?.name || null,
  };
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchDayArchive(dateStr) {
  const upstream = `https://api.orhanaydogdu.com.tr/deprem/kandilli/archive?date=${dateStr}&date_end=${dateStr}&limit=200`;
  const r = await fetchWithTimeout(upstream, {}, 15000);
  if (!r.ok) return [];
  const data = await r.json();
  return (data.result || []).map(normalizeQuake).filter((q) => q.lat !== null && q.lon !== null);
}

// ---------- /api/quakes/history ----------
// Son N gunun deprem arsivini gun gun cekip birlestirir (zaman tuneli / 3D glob icin).
async function handleQuakeHistory(req, res, query) {
  const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 30);
  const cacheKey = `quake-history:${days}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const today = new Date();
  const dateList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dateList.push(ymd(d));
  }

  try {
    // upstream'i bogmamak icin 5'erli gruplar halinde paralel cek
    const all = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < dateList.length; i += CONCURRENCY) {
      const batch = dateList.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((d) => fetchDayArchive(d).catch(() => [])));
      results.forEach((dayResult) => all.push(...dayResult));
    }
    // ayni depremler farkli gunlerde tekrar gelmesin diye id'ye gore tekillestir
    const seen = new Map();
    all.forEach((q) => seen.set(q.id, q));
    const merged = Array.from(seen.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

    const payload = { ok: true, updated: new Date().toISOString(), days, count: merged.length, data: merged };
    setCache(cacheKey, payload, 20 * 60 * 1000); // 20 dk (arsiv verisi sik degismez)
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 200, { ok: false, reason: "fetch_failed", detail: String(err.message || err), data: [] });
  }
}

// ---------- /api/fires ----------
// Kaynak: NASA FIRMS (VIIRS/MODIS uydu aktif ates tespiti). Anahtar gerektirir.
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i]));
    return obj;
  });
}

async function handleFires(req, res, query) {
  // NASA FIRMS 'country' uc noktasi gunluk araligi 1-5 ile sinirlar
  const days = Math.min(Math.max(parseInt(query.days, 10) || 1, 1), 5);
  const source = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"].includes(query.source)
    ? query.source
    : "VIIRS_SNPP_NRT";

  const key = CONFIG.FIRMS_MAP_KEY;
  if (!key || key === "BURAYA_KENDI_ANAHTARINI_YAZ") {
    return sendJson(res, 200, {
      ok: false,
      reason: "no_key",
      message: "FIRMS_MAP_KEY tanimli degil. config.json dosyasina ucretsiz NASA FIRMS anahtarini ekle: https://firms.modaps.eosdis.nasa.gov/api/map_key/",
      data: [],
    });
  }

  const cacheKey = `fires:${source}:${days}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  try {
    // Dogru host: firms.modaps.eosdis.nasa.gov (eski firms.modis.gov artik cozulmuyor / kapatildi).
    // 'country/csv/.../TUR/...' bu sunucuda "Invalid API call" donuyor; bunun yerine
    // Turkiye'yi kapsayan bir bounding box (west,south,east,north) ile 'area/csv' kullaniyoruz.
    const TURKEY_BBOX = "25.5,35.5,45,42.5";
    const upstream = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${TURKEY_BBOX}/${days}`;
    const r = await fetchWithTimeout(upstream, {}, 20000);
    const text = await r.text();
    if (!r.ok) throw new Error(`upstream ${r.status}: ${text.slice(0, 200)}`);
    if (/invalid/i.test(text) || /error/i.test(text.slice(0, 100))) {
      throw new Error(`FIRMS yaniti: ${text.slice(0, 200)}`);
    }
    const rows = parseCsv(text).map((row) => ({
      lat: parseFloat(row.latitude),
      lon: parseFloat(row.longitude),
      frp: parseFloat(row.frp) || 0,
      brightness: parseFloat(row.bright_ti4 || row.brightness) || null,
      confidence: row.confidence,
      date: row.acq_date,
      time: row.acq_time,
      satellite: row.satellite,
      instrument: row.instrument,
      daynight: row.daynight,
    })).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));

    const payload = { ok: true, updated: new Date().toISOString(), count: rows.length, source, days, data: rows };
    setCache(cacheKey, payload, 5 * 60 * 1000); // 5 dk (FIRMS verisi genelde ~1-2 saatte bir guncellenir)
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 200, { ok: false, reason: "fetch_failed", detail: String(err.message || err), data: [] });
  }
}

// ---------- statik dosya sunumu ----------
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  if (pathname === "/") filePath = path.join(PUBLIC_DIR, "index.html");

  // dizin gezintisini engelle
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // .html uzantisiz temiz URL destegi (orn. /hava -> /hava.html)
      const withHtml = filePath + ".html";
      fs.stat(withHtml, (err2, stat2) => {
        if (!err2 && stat2.isFile()) return streamFile(res, withHtml);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>404</h1><p>Sayfa bulunamadi.</p>");
      });
      return;
    }
    streamFile(res, filePath);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === "/api/quakes") return handleQuakes(req, res, parsed.query);
  if (pathname === "/api/quakes/history") return handleQuakeHistory(req, res, parsed.query);
  if (pathname === "/api/fires") return handleFires(req, res, parsed.query);
  if (pathname === "/api/reload-config") {
    loadConfig();
    return sendJson(res, 200, { ok: true });
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`\n  Turkiye Canli Takip sunucusu calisiyor:`);
  console.log(`  -> http://localhost:${PORT}\n`);
  if (!CONFIG.FIRMS_MAP_KEY || CONFIG.FIRMS_MAP_KEY === "BURAYA_KENDI_ANAHTARINI_YAZ") {
    console.log("  [bilgi] Yangin verisi icin config.json dosyasina NASA FIRMS anahtari ekleyin.");
    console.log("          Ucretsiz anahtar: https://firms.modaps.eosdis.nasa.gov/api/map_key/\n");
  }
});
