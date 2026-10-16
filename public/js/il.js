// Il sayfasi (/izmir gibi): 7 gunluk hava, il ve 30 km cevresindeki son 30 gunun depremleri,
// il sinirindaki son 5 gunun isi noktalari ve hepsini gosteren harita (aktif fay hatlariyla).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.escapeHtml(String(s == null ? "" : s));
  const ic = (n, size = 13) => window.HavaIcon(n, { size });
  const nf = new Intl.NumberFormat("tr-TR");
  const main = $("ilMain");
  const IL = main.dataset.il;
  const LAT = Number(main.dataset.lat), LON = Number(main.dataset.lon);
  const NEAR_KM = 30;

  // ---------------- yardimcilar ----------------
  const quakeTime = (q) => Date.parse(String(q.date || "").replace(" ", "T") + "+03:00");
  const fireTime = (f) => Date.parse(`${f.date}T${String(f.time).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")}:00Z`);
  const TZ = { timeZone: "Europe/Istanbul" };
  const hhmm = (t) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", ...TZ });
  const dayShort = (t) => new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short", ...TZ });
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return `${Math.max(1, m)} dk önce`;
    if (m < 1440) return `${Math.round(m / 60)} sa önce`;
    return `${Math.round(m / 1440)} gün önce`;
  }
  function km(lat1, lon1, lat2, lon2) {
    const r = (d) => (d * Math.PI) / 180;
    const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }
  function inRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  const inShape = (lon, lat, g) => polysOf(g).some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
  // sinira en yakin kose noktasina uzaklik (kaba ama 30 km esigi icin yeterli)
  function nearShape(lon, lat, g, limit) {
    for (const rings of polysOf(g)) for (const [x, y] of rings[0]) if (Math.abs(y - lat) < 0.5 && km(lat, lon, y, x) <= limit) return true;
    return false;
  }
  const magSq = (m, type) => `<span class="mag-sq${m >= 4 ? " m-strong" : ""}" style="--m:${window.magTone(m)}">${m.toFixed(1)}<small>${esc(type || "MAG")}</small></span>`;
  // duz ikon: acik / bulutlu / yagisli
  const wxIcon = (code) => (code <= 1 ? "sun" : code <= 48 ? "cloud-sun" : "droplet");

  const geoP = fetch("/data/tr-iller.geojson").then((r) => r.json()).then((g) => g.features.find((f) => f.properties.n === IL)).catch(() => null);
  const placesP = fetch("/data/iller.json").then((r) => r.json()).then((p) => (p.find((x) => x.n === IL) || { d: [] }).d).catch(() => []);
  function nearestDistrict(districts, lat, lon) {
    let best = null, bd = Infinity;
    for (const [name, la, lo] of districts) { const d = km(lat, lon, la, lo); if (d < bd) { bd = d; best = name; } }
    return best;
  }

  // ---------------- hava (tarayicidan Open-Meteo'ya; ziyaretcinin kendi kotasi) ----------------
  async function loadWeather() {
    const p = new URLSearchParams({
      latitude: LAT, longitude: LON,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "Europe/Istanbul", forecast_days: "7",
    });
    try {
      const j = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`).then((r) => r.json());
      const c = j.current;
      const label = window.WeatherWMO.label(c.weather_code);
      $("ilTemp").textContent = `${Math.round(c.temperature_2m)}°`;
      $("ilNow").innerHTML = `
        <div class="il-now-main"><span class="il-now-ic">${ic(wxIcon(c.weather_code), 34)}</span><b>${Math.round(c.temperature_2m)}°</b><div><strong>${esc(label)}</strong><span>Hissedilen ${Math.round(c.apparent_temperature)}°</span></div></div>
        <div class="il-now-facts">
          <span>${ic("droplet")} Nem %${Math.round(c.relative_humidity_2m)}</span>
          <span>${ic("wind")} Rüzgâr ${Math.round(c.wind_speed_10m)} km/s</span>
          <span>${ic("droplet")} Bugün yağış ihtimali %${j.daily.precipitation_probability_max[0] ?? 0}</span>
        </div>`;
      $("ilDays").innerHTML = j.daily.time.map((d, i) => {
        const t = Date.parse(`${d}T12:00:00+03:00`);
        const name = i === 0 ? "Bugün" : new Date(t).toLocaleDateString("tr-TR", { weekday: "short", ...TZ });
        const code = j.daily.weather_code[i];
        return `<div class="il-day" title="${esc(window.WeatherWMO.label(code))}"><span class="il-day-name">${esc(name)}</span>${ic(wxIcon(code), 20)}<b>${Math.round(j.daily.temperature_2m_max[i])}°</b><span class="il-day-min">${Math.round(j.daily.temperature_2m_min[i])}°</span><small>%${j.daily.precipitation_probability_max[i] ?? 0}</small></div>`;
      }).join("");
    } catch {
      $("ilNow").innerHTML = '<p class="il-empty">Hava verisine şu an ulaşılamıyor.</p>';
    }
  }

  // ---------------- harita ----------------
  let pm = null;
  function setupMap(feature) {
    if (!window.L || !window.HavaProvMap) return;
    pm = window.HavaProvMap.create({ el: "ilMap", kind: "quake", faults: true, noFill: true, maxZoom: 14 });
    if (feature) {
      const outline = L.geoJSON(feature, { interactive: false, style: { color: "#ffffff", weight: 2.2, fill: false } }).addTo(pm.map);
      pm.map.fitBounds(outline.getBounds(), { padding: [18, 18] });
    } else {
      pm.map.setView([LAT, LON], 8);
    }
  }

  // ---------------- depremler ----------------
  async function loadQuakes(feature) {
    try {
      const res = await fetch("/api/quakes/history?days=30").then((r) => r.json());
      if (!res.ok) throw new Error();
      const qs = res.data
        .filter((q) => q.lat != null && (q.province === IL || (feature && (inShape(q.lon, q.lat, feature.geometry) || nearShape(q.lon, q.lat, feature.geometry, NEAR_KM)))))
        .sort((a, b) => quakeTime(b) - quakeTime(a));
      const week = qs.filter((q) => Date.now() - quakeTime(q) < 7 * 864e5);
      const max = qs.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
      $("ilQ7").textContent = nf.format(week.length);
      $("ilQMax").textContent = max ? `${max.magType || "M"} ${max.mag.toFixed(1)}` : "—";

      if (pm) {
        [...qs].sort((a, b) => a.mag - b.mag).forEach((q) => {
          L.circleMarker([q.lat, q.lon], { pane: "points", radius: 3 + q.mag * 2.2, color: "#0b0d11", weight: 1, fillColor: window.magTone(q.mag), fillOpacity: 0.85 })
            .bindPopup(`<div class="map-pop"><strong>${esc(q.magType || "M")} ${q.mag.toFixed(1)} · ${esc(q.title)}</strong><br/>${esc(dayShort(quakeTime(q)))} ${esc(hhmm(quakeTime(q)))} · ${Number.isFinite(q.depth) ? `${Math.round(q.depth * 10) / 10} km derinlik` : "derinlik —"}</div>`)
            .addTo(pm.points);
        });
      }

      $("ilQuakes").innerHTML = qs.length
        ? qs.slice(0, 10).map((q, i) => {
            const t = quakeTime(q);
            return `<div class="lp-q${i === 0 && Date.now() - t < 864e5 ? " q-latest" : ""}">${magSq(q.mag, q.magType)}
              <div class="lp-q-main"><b>${esc(q.title)}</b>
                <div class="lp-q-meta"><span>${ic("ruler")} ${Number.isFinite(q.depth) ? `${Math.round(q.depth * 10) / 10} km derinlik` : "derinlik —"}</span><span>${ic("clock")} ${esc(ago(t))}</span></div>
              </div>
              <div class="lp-q-time"><b>${esc(hhmm(t))}</b><span>${esc(dayShort(t))}</span></div></div>`;
          }).join("") + (qs.length > 10 ? `<p class="il-more-note">Son 30 günde toplam ${nf.format(qs.length)} deprem; en yeni 10 tanesi gösteriliyor.</p>` : "")
        : `<p class="il-empty">Son 30 günde ${esc(IL)} ve 30 km çevresinde deprem kaydedilmedi.</p>`;
    } catch {
      $("ilQuakes").innerHTML = '<p class="il-empty">Deprem verisine şu an ulaşılamıyor.</p>';
    }
  }

  // ---------------- yanginlar ----------------
  async function loadFires(feature) {
    try {
      const [res, districts] = await Promise.all([fetch("/api/fires?days=5").then((r) => r.json()), placesP]);
      if (!res.ok) {
        $("ilFires").innerHTML = '<p class="il-empty">Uydu verisine şu an ulaşılamıyor.</p>';
        $("ilFire").textContent = "—";
        return;
      }
      const fs = feature ? res.data.filter((f) => inShape(f.lon, f.lat, feature.geometry)) : [];
      const day = fs.filter((f) => Date.now() - fireTime(f) < 864e5);
      $("ilFire").textContent = nf.format(day.length);
      if (pm) {
        fs.forEach((f) => {
          L.circleMarker([f.lat, f.lon], { pane: "points", radius: f.frp >= 15 ? 5 : 3.5, color: "#7c2d12", weight: 1, fillColor: f.frp >= 15 ? "#fbbf24" : "#fb923c", fillOpacity: 0.95 })
            .bindPopup(`<div class="map-pop"><strong>Isı noktası · ${esc(nearestDistrict(districts, f.lat, f.lon) || IL)}</strong><br/>${esc(dayShort(fireTime(f)))} ${esc(hhmm(fireTime(f)))} · güç ${Math.round(f.frp)} MW</div>`)
            .addTo(pm.points);
        });
      }
      if (!fs.length) {
        $("ilFires").innerHTML = `<p class="il-empty">Son 5 günde ${esc(IL)} il sınırları içinde uydu ısı noktası tespit edilmedi.</p>`;
        return;
      }
      // ilceye gore grupla: en cok tespit edilen ilceler
      const by = new Map();
      fs.forEach((f) => {
        const d = nearestDistrict(districts, f.lat, f.lon) || IL;
        const e = by.get(d) || { n: 0, frp: 0, last: 0 };
        e.n++; e.frp = Math.max(e.frp, f.frp); e.last = Math.max(e.last, fireTime(f));
        by.set(d, e);
      });
      const rows = [...by].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
      $("ilFires").innerHTML = `
        <p class="il-fire-sum">Son 24 saatte <b>${nf.format(day.length)}</b>, son 5 günde <b>${nf.format(fs.length)}</b> ısı noktası. Isı noktası her zaman yangın demek değildir; tarım atığı yakma ve sanayi tesisleri de görünebilir.</p>
        <div class="admin-table-wrap"><table class="il-table"><thead><tr><th>İlçe (yakını)</th><th>Tespit</th><th>En güçlü</th><th>Son tespit</th></tr></thead><tbody>
        ${rows.map(([d, e]) => `<tr><td>${esc(d)}</td><td>${nf.format(e.n)}</td><td>${Math.round(e.frp)} MW</td><td>${esc(ago(e.last))}</td></tr>`).join("")}
        </tbody></table></div>`;
    } catch {
      $("ilFires").innerHTML = '<p class="il-empty">Uydu verisine şu an ulaşılamıyor.</p>';
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("year") && ($("year").textContent = new Date().getFullYear());
    loadWeather();
    const feature = await geoP;
    setupMap(feature);
    loadQuakes(feature);
    loadFires(feature);
  });
})();
