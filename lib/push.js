// Deprem bildirimleri (Web Push).
// Akis: AWS EventBridge her 2 dakikada /api/push/run'i cagirir (X-Cron-Secret basligiyla) ->
// son AFAD depremleri alinir -> daha once bildirilmemis ve yeni olanlar icin, esigi ve
// (varsa) mesafe tercihi uyan abonelere bildirim gider. Gonderilen deprem kimlikleri
// app_state tablosunda tutulur (sunucu durumsuz calistigi icin bellekte degil).
const webpush = require("web-push");

const STATE_KEY = "push_sent_quakes";
const MAX_AGE_MIN = 45; // bundan eski depremler icin bildirim gonderilmez
const MAX_PER_RUN = 3; // tek calismada en fazla bu kadar deprem bildirilir (en buyukler)

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
  const ids = quakes.map((q) => String(q.id));

  // ilk calisma: mevcut depremleri "goruldu" say, eski depremler icin toplu bildirim atma
  if (!prev) {
    await pool.query("INSERT INTO app_state (k, v) VALUES ($1, $2::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()", [STATE_KEY, JSON.stringify({ ids: ids.slice(0, 300) })]);
    return { ok: true, initialized: true, sent: 0 };
  }

  const seen = new Set(prev.ids || []);
  const fresh = quakes
    .filter((q) => !seen.has(String(q.id)) && Number.isFinite(q.mag) && q.lat != null && q.lon != null)
    .filter((q) => { const t = quakeTime(q); return t && now - t <= MAX_AGE_MIN * 60000; })
    .sort((a, b) => b.mag - a.mag)
    .slice(0, MAX_PER_RUN);

  let sent = 0, removed = 0, failed = 0;
  if (fresh.length) {
    const maxMag = Math.max(...fresh.map((q) => q.mag));
    const subs = (await pool.query("SELECT * FROM push_subscriptions WHERE min_mag <= $1", [maxMag])).rows;
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
  await pool.query("UPDATE app_state SET v = $2::jsonb, updated_at = now() WHERE k = $1", [STATE_KEY, JSON.stringify({ ids: merged })]);
  return { ok: true, newQuakes: fresh.map((q) => `${q.id}:M${q.mag}`), sent, removed, failed };
}

module.exports = { pushConfigured, sendOne, runQuakePush, haversineKm };
