// Basit, bagimliliksiz Node.js sunucusu.
// - /public altindaki dosyalari statik olarak sunar (guvenlik basliklari + sikistirma ile)
// - /api/quakes  -> AFAD (yedek: EMSC) canli deprem verisini proxy'ler
// - /api/fires   -> NASA FIRMS (canli yangin/aktif ates tespiti) verisini proxy'ler
// - /api/auth/*, /api/admin/* -> hesap ve yonetim uc noktalari (hiz sinirli)
// Node >= 18 gereklidir (global fetch kullanilir).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { getPool, ensureSchema } = require("./lib/db");
const AuthLib = require("./lib/auth");
const HttpLib = require("./lib/http");
const Mail = require("./lib/mail");
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
  loginIp: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  loginEmail: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 }),
  register: HttpLib.createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
  admin: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
  password: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 6 }),
  forgotIp: HttpLib.createRateLimiter({ windowMs: 60 * 60 * 1000, max: 6 }),
  forgotEmail: HttpLib.createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }),
  reset: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  pushSub: HttpLib.createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
  pushTest: HttpLib.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
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
// Kaynak sirasi: (1) AFAD'in last-earthquakes.html sayfasina gomulu, gercekten
// canli tablo (kendi resmi sitelerinde gosterdikleri veriyle birebir ayni,
// Turkiye yerel saatiyle) (2) AFAD'in filter API'si (daha genis tarih araligi
// sorgulanabilir ama UTC dondurur ve bizim ilk testimizde birkac saat "eski"
// gorunmustu — asagida UTC->Turkiye saatine dogru cevriliyor) (3) EMSC (Avrupa-
// Akdeniz Sismoloji Merkezi). Onceki kaynagimiz olan api.orhanaydogdu.com.tr'nin
// Kandilli proxy'si, barindirma saglayicilarinin sunucu IP araliklarini
// engelliyor gibi gorundugu icin birakildi.
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
    depth: parseFloat(item.depth),
    date: dateStr,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    closestCity: item.province || null,
    epiCenter: item.location || null,
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

// Son depremler (AFAD canli tablo -> AFAD API -> EMSC sirasiyla); 25 sn onbellekli.
// Hem /api/quakes hem de deprem bildirimleri (/api/push/run) kullanir.
async function getLatestQuakes(limit) {
  const cacheKey = `quakes:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let result;
  let source;
  try {
    // (1) en guncel ~100 olay: AFAD'in kendi canli sayfasiyla birebir ayni
    result = (await fetchAfadLiveTable())
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
    source = "afad-live";
  } catch (err) {
    try {
      // (2) yedek: AFAD filter API (daha genis pencere, dakika hassasiyeti biraz dusuk olabilir)
      const end = new Date();
      const start = new Date(end.getTime() - 5 * 86400000);
      result = (await fetchAfadQuakes(start, end, 1000))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
      source = "afad-api";
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
      message: "Yangın verisi için NASA FIRMS anahtarı tanımlı değil. Ücretsiz anahtar: https://firms.modaps.eosdis.nasa.gov/api/map_key/",
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
    console.error("[yangin] alinamadi:", String(err.message || err).slice(0, 300));
    sendJson(res, 200, { ok: false, reason: "fetch_failed", data: [] });
  }
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

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin, createdAt: u.created_at, prefs: u.prefs || {} };
}

function isValidEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
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

async function currentUser(req) {
  const session = AuthLib.readSession(req);
  if (!session) return null;
  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [session.uid]);
    const user = r.rows[0] || null;
    // sifre degistirildiyse/sifirlandiysa eski oturumlar gecersiz
    if (user && (session.tv || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

async function handleRegister(req, res) {
  if (!checkLimit(res, limiters.register, HttpLib.clientIp(req))) return;
  if (!(await requireDb(res))) return;
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." });
  }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name.length < 2) return sendJson(res, 400, { ok: false, reason: "invalid_name", message: "Ad en az 2 karakter olmalı." });
  if (!isValidEmail(email)) return sendJson(res, 400, { ok: false, reason: "invalid_email", message: "Geçerli bir e-posta adresi gir." });
  if (password.length < 8) return sendJson(res, 400, { ok: false, reason: "invalid_password", message: "Şifre en az 8 karakter olmalı." });

  const pool = getPool();
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      return sendJson(res, 409, { ok: false, reason: "email_taken", message: "Bu e-posta adresiyle zaten bir hesap var." });
    }

    // Not: site yoneticisi (admin) burada olusmaz; admin ayri, ADMIN_EMAIL/ADMIN_PASSWORD
    // ortam degiskenleriyle dogrulanan, tamamen bagimsiz bir girisdir (bkz. handleAdminLogin).
    const passwordHash = AuthLib.hashPassword(password);
    const inserted = await pool.query(
      "INSERT INTO users (name, email, password_hash, is_admin) VALUES ($1,$2,$3,FALSE) RETURNING *",
      [name, email, passwordHash]
    );
    const user = inserted.rows[0];
    res.setHeader("Set-Cookie", AuthLib.createSessionCookie(req, user));
    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (err) {
    console.error("[auth] kayit hatasi:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Kayıt sırasında bir hata oluştu. Lütfen tekrar dene." });
  }
}

const DUMMY_HASH = AuthLib.hashPassword(require("crypto").randomBytes(16).toString("hex"));

async function handleLogin(req, res) {
  if (!(await requireDb(res))) return;
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!checkLimit(res, limiters.loginIp, HttpLib.clientIp(req))) return;
  if (!checkLimit(res, limiters.loginEmail, email)) return;

  const pool = getPool();
  try {
    const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = r.rows[0];
    // kullanici yoksa da ayni maliyette dogrulama: yanit suresi e-postanin kayitli olup olmadigini ele vermesin
    const passwordOk = AuthLib.verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !passwordOk) {
      return sendJson(res, 401, { ok: false, reason: "invalid_credentials", message: "E-posta veya şifre hatalı." });
    }
    limiters.loginEmail.reset(email);
    res.setHeader("Set-Cookie", AuthLib.createSessionCookie(req, user, { remember: body.remember !== false }));
    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (err) {
    console.error("[auth] giris hatasi:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Giriş sırasında bir hata oluştu. Lütfen tekrar dene." });
  }
}

function handleLogout(req, res) {
  res.setHeader("Set-Cookie", AuthLib.clearSessionCookie(req));
  sendJson(res, 200, { ok: true });
}

async function handleMe(req, res) {
  const pool = getPool();
  if (!pool) return sendJson(res, 200, { ok: true, user: null });
  const user = await currentUser(req);
  sendJson(res, 200, { ok: true, user: user ? publicUser(user) : null });
}

async function handleUpdateMe(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Bu işlem için giriş yapmalısın." });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." });
  }
  const name = String(body.name || "").trim();
  if (name.length < 2) return sendJson(res, 400, { ok: false, reason: "invalid_name", message: "Ad en az 2 karakter olmalı." });
  try {
    const r = await getPool().query("UPDATE users SET name = $1 WHERE id = $2 RETURNING *", [name, user.id]);
    sendJson(res, 200, { ok: true, user: publicUser(r.rows[0]) });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Güncelleme yapılamadı. Lütfen tekrar dene." });
  }
}

// ---------- hesap: sifre, silme, tercihler, sifre sifirlama ----------
async function handleChangePassword(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Bu işlem için giriş yapmalısın." });
  if (!checkLimit(res, limiters.password, `u${user.id}`)) return;
  let body;
  try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const current = String(body.currentPassword || "");
  const next = String(body.newPassword || "");
  if (!AuthLib.verifyPassword(current, user.password_hash)) {
    return sendJson(res, 400, { ok: false, reason: "wrong_password", message: "Mevcut şifre hatalı." });
  }
  if (next.length < 8) return sendJson(res, 400, { ok: false, reason: "invalid_password", message: "Yeni şifre en az 8 karakter olmalı." });
  if (next === current) return sendJson(res, 400, { ok: false, reason: "same_password", message: "Yeni şifre eskisiyle aynı olamaz." });
  try {
    const r = await getPool().query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *",
      [AuthLib.hashPassword(next), user.id]
    );
    // bu cihazda oturum acik kalsin, digerleri kapansin
    res.setHeader("Set-Cookie", AuthLib.createSessionCookie(req, r.rows[0]));
    sendJson(res, 200, { ok: true, message: "Şifren güncellendi. Diğer cihazlardaki oturumlar kapatıldı." });
  } catch (err) {
    console.error("[auth] sifre degistirme:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Şifre güncellenemedi. Lütfen tekrar dene." });
  }
}

async function handleDeleteMe(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Bu işlem için giriş yapmalısın." });
  if (!checkLimit(res, limiters.password, `u${user.id}`)) return;
  let body;
  try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  if (!AuthLib.verifyPassword(String(body.password || ""), user.password_hash)) {
    return sendJson(res, 400, { ok: false, reason: "wrong_password", message: "Şifre hatalı." });
  }
  try {
    await getPool().query("DELETE FROM users WHERE id = $1", [user.id]);
    res.setHeader("Set-Cookie", AuthLib.clearSessionCookie(req));
    sendJson(res, 200, { ok: true, message: "Hesabın ve tüm kişisel verilerin silindi." });
  } catch (err) {
    console.error("[auth] hesap silme:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Hesap silinemedi. Lütfen tekrar dene." });
  }
}

// tercihler: yalnizca bilinen alanlar, dogrulanmis degerlerle saklanir
function cleanPrefs(input) {
  const out = {};
  if (typeof input.favoriteCity === "string") out.favoriteCity = input.favoriteCity.trim().slice(0, 60);
  const mag = Number(input.quakeAlertMag);
  if (Number.isFinite(mag)) out.quakeAlertMag = Math.min(6, Math.max(2.5, Math.round(mag * 2) / 2));
  return out;
}

async function handleUpdatePrefs(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Bu işlem için giriş yapmalısın." });
  let body;
  try { body = await readJsonBody(req, 4 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const prefs = { ...(user.prefs || {}), ...cleanPrefs(body || {}) };
  try {
    const r = await getPool().query("UPDATE users SET prefs = $1::jsonb WHERE id = $2 RETURNING *", [JSON.stringify(prefs), user.id]);
    sendJson(res, 200, { ok: true, user: publicUser(r.rows[0]) });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Tercihler kaydedilemedi." });
  }
}

const RESET_TTL_MS = 60 * 60 * 1000; // e-postayla giden baglanti: 1 saat
const ADMIN_RESET_TTL_MS = 24 * 3600 * 1000; // yoneticinin olusturdugu baglanti: 24 saat

async function createResetLink(req, userId, ttlMs) {
  const pool = getPool();
  const { token, hash } = AuthLib.createResetToken();
  // ayni kullanicinin eski, kullanilmamis baglantilari gecersiz olsun
  await pool.query("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [userId]);
  // suresi gecmis/kullanilmis eski kayitlar birikmesin
  await pool.query("DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'");
  await pool.query(
    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + $3::int * interval '1 millisecond')",
    [userId, hash, ttlMs]
  );
  // token adres cubugunun # kisminda: sunucu kayitlarina ve Referer basligina dusmez
  return `${siteOrigin(req)}/sifre-sifirla.html#t=${token}`;
}

async function handleForgotPassword(req, res) {
  if (!(await requireDb(res))) return;
  let body;
  try { body = await readJsonBody(req, 4 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return sendJson(res, 400, { ok: false, reason: "invalid_email", message: "Geçerli bir e-posta adresi gir." });
  if (!checkLimit(res, limiters.forgotIp, HttpLib.clientIp(req))) return;
  if (!checkLimit(res, limiters.forgotEmail, email)) return;

  const mailOn = Mail.mailConfigured();
  if (mailOn) {
    try {
      const r = await getPool().query("SELECT id, name FROM users WHERE email = $1", [email]);
      const user = r.rows[0];
      if (user) {
        const link = await createResetLink(req, user.id, RESET_TTL_MS);
        await Mail.sendMail({
          to: email,
          subject: "TürkiyeCanlı — şifre sıfırlama",
          text: `Merhaba ${user.name},\n\nŞifreni sıfırlamak için bu bağlantıyı aç (1 saat geçerli):\n${link}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
          html: `<p>Merhaba ${user.name.replace(/[<>&"]/g, "")},</p><p>Şifreni sıfırlamak için aşağıdaki bağlantıyı aç (1 saat geçerli):</p><p><a href="${link}">Şifremi sıfırla</a></p><p>Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>`,
        });
      }
    } catch (err) {
      console.error("[auth] sifre sifirlama istegi:", err.message);
    }
  }
  // Hesabin var olup olmadigi disari sizmasin: her durumda ayni yanit
  sendJson(res, 200, {
    ok: true,
    mailEnabled: mailOn,
    message: mailOn
      ? "Bu e-postayla kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et."
      : "E-posta ile sıfırlama henüz aktif değil. Site yöneticisinden şifre sıfırlama bağlantısı isteyebilirsin.",
  });
}

async function handleResetPassword(req, res) {
  if (!(await requireDb(res))) return;
  if (!checkLimit(res, limiters.reset, HttpLib.clientIp(req))) return;
  let body;
  try { body = await readJsonBody(req, 4 * 1024); } catch { return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Geçersiz istek." }); }
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (password.length < 8) return sendJson(res, 400, { ok: false, reason: "invalid_password", message: "Yeni şifre en az 8 karakter olmalı." });
  const pool = getPool();
  try {
    const r = await pool.query(
      "SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [AuthLib.hashResetToken(token)]
    );
    const row = r.rows[0];
    if (!row) {
      return sendJson(res, 400, { ok: false, reason: "invalid_token", message: "Bu bağlantı geçersiz ya da süresi dolmuş. Yeni bir sıfırlama bağlantısı iste." });
    }
    const u = await pool.query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *",
      [AuthLib.hashPassword(password), row.user_id]
    );
    await pool.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [row.id]);
    await pool.query("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [row.user_id]);
    if (!u.rows[0]) return sendJson(res, 400, { ok: false, reason: "invalid_token", message: "Hesap bulunamadı." });
    res.setHeader("Set-Cookie", AuthLib.createSessionCookie(req, u.rows[0]));
    sendJson(res, 200, { ok: true, message: "Şifren güncellendi, giriş yapıldı." });
  } catch (err) {
    console.error("[auth] sifre sifirlama:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Şifre sıfırlanamadı. Lütfen tekrar dene." });
  }
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
  // konum gizlilik icin ~1 km'ye yuvarlanir; yaricap yalnizca konum varsa anlamli
  const hasLoc = Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lon));
  const lat = hasLoc ? Math.round(Number(body.lat) * 100) / 100 : null;
  const lon = hasLoc ? Math.round(Number(body.lon) * 100) / 100 : null;
  const radius = hasLoc && [50, 100, 250, 500].includes(Number(body.radiusKm)) ? Number(body.radiusKm) : null;
  const user = await currentUser(req);
  try {
    await getPool().query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, min_mag, lat, lon, radius_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id), min_mag = EXCLUDED.min_mag,
         lat = EXCLUDED.lat, lon = EXCLUDED.lon, radius_km = EXCLUDED.radius_km`,
      [sub.endpoint, sub.p256dh, sub.auth, user ? user.id : null, minMag, lat, lon, radius]
    );
    sendJson(res, 200, { ok: true, minMag, radiusKm: radius });
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
  const latest = await getLatestQuakes(150);
  if (!latest.ok) return sendJson(res, 200, { ok: false, reason: "quakes_unavailable" });
  try {
    const result = await Push.runQuakePush(getPool(), latest.data);
    if (result.sent || result.removed || result.failed) console.log("[push] calisma:", JSON.stringify(result));
    sendJson(res, 200, result);
  } catch (err) {
    console.error("[push] calisma hatasi:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error" });
  }
}

// ---------- admin ----------
// Admin, normal kullanici hesaplarindan tamamen bagimsizdir: musteri kayit/giris
// sistemiyle hicbir iliskisi yoktur. Site sahibi AWS Amplify'da (veya yerelde .env icinde)
// ADMIN_EMAIL ve ADMIN_PASSWORD ortam degiskenlerini tanimlar; admin.html'deki
// giris formu bu bilgilerle dogrulanir ve ayri, kisa omurlu bir oturum cerezi alir.
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
  try {
    const pool = getPool();
    const totalRes = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    const todayRes = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE created_at::date = now()::date");
    sendJson(res, 200, {
      ok: true,
      stats: {
        totalUsers: totalRes.rows[0].n,
        registeredToday: todayRes.rows[0].n,
        firmsKeyConfigured: !!(CONFIG.FIRMS_MAP_KEY && CONFIG.FIRMS_MAP_KEY !== "BURAYA_KENDI_ANAHTARINI_YAZ"),
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "İstatistikler alınamadı." });
  }
}

async function handleAdminUsersList(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (!(await requireDb(res))) return;
  try {
    const pool = getPool();
    const r = await pool.query("SELECT * FROM users ORDER BY created_at DESC");
    sendJson(res, 200, { ok: true, users: r.rows.map(publicUser) });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Kullanıcılar alınamadı." });
  }
}

async function handleAdminResetLink(req, res, id) {
  if (!(await requireAdmin(req, res))) return;
  if (!(await requireDb(res))) return;
  try {
    const r = await getPool().query("SELECT id FROM users WHERE id = $1", [id]);
    if (!r.rows[0]) return sendJson(res, 404, { ok: false, reason: "not_found", message: "Kullanıcı bulunamadı." });
    const link = await createResetLink(req, r.rows[0].id, ADMIN_RESET_TTL_MS);
    sendJson(res, 200, { ok: true, link, expiresInHours: 24 });
  } catch (err) {
    console.error("[admin] sifirlama baglantisi:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Bağlantı oluşturulamadı." });
  }
}

async function handleAdminUserDelete(req, res, id) {
  if (!(await requireAdmin(req, res))) return;
  if (!(await requireDb(res))) return;
  try {
    const r = await getPool().query("DELETE FROM users WHERE id = $1", [id]);
    if (!r.rowCount) return sendJson(res, 404, { ok: false, reason: "not_found", message: "Kullanıcı bulunamadı." });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Silme işlemi yapılamadı." });
  }
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

const SITEMAP_PAGES = ["/", "/hava.html", "/deprem.html", "/yangin.html", "/gizlilik.html"];

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
    "Disallow: /login.html",
    origin ? `Sitemap: ${origin}/sitemap.xml` : "",
    "",
  ].join("\n");
  HttpLib.send(req, res, 200, { ...HttpLib.securityHeaders(false), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body);
}

function handleSitemap(req, res) {
  const origin = siteOrigin(req);
  const today = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_PAGES.map((p) => `  <url><loc>${origin}${p}</loc><lastmod>${today}</lastmod><changefreq>${p === "/" ? "daily" : "hourly"}</changefreq></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  HttpLib.send(req, res, 200, { ...HttpLib.securityHeaders(false), "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body);
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

  if (pathname === "/api/auth/register" && method === "POST") return handleRegister(req, res);
  if (pathname === "/api/auth/login" && method === "POST") return handleLogin(req, res);
  if (pathname === "/api/auth/logout" && method === "POST") return handleLogout(req, res);
  if (pathname === "/api/auth/me" && method === "GET") return handleMe(req, res);
  if (pathname === "/api/auth/me" && method === "PATCH") return handleUpdateMe(req, res);
  if (pathname === "/api/auth/me" && method === "DELETE") return handleDeleteMe(req, res);
  if (pathname === "/api/auth/password" && method === "POST") return handleChangePassword(req, res);
  if (pathname === "/api/auth/prefs" && method === "PUT") return handleUpdatePrefs(req, res);
  if (pathname === "/api/auth/forgot" && method === "POST") return handleForgotPassword(req, res);
  if (pathname === "/api/auth/reset" && method === "POST") return handleResetPassword(req, res);

  if (pathname === "/api/admin/login" && method === "POST") return handleAdminLogin(req, res);
  if (pathname === "/api/admin/logout" && method === "POST") return handleAdminLogout(req, res);
  if (pathname === "/api/admin/session" && method === "GET") return handleAdminSession(req, res);
  if (pathname === "/api/admin/stats" && method === "GET") return handleAdminStats(req, res);
  if (pathname === "/api/admin/users" && method === "GET") return handleAdminUsersList(req, res);
  const userMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && method === "DELETE") return handleAdminUserDelete(req, res, userMatch[1]);
  const resetMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/reset-link$/);
  if (resetMatch && method === "POST") return handleAdminResetLink(req, res, resetMatch[1]);

  if (pathname === "/api/push/key" && method === "GET") return handlePushKey(req, res);
  if (pathname === "/api/push/subscribe" && method === "POST") return handlePushSubscribe(req, res);
  if (pathname === "/api/push/unsubscribe" && method === "POST") return handlePushUnsubscribe(req, res);
  if (pathname === "/api/push/resubscribe" && method === "POST") return handlePushResubscribe(req, res);
  if (pathname === "/api/push/test" && method === "POST") return handlePushTest(req, res);
  if (pathname === "/api/push/run" && method === "POST") return handlePushRun(req, res);

  if (pathname === "/robots.txt" && (method === "GET" || method === "HEAD")) return handleRobots(req, res);
  if (pathname === "/sitemap.xml" && (method === "GET" || method === "HEAD")) return handleSitemap(req, res);

  if (pathname.startsWith("/api/")) {
    return sendJson(res, 404, { ok: false, reason: "not_found", message: "Böyle bir uç nokta yok." });
  }
  if (method !== "GET" && method !== "HEAD") {
    return HttpLib.send(req, res, 405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" }, "Bu yöntem desteklenmiyor.");
  }
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
