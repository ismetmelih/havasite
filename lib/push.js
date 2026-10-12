// Deprem bildirimleri (Web Push).
// Akis: AWS EventBridge her 2 dakikada /api/push/run'i cagirir (X-Cron-Secret basligiyla) ->
// son AFAD depremleri alinir -> daha once bildirilmemis ve yeni olanlar icin, esigi ve
// (varsa) mesafe tercihi uyan abonelere bildirim gider. Gonderilen deprem kimlikleri
// app_state tablosunda tutulur (sunucu durumsuz calistigi icin bellekte degil).
const webpush = require("web-push");

const STATE_KEY = "push_sent_quakes";
const MAX_AGE_MIN = 45; // bundan eski depremler icin bildirim gonderilmez
const MAX_PER_RUN = 3; // tek calismada en fazla bu kadar deprem bildirilir (en buyukler)
// "gonderildi mi" anahtari kaynaktan bagimsiz: Turkiye saati + yaklasik konum. AFAD'in
// farkli servisleri ayni depreme farkli kimlik numarasi veriyor (canli tablo 596xxx,
// resmi API 731xxx); kimlikle takip edilseydi kaynak degisince ayni deprem yeniden bildirilirdi.
const KEY_VERSION = 2;
const quakeKey = (q) => `${q.date}|${Number(q.lat).toFixed(1)}|${Number(q.lon).toFixed(1)}`;

function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "https://turkiyecanli.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidSet = true;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// AFAD tarihi Turkiye saatiyle "YYYY-MM-DD HH:MM:SS"
function quakeTime(q) {
  const t = Date.parse(String(q.date || "").replace(" ", "T") + "+03:00");
  return Number.isNaN(t) ? null : t;
}

async function sendOne(sub, payload, urgency) {
  ensureVapid();
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 900, urgency: urgency || "normal" }
  );
}

function quakePayload(q, distKm) {
  const place = q.title || q.closestCity || "Türkiye";
  const t = quakeTime(q);
  const hhmm = t ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(t) : "";
  const parts = [hhmm && `Saat ${hhmm}`, Number.isFinite(q.depth) ? `derinlik ${Math.round(q.depth * 10) / 10} km` : "", distKm != null ? `sana yaklaşık ${Math.round(distKm)} km` : ""].filter(Boolean);
  return {
    title: `M${q.mag.toFixed(1)} deprem — ${place}`,
    body: `${parts.join(" · ")}. Kaynak: AFAD.`,
    url: "/deprem.html",
    tag: `quake-${q.id}`,
  };
}

// quakes: en yeni depremler listesi ({id, mag, lat, lon, date, depth, title})
async function runQuakePush(pool, quakes) {
  if (!pushConfigured()) return { ok: false, reason: "not_configured" };
  const now = Date.now();
  const st = await pool.query("SELECT v FROM app_state WHERE k = $1", [STATE_KEY]);
  const prev = st.rows[0] ? st.rows[0].v : null;
  const ids = quakes.map(quakeKey);

  // ilk calisma (ya da anahtar bicimi degistiyse): mevcut depremleri "goruldu" say,
  // eski depremler icin toplu bildirim atma
  if (!prev || prev.v !== KEY_VERSION) {
    await pool.query("INSERT INTO app_state (k, v) VALUES ($1, $2::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()", [STATE_KEY, JSON.stringify({ v: KEY_VERSION, ids: ids.slice(0, 300) })]);
    return { ok: true, initialized: true, sent: 0 };
  }

  const seen = new Set(prev.ids || []);
  const fresh = quakes
    .filter((q) => !seen.has(quakeKey(q)) && Number.isFinite(q.mag) && q.lat != null && q.lon != null)
    .filter((q) => { const t = quakeTime(q); return t && now - t <= MAX_AGE_MIN * 60000; })
    .sort((a, b) => b.mag - a.mag)
    .slice(0, MAX_PER_RUN);

  let sent = 0, removed = 0, failed = 0;
  if (fresh.length) {
    const maxMag = Math.max(...fresh.map((q) => q.mag));
    const subs = (await pool.query("SELECT * FROM push_subscriptions WHERE quake_on AND min_mag <= $1", [maxMag])).rows;
    for (const q of fresh) {
      for (const sub of subs) {
        if (q.mag < sub.min_mag) continue;
        let dist = null;
        if (sub.lat != null && sub.lon != null) {
          dist = haversineKm(sub.lat, sub.lon, q.lat, q.lon);
          if (sub.radius_km && dist > sub.radius_km) continue;
        }
        try {
          await sendOne(sub, quakePayload(q, dist), q.mag >= 5 ? "high" : "normal");
          sent++;
          await pool.query("UPDATE push_subscriptions SET last_sent_at = now() WHERE id = $1", [sub.id]);
        } catch (err) {
          // 404/410: abonelik artik gecersiz (uygulama silinmis, izin kaldirilmis)
          if (err.statusCode === 404 || err.statusCode === 410) {
            await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
            removed++;
          } else {
            failed++;
            console.error("[push] gonderilemedi:", err.statusCode || "", String(err.body || err.message).slice(0, 160));
          }
        }
      }
    }
  }
  // gorulen kimlikleri guncelle (yeni gelenler + oncekiler, en fazla 300)
  const merged = [...new Set([...ids, ...(prev.ids || [])])].slice(0, 300);
  await pool.query("UPDATE app_state SET v = $2::jsonb, updated_at = now() WHERE k = $1", [STATE_KEY, JSON.stringify({ v: KEY_VERSION, ids: merged })]);
  return { ok: true, newQuakes: fresh.map((q) => `${q.id}:M${q.mag}`), sent, removed, failed };
}

// gonderim + gecersiz abonelik temizligi (hava/yangin isleri icin ortak)
async function deliver(pool, sub, payload, urgency, stats) {
  try {
    await sendOne(sub, payload, urgency);
    stats.sent++;
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
      stats.removed++;
    } else {
      stats.failed++;
      console.error("[push] gonderilemedi:", err.statusCode || "", String(err.body || err.message).slice(0, 160));
    }
    return false;
  }
}

async function getState(pool, key) {
  const r = await pool.query("SELECT v, updated_at FROM app_state WHERE k = $1", [key]);
  return r.rows[0] || null;
}
async function setState(pool, key, v) {
  await pool.query("INSERT INTO app_state (k, v) VALUES ($1, $2::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()", [key, JSON.stringify(v)]);
}

/* ---------------- HAVA: sabah ozeti + kuvvetli hava uyarilari ---------------- */
const WMO_TR = {
  0: "Açık", 1: "Az bulutlu", 2: "Parçalı bulutlu", 3: "Kapalı", 45: "Sisli", 48: "Kırağılı sis",
  51: "Hafif çisenti", 53: "Çisenti", 55: "Yoğun çisenti", 56: "Donan çisenti", 57: "Donan çisenti",
  61: "Hafif yağmurlu", 63: "Yağmurlu", 65: "Kuvvetli yağmurlu", 66: "Donan yağmur", 67: "Donan yağmur",
  71: "Hafif kar yağışlı", 73: "Kar yağışlı", 75: "Yoğun kar yağışlı", 77: "Kar taneli",
  80: "Hafif sağanaklı", 81: "Sağanaklı", 82: "Şiddetli sağanaklı", 85: "Kar sağanaklı", 86: "Yoğun kar sağanaklı",
  95: "Gök gürültülü sağanak", 96: "Dolulu fırtına", 99: "Şiddetli dolulu fırtına",
};
const TR_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function trNow() {
  const p = Object.fromEntries(TR_PARTS.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const ALERT_EVERY_MS = 30 * 60 * 1000;

// gun icin kuvvetli hava kosullari: [{type, text}]
function dayAlerts(d, i) {
  const out = [];
  const rain = d.precipitation_sum[i], gust = d.wind_gusts_10m_max[i], snow = d.snowfall_sum[i];
  const tmin = d.temperature_2m_min[i], tmax = d.temperature_2m_max[i], code = d.weather_code[i];
  if (rain >= 25) out.push({ type: "rain", text: `kuvvetli yağış (${Math.round(rain)} mm)` });
  if (snow >= 5) out.push({ type: "snow", text: `kar yağışı (${Math.round(snow)} cm)` });
  if (gust >= 65) out.push({ type: "wind", text: `fırtına, rüzgâr ${Math.round(gust)} km/s'ye kadar` });
  if (code >= 95) out.push({ type: "storm", text: "gök gürültülü sağanak" });
  if (tmin <= -3) out.push({ type: "frost", text: `don, en düşük ${Math.round(tmin)}°` });
  if (tmax >= 38) out.push({ type: "heat", text: `aşırı sıcak, ${Math.round(tmax)}°` });
  return out;
}

async function runWeatherPush(pool) {
  const stats = { sent: 0, removed: 0, failed: 0 };
  // DATE alani metin olarak okunur (JS Date'e cevrilince saat dilimi kaymasi oluyordu)
  const subs = (await pool.query("SELECT *, wx_last_daily::text AS wx_last_daily_t FROM push_subscriptions WHERE (wx_daily OR wx_alerts) AND lat IS NOT NULL AND lon IS NOT NULL")).rows;
  if (!subs.length) return { ...stats, subs: 0 };
  const now = trNow();
  const lastDaily = (s) => s.wx_last_daily_t || "";
  // sabah ozeti: secilen saatte (3 saatlik pencere, gunde bir kez)
  const daily = subs.filter((s) => s.wx_daily && now.hour >= s.wx_hour && now.hour < s.wx_hour + 3 && lastDaily(s) !== now.date);
  // uyarilar: 30 dakikada bir bakilir
  const st = await getState(pool, "wx_alert_run");
  const alertsDue = !st || Date.now() - new Date(st.updated_at).getTime() >= ALERT_EVERY_MS;
  const alerting = alertsDue ? subs.filter((s) => s.wx_alerts) : [];
  if (alertsDue) await setState(pool, "wx_alert_run", { at: Date.now() });
  const need = [...new Set([...daily, ...alerting])];
  if (!need.length) return { ...stats, subs: subs.length };

  // ayni bolgedekiler tek istekte (0.1 derece ~ 10 km)
  const keyOf = (s) => `${(Math.round(s.lat * 10) / 10).toFixed(1)},${(Math.round(s.lon * 10) / 10).toFixed(1)}`;
  const coords = [...new Set(need.map(keyOf))];
  const params = new URLSearchParams({
    latitude: coords.map((c) => c.split(",")[0]).join(","),
    longitude: coords.map((c) => c.split(",")[1]).join(","),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,snowfall_sum",
    timezone: "Europe/Istanbul", forecast_days: "2",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [j];
  const byKey = new Map(coords.map((c, i) => [c, arr[i] && arr[i].daily]));

  for (const s of need) {
    const d = byKey.get(keyOf(s));
    if (!d) continue;
    const place = s.place_name || "Konumun";
    if (daily.includes(s)) {
      const lbl = WMO_TR[d.weather_code[0]] || "—";
      const pop = d.precipitation_probability_max[0], rain = d.precipitation_sum[0], gust = d.wind_gusts_10m_max[0];
      const body = `${lbl}, ${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°.` +
        (pop != null ? ` Yağış olasılığı %${pop}${rain >= 0.5 ? ` (${Math.round(rain * 10) / 10} mm)` : ""}.` : "") +
        (gust >= 40 ? ` Rüzgâr ${Math.round(gust)} km/s'ye kadar.` : "");
      if (await deliver(pool, s, { title: `Günaydın — ${place} bugün`, body, url: "/hava.html", tag: "wx-daily" }, "normal", stats)) {
        await pool.query("UPDATE push_subscriptions SET wx_last_daily = $2 WHERE id = $1", [s.id, now.date]);
      }
    }
    if (alerting.includes(s)) {
      const sent = new Set(String(s.wx_sent || "").split(",").filter(Boolean));
      const fresh = [];
      [0, 1].forEach((i) => dayAlerts(d, i).forEach((a) => {
        const key = `${d.time[i]}:${a.type}`;
        if (!sent.has(key)) { fresh.push({ ...a, i, key }); }
      }));
      if (!fresh.length) continue;
      const when = (i) => (i === 0 ? "Bugün" : "Yarın");
      const body = fresh.map((a) => `${when(a.i)}: ${a.text}`).join(" · ") + ". Kaynak: hava modelleri; resmî uyarılar için MGM.";
      const title = `Hava uyarısı — ${place}`;
      if (await deliver(pool, s, { title, body, url: "/hava.html", tag: `wx-alert-${fresh[0].key}` }, "high", stats)) {
        fresh.forEach((a) => sent.add(a.key));
        await pool.query("UPDATE push_subscriptions SET wx_sent = $2 WHERE id = $1", [s.id, [...sent].slice(-30).join(",")]);
      }
    }
  }
  return { ...stats, subs: subs.length, daily: daily.length, alerts: alerting.length };
}

/* ---------------- YANGIN: yakinimda yeni uydu tespiti ---------------- */
const FIRE_EVERY_MS = 10 * 60 * 1000;
const FIRE_MAX_AGE_H = 12;
const FIRE_COOLDOWN_MS = 2 * 3600 * 1000;
const fireKey = (f) => `${f.lat.toFixed(3)},${f.lon.toFixed(3)},${f.date},${f.time}`;
const fireTs = (f) => { const hh = String(f.time || "0000").padStart(4, "0"); return Date.parse(`${f.date}T${hh.slice(0, 2)}:${hh.slice(2)}:00Z`); };

// getFires: () => Promise<{ok, data}> (sunucunun FIRMS onbellegi)
async function runFirePush(pool, getFires) {
  const stats = { sent: 0, removed: 0, failed: 0 };
  const st = await getState(pool, "fire_push");
  if (st && Date.now() - new Date(st.updated_at).getTime() < FIRE_EVERY_MS) return { ...stats, skipped: true };
  const subs = (await pool.query("SELECT * FROM push_subscriptions WHERE fire_on AND lat IS NOT NULL AND lon IS NOT NULL AND fire_radius_km IS NOT NULL")).rows;
  const fires = await getFires();
  if (!fires.ok) { await setState(pool, "fire_push", st ? st.v : { seen: [] }); return { ...stats, reason: "fires_unavailable" }; }
  const now = Date.now();
  const recent = fires.data.filter((f) => now - fireTs(f) <= FIRE_MAX_AGE_H * 3600 * 1000);
  const keys = recent.map(fireKey);
  // ilk calisma: mevcut tespitleri "goruldu" say
  if (!st || !st.v || !Array.isArray(st.v.seen)) { await setState(pool, "fire_push", { seen: keys }); return { ...stats, initialized: true }; }
  const seen = new Set(st.v.seen);
  const fresh = recent.filter((f) => !seen.has(fireKey(f)));
  await setState(pool, "fire_push", { seen: keys });
  if (!fresh.length || !subs.length) return { ...stats, fresh: fresh.length, subs: subs.length };

  for (const s of subs) {
    if (s.fire_last_at && now - new Date(s.fire_last_at).getTime() < FIRE_COOLDOWN_MS) continue;
    const near = fresh.map((f) => ({ f, km: haversineKm(s.lat, s.lon, f.lat, f.lon) })).filter((x) => x.km <= s.fire_radius_km).sort((a, b) => a.km - b.km);
    if (!near.length) continue;
    const t = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(fireTs(near[0].f));
    const body = `${near.length > 1 ? `${near.length} ısı noktası, en yakını` : "Bir ısı noktası"} sana yaklaşık ${Math.round(near[0].km)} km uzakta (uydu geçişi ${t}). Yangın görürsen 177'yi ara.`;
    if (await deliver(pool, s, { title: `Yakınında yangın tespiti — ${s.place_name || "konumun"}`, body, url: "/yangin.html?v=harita", tag: "fire-near" }, "high", stats)) {
      await pool.query("UPDATE push_subscriptions SET fire_last_at = now() WHERE id = $1", [s.id]);
    }
  }
  return { ...stats, fresh: fresh.length, subs: subs.length };
}

module.exports = { pushConfigured, sendOne, runQuakePush, runWeatherPush, runFirePush, haversineKm };
