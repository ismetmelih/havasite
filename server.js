// Basit, bagimliliksiz Node.js sunucusu.
// - /public altindaki dosyalari statik olarak sunar (guvenlik basliklari + sikistirma ile)
// - /api/quakes  -> AFAD (yedek: EMSC) canli deprem verisini proxy'ler
// - /api/fires   -> NASA FIRMS (canli yangin/aktif ates tespiti) verisini proxy'ler
// - /api/auth/*, /api/admin/* -> hesap ve yonetim uc noktalari (hiz sinirli)
// Node >= 18 gereklidir (global fetch kullanilir).

const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { getPool, ensureSchema } = require("./lib/db");
const AuthLib = require("./lib/auth");
const HttpLib = require("./lib/http");
const Push = require("./lib/push");

// Varsa .env dosyasindaki ortam degiskenlerini yukle (yerel gelistirme ve AWS Amplify:
// Amplify ortam degiskenleri calisma aninda sunucuya ulasmadigi icin build sirasinda .env'e yazilir).
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_FILE);
}

const PUBLIC_DIR = path.join(__dirname, "public");
let CONFIG = { FIRMS_MAP_KEY: "", PORT: 3000 };

function loadConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "config.json"), "utf8");
    CONFIG = { ...CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("[uyari] config.json okunamadi, varsayilanlar kullaniliyor:", err.message);
  }
  // Ortam degiskenleri (ornegin AWS Amplify Environment variables) config.json'u ezer.
  // Boylece config.json git'e dahil edilmese bile (.gitignore) barindirma platformunda calisir.
  if (process.env.FIRMS_MAP_KEY) CONFIG.FIRMS_MAP_KEY = process.env.FIRMS_MAP_KEY;
  if (process.env.PORT) CONFIG.PORT = process.env.PORT;
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
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
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
    return await fetch(resource, {
      ...opts,
      signal: controller.signal,
      headers: {
        // bazi ucuncu taraf servisler barindirma saglayicilarinin sunucu IP'lerinden
        // gelen "bot benzeri" (User-Agent'siz/node) istekleri 403 ile reddediyor;
        // tarayici benzeri basliklar bu engeli asmaya yardimci olabilir.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

// Not: Access-Control-Allow-Origin bilerek yok — API'ler yalnizca bu sitenin kendi
// sayfalarina hizmet eder; baska sitelerin tarayicidan dogrudan kullanmasi engellenir
// (aksi halde NASA FIRMS anahtarimizin kotasi baskalarinca tuketilebilirdi).
function sendJson(res, status, obj, extraHeaders) {
  HttpLib.send(res.req, res, status, {
    ...HttpLib.securityHeaders(false),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(extraHeaders || {}),
  }, JSON.stringify(obj));
}

// ---------- hiz sinirlama ----------
const limiters = {
  admin: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
  // tum IP'lerden toplam basarisiz admin denemesi (dagitik kaba kuvvete karsi)
  adminAll: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  pushSub: HttpLib.createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
  pushTest: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
  hit: HttpLib.createRateLimiter({ windowMs: 60 * 1000, max: 60 }),
};

// sinir asildiysa 429 yazar ve false doner
function checkLimit(res, limiter, key) {
  const r = limiter.hit(key);
  if (r.ok) return true;
  const mins = Math.max(1, Math.ceil(r.retryAfterSec / 60));
  sendJson(res, 429, {
    ok: false,
    reason: "rate_limited",
    message: `Çok fazla deneme yapıldı. Lütfen ${mins} dakika sonra tekrar dene.`,
  }, { "Retry-After": String(r.retryAfterSec) });
  return false;
}

// ---------- /api/quakes ----------
// Kaynak sirasi: (1) AFAD resmi acik API (servisnet apiv2): il/ilce/mahalle, buyukluk turu
// (ML/MW) ve duzeltme bilgisi verir, UTC dondurur (Turkiye saatine cevrilir). (2) AFAD'in
// last-earthquakes.html sayfasindaki canli tablo. (3) EMSC (Avrupa-Akdeniz Sismoloji Merkezi).
const TURKEY_BBOX_QUAKE = { minlat: 35.5, maxlat: 42.5, minlon: 25.5, maxlon: 45 };

function isoNoMs(d) {
  return d.toISOString().slice(0, 19);
}

const istanbulFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
// UTC bir Date'i "YYYY-MM-DD HH:MM:SS" formatinda Turkiye yerel saatine cevirir
// (sitenin geri kalani deprem tarihlerini hep bu naive/ofsetsiz bicimde kullanir).
function toIstanbulLocalString(d) {
  const parts = {};
  istanbulFmt.formatToParts(d).forEach((p) => (parts[p.type] = p.value));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function provinceFromPlace(place) {
  const m = /\(([^()]+)\)\s*$/.exec(place || "");
  return m ? m[1].trim() : null;
}

// ---- (1) AFAD canli tablosu: last-earthquakes.html icine gomulu HTML tablo ----
// Bu sayfa AFAD'in kendi vatandaslara gosterdigi sayfayla birebir aynidir;
// ekstra bir "API" cagrisi yok, veri dogrudan HTML icinde geliyor.
async function fetchAfadLiveTable() {
  const r = await fetchWithTimeout("https://deprem.afad.gov.tr/last-earthquakes.html", {}, 15000);
  if (!r.ok) throw new Error(`afad-live upstream ${r.status}`);
  const html = await r.text();
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].trim());
    if (cells.length < 8) continue; // baslik satiri <th> kullanir, atlanir
    const [dateStr, latStr, lonStr, depthStr, , magStr, place, detailCell] = cells;
    const idMatch = detailCell.match(/event-detail\/(\d+)/);
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    const mag = parseFloat(magStr);
    if (!idMatch || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag)) continue;
    out.push({
      id: idMatch[1],
      title: place,
      mag,
      depth: parseFloat(depthStr),
      date: dateStr, // zaten "YYYY-MM-DD HH:MM:SS" Turkiye yerel saati
      lat,
      lon,
      closestCity: provinceFromPlace(place),
      epiCenter: place,
    });
  }
  if (!out.length) throw new Error("afad-live tablo bos/ayristirilamadi");
  return out;
}

// ---- (2) AFAD filter API: gecmis tarih araligi sorgulanabilir ----
function afadQuery(startDate, endDate, limit) {
  const { minlat, maxlat, minlon, maxlon } = TURKEY_BBOX_QUAKE;
  return `https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter?start=${isoNoMs(startDate)}&end=${isoNoMs(endDate)}&minlat=${minlat}&maxlat=${maxlat}&minlon=${minlon}&maxlon=${maxlon}&limit=${limit}`;
}

function normalizeAfadQuake(item) {
  const mag = parseFloat(item.magnitude);
  const lat = parseFloat(item.latitude);
  const lon = parseFloat(item.longitude);
  // filter API "date" alanini UTC olarak donduruyor (last-earthquakes.html
  // tablosundaki ayni olayla karsilastirarak dogrulandi); gosterim icin
  // Turkiye yerel saatine ceviriyoruz.
  let dateStr = null;
  if (item.date) {
    const d = new Date(item.date.endsWith("Z") ? item.date : item.date + "Z");
    if (!Number.isNaN(d.getTime())) dateStr = toIstanbulLocalString(d);
  }
  return {
    id: item.eventID,
    title: item.location || [item.district, item.province].filter(Boolean).join(", ") || "Türkiye",
    mag,
    magType: /^[A-Za-z]{1,4}$/.test(String(item.type || "")) ? String(item.type) : null,
    depth: parseFloat(item.depth),
    date: dateStr,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    closestCity: item.province || null,
    epiCenter: item.location || null,
    province: item.province || null,
    district: item.district || null,
    neighborhood: item.neighborhood || null,
    // AFAD buyukluk/konumu sonradan duzelttiyse
    updated: item.isEventUpdate === true,
    source: "afad",
  };
}

async function fetchAfadQuakes(startDate, endDate, limit) {
  const upstream = afadQuery(startDate, endDate, limit);
  const r = await fetchWithTimeout(upstream, {}, 15000);
  if (!r.ok) throw new Error(`afad upstream ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("afad beklenmeyen yanit");
  return data
    .map(normalizeAfadQuake)
    .filter((q) => q.lat !== null && q.lon !== null && q.date && Number.isFinite(q.mag));
}

function emscBboxQuery(extra) {
  const { minlat, maxlat, minlon, maxlon } = TURKEY_BBOX_QUAKE;
  return `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlatitude=${minlat}&maxlatitude=${maxlat}&minlongitude=${minlon}&maxlongitude=${maxlon}&orderby=time${extra}`;
}

function normalizeEmscQuake(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [null, null];
  let dateStr = null;
  if (p.time) {
    const d = new Date(p.time);
    if (!Number.isNaN(d.getTime())) dateStr = d.toISOString().slice(0, 19).replace("T", " ");
  }
  const region = p.flynn_region ? p.flynn_region.replace(/\s+/g, " ").trim() : null;
  return {
    id: f.id || p.unid || p.source_id,
    title: region || "Türkiye",
    mag: typeof p.mag === "number" ? p.mag : parseFloat(p.mag),
    depth: typeof p.depth === "number" ? p.depth : parseFloat(p.depth),
    date: dateStr,
    lat: typeof lat === "number" ? lat : null,
    lon: typeof lon === "number" ? lon : null,
    closestCity: null,
    epiCenter: region,
  };
}

async function fetchEmscQuakes(extra) {
  const upstream = emscBboxQuery(extra);
  const r = await fetchWithTimeout(upstream, {}, 15000);
  if (!r.ok) throw new Error(`emsc upstream ${r.status}`);
  const data = await r.json();
  return (data.features || [])
    .map(normalizeEmscQuake)
    .filter((q) => q.lat !== null && q.lon !== null && q.date && Number.isFinite(q.mag));
}

async function handleQuakes(req, res, query) {
  const limit = Math.min(parseInt(query.limit, 10) || 150, 500);
  const payload = await getLatestQuakes(limit);
  sendJson(res, 200, payload);
}

// Son depremler (AFAD resmi API -> AFAD canli tablo -> EMSC sirasiyla); 25 sn onbellekli.
// Hem /api/quakes hem de deprem bildirimleri (/api/push/run) kullanir.
async function getLatestQuakes(limit) {
  const cacheKey = `quakes:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let result;
  let source;
  try {
    // (1) AFAD resmi acik API: il/ilce/mahalle, buyukluk turu ve duzeltme bilgisi; canli tabloda
    // henuz gorunmeyen olaylari da iceriyor (2026-10-12 karsilastirmasi)
    const end = new Date(Date.now() + 60000);
    const start = new Date(end.getTime() - 3 * 86400000);
    result = (await fetchAfadQuakes(start, end, 1000))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);
    if (!result.length) throw new Error("afad api bos");
    source = "afad";
  } catch (err) {
    try {
      // (2) yedek: AFAD'in kendi "son depremler" sayfasindaki canli tablo
      result = (await fetchAfadLiveTable())
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
      source = "afad-live";
    } catch (err2) {
      try {
        // (3) son care: EMSC
        result = await fetchEmscQuakes(`&limit=${limit}`);
        source = "emsc";
      } catch (err3) {
        console.error("[deprem] tum kaynaklar basarisiz:", String(err3.message || err3));
        return { ok: false, reason: "fetch_failed", data: [] };
      }
    }
  }

  const payload = { ok: true, updated: new Date().toISOString(), count: result.length, source, data: result };
  setCache(cacheKey, payload, 25000); // 25 sn
  return payload;
}

// ---------- /api/quakes/history ----------
// Son N gunu tek bir tarih-araligi sorgusuyla ceker (zaman tuneli / 3D glob icin).
async function handleQuakeHistory(req, res, query) {
  const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 30);
  const cacheKey = `quake-history:${days}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  let result;
  let source;
  try {
    // AFAD filter API tek istekte ~1000 kayitla sinirli ve eskiden yeniye
    // donuyor; yogun bir 30 gunluk pencerede son gunler eksik kaliyordu.
    // Bu yuzden pencereyi ~7 gunluk dilimlere bolup birlestiriyoruz.
    const CHUNK_MS = 7 * 86400000;
    const chunks = [];
    for (let s = start.getTime(); s < end.getTime(); s += CHUNK_MS) {
      chunks.push([new Date(s), new Date(Math.min(s + CHUNK_MS, end.getTime()))]);
    }
    const parts = await Promise.all(chunks.map(([cs, ce]) => fetchAfadQuakes(cs, ce, 1000).catch(() => [])));
    const seen = new Set();
    result = [];
    parts.flat().forEach((q) => { if (!seen.has(q.id)) { seen.add(q.id); result.push(q); } });
    if (!result.length) throw new Error("afad bos");
    source = "afad";
  } catch (err) {
    try {
      result = await fetchEmscQuakes(`&limit=2000&starttime=${isoNoMs(start)}`);
      source = "emsc";
    } catch (err2) {
      console.error("[deprem gecmisi] alinamadi:", String(err2.message || err2));
      return sendJson(res, 200, { ok: false, reason: "fetch_failed", data: [] });
    }
  }

  result.sort((a, b) => new Date(a.date) - new Date(b.date));
  const payload = { ok: true, updated: new Date().toISOString(), days, count: result.length, source, data: result };
  setCache(cacheKey, payload, 20 * 60 * 1000); // 20 dk (arsiv verisi sik degismez)
  sendJson(res, 200, payload);
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

async function getFires(source, days) {
  const key = CONFIG.FIRMS_MAP_KEY;
  if (!key || key === "BURAYA_KENDI_ANAHTARINI_YAZ") {
    return {
      ok: false,
      reason: "no_key",
      message: "Yangın verisi için NASA FIRMS anahtarı tanımlı değil. Ücretsiz anahtar: https://firms.modaps.eosdis.nasa.gov/api/map_key/",
      data: [],
    };
  }
  const cacheKey = `fires:${source}:${days}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
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
    return payload;
  } catch (err) {
    console.error("[yangin] alinamadi:", String(err.message || err).slice(0, 300));
    return { ok: false, reason: "fetch_failed", data: [] };
  }
}

async function handleFires(req, res, query) {
  // NASA FIRMS 'area' uc noktasi gunluk araligi 1-5 ile sinirlar
  const days = Math.min(Math.max(parseInt(query.days, 10) || 1, 1), 5);
  const source = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"].includes(query.source)
    ? query.source
    : "VIIRS_SNPP_NRT";
  sendJson(res, 200, await getFires(source, days));
}

// ---------- govde okuma + json yardimcilari ----------
function readJsonBody(req, maxBytes = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

// ---------- auth ----------
async function requireDb(res) {
  const ok = await ensureSchema();
  if (!ok) {
    sendJson(res, 200, {
      ok: false,
      reason: "no_database",
      message: "Hesap sistemine şu an ulaşılamıyor. Lütfen biraz sonra tekrar dene.",
    });
    return false;
  }
  return true;
}

// ---------- hava: 81 ilin anlik durumu ve ana sayfa model karsilastirmasi ----------
// Open-Meteo IP basina sinir koyuyor (cok konumlu istekte her konum ayri sayilir). Bu veriler
// her kullanicinin tarayicisindan ayri ayri istenmesin diye sunucuda onbellege alinir; kaynak
// cevap vermezse son basarili veri sunulur (bayat ama bos degil).
let TR_CITY_LIST = null;
function trCityList() {
  if (TR_CITY_LIST) return TR_CITY_LIST;
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "js", "cities.js"), "utf8"), sandbox, { timeout: 1000 });
  TR_CITY_LIST = (sandbox.window.TR_CITIES || []).map((c) => ({ name: c.name, lat: c.lat, lon: c.lon }));
  return TR_CITY_LIST;
}
const wxStore = new Map(); // anahtar -> { data, at, pending }
function cachedFetch(key, ttlMs, loader) {
  const e = wxStore.get(key) || { data: null, at: 0, pending: null };
  wxStore.set(key, e);
  const fresh = e.data && Date.now() - e.at < ttlMs;
  if (!fresh && !e.pending) {
    e.pending = loader()
      .then((data) => { e.data = data; e.at = Date.now(); })
      .catch((err) => console.error(`[hava] ${key} alinamadi:`, String(err.message || err).slice(0, 160)))
      .finally(() => { e.pending = null; });
  }
  // bayat veri varsa beklemeden onu don (arka planda yenilenir); hic yoksa ilk yuklemeyi bekle
  if (e.data) return Promise.resolve({ ...e.data, stale: !fresh });
  return (e.pending || Promise.resolve()).then(() => (e.data ? { ...e.data, stale: false } : { ok: false, reason: "unavailable" }));
}
async function openMeteo(params) {
  const r = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams(params)}`, {}, 15000);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  return r.json();
}
const getCityWeather = () =>
  cachedFetch("cities", 10 * 60 * 1000, async () => {
    const cities = trCityList();
    const j = await openMeteo({
      latitude: cities.map((c) => c.lat).join(","), longitude: cities.map((c) => c.lon).join(","),
      current: "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,cloud_cover,is_day", timezone: "Europe/Istanbul",
    });
    const arr = Array.isArray(j) ? j : [j];
    const data = cities.map((c, i) => {
      const cur = arr[i] && arr[i].current;
      return cur ? { name: c.name, lat: c.lat, lon: c.lon, temp: cur.temperature_2m, code: cur.weather_code, humidity: cur.relative_humidity_2m, wind: cur.wind_speed_10m, cloud: cur.cloud_cover, isDay: cur.is_day === 1 } : null;
    }).filter(Boolean);
    if (data.length < 40) throw new Error("eksik veri");
    return { ok: true, updated: new Date().toISOString(), data };
  });
async function handleWeatherCities(req, res) {
  const out = await getCityWeather();
  // gecici hata yaniti onbellege alinmasin (CloudFront/tarayici 5 dk boyunca bos harita gosterirdi)
  sendJson(res, 200, out, { "Cache-Control": out.ok ? "public, max-age=300" : "no-store" });
}
const HOME_MODELS = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "meteofrance_seamless", "gem_seamless", "ukmo_seamless"];
async function handleWeatherModels(req, res) {
  const out = await cachedFetch("models-ankara", 60 * 60 * 1000, async () => {
    const j = await openMeteo({ latitude: "39.92", longitude: "32.85", daily: "temperature_2m_max", models: HOME_MODELS.join(","), timezone: "Europe/Istanbul", forecast_days: "3" });
    return { ok: true, updated: new Date().toISOString(), daily: j.daily };
  });
  sendJson(res, 200, out, { "Cache-Control": out.ok ? "public, max-age=900" : "no-store" });
}

// ---------- sistem durumu (alt bilgideki canli gosterge) ----------
// Dis servislere ek sorgu yapmaz: deprem verisi zaten 25 sn onbellekte, yangin icin son
// onbellek kaydina bakilir. Boylece her sayfa acilisi AFAD/NASA'ya fazladan istek atmaz.
async function handleStatus(req, res) {
  const quakes = await getLatestQuakes(150).catch(() => ({ ok: false }));
  const firesKey = !!(CONFIG.FIRMS_MAP_KEY && CONFIG.FIRMS_MAP_KEY !== "BURAYA_KENDI_ANAHTARINI_YAZ");
  const firesCached = [...cache.keys()].some((k) => k.startsWith("fires:") && getCache(k));
  sendJson(res, 200, {
    ok: true,
    services: {
      deprem: quakes.ok ? { state: "ok", source: quakes.source === "emsc" ? "EMSC (yedek)" : "AFAD" } : { state: "down", source: "AFAD" },
      yangin: !firesKey ? { state: "off", source: "NASA FIRMS" } : { state: firesCached ? "ok" : "idle", source: "NASA FIRMS" },
      bildirim: { state: Push.pushConfigured() ? "ok" : "off", source: "Web Push" },
    },
    time: new Date().toISOString(),
  }, { "Cache-Control": "public, max-age=30" });
}

// ---------- deprem bildirimleri (Web Push) ----------
// Sunucu bu adreslere istek atacagi icin yalnizca bilinen tarayici bildirim servisleri kabul edilir
// (aksi halde biri sunucuyu istedigi adrese istek atmaya zorlayabilirdi — SSRF).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

function validSubscription(sub) {
  if (!sub || typeof sub !== "object") return null;
  const endpoint = String(sub.endpoint || "");
  const keys = sub.keys || {};
  if (!/^https:\/\/[^\s]{10,}$/.test(endpoint) || endpoint.length > 1000) return null;
  let host;
  try { host = new URL(endpoint).hostname; } catch { return null; }
  if (!PUSH_HOSTS.some((re) => re.test(host))) return null;
  const p256dh = String(keys.p256dh || ""), auth = String(keys.auth || "");
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,60}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

function handlePushKey(req, res) {
  sendJson(res, 200, { ok: true, enabled: Push.pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
}

async function handlePushSubscribe(req, res) {
  if (!Push.pushConfigured()) return sendJson(res, 200, { ok: false, reason: "not_configured", message: "Bildirimler henüz etkin değil." });
  if (!checkLimit(res, limiters.pushSub, HttpLib.clientIp(req))) return;
  if (!(await requireDb(res))) return;
  let body;
  try { body = await readJsonBody(req, 8 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const sub = validSubscription(body.subscription);
  if (!sub) return sendJson(res, 400, { ok: false, reason: "bad_subscription", message: "Bildirim aboneliği geçersiz." });
  const minMag = Math.min(7, Math.max(3, Math.round((Number(body.minMag) || 4) * 2) / 2));
  // konum gizlilik icin ~1 km'ye yuvarlanir; hava/yangin bildirimleri ve deprem yaricapi icin gerekir
  const hasLoc = Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lon))
    && Number(body.lat) > 34 && Number(body.lat) < 43.5 && Number(body.lon) > 24 && Number(body.lon) < 46;
  const lat = hasLoc ? Math.round(Number(body.lat) * 100) / 100 : null;
  const lon = hasLoc ? Math.round(Number(body.lon) * 100) / 100 : null;
  const placeName = hasLoc ? String(body.placeName || "").replace(/[<>]/g, "").trim().slice(0, 40) || null : null;
  const quakeOn = body.quakeOn !== false;
  const radius = hasLoc && [50, 100, 250, 500].includes(Number(body.radiusKm)) ? Number(body.radiusKm) : null;
  const wxDaily = hasLoc && body.wxDaily === true;
  const wxHour = Math.min(10, Math.max(5, parseInt(body.wxHour, 10) || 7));
  const wxAlerts = hasLoc && body.wxAlerts === true;
  const fireRadius = hasLoc && [25, 50, 100].includes(Number(body.fireRadiusKm)) ? Number(body.fireRadiusKm) : null;
  const fireOn = !!fireRadius && body.fireOn === true;
  if (!quakeOn && !wxDaily && !wxAlerts && !fireOn) {
    return sendJson(res, 400, { ok: false, reason: "nothing_selected", message: "En az bir bildirim türü seç." });
  }
  try {
    await getPool().query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, min_mag, lat, lon, radius_km, quake_on, place_name, wx_daily, wx_hour, wx_alerts, fire_on, fire_radius_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, min_mag = EXCLUDED.min_mag,
         lat = EXCLUDED.lat, lon = EXCLUDED.lon, radius_km = EXCLUDED.radius_km, quake_on = EXCLUDED.quake_on,
         place_name = EXCLUDED.place_name, wx_daily = EXCLUDED.wx_daily, wx_hour = EXCLUDED.wx_hour,
         wx_alerts = EXCLUDED.wx_alerts, fire_on = EXCLUDED.fire_on, fire_radius_km = EXCLUDED.fire_radius_km`,
      [sub.endpoint, sub.p256dh, sub.auth, minMag, lat, lon, radius, quakeOn, placeName, wxDaily, wxHour, wxAlerts, fireOn, fireRadius]
    );
    sendJson(res, 200, { ok: true, minMag, radiusKm: radius, quakeOn, wxDaily, wxHour, wxAlerts, fireOn, fireRadiusKm: fireRadius, placeName, hasLocation: hasLoc });
  } catch (err) {
    console.error("[push] abonelik:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Abonelik kaydedilemedi." });
  }
}

// Tarayici aboneligi kendiliginden yenilerse (pushsubscriptionchange) service worker
// eski adresle birlikte yenisini gonderir; tercihler korunarak adres guncellenir.
async function handlePushResubscribe(req, res) {
  if (!checkLimit(res, limiters.pushSub, HttpLib.clientIp(req))) return;
  if (!(await requireDb(res))) return;
  let body;
  try { body = await readJsonBody(req, 8 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request" }); }
  const sub = validSubscription(body.subscription);
  const oldEndpoint = String(body.oldEndpoint || "");
  if (!sub || !oldEndpoint) return sendJson(res, 400, { ok: false, reason: "bad_subscription" });
  const r = await getPool().query(
    "UPDATE push_subscriptions SET endpoint = $1, p256dh = $2, auth = $3 WHERE endpoint = $4",
    [sub.endpoint, sub.p256dh, sub.auth, oldEndpoint]
  ).catch(() => ({ rowCount: 0 }));
  sendJson(res, 200, { ok: r.rowCount > 0 });
}

async function handlePushUnsubscribe(req, res) {
  if (!checkLimit(res, limiters.pushSub, HttpLib.clientIp(req))) return;
  if (!(await requireDb(res))) return;
  let body;
  try { body = await readJsonBody(req, 4 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const endpoint = String(body.endpoint || "");
  if (endpoint) await getPool().query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]).catch(() => {});
  sendJson(res, 200, { ok: true });
}

async function handlePushTest(req, res) {
  if (!Push.pushConfigured()) return sendJson(res, 200, { ok: false, reason: "not_configured", message: "Bildirimler henüz etkin değil." });
  if (!(await requireDb(res))) return;
  let body;
  try { body = await readJsonBody(req, 4 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const endpoint = String(body.endpoint || "");
  if (!checkLimit(res, limiters.pushTest, endpoint || HttpLib.clientIp(req))) return;
  const r = await getPool().query("SELECT * FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  if (!r.rows[0]) return sendJson(res, 404, { ok: false, reason: "not_found", message: "Önce bildirimleri aç." });
  try {
    await Push.sendOne(r.rows[0], { title: "TürkiyeCanlı bildirimleri açık", body: `M${r.rows[0].min_mag.toFixed(1)} ve üzeri depremlerde haber vereceğiz.`, url: "/deprem.html", tag: "test" });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 502, { ok: false, reason: "push_failed", message: "Test bildirimi gönderilemedi." });
  }
}

// EventBridge zamanlayicisi cagirir; gizli anahtarsiz cagri reddedilir.
async function handlePushRun(req, res) {
  const secret = process.env.PUSH_CRON_SECRET || "";
  if (!secret || !AuthLib.timingSafeEqualStr(String(req.headers["x-cron-secret"] || ""), secret)) {
    return sendJson(res, 401, { ok: false, reason: "unauthorized" });
  }
  if (!(await requireDb(res))) return;
  const pool = getPool();
  const result = {};
  // her is bagimsiz: biri hata verirse digerleri yine calisir
  try {
    const latest = await getLatestQuakes(150);
    result.quake = latest.ok ? await Push.runQuakePush(pool, latest.data) : { ok: false, reason: "quakes_unavailable" };
  } catch (err) { result.quake = { ok: false, error: String(err.message).slice(0, 120) }; }
  try { result.weather = await Push.runWeatherPush(pool); } catch (err) { result.weather = { ok: false, error: String(err.message).slice(0, 120) }; }
  try { result.fire = await Push.runFirePush(pool, () => getFires("VIIRS_SNPP_NRT", 1)); } catch (err) { result.fire = { ok: false, error: String(err.message).slice(0, 120) }; }
  const noisy = Object.values(result).some((r) => r && (r.sent || r.removed || r.failed || r.error));
  if (noisy) console.log("[push] calisma:", JSON.stringify(result));
  await recordPushRun(pool, result).catch((err) => console.error("[push] kayit:", String(err.message).slice(0, 120)));
  sendJson(res, 200, { ok: true, ...result });
}

// admin paneli icin: son calisma zamani, hatalar ve son 14 gunun gonderim sayilari
async function recordPushRun(pool, result) {
  const sum = (k) => Object.values(result).reduce((n, r) => n + ((r && r[k]) || 0), 0);
  const errors = Object.entries(result)
    .filter(([, r]) => r && (r.ok === false || r.error || /unavailable/.test(r.reason || "")))
    .map(([name, r]) => `${name}: ${r.error || r.reason || "hata"}`);
  const st = await pool.query("SELECT v FROM app_state WHERE k = 'push_log'");
  const prev = (st.rows[0] && st.rows[0].v) || {};
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const days = prev.days || {};
  const d = days[today] || { sent: 0, failed: 0, removed: 0 };
  d.sent += sum("sent");
  d.failed += sum("failed");
  d.removed += sum("removed");
  days[today] = d;
  const keep = Object.keys(days).sort().slice(-14);
  const now = new Date().toISOString();
  const v = { lastRunAt: now, lastErrors: errors, lastSendAt: sum("sent") ? now : prev.lastSendAt || null, days: Object.fromEntries(keep.map((k) => [k, days[k]])) };
  await pool.query("INSERT INTO app_state (k, v) VALUES ('push_log', $1::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()", [JSON.stringify(v)]);
}

// ---------- kimliksiz ziyaret sayaci ----------
// IP adresi, cerez ya da cihaz kimligi saklanmaz; yalnizca zaman, sayfa, gelinen site (alan adi),
// cihaz turu ve ulke (CloudFront basligi). Botlar ve admin sayfasi sayilmaz.
const VISIT_PAGES = new Set(["/", "/hava.html", "/deprem.html", "/yangin.html", "/uygulama.html", "/gizlilik.html", "/ayarlar.html"]);
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python|node-fetch|go-http/i;
async function handleHit(req, res) {
  if (!checkLimit(res, limiters.hit, HttpLib.clientIp(req))) return;
  let body;
  try { body = await readJsonBody(req, 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request" }); }
  const ua = String(req.headers["user-agent"] || "");
  const page = String(body.p || "") === "/index.html" ? "/" : String(body.p || "");
  if (!ua || BOT_UA.test(ua) || !VISIT_PAGES.has(page)) return sendJson(res, 200, { ok: true, counted: false });
  if (!(await requireDb(res))) return;
  const refRaw = String(body.r || "").toLowerCase().replace(/^www\./, "");
  const ref = /^[a-z0-9.-]{1,80}$/.test(refRaw) ? refRaw : null;
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobil" : "masaüstü";
  const cc = String(req.headers["cloudfront-viewer-country"] || "").toUpperCase();
  const pool = getPool();
  await pool.query("INSERT INTO site_visits (path, ref, device, country, entry, app) VALUES ($1, $2, $3, $4, $5, $6)", [page, ref, device, /^[A-Z]{2}$/.test(cc) ? cc : null, !!body.e, !!body.a]);
  if (Math.random() < 0.005) pool.query("DELETE FROM site_visits WHERE at < now() - interval '180 days'").catch(() => {});
  sendJson(res, 200, { ok: true });
}

// ---------- admin ----------
// Sitede kullanici hesabi yok; tek giris admin icindir. Site sahibi AWS Amplify'da (veya yerelde
// .env icinde) ADMIN_EMAIL ve ADMIN_PASSWORD ortam degiskenlerini tanimlar; admin.html'deki
// giris formu bu bilgilerle dogrulanir ve kisa omurlu bir oturum cerezi alir.
function adminCredentialsConfigured() {
  return !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}

async function handleAdminLogin(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." });
  }
  if (!checkLimit(res, limiters.admin, HttpLib.clientIp(req))) return;
  if (!adminCredentialsConfigured()) {
    return sendJson(res, 200, {
      ok: false,
      reason: "not_configured",
      message: "Yönetici girişi henüz yapılandırılmamış (ADMIN_EMAIL / ADMIN_PASSWORD).",
    });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const expectedEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

  const emailOk = AuthLib.timingSafeEqualStr(email, expectedEmail);
  const passwordOk = AuthLib.timingSafeEqualStr(password, process.env.ADMIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    if (!checkLimit(res, limiters.adminAll, "all")) return;
    return sendJson(res, 401, { ok: false, reason: "invalid_credentials", message: "Yönetici e-postası veya şifresi hatalı." });
  }
  res.setHeader("Set-Cookie", AuthLib.createAdminSessionCookie(req));
  sendJson(res, 200, { ok: true });
}

function handleAdminLogout(req, res) {
  res.setHeader("Set-Cookie", AuthLib.clearAdminSessionCookie(req));
  sendJson(res, 200, { ok: true });
}

function handleAdminSession(req, res) {
  sendJson(res, 200, { ok: true, isAdmin: AuthLib.readAdminSession(req) });
}

// admin API uc noktalarini korumak icin kullanilir; basarisizsa kendisi yanit yazar ve false doner
async function requireAdmin(req, res) {
  if (!AuthLib.readAdminSession(req)) {
    sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Bu işlem için yönetici girişi gerekli." });
    return false;
  }
  return true;
}

async function handleAdminStats(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (!(await requireDb(res))) return;
  const TZ = "'Europe/Istanbul'";
  const WEEK = "at > now() - interval '7 days'";
  try {
    const pool = getPool();
    const [push, log, totals, daily, hourly, pages, refs, devices, countries, recent] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE quake_on)::int AS quake, count(*) FILTER (WHERE wx_daily)::int AS wx_daily,
        count(*) FILTER (WHERE wx_alerts)::int AS wx_alerts, count(*) FILTER (WHERE fire_on)::int AS fire, count(*) FILTER (WHERE lat IS NOT NULL)::int AS located,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7 FROM push_subscriptions`),
      pool.query("SELECT v FROM app_state WHERE k = 'push_log'"),
      pool.query(`SELECT count(*) FILTER (WHERE entry AND at > now() - interval '1 day')::int AS v1, count(*) FILTER (WHERE at > now() - interval '1 day')::int AS p1,
        count(*) FILTER (WHERE entry AND ${WEEK})::int AS v7, count(*) FILTER (WHERE ${WEEK})::int AS p7,
        count(*) FILTER (WHERE entry)::int AS v30, count(*)::int AS p30 FROM site_visits WHERE at > now() - interval '30 days'`),
      pool.query(`SELECT to_char(at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d, count(*) FILTER (WHERE entry)::int AS v, count(*)::int AS p
        FROM site_visits WHERE at > now() - interval '15 days' GROUP BY 1 ORDER BY 1`),
      pool.query(`SELECT extract(hour FROM at AT TIME ZONE ${TZ})::int AS h, count(*) FILTER (WHERE entry)::int AS v FROM site_visits
        WHERE (at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date GROUP BY 1`),
      pool.query(`SELECT path, count(*)::int AS n FROM site_visits WHERE ${WEEK} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      pool.query(`SELECT coalesce(ref, '') AS ref, count(*)::int AS n FROM site_visits WHERE entry AND ${WEEK} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      pool.query(`SELECT device, count(*)::int AS n FROM site_visits WHERE entry AND ${WEEK} GROUP BY 1 ORDER BY 2 DESC`),
      pool.query(`SELECT coalesce(country, '') AS country, count(*)::int AS n FROM site_visits WHERE entry AND ${WEEK} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      pool.query("SELECT at, path, ref, device, country, entry, app FROM site_visits ORDER BY at DESC LIMIT 30"),
    ]);
    sendJson(res, 200, {
      ok: true,
      stats: {
        push: { ...push.rows[0], configured: Push.pushConfigured(), log: (log.rows[0] && log.rows[0].v) || null },
        visits: { totals: totals.rows[0], daily: daily.rows, hourly: hourly.rows, pages: pages.rows, refs: refs.rows, devices: devices.rows, countries: countries.rows, recent: recent.rows },
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  } catch (err) {
    console.error("[admin] istatistik:", String(err.message).slice(0, 160));
    sendJson(res, 500, { ok: false, reason: "server_error", message: "İstatistikler alınamadı." });
  }
}

// veri kaynaklarinin canli durumu: her kaynak gercekten sorgulanir (onbellek varsa onu kullanir)
async function handleAdminHealth(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const timed = async (fn) => { const t = Date.now(); try { return { ...(await fn()), ms: Date.now() - t }; } catch (err) { return { ok: false, error: String(err.message || err).slice(0, 120), ms: Date.now() - t }; } };
  const [quakes, fires, wx, db] = await Promise.all([
    timed(() => getLatestQuakes(150)),
    timed(() => getFires("VIIRS_SNPP_NRT", 1)),
    timed(() => getCityWeather()),
    timed(async () => { if (!(await ensureSchema())) return { ok: false, error: "bağlantı yok" }; await getPool().query("SELECT 1"); return { ok: true }; }),
  ]);
  const newestFire = (fires.data || []).reduce((m, f) => { const t = Date.parse(`${f.date}T${String(f.time).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")}:00Z`); return t > m ? t : m; }, 0);
  sendJson(res, 200, {
    ok: true,
    sources: {
      afad: { ok: !!quakes.ok, source: quakes.source || null, count: quakes.count || 0, newest: quakes.data && quakes.data[0] ? quakes.data[0].date : null, ms: quakes.ms, error: quakes.reason || quakes.error || null },
      firms: { ok: !!fires.ok, count: fires.data ? fires.data.length : 0, newest: newestFire ? new Date(newestFire).toISOString() : null, ms: fires.ms, error: fires.reason || fires.error || null },
      openMeteo: { ok: !!wx.ok, updated: wx.updated || null, stale: !!wx.stale, count: wx.data ? wx.data.length : 0, ms: wx.ms, error: wx.reason || wx.error || null },
      db: { ok: !!db.ok, ms: db.ms, error: db.error || null },
      push: { ok: Push.pushConfigured() },
    },
  }, { "Cache-Control": "no-store" });
}

// ---------- sitenin tam adresi (paylasim etiketleri, sitemap) ----------
// Kalici alan adi baglaninca Amplify'da SITE_URL (orn. https://ornek.com) tanimlanmali;
// tanimli degilse istegin geldigi alan adi kullanilir (dogrulanmis bicimde).
function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return "";
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

const SITEMAP_PAGES = ["/", "/hava.html", "/deprem.html", "/yangin.html", "/uygulama.html", "/gizlilik.html"];

// HTML yer tutuculari: {{ORIGIN}} sitenin tam adresi, {{CONTACT_EMAIL}} KVKK iletisim adresi
function fillPlaceholders(html, req) {
  const contact = String(process.env.CONTACT_EMAIL || "").replace(/[<>"&]/g, "");
  return html
    .split("{{ORIGIN}}").join(siteOrigin(req))
    .split("{{CONTACT_EMAIL}}").join(contact || "iletişim adresi yakında eklenecek");
}

function handleRobots(req, res) {
  const origin = siteOrigin(req);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin.html",
    "Disallow: /ayarlar.html",
    origin ? `Sitemap: ${origin}/sitemap.xml` : "",
    "",
  ].join("\n");
  HttpLib.send(req, res, 200, { ...HttpLib.securityHeaders(false), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body);
}

function handleSitemap(req, res) {
  const origin = siteOrigin(req);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [...SITEMAP_PAGES, "/iller", ...[...ilData().keys()].map((s) => `/${s}`)].map((p) => `  <url><loc>${origin}${p}</loc><lastmod>${today}</lastmod><changefreq>${p === "/" ? "daily" : "hourly"}</changefreq></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  HttpLib.send(req, res, 200, { ...HttpLib.securityHeaders(false), "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body);
}

// ---------- il sayfalari (/izmir gibi) ----------
// Google'da "Izmir hava durumu", "Izmir deprem" gibi aramalar icin her ilin kendi adresi olur.
// Sayfa sunucuda doldurulur (baslik, aciklama, guncel ozet, ilceler); harita ve listeler tarayicida yuklenir.
const IL_TEMPLATE = path.join(__dirname, "lib", "templates", "il.html");
const trSlug = (s) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
  .replace(/ö/g, "o").replace(/ç/g, "c").replace(/â/g, "a").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let IL_DATA = null;
function ilData() {
  if (IL_DATA) return IL_DATA;
  const places = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "iller.json"), "utf8"));
  const geo = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "tr-iller.geojson"), "utf8"));
  const shapes = new Map(geo.features.map((f) => [f.properties.n, f.geometry]));
  IL_DATA = new Map(trCityList().map((c) => {
    const p = places.find((x) => x.n === c.name);
    return [trSlug(c.name), { name: c.name, lat: c.lat, lon: c.lon, districts: p ? p.d : [], shape: shapes.get(c.name) }];
  }));
  return IL_DATA;
}
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inShape(lon, lat, g) {
  if (!g || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
}
// "Izmir'de", "Ankara'da", "Mus'ta": son unluye ve son harfe gore bulunma eki
function trLocative(name) {
  const vowels = name.toLocaleLowerCase("tr").match(/[aeıioöuü]/g) || ["e"];
  const front = "eiöü".includes(vowels[vowels.length - 1]);
  const hard = "fstkçşhp".includes(name.slice(-1).toLocaleLowerCase("tr"));
  return `${name}'${hard ? "t" : "d"}${front ? "e" : "a"}`;
}

async function handleIlPage(req, res, slug) {
  const il = ilData().get(slug);
  if (!il) return serveStatic(req, res, "/" + slug);
  const [wx, quakes, fires] = await Promise.all([
    getCityWeather().catch(() => null),
    getLatestQuakes(150).catch(() => null),
    getFires("VIIRS_SNPP_NRT", 1).catch(() => null),
  ]);
  const loc = trLocative(il.name);
  const w = wx && wx.ok ? wx.data.find((x) => x.name === il.name) : null;
  const dayAgo = Date.now() - 864e5;
  const qs = quakes && quakes.ok
    ? quakes.data.filter((q) => (q.province === il.name || inShape(q.lon, q.lat, il.shape)) && Date.parse(String(q.date).replace(" ", "T") + "+03:00") > dayAgo)
    : null;
  const fireN = fires && fires.ok ? fires.data.filter((f) => inShape(f.lon, f.lat, il.shape)).length : null;

  const parts = [];
  if (w) parts.push(`${loc} şu an hava ${Math.round(w.temp)}°C ve ${(Push.WMO_TR[w.code] || "değişken").toLocaleLowerCase("tr")}; nem %${Math.round(w.humidity)}, rüzgâr ${Math.round(w.wind)} km/s.`);
  if (qs) {
    const max = qs.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
    parts.push(qs.length ? `Son 24 saatte ${il.name} ve çevresinde ${qs.length} deprem kaydedildi; en büyüğü ${max.magType || "M"} ${max.mag.toFixed(1)} (${max.title}).` : `Son 24 saatte ${il.name} ve çevresinde deprem kaydedilmedi.`);
  }
  if (fireN != null) parts.push(fireN ? `NASA uyduları son 24 saatte il sınırları içinde ${fireN} ısı noktası tespit etti.` : `NASA uyduları son 24 saatte il sınırları içinde ısı noktası tespit etmedi.`);

  const enc = encodeURIComponent;
  const nearby = [...ilData()].filter(([s]) => s !== slug)
    .map(([s, x]) => [s, x.name, Push.haversineKm(il.lat, il.lon, x.lat, x.lon)])
    .sort((a, b) => a[2] - b[2]).slice(0, 8)
    .map(([s, n]) => `<a href="/${s}">${escHtml(n)}</a>`).join("");
  const districts = [...il.districts].sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([d, lat, lon]) => `<a href="/hava.html?yer=${enc(d)}&amp;bolge=${enc(il.name)}&amp;lat=${lat}&amp;lon=${lon}">${escHtml(d)}</a>`).join("");
  const fill = {
    TITLE: `${il.name} Hava Durumu, Son Depremler ve Yangınlar | TürkiyeCanlı`,
    DESC: `${il.name} için anlık hava durumu ve 16 günlük tahmin, ${il.name} ve çevresindeki son depremler (AFAD), aktif fay hatları ve uydudan orman yangını tespitleri. Ücretsiz, reklamsız.`,
    IL: il.name, SLUG: slug, LAT: il.lat, LON: il.lon,
    TEMP: w ? `${Math.round(w.temp)}°` : "—",
    SUMMARY: parts.join(" "),
    WX_LINK: `/hava.html?yer=${enc(il.name)}&lat=${il.lat}&lon=${il.lon}`,
    DISTRICT_COUNT: il.districts.length,
  };
  let html = fs.readFileSync(IL_TEMPLATE, "utf8");
  for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(escHtml(v));
  html = html.split("{{DISTRICTS}}").join(districts).split("{{NEARBY}}").join(nearby);
  HttpLib.send(req, res, 200, {
    ...HttpLib.securityHeaders(true),
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=120",
  }, fillPlaceholders(html, req));
}

// tum iller: anlik sicaklikla alfabetik liste (il sayfalarina giris kapisi)
async function handleIllerPage(req, res) {
  const wx = await getCityWeather().catch(() => null);
  const byName = new Map(wx && wx.ok ? wx.data.map((x) => [x.name, x]) : []);
  const list = [...ilData()].sort((a, b) => a[1].name.localeCompare(b[1].name, "tr")).map(([s, x]) => {
    const w = byName.get(x.name);
    return `<a class="iller-item" href="/${s}"><b>${escHtml(x.name)}</b><span>${w ? `${Math.round(w.temp)}° · ${escHtml(Push.WMO_TR[w.code] || "")}` : ""}</span></a>`;
  }).join("");
  const html = fs.readFileSync(path.join(__dirname, "lib", "templates", "iller.html"), "utf8").split("{{LIST}}").join(list);
  HttpLib.send(req, res, 200, {
    ...HttpLib.securityHeaders(true),
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  }, fillPlaceholders(html, req));
}

// ---------- statik dosya sunumu ----------
function staticCacheControl(ext, filePath) {
  if (ext === ".html" || filePath.endsWith("sw.js")) return "no-cache";
  if (/[\\/](fonts|img)[\\/]/.test(filePath)) return "public, max-age=2592000"; // 30 gun
  return "public, max-age=300";
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // bozuk yuzde kodlamasi (orn. /%E0%A4%A): sunucuyu cokertmesin, 400 donsun
    return HttpLib.send(req, res, 400, { ...HttpLib.securityHeaders(false), "Content-Type": "text/plain; charset=utf-8" }, "Geçersiz adres.");
  }
  let filePath = path.join(PUBLIC_DIR, decoded);
  if (pathname === "/") filePath = path.join(PUBLIC_DIR, "index.html");

  // dizin gezintisini engelle
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    return HttpLib.send(req, res, 403, { ...HttpLib.securityHeaders(false), "Content-Type": "text/plain; charset=utf-8" }, "Erişim engellendi.");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // .html uzantisiz temiz URL destegi (orn. /hava -> /hava.html)
      const withHtml = filePath + ".html";
      fs.stat(withHtml, (err2, stat2) => {
        if (!err2 && stat2.isFile()) return sendFile(req, res, withHtml);
        // stilli 404 sayfasi (yoksa duz metne dus)
        fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err3, buf) => {
          HttpLib.send(req, res, 404, {
            ...HttpLib.securityHeaders(true),
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          }, err3 ? "<h1>404</h1><p>Sayfa bulunamadı.</p>" : buf);
        });
      });
      return;
    }
    sendFile(req, res, filePath);
  });
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      return HttpLib.send(req, res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Dosya okunamadı.");
    }
    // HTML'deki {{ORIGIN}} yer tutucusunu sitenin tam adresiyle doldur (og:image vb. mutlak adres ister)
    const body = ext === ".html" ? fillPlaceholders(buf.toString("utf8"), req) : buf;
    HttpLib.send(req, res, 200, {
      ...HttpLib.securityHeaders(ext === ".html"),
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": staticCacheControl(ext, filePath),
    }, body);
  });
}

// SITE_URL tanimliysa sayfa istekleri tek adrese toplanir: www.alanadi ve *.amplifyapp.com
// -> https://alanadi (301). API ve statik dosyalar etkilenmez; yerelde devre disi.
function canonicalRedirect(req, res, pathname, search) {
  if (!process.env.SITE_URL || (req.method !== "GET" && req.method !== "HEAD")) return false;
  if (pathname.startsWith("/api/")) return false;
  let target;
  try { target = new URL(process.env.SITE_URL); } catch { return false; }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  if (!host || host === target.host || /^(localhost|127\.)/.test(host)) return false;
  const location = `${target.origin}${pathname}${search}`;
  HttpLib.send(req, res, 301, { ...HttpLib.securityHeaders(false), Location: location, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }, `Taşındı: ${location}`);
  return true;
}

// CSRF icin ek savunma (cerezler zaten SameSite=Lax): degisiklik yapan API istekleri
// tarayicidan geliyorsa Origin bu sitenin kendisi olmali. Origin'siz istekler (EventBridge,
// curl) gecer; onlarin korumasi gizli anahtar/oturum kontrolundedir.
function sameOriginWrite(req, pathname) {
  if (!pathname.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  let originHost;
  try { originHost = new URL(origin).host; } catch { return false; }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (originHost === host) return true;
  if (process.env.SITE_URL) { try { return originHost === new URL(process.env.SITE_URL).host; } catch {} }
  return false;
}

function route(req, res) {
  const parsed = new URL(req.url, "http://localhost");
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);
  const method = req.method;
  if (canonicalRedirect(req, res, pathname, parsed.search)) return;
  if (!sameOriginWrite(req, pathname)) {
    return sendJson(res, 403, { ok: false, reason: "cross_origin", message: "Bu istek başka bir siteden geldiği için reddedildi." });
  }

  if (pathname === "/api/quakes") return handleQuakes(req, res, query);
  if (pathname === "/api/quakes/history") return handleQuakeHistory(req, res, query);
  if (pathname === "/api/fires") return handleFires(req, res, query);
  if (pathname === "/api/weather/cities" && method === "GET") return handleWeatherCities(req, res);
  if (pathname === "/api/weather/models" && method === "GET") return handleWeatherModels(req, res);

  if (pathname === "/api/admin/login" && method === "POST") return handleAdminLogin(req, res);
  if (pathname === "/api/admin/logout" && method === "POST") return handleAdminLogout(req, res);
  if (pathname === "/api/admin/session" && method === "GET") return handleAdminSession(req, res);
  if (pathname === "/api/admin/stats" && method === "GET") return handleAdminStats(req, res);
  if (pathname === "/api/admin/health" && method === "GET") return handleAdminHealth(req, res);
  if (pathname === "/api/hit" && method === "POST") return handleHit(req, res);

  if (pathname === "/api/status" && method === "GET") return handleStatus(req, res);
  if (pathname === "/api/push/key" && method === "GET") return handlePushKey(req, res);
  if (pathname === "/api/push/subscribe" && method === "POST") return handlePushSubscribe(req, res);
  if (pathname === "/api/push/unsubscribe" && method === "POST") return handlePushUnsubscribe(req, res);
  if (pathname === "/api/push/resubscribe" && method === "POST") return handlePushResubscribe(req, res);
  if (pathname === "/api/push/test" && method === "POST") return handlePushTest(req, res);
  if (pathname === "/api/push/run" && method === "POST") return handlePushRun(req, res);

  // kullanici hesaplari kaldirildi: eski giris/sifre sayfasi baglantilari ana sayfaya gider
  if ((pathname === "/login.html" || pathname === "/sifre-sifirla.html") && (method === "GET" || method === "HEAD")) {
    return HttpLib.send(req, res, 301, { ...HttpLib.securityHeaders(false), Location: "/", "Cache-Control": "public, max-age=86400" }, "");
  }
  if (pathname === "/robots.txt" && (method === "GET" || method === "HEAD")) return handleRobots(req, res);
  if (pathname === "/sitemap.xml" && (method === "GET" || method === "HEAD")) return handleSitemap(req, res);

  if (pathname.startsWith("/api/")) {
    return sendJson(res, 404, { ok: false, reason: "not_found", message: "Böyle bir uç nokta yok." });
  }
  if (method !== "GET" && method !== "HEAD") {
    return HttpLib.send(req, res, 405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" }, "Bu yöntem desteklenmiyor.");
  }
  if (pathname === "/iller") return handleIllerPage(req, res);
  const ilMatch = /^\/([a-z-]{3,20})$/.exec(pathname);
  if (ilMatch && ilData().has(ilMatch[1])) return handleIlPage(req, res, ilMatch[1]);
  return serveStatic(req, res, pathname);
}

// Tek bir istekteki beklenmeyen hata tum sunucuyu dusurmesin: yakala, 500 don.
function handleError(res, err) {
  console.error("[sunucu] beklenmeyen hata:", err && err.stack ? err.stack : err);
  if (res.headersSent) return res.destroy();
  try {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Beklenmeyen bir hata oluştu." });
  } catch {
    res.destroy();
  }
}

const server = http.createServer((req, res) => {
  try {
    Promise.resolve(route(req, res)).catch((err) => handleError(res, err));
  } catch (err) {
    handleError(res, err);
  }
});

// Render'in onerdigi gibi acikca 0.0.0.0'a bagla (host belirtilmeden birakmak
// bazi konteyner ortamlarinda yalnizca IPv6'ya baglanip Render'in health check'inin
// servise ulasamamasina yol acabiliyor). Keep-alive/headers timeout'lari da
// Render'in onerdigi degerlere yukselttik (ara sira "Connection reset" hatalarina karsi).
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Turkiye Canli Takip sunucusu calisiyor:`);
  console.log(`  -> http://localhost:${PORT}\n`);
  if (!CONFIG.FIRMS_MAP_KEY || CONFIG.FIRMS_MAP_KEY === "BURAYA_KENDI_ANAHTARINI_YAZ") {
    console.log("  [bilgi] Yangin verisi icin config.json dosyasina NASA FIRMS anahtari ekleyin.");
    console.log("          Ucretsiz anahtar: https://firms.modaps.eosdis.nasa.gov/api/map_key/\n");
  }
  if (!adminCredentialsConfigured()) {
    console.log("  [bilgi] ADMIN_EMAIL / ADMIN_PASSWORD tanimli degil: /admin.html girisi calismayacak.\n");
  }
  if (!process.env.DATABASE_URL) {
    console.log("  [bilgi] DATABASE_URL tanimli degil: kullanici kayit/giris calismayacak.");
    console.log("          Bir PostgreSQL baglantisi ekleyip DATABASE_URL ortam degiskenini tanimlayin.\n");
  } else {
    ensureSchema().then((ok) => {
      console.log(ok ? "  [bilgi] Veritabani semasi hazir.\n" : "  [uyari] Veritabanina baglanilamadi.\n");
    });
  }
});
