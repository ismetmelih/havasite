// Basit, bagimliliksiz Node.js sunucusu.
// - /public altindaki dosyalari statik olarak sunar
// - /api/quakes  -> Kandilli (canli deprem) verisini proxy'ler
// - /api/fires   -> NASA FIRMS (canli yangin/aktif ates tespiti) verisini proxy'ler
// Node >= 18 gereklidir (global fetch kullanilir).

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { getPool, ensureSchema } = require("./lib/db");
const AuthLib = require("./lib/auth");

const PUBLIC_DIR = path.join(__dirname, "public");
let CONFIG = { FIRMS_MAP_KEY: "", PORT: 3000 };

function loadConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "config.json"), "utf8");
    CONFIG = { ...CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("[uyari] config.json okunamadi, varsayilanlar kullaniliyor:", err.message);
  }
  // Ortam degiskenleri (ornegin Render.com'daki Environment Variables) config.json'u ezer.
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
// Kaynak: EMSC (Avrupa-Akdeniz Sismoloji Merkezi) seismicportal servisi, Turkiye
// bounding box'i ile filtrelenmis. Onceki kaynagimiz (api.orhanaydogdu.com.tr'nin
// Kandilli proxy'si) barindirma saglayicilarinin sunucu IP araliklarini engelliyor
// gibi gorundugu icin EMSC'ye gecildi; EMSC verileri buyuk olcude AFAD'dan besleniyor.
const TURKEY_BBOX_QUAKE = { minlat: 35.5, maxlat: 42.5, minlon: 25.5, maxlon: 45 };

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

function emscBboxQuery(extra) {
  const { minlat, maxlat, minlon, maxlon } = TURKEY_BBOX_QUAKE;
  return `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlatitude=${minlat}&maxlatitude=${maxlat}&minlongitude=${minlon}&maxlongitude=${maxlon}&orderby=time${extra}`;
}

async function handleQuakes(req, res, query) {
  const limit = Math.min(parseInt(query.limit, 10) || 150, 500);
  const cacheKey = `quakes:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  try {
    const upstream = emscBboxQuery(`&limit=${limit}`);
    const r = await fetchWithTimeout(upstream);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    const result = (data.features || [])
      .map(normalizeEmscQuake)
      .filter((q) => q.lat !== null && q.lon !== null && q.date && Number.isFinite(q.mag));

    const payload = { ok: true, updated: new Date().toISOString(), count: result.length, data: result };
    setCache(cacheKey, payload, 25000); // 25 sn
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 200, { ok: false, reason: "fetch_failed", detail: String(err.message || err), data: [] });
  }
}

// ---------- /api/quakes/history ----------
// Son N gunu tek bir EMSC tarih-araligi sorgusuyla ceker (zaman tuneli / 3D glob icin).
async function handleQuakeHistory(req, res, query) {
  const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 30);
  const cacheKey = `quake-history:${days}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);

  try {
    const upstream = emscBboxQuery(`&limit=1000&starttime=${start}`);
    const r = await fetchWithTimeout(upstream, {}, 20000);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    const result = (data.features || [])
      .map(normalizeEmscQuake)
      .filter((q) => q.lat !== null && q.lon !== null && q.date && Number.isFinite(q.mag))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const payload = { ok: true, updated: new Date().toISOString(), days, count: result.length, data: result };
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
  return { id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin, createdAt: u.created_at };
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
      message: "DATABASE_URL tanimli degil veya veritabanina baglanilamadi. Render panelinde bir PostgreSQL ekleyip DATABASE_URL ortam degiskenini tanimla.",
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
    return r.rows[0] || null;
  } catch {
    return null;
  }
}

async function handleRegister(req, res) {
  if (!(await requireDb(res))) return;
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Gecersiz istek govdesi." });
  }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name.length < 2) return sendJson(res, 400, { ok: false, reason: "invalid_name", message: "Ad en az 2 karakter olmali." });
  if (!isValidEmail(email)) return sendJson(res, 400, { ok: false, reason: "invalid_email", message: "Gecerli bir e-posta gir." });
  if (password.length < 6) return sendJson(res, 400, { ok: false, reason: "invalid_password", message: "Sifre en az 6 karakter olmali." });

  const pool = getPool();
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      return sendJson(res, 409, { ok: false, reason: "email_taken", message: "Bu e-posta zaten kayitli." });
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
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Kayit sirasinda bir hata olustu." });
  }
}

async function handleLogin(req, res) {
  if (!(await requireDb(res))) return;
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Gecersiz istek govdesi." });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const pool = getPool();
  try {
    const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = r.rows[0];
    if (!user || !AuthLib.verifyPassword(password, user.password_hash)) {
      return sendJson(res, 401, { ok: false, reason: "invalid_credentials", message: "Hatali e-posta veya sifre." });
    }
    res.setHeader("Set-Cookie", AuthLib.createSessionCookie(req, user));
    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (err) {
    console.error("[auth] giris hatasi:", err.message);
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Giris sirasinda bir hata olustu." });
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
  if (!user) return sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Giris yapmalisin." });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Gecersiz istek govdesi." });
  }
  const name = String(body.name || "").trim();
  if (name.length < 2) return sendJson(res, 400, { ok: false, reason: "invalid_name", message: "Ad en az 2 karakter olmali." });
  try {
    const r = await getPool().query("UPDATE users SET name = $1 WHERE id = $2 RETURNING *", [name, user.id]);
    sendJson(res, 200, { ok: true, user: publicUser(r.rows[0]) });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Guncelleme basarisiz." });
  }
}

// ---------- admin ----------
// Admin, normal kullanici hesaplarindan tamamen bagimsizdir: musteri kayit/giris
// sistemiyle hicbir iliskisi yoktur. Site sahibi Render panelinde (veya yerelde)
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
    return sendJson(res, 400, { ok: false, reason: "bad_request", message: "Gecersiz istek govdesi." });
  }
  if (!adminCredentialsConfigured()) {
    return sendJson(res, 200, {
      ok: false,
      reason: "not_configured",
      message: "Sunucuda ADMIN_EMAIL / ADMIN_PASSWORD ortam degiskenleri tanimli degil. Render panelinden ekleyin.",
    });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const expectedEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

  const emailOk = AuthLib.timingSafeEqualStr(email, expectedEmail);
  const passwordOk = AuthLib.timingSafeEqualStr(password, process.env.ADMIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    return sendJson(res, 401, { ok: false, reason: "invalid_credentials", message: "Hatali admin e-postasi veya sifresi." });
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
    sendJson(res, 401, { ok: false, reason: "unauthorized", message: "Admin girisi yapmalisin." });
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
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Istatistikler alinamadi." });
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
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Kullanicilar alinamadi." });
  }
}

async function handleAdminUserDelete(req, res, id) {
  if (!(await requireAdmin(req, res))) return;
  if (!(await requireDb(res))) return;
  try {
    const r = await getPool().query("DELETE FROM users WHERE id = $1", [id]);
    if (!r.rowCount) return sendJson(res, 404, { ok: false, reason: "not_found", message: "Kullanici bulunamadi." });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, reason: "server_error", message: "Silme basarisiz." });
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
  const method = req.method;

  if (pathname === "/api/quakes") return handleQuakes(req, res, parsed.query);
  if (pathname === "/api/quakes/history") return handleQuakeHistory(req, res, parsed.query);
  if (pathname === "/api/fires") return handleFires(req, res, parsed.query);
  if (pathname === "/api/reload-config") {
    loadConfig();
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/register" && method === "POST") return handleRegister(req, res);
  if (pathname === "/api/auth/login" && method === "POST") return handleLogin(req, res);
  if (pathname === "/api/auth/logout" && method === "POST") return handleLogout(req, res);
  if (pathname === "/api/auth/me" && method === "GET") return handleMe(req, res);
  if (pathname === "/api/auth/me" && method === "PATCH") return handleUpdateMe(req, res);

  if (pathname === "/api/admin/login" && method === "POST") return handleAdminLogin(req, res);
  if (pathname === "/api/admin/logout" && method === "POST") return handleAdminLogout(req, res);
  if (pathname === "/api/admin/session" && method === "GET") return handleAdminSession(req, res);
  if (pathname === "/api/admin/stats" && method === "GET") return handleAdminStats(req, res);
  if (pathname === "/api/admin/users" && method === "GET") return handleAdminUsersList(req, res);
  const userMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && method === "DELETE") return handleAdminUserDelete(req, res, userMatch[1]);

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
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
