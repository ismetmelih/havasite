/* =========================================================================
   TürkiyeCanlı — Hava Durumu
   Bölümler: Genel · Saatlik · Ayrıntılar · Harita · Aylık · Eğilimler
   Kaynak: Open-Meteo (tahmin + hava kalitesi + geçmiş arşiv), tümü ücretsiz.
   ========================================================================= */
(function () {
  "use strict";

  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
  const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const REFRESH_MS = 10 * 60 * 1000;

  const QUICK_CITIES = [
    { name: "İstanbul", lat: 41.0138, lon: 28.9497 },
    { name: "Ankara", lat: 39.9208, lon: 32.8541 },
    { name: "İzmir", lat: 38.4237, lon: 27.1428 },
    { name: "Bursa", lat: 40.1826, lon: 29.0665 },
    { name: "Antalya", lat: 36.8969, lon: 30.7133 },
    { name: "Adana", lat: 37.0, lon: 35.3213 },
    { name: "Trabzon", lat: 41.0027, lon: 39.7168 },
  ];

  const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const GUN_UZUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  const state = {
    loc: { name: "Ankara", lat: 39.9208, lon: 32.8541 },
    f: null, air: null, archive: null, archiveKey: null,
    view: "genel",
    metric: "temp",
    monthOffset: 0,
    mapLayer: "temp",
    map: null, cityLayer: null, mapReady: false,
    cityRows: [],
  };

  const $ = (id) => document.getElementById(id);
  const iso = (d) => d.toISOString().slice(0, 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = Math.round;

  document.addEventListener("DOMContentLoaded", () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    const saved = safeJson("havasite_last_city");
    if (saved && saved.lat) state.loc = saved;
    else if (window.HavaPrefs) {
      const fav = window.HavaPrefs.get().favoriteCity;
      const c = fav && (window.TR_CITIES || []).find((x) => x.name === fav);
      if (c) state.loc = { name: c.name, lat: c.lat, lon: c.lon };
    }

    const wantView = (new URLSearchParams(location.search).get("v") || location.hash.slice(1) || "").toLowerCase();
    if (["genel", "saatlik", "ayrinti", "harita", "aylik", "egilim"].includes(wantView)) state.view = wantView;

    setupTabs();
    setupSearch();
    setupMetricChips();
    setupMonthNav();
    setupMapLayers();
    $("geoBtn") && $("geoBtn").addEventListener("click", useGeolocation);

    if (state.view !== "genel") {
      document.querySelectorAll(".wx-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
      document.querySelectorAll(".wx-view").forEach((s) => s.classList.toggle("is-active", s.id === `view-${state.view}`));
    }

    loadWeather();
    setInterval(loadWeather, REFRESH_MS);
  });

  function safeJson(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  /* ---------------- veri yükleme ---------------- */
  async function loadWeather(silent) {
    if (!silent) $("lastUpdated").textContent = "Yükleniyor…";
    $("wcCity").textContent = state.loc.name;

    const fp = new URLSearchParams({
      latitude: state.loc.lat, longitude: state.loc.lon,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation",
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,relative_humidity_2m,dew_point_2m,uv_index,wind_speed_10m,pressure_msl,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset",
      timezone: "Europe/Istanbul", forecast_days: "16", past_days: "1",
    });
    const ap = new URLSearchParams({
      latitude: state.loc.lat, longitude: state.loc.lon,
      current: "european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
      hourly: "grass_pollen,birch_pollen,alder_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
      timezone: "Europe/Istanbul",
    });

    try {
      const [f, air] = await Promise.all([
        fetch(`${FORECAST_URL}?${fp}`).then((r) => r.json()),
        fetch(`${AIR_URL}?${ap}`).then((r) => r.json()).catch(() => null),
      ]);
      state.f = f;
      state.air = air;
      $("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())} · kaynak: Open-Meteo`;
      renderCurrentHeader();
      renderView(state.view, true);
      loadCityData();
    } catch (err) {
      $("lastUpdated").textContent = "Veri alınamadı, tekrar denenecek…";
    }
  }

  /* ---------------- yardımcılar: zaman/index ---------------- */
  function nowIndex() {
    const h = state.f.hourly;
    const i = h.time.findIndex((t) => new Date(t) >= new Date(state.f.current.time));
    return Math.max(i, 0);
  }
  function todayIndex() {
    const t = iso(new Date());
    const i = state.f.daily.time.indexOf(t);
    return i < 0 ? 1 : i;
  }
  function fmtHM(isoStr) {
    return new Date(isoStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  const WIND_DIRS = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"];
  const WIND_DIRS_UZUN = ["Kuzey", "Kuzeydoğu", "Doğu", "Güneydoğu", "Güney", "Güneybatı", "Batı", "Kuzeybatı"];
  const windDirShort = (d) => WIND_DIRS[Math.round((d % 360) / 22.5) % 16];
  const windDirLong = (d) => WIND_DIRS_UZUN[Math.round((d % 360) / 45) % 8];
  function windForce(kmh) {
    if (kmh < 2) return "Sakin"; if (kmh < 12) return "Hafif esinti"; if (kmh < 20) return "Tatlı rüzgâr";
    if (kmh < 30) return "Orta rüzgâr"; if (kmh < 40) return "Sert rüzgâr"; if (kmh < 62) return "Fırtınamsı"; return "Fırtına";
  }
  function uvLabel(u) { return u < 3 ? "Düşük" : u < 6 ? "Orta" : u < 8 ? "Yüksek" : u < 11 ? "Çok yüksek" : "Aşırı"; }
  function aqiLabel(a) {
    if (a == null) return "—"; if (a <= 20) return "İyi"; if (a <= 40) return "Uygun"; if (a <= 60) return "Orta";
    if (a <= 80) return "Sağlıksız (hassas)"; if (a <= 100) return "Sağlıksız"; return "Çok sağlıksız";
  }

  /* ---------------- renk skalaları ---------------- */
  function lerp(a, b, t) { return a.map((v, i) => round(v + (b[i] - v) * t)); }
  function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function scale(stops, v) {
    if (v <= stops[0][0]) return rgb(stops[0][1]);
    if (v >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
      if (v >= x0 && v <= x1) return rgb(lerp(c0, c1, (v - x0) / (x1 - x0)));
    }
    return rgb(stops[0][1]);
  }
  const TEMP_STOPS = [[-15, [79, 120, 200]], [0, [90, 169, 222]], [10, [120, 190, 190]], [18, [150, 175, 150]], [24, [214, 160, 100]], [32, [214, 110, 80]], [40, [200, 70, 70]]];
  const tempColor = (t) => scale(TEMP_STOPS, t);
  const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b9ed9";

  /* ---------------- sekme geçişi ---------------- */
  function setupTabs() {
    document.querySelectorAll(".wx-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }
  function switchView(v) {
    state.view = v;
    try { history.replaceState(null, "", v === "genel" ? location.pathname : `?v=${v}`); } catch {}
    document.querySelectorAll(".wx-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    document.querySelectorAll(".wx-view").forEach((s) => s.classList.toggle("is-active", s.id === `view-${v}`));
    if (state.f) renderView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderView(v, all) {
    if (!state.f) return;
    if (all || v === "genel") { renderGenel(); }
    if (all || v === "saatlik") { renderSaatlik(); }
    if (v === "ayrinti") renderAyrinti();
    if (v === "harita") initMap();
    if (v === "aylik") { renderCalendar(); ensureArchive(); }
    if (v === "egilim") { ensureArchive(); }
    window.hydrateIcons && window.hydrateIcons();
  }

  /* ---------------- üst başlık + şehir şeridi ---------------- */
  function renderCurrentHeader() {
    const c = state.f.current, d = state.f.daily, di = todayIndex();
    const isDay = c.is_day === 1;
    applyWeatherScene(c.weather_code, isDay);
    $("wcIcon").innerHTML = window.WeatherWMO.svg(c.weather_code, isDay);
    $("wcDesc").textContent = window.WeatherWMO.label(c.weather_code);
    setFlash("wcTemp", round(c.temperature_2m));
    $("wcFeels").textContent = `${round(c.apparent_temperature)}°`;
    $("wcDayMax").textContent = `${round(d.temperature_2m_max[di])}°`;
    $("wcDayMin").textContent = `${round(d.temperature_2m_min[di])}°`;

    const hi = round(d.temperature_2m_max[di]), lo = round(d.temperature_2m_min[di]);
    const pop = d.precipitation_probability_max[di];
    let s = `${window.WeatherWMO.label(c.weather_code)}. Bugün en yüksek ${hi}°, en düşük ${lo}°.`;
    if (pop >= 30) s += ` Yağış olasılığı %${pop}.`;
    const feels = round(c.apparent_temperature);
    if (Math.abs(feels - round(c.temperature_2m)) >= 3) s += ` Dışarısı ${feels}° gibi hissettiriyor.`;
    $("wcForecast").textContent = s;
  }
  function setFlash(id, val) {
    const el = $(id); if (!el) return;
    const t = String(val);
    if (el.textContent !== t) { el.textContent = t; window.flashUpdate && window.flashUpdate(el); }
  }

  async function loadCityData() {
    const wrap = $("wxCities");
    const lats = QUICK_CITIES.map((c) => c.lat).join(",");
    const lons = QUICK_CITIES.map((c) => c.lon).join(",");
    try {
      const r = await fetch(`${FORECAST_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day&timezone=Europe%2FIstanbul`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];
      wrap.innerHTML = QUICK_CITIES.map((c, i) => {
        const cur = arr[i] && arr[i].current;
        if (!cur) return "";
        const active = c.name === state.loc.name ? " is-active" : "";
        return `<button class="wx-city${active}" type="button" data-lat="${c.lat}" data-lon="${c.lon}" data-name="${c.name}">
          <span class="wx-city-ic">${window.WeatherWMO.svg(cur.weather_code, cur.is_day === 1)}</span>
          <span class="wx-city-name">${c.name}</span>
          <span class="wx-city-temp">${round(cur.temperature_2m)}°</span>
        </button>`;
      }).join("");
      wrap.querySelectorAll(".wx-city").forEach((b) => {
        b.addEventListener("click", () => {
          state.loc = { name: b.dataset.name, lat: +b.dataset.lat, lon: +b.dataset.lon };
          saveJson("havasite_last_city", state.loc);
          state.archive = null;
          loadWeather();
        });
      });
    } catch { /* sessiz */ }
  }

  /* ============================================================
     GENEL
     ============================================================ */
  function renderGenel() {
    const c = state.f.current, h = state.f.hourly, air = state.air;
    const ni = nowIndex();
    const dew = h.dew_point_2m ? round(h.dew_point_2m[ni]) : null;
    const vis = h.visibility ? round(h.visibility[ni] / 1000) : null;
    const pollen = maxPollenNow();

    const uv = h.uv_index ? h.uv_index[ni] : null;
    const aqi = air && air.current && air.current.european_aqi != null ? round(air.current.european_aqi) : null;
    const metrics = [
      { ic: "wind", label: "Rüzgâr", val: `${round(c.wind_speed_10m)} km/s`, sub: `${windForce(c.wind_speed_10m)} · ${windDirShort(c.wind_direction_10m)}` },
      { ic: "droplet", label: "Nem", val: `%${c.relative_humidity_2m}`, sub: dew != null ? `çiy noktası ${dew}°` : "" },
      { ic: "navigation", label: "Görüş", val: vis != null ? `${vis} km` : "—", sub: vis == null ? "" : vis >= 10 ? "açık" : vis >= 4 ? "orta" : "puslu" },
      { ic: "gauge", label: "Basınç", val: `${round(c.pressure_msl)} hPa`, sub: c.pressure_msl >= 1013 ? "yüksek basınç" : "alçak basınç" },
      { ic: "sun", label: "UV indeksi", val: uv != null ? round(uv) : "—", sub: uv != null ? uvLabel(uv) : "" },
      aqi != null
        ? { ic: "activity", label: "Hava kalitesi", val: aqi, sub: aqiLabel(aqi) }
        : { ic: "layers", label: "Bulut örtüsü", val: `%${round(c.cloud_cover)}`, sub: c.cloud_cover < 25 ? "açık" : c.cloud_cover < 70 ? "parçalı" : "kapalı" },
    ];
    $("wxQuickRow").innerHTML = metrics.map((m) => `
      <div class="wx-qm">
        <span class="wx-qm-ic">${window.HavaIcon(m.ic, { size: 15 })}</span>
        <span class="wx-qm-label">${m.label}</span>
        <span class="wx-qm-val">${m.val}</span>
        <span class="wx-qm-sub">${m.sub}</span>
      </div>`).join("");

    // saatlik sıcaklık grafiği (24 saat)
    drawGradientChart($("wxGChart"), buildSeries("temp", 24), { unit: "°", colorByTemp: true });

    // ay evresi
    const mp = moonPhase(new Date());
    $("wxMoonBadge").innerHTML = `${moonSvg(mp.frac, 20)}<span>${mp.name} · %${round(mp.illum * 100)}</span>`;

    renderDaily();
  }

  function maxPollenNow() {
    const air = state.air;
    if (!air || !air.hourly) return null;
    const t = air.hourly.time || [];
    let idx = t.findIndex((x) => new Date(x) >= new Date());
    if (idx < 0) idx = 0;
    const kinds = [
      ["grass_pollen", "Çim poleni"], ["birch_pollen", "Huş poleni"], ["alder_pollen", "Kızılağaç poleni"],
      ["olive_pollen", "Zeytin poleni"], ["mugwort_pollen", "Pelin poleni"], ["ragweed_pollen", "Kanyaş poleni"],
    ];
    let best = null;
    kinds.forEach(([k, name]) => {
      const v = air.hourly[k] && air.hourly[k][idx];
      if (v == null) return;
      if (!best || v > best.v) best = { v, name };
    });
    if (!best) return null;
    const lvl = best.v < 10 ? "Düşük" : best.v < 30 ? "Orta" : best.v < 70 ? "Yüksek" : "Çok yüksek";
    return { label: lvl, name: best.name, v: best.v };
  }

  function renderDaily() {
    const d = state.f.daily;
    const days = d.time.slice(0, 10);
    const wmin = Math.min(...d.temperature_2m_min.slice(0, 10));
    const wmax = Math.max(...d.temperature_2m_max.slice(0, 10));
    const span = wmax - wmin || 1;
    $("dailyGrid").innerHTML = days.map((t, i) => {
      const dt = new Date(t);
      const label = i === 0 ? "Bugün" : `${GUN_KISA[dt.getDay()]} ${dt.getDate()}`;
      const hi = round(d.temperature_2m_max[i]), lo = round(d.temperature_2m_min[i]);
      const left = ((d.temperature_2m_min[i] - wmin) / span) * 100;
      const w = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
      const pop = d.precipitation_probability_max[i];
      return `<div class="day-row" title="${i === 0 ? "Bugün" : GUN_UZUN[dt.getDay()]}">
        <span class="dr-day">${label}</span>
        <span class="dr-icon">${window.WeatherWMO.svg(d.weather_code[i], true)}</span>
        <span class="dr-pop">${pop >= 10 ? window.HavaIcon("droplet", { size: 11 }) + " %" + pop : ""}</span>
        <span class="dr-lo">${lo}°</span>
        <span class="dr-bar"><span class="dr-bar-fill" style="left:${left.toFixed(0)}%;width:${Math.max(w, 6).toFixed(0)}%"></span></span>
        <span class="dr-hi">${hi}°</span>
      </div>`;
    }).join("");
  }

  /* ============================================================
     SAATLİK
     ============================================================ */
  const METRICS = [
    { key: "temp", label: "Sıcaklık", unit: "°", field: "temperature_2m", colorByTemp: true },
    { key: "feels", label: "Hissedilen", unit: "°", field: "apparent_temperature", colorByTemp: true },
    { key: "pop", label: "Yağış olasılığı", unit: "%", field: "precipitation_probability" },
    { key: "precip", label: "Yağış", unit: " mm", field: "precipitation" },
    { key: "wind", label: "Rüzgâr", unit: " km/s", field: "wind_speed_10m" },
    { key: "humidity", label: "Nem", unit: "%", field: "relative_humidity_2m" },
    { key: "cloud", label: "Bulut örtüsü", unit: "%", field: "cloud_cover" },
    { key: "pressure", label: "Basınç", unit: " hPa", field: "pressure_msl" },
    { key: "uv", label: "UV", unit: "", field: "uv_index" },
  ];
  function setupMetricChips() {
    const wrap = $("wxMetricChips");
    wrap.innerHTML = METRICS.map((m) => `<button class="wx-mchip${m.key === "temp" ? " active" : ""}" type="button" data-m="${m.key}">${m.label}</button>`).join("");
    wrap.querySelectorAll(".wx-mchip").forEach((b) => b.addEventListener("click", () => {
      state.metric = b.dataset.m;
      wrap.querySelectorAll(".wx-mchip").forEach((x) => x.classList.toggle("active", x === b));
      renderSaatlik();
    }));
  }
  function buildSeries(key, hours) {
    const m = METRICS.find((x) => x.key === key) || METRICS[0];
    const h = state.f.hourly;
    const s = nowIndex();
    const n = Math.min(hours, h.time.length - s);
    const out = { times: [], vals: [], codes: [], isDay: [], pop: [], m };
    for (let i = 0; i < n; i++) {
      const idx = s + i;
      out.times.push(h.time[idx]);
      out.vals.push(h[m.field] ? h[m.field][idx] : 0);
      out.codes.push(h.weather_code[idx]);
      out.isDay.push(h.is_day ? h.is_day[idx] : (new Date(h.time[idx]).getHours() >= 7 && new Date(h.time[idx]).getHours() < 20 ? 1 : 0));
      out.pop.push(h.precipitation_probability ? h.precipitation_probability[idx] : 0);
    }
    return out;
  }
  function renderSaatlik() {
    if (!state.f) return;
    const m = METRICS.find((x) => x.key === state.metric) || METRICS[0];
    $("wxHourlyTitle").textContent = m.label;
    const series = buildSeries(state.metric, 48);
    drawGradientChart($("wxHourlyChart"), series, { unit: m.unit, colorByTemp: !!m.colorByTemp });

    // saatlik kart şeridi (48 saat)
    const h = state.f.hourly, s = nowIndex();
    const cards = [];
    for (let i = 0; i < Math.min(48, h.time.length - s); i++) {
      const idx = s + i, dt = new Date(h.time[idx]);
      const isDay = h.is_day ? h.is_day[idx] === 1 : (dt.getHours() >= 7 && dt.getHours() < 20);
      const pop = h.precipitation_probability[idx];
      cards.push(`<div class="hour-card">
        <span class="hc-time">${i === 0 ? "Şimdi" : dt.getHours() + ":00"}</span>
        ${window.WeatherWMO.svg(h.weather_code[idx], isDay)}
        <span class="hc-temp">${round(h.temperature_2m[idx])}°</span>
        <span class="hc-pop">${pop >= 10 ? window.HavaIcon("droplet", { size: 11 }) + " %" + pop : "—"}</span>
      </div>`);
    }
    $("hourlyStrip").innerHTML = cards.join("");
  }

  /* ============================================================
     GRADIENT CHART (imza görsel)
     ============================================================ */
  function catmullRom(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  let gcSeq = 0;
  function drawGradientChart(container, series, opts) {
    if (!container) return;
    opts = opts || {};
    const vals = series.vals, times = series.times;
    if (!vals || vals.length < 2) { container.innerHTML = ""; return; }
    const W = 1000, H = 260, padL = 24, padR = 20, padT = 34, padB = 46;
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1) { max += 1; min -= 1; }
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const x = (i) => padL + (i / (vals.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const line = catmullRom(pts);
    const area = `${line} L${x(vals.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;

    const uid = `gc${++gcSeq}`;
    const acc = accentColor();
    let gradStops = "";
    if (opts.colorByTemp) {
      vals.forEach((v, i) => { gradStops += `<stop offset="${((i / (vals.length - 1)) * 100).toFixed(1)}%" stop-color="${tempColor(v)}"/>`; });
    } else {
      gradStops = `<stop offset="0%" stop-color="${acc}"/><stop offset="100%" stop-color="${acc}"/>`;
    }

    // x ekseni etiketleri (her 3-6 saatte)
    const step = vals.length > 30 ? 6 : 3;
    let xlab = "";
    times.forEach((t, i) => {
      if (i % step !== 0 && i !== vals.length - 1) return;
      const dt = new Date(t);
      const lbl = i === 0 ? "Şimdi" : `${dt.getHours()}:00`;
      xlab += `<text x="${x(i).toFixed(0)}" y="${H - 24}" class="gc-xt">${lbl}</text>`;
      // gün değişiminde tarih
      if (dt.getHours() === 0) xlab += `<text x="${x(i).toFixed(0)}" y="${H - 8}" class="gc-xd">${dt.getDate()} ${AY_KISA[dt.getMonth()]}</text>`;
    });

    // değer etiketleri (tepe/dip)
    let vlab = "";
    for (let i = 0; i < vals.length; i += step) {
      vlab += `<text x="${x(i).toFixed(0)}" y="${(y(vals[i]) - 12).toFixed(0)}" class="gc-vt">${round(vals[i])}${opts.unit || ""}</text>`;
    }

    // gün doğumu/batımı işaretleri
    let sun = "";
    const di = todayIndex(), d = state.f.daily;
    [["sunrise", "sunrise"], ["sunset", "sunset"]].forEach(([f, ic]) => {
      for (let k = di; k < di + 3 && d[f][k]; k++) {
        const st = new Date(d[f][k]).getTime();
        const t0 = new Date(times[0]).getTime(), t1 = new Date(times[vals.length - 1]).getTime();
        if (st < t0 || st > t1) continue;
        const frac = (st - t0) / (t1 - t0);
        const px = padL + frac * (W - padL - padR);
        sun += `<g transform="translate(${px.toFixed(0)},${H - padB + 2})" class="gc-sun">${window.HavaIcon(ic, { size: 15 })}</g>`;
      }
    });

    // yağış çubukları
    let bars = "";
    series.pop.forEach((p, i) => {
      if (!p || p < 10) return;
      const bh = (p / 100) * 20;
      bars += `<rect x="${(x(i) - 2).toFixed(0)}" y="${(H - padB - bh).toFixed(0)}" width="4" height="${bh.toFixed(0)}" rx="1" class="gc-bar"/>`;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="gc-svg">
        <defs>
          <linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="0">${gradStops}</linearGradient>
          <linearGradient id="${uid}v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fff" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
          <mask id="${uid}m"><rect width="${W}" height="${H}" fill="url(#${uid}v)"/></mask>
        </defs>
        <path d="${area}" fill="url(#${uid})" mask="url(#${uid}m)" opacity="0.9"/>
        ${bars}
        <path d="${line}" fill="none" stroke="url(#${uid})" stroke-width="3" stroke-linecap="round" class="gc-line"/>
        ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" class="gc-pt"/>`).join("")}
        ${vlab}${xlab}${sun}
        <line class="gc-cursor" x1="0" y1="${padT}" x2="0" y2="${H - padB}" style="display:none"/>
      </svg>
      <div class="gc-tip" style="display:none"></div>
      <div class="gc-hit"></div>`;

    // etkileşim
    const svgEl = container.querySelector(".gc-svg");
    const tip = container.querySelector(".gc-tip");
    const cursor = container.querySelector(".gc-cursor");
    const hit = container.querySelector(".gc-hit");
    function move(clientX) {
      const rect = svgEl.getBoundingClientRect();
      const rel = clamp((clientX - rect.left) / rect.width, 0, 1);
      const i = clamp(Math.round(rel * (vals.length - 1)), 0, vals.length - 1);
      const dt = new Date(times[i]);
      cursor.style.display = "block";
      cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i));
      tip.style.display = "block";
      tip.style.left = `${(x(i) / W) * 100}%`;
      tip.innerHTML = `<strong>${i === 0 ? "Şimdi" : dt.getHours() + ":00"}</strong>
        ${window.WeatherWMO.svg(series.codes[i], series.isDay[i] === 1)}
        <span class="gc-tip-v">${round(vals[i])}${opts.unit || ""}</span>
        ${series.pop[i] >= 10 ? `<span class="gc-tip-p">${window.HavaIcon("droplet", { size: 11 })} %${series.pop[i]}</span>` : ""}`;
    }
    hit.addEventListener("mousemove", (e) => move(e.clientX));
    hit.addEventListener("touchmove", (e) => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
    hit.addEventListener("mouseleave", () => { tip.style.display = "none"; cursor.style.display = "none"; });
  }

  /* ============================================================
     AYRINTILAR — ölçüm kartları (SVG gauge)
     ============================================================ */
  function renderAyrinti() {
    const c = state.f.current, h = state.f.hourly, d = state.f.daily, air = state.air;
    const ni = nowIndex(), di = todayIndex();
    const cards = [];

    // Sıcaklık (mini seri)
    cards.push(dcard("Sıcaklık", miniLine(sliceH("temperature_2m", ni, 12), tempColor(c.temperature_2m)),
      `${round(c.temperature_2m)}°`, sentence("temp", c)));

    // Hissedilen
    cards.push(dcard("Hissedilen", miniLine(sliceH("apparent_temperature", ni, 12), tempColor(c.apparent_temperature)),
      `${round(c.apparent_temperature)}°`, `Baskın faktör: ${c.wind_speed_10m > 15 ? "rüzgâr" : c.relative_humidity_2m > 70 ? "nem" : "sıcaklık"}. Gerçek sıcaklık ${round(c.temperature_2m)}°.`));

    // Rüzgâr — pusula
    cards.push(dcard("Rüzgâr", compassSvg(c.wind_direction_10m),
      `${round(c.wind_speed_10m)} <small>km/s</small>`,
      `${windForce(c.wind_speed_10m)}, ${windDirLong(c.wind_direction_10m)} yönünden. Ani rüzgâr ${round(c.wind_gusts_10m || c.wind_speed_10m)} km/s.`));

    // Nem — bar meter
    cards.push(dcard("Nem", barMeter(c.relative_humidity_2m),
      `%${c.relative_humidity_2m}`,
      `Çiy noktası ${h.dew_point_2m ? round(h.dew_point_2m[ni]) : "—"}°. ${c.relative_humidity_2m > 80 ? "Nemli" : c.relative_humidity_2m > 50 ? "Ilıman" : "Kuru"} his.`));

    // UV — arc
    const uv = h.uv_index ? h.uv_index[ni] : 0;
    cards.push(dcard("UV indeksi", arcGauge(uv, 0, 12, [[0, "#3f9d6d"], [3, "#d9a441"], [6, "#cf8352"], [8, "#cf4f4f"], [11, "#8f5bb0"]]),
      `${round(uv)}`,
      `${uvLabel(uv)}. Günün en yükseği ${round(d.uv_index_max[di])}. ${uv >= 6 ? "Koruma önerilir." : "Düşük risk."}`));

    // Hava kalitesi
    if (air && air.current && air.current.european_aqi != null) {
      const a = air.current.european_aqi;
      cards.push(dcard("Hava kalitesi (HKİ)", arcGauge(a, 0, 150, [[0, "#3f9d6d"], [20, "#7bbf7b"], [40, "#d9a441"], [60, "#cf8352"], [80, "#cf4f4f"], [100, "#8f5bb0"]]),
        `${round(a)}`,
        `${aqiLabel(a)}. PM2.5 ${air.current.pm2_5 != null ? round(air.current.pm2_5) : "—"} µg/m³.`));
    }

    // Görüş — stacked bars
    const visKm = h.visibility ? h.visibility[ni] / 1000 : null;
    cards.push(dcard("Görüş mesafesi", visBars(visKm),
      visKm != null ? `${round(visKm)} <small>km</small>` : "—",
      visKm == null ? "" : visKm >= 15 ? "Mükemmel görüş." : visKm >= 8 ? "İyi görüş." : visKm >= 3 ? "Orta görüş, hafif pus." : "Düşük görüş, sisli."));

    // Basınç — slider
    cards.push(dcard("Basınç", pressureSlider(c.pressure_msl),
      `${round(c.pressure_msl)} <small>hPa</small>`,
      `${c.pressure_msl >= 1020 ? "Yüksek basınç, açık hava." : c.pressure_msl >= 1005 ? "Normal basınç." : "Alçak basınç, değişken hava."}`));

    // Bulut örtüsü — ring
    cards.push(dcard("Bulut örtüsü", ringFill(c.cloud_cover),
      `%${round(c.cloud_cover)}`,
      `${c.cloud_cover < 15 ? "Açık gökyüzü." : c.cloud_cover < 50 ? "Az bulutlu." : c.cloud_cover < 85 ? "Parçalı bulutlu." : "Kapalı gökyüzü."}`));

    // Yağış (24s)
    const rain24 = d.precipitation_sum[di];
    cards.push(dcard("Yağış (bugün)", arcGauge(rain24, 0, 20, [[0, "#8fb0cc"], [2, "#6fa8d4"], [8, "#3b9ed9"], [16, "#2f6f8f"]]),
      `${rain24.toFixed(1)} <small>mm</small>`,
      `Yağış olasılığı %${d.precipitation_probability_max[di]}. ${rain24 < 0.2 ? "Kayda değer yağış beklenmiyor." : "Yağış bekleniyor."}`));

    // Gün doğumu/batımı — sun arc
    cards.push(dcard("Gün", sunArc(d.sunrise[di], d.sunset[di]),
      dayLenLabel(d.sunrise[di], d.sunset[di]),
      `Gün doğumu ${fmtHM(d.sunrise[di])} · Gün batımı ${fmtHM(d.sunset[di])}.`));

    // Ay evresi
    const mp = moonPhase(new Date());
    cards.push(dcard("Ay evresi", `<div class="wx-moonbig">${moonSvg(mp.frac, 60)}</div>`,
      `<span class="wx-dcard-txt">${mp.name}</span>`,
      `Aydınlanma %${round(mp.illum * 100)} · ${mp.frac < 0.5 ? "büyüyen" : "küçülen"} ay.`));

    // Polen
    const pl = maxPollenNow();
    if (pl) {
      cards.push(dcard("Polen", pollenBars(pl.v),
        pl.label,
        `${pl.name} baskın. ${pl.v >= 30 ? "Alerjisi olanlar dikkatli olmalı." : "Düşük–orta düzey."}`));
    }

    $("wxDetailGrid").innerHTML = cards.join("");
  }
  function sliceH(field, from, n) {
    const h = state.f.hourly, out = [];
    for (let i = 0; i < n && h[field] && h[field][from + i] != null; i++) out.push(h[field][from + i]);
    return out;
  }
  function sentence(kind, c) {
    if (kind === "temp") {
      const h = state.f.hourly, ni = nowIndex();
      const later = h.temperature_2m[ni + 3];
      if (later == null) return "";
      const diff = later - c.temperature_2m;
      if (Math.abs(diff) < 1) return `Şu anda ${round(c.temperature_2m)}° ve sabit kalacak.`;
      return `Şu anda ${round(c.temperature_2m)}°. Önümüzdeki 3 saatte ${diff > 0 ? "yükselerek" : "düşerek"} ${round(later)}° olması bekleniyor.`;
    }
    return "";
  }
  function dcard(title, vis, val, note) {
    return `<div class="wx-dcard">
      <div class="wx-dcard-head">${title}</div>
      <div class="wx-dcard-vis">${vis}</div>
      <div class="wx-dcard-val">${val}</div>
      <div class="wx-dcard-note">${note || ""}</div>
    </div>`;
  }

  /* ---- gauge çizimler ---- */
  function miniLine(vals, color) {
    if (!vals.length) return "";
    const W = 240, H = 70;
    let mn = Math.min(...vals), mx = Math.max(...vals); if (mx - mn < 1) { mx += 1; mn -= 1; }
    const x = (i) => (i / (vals.length - 1)) * W;
    const y = (v) => 6 + (1 - (v - mn) / (mx - mn)) * (H - 12);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const line = catmullRom(pts);
    return `<svg viewBox="0 0 ${W} ${H}" class="wx-mini" preserveAspectRatio="none">
      <path d="${line} L${W},${H} L0,${H} Z" fill="${color}" opacity="0.14"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3.5" fill="${color}"/>
    </svg>`;
  }
  function compassSvg(deg) {
    return `<svg viewBox="0 0 120 120" class="wx-gauge">
      <circle cx="60" cy="60" r="46" class="g-track"/>
      ${["K", "D", "G", "B"].map((c, i) => `<text x="${60 + 54 * Math.sin(i * Math.PI / 2)}" y="${60 - 54 * Math.cos(i * Math.PI / 2) + 4}" class="g-card">${c}</text>`).join("")}
      <g transform="rotate(${deg} 60 60)">
        <path d="M60 22 L52 62 L60 56 L68 62 Z" class="g-needle"/>
        <path d="M60 98 L54 62 L60 66 L66 62 Z" class="g-needle-tail"/>
      </g>
      <circle cx="60" cy="60" r="4" class="g-hub"/>
    </svg>`;
  }
  function arcGauge(value, min, max, stops) {
    const a0 = 135, a1 = 405; // 270° yay
    const frac = clamp((value - min) / (max - min), 0, 1);
    const ang = a0 + frac * (a1 - a0);
    const R = 46, cx = 60, cy = 60;
    const pol = (deg) => [cx + R * Math.cos(deg * Math.PI / 180), cy + R * Math.sin(deg * Math.PI / 180)];
    const [sx, sy] = pol(a0), [ex, ey] = pol(a1), [px, py] = pol(ang);
    let segs = "";
    for (let i = 0; i < stops.length; i++) {
      const f0 = clamp((stops[i][0] - min) / (max - min), 0, 1);
      const f1 = i + 1 < stops.length ? clamp((stops[i + 1][0] - min) / (max - min), 0, 1) : 1;
      if (f1 <= f0) continue;
      const [ax, ay] = pol(a0 + f0 * (a1 - a0)), [bx, by] = pol(a0 + f1 * (a1 - a0));
      const large = (f1 - f0) * 270 > 180 ? 1 : 0;
      segs += `<path d="M${ax.toFixed(1)},${ay.toFixed(1)} A${R},${R} 0 ${large} 1 ${bx.toFixed(1)},${by.toFixed(1)}" stroke="${stops[i][1]}" class="g-seg"/>`;
    }
    return `<svg viewBox="0 0 120 120" class="wx-gauge">
      <path d="M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 1 1 ${ex.toFixed(1)},${ey.toFixed(1)}" class="g-track-arc"/>
      ${segs}
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" class="g-dot"/>
    </svg>`;
  }
  function barMeter(pct) {
    const n = 12, filled = Math.round((pct / 100) * n);
    let bars = "";
    for (let i = 0; i < n; i++) bars += `<rect x="${i * 12 + 4}" y="10" width="7" height="50" rx="2" class="${i < filled ? "bm-on" : "bm-off"}"/>`;
    return `<svg viewBox="0 0 160 70" class="wx-bars">${bars}</svg>`;
  }
  function visBars(km) {
    if (km == null) return "";
    const rows = 6, on = clamp(Math.round((km / 20) * rows), 1, rows);
    let out = "";
    for (let i = 0; i < rows; i++) {
      const w = 30 + i * 22;
      out += `<rect x="${(160 - w) / 2}" y="${58 - i * 9}" width="${w}" height="5" rx="2.5" class="${rows - 1 - i < on ? "vb-on" : "vb-off"}"/>`;
    }
    return `<svg viewBox="0 0 160 70" class="wx-bars">${out}</svg>`;
  }
  function pressureSlider(hpa) {
    const frac = clamp((hpa - 970) / (1050 - 970), 0, 1);
    return `<svg viewBox="0 0 200 40" class="wx-slider" preserveAspectRatio="none">
      <rect x="4" y="16" width="192" height="8" rx="4" class="ps-track"/>
      <circle cx="${(4 + frac * 192).toFixed(1)}" cy="20" r="8" class="ps-thumb"/>
    </svg>`;
  }
  function ringFill(pct) {
    const r = 42, cir = 2 * Math.PI * r;
    return `<svg viewBox="0 0 120 120" class="wx-gauge">
      <circle cx="60" cy="60" r="${r}" class="rf-track"/>
      <circle cx="60" cy="60" r="${r}" class="rf-fill" transform="rotate(-90 60 60)"
        stroke-dasharray="${(cir * pct / 100).toFixed(1)} ${cir.toFixed(1)}"/>
    </svg>`;
  }
  function sunArc(sunrise, sunset) {
    const sr = new Date(sunrise).getTime(), ss = new Date(sunset).getTime(), now = Date.now();
    const frac = clamp((now - sr) / (ss - sr), 0, 1);
    const cx = 100, cy = 64, R = 78;
    const ang = Math.PI - frac * Math.PI;
    const px = cx + R * Math.cos(ang), py = cy - R * Math.sin(ang) * 0.62;
    return `<svg viewBox="0 0 200 74" class="wx-sunarc">
      <path d="M${cx - R},${cy} A${R},${R * 0.62} 0 0 1 ${cx + R},${cy}" class="sa-track"/>
      <path d="M${cx - R},${cy} A${R},${R * 0.62} 0 0 1 ${px.toFixed(1)},${py.toFixed(1)}" class="sa-done"/>
      <line x1="0" y1="${cy}" x2="200" y2="${cy}" class="sa-horizon"/>
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" class="sa-sun"/>
    </svg>`;
  }
  function pollenBars(v) {
    const lvl = clamp(Math.round(v / 20), 0, 5);
    let out = "";
    for (let i = 0; i < 5; i++) out += `<rect x="${i * 26 + 8}" y="${52 - i * 8}" width="16" height="${12 + i * 8}" rx="2" class="${i < lvl ? "pb-on" : "pb-off"}"/>`;
    return `<svg viewBox="0 0 150 70" class="wx-bars">${out}</svg>`;
  }
  function dayLenLabel(sr, ss) {
    const ms = new Date(ss) - new Date(sr);
    return `${Math.floor(ms / 3600000)} sa ${Math.round((ms % 3600000) / 60000)} dk`;
  }

  /* ---- ay evresi ---- */
  function moonPhase(date) {
    const syn = 29.53058867;
    const ref = Date.UTC(2000, 0, 6, 18, 14);
    let days = (date.getTime() - ref) / 86400000;
    let p = ((days % syn) + syn) % syn;
    const frac = p / syn;
    const illum = 0.5 * (1 - Math.cos(2 * Math.PI * frac));
    let name = "Yeni ay";
    if (frac < 0.03 || frac > 0.97) name = "Yeni ay";
    else if (frac < 0.22) name = "Hilal";
    else if (frac < 0.28) name = "İlk dördün";
    else if (frac < 0.47) name = "Şişkin ay (büyüyen)";
    else if (frac < 0.53) name = "Dolunay";
    else if (frac < 0.72) name = "Şişkin ay (küçülen)";
    else if (frac < 0.78) name = "Son dördün";
    else name = "Hilal (küçülen)";
    return { frac, illum, name };
  }
  function moonSvg(frac, size) {
    // 0..1: yeni→dolunay→yeni. terminator eğrisi.
    const r = 20, cx = 24, cy = 24;
    const k = Math.cos(2 * Math.PI * frac); // -1 dolunay, +1 yeni
    const rx = Math.abs(k) * r;
    const sweepOuter = frac < 0.5 ? 1 : 0;
    const sweepInner = k > 0 ? sweepOuter : 1 - sweepOuter;
    const lit = `M${cx},${cy - r} A${r},${r} 0 0 ${sweepOuter} ${cx},${cy + r} A${rx},${r} 0 0 ${sweepInner} ${cx},${cy - r} Z`;
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" class="wx-moonsvg">
      <circle cx="${cx}" cy="${cy}" r="${r}" class="moon-dark"/>
      <path d="${lit}" class="moon-lit"/>
    </svg>`;
  }

  /* ============================================================
     HARİTA
     ============================================================ */
  function setupMapLayers() {
    const wrap = $("wxMapLayers");
    if (!wrap) return;
    const layers = [["temp", "Sıcaklık"], ["humidity", "Nem"], ["wind", "Rüzgâr"], ["cloud", "Bulut"]];
    wrap.innerHTML = layers.map(([k, l]) => `<button class="wx-mchip${k === "temp" ? " active" : ""}" type="button" data-layer="${k}">${l}</button>`).join("");
    wrap.querySelectorAll(".wx-mchip").forEach((b) => b.addEventListener("click", () => {
      state.mapLayer = b.dataset.layer;
      wrap.querySelectorAll(".wx-mchip").forEach((x) => x.classList.toggle("active", x === b));
      drawCityMarkers();
      updateMapLegend();
    }));
  }
  function initMap() {
    if (state.mapReady) { setTimeout(() => state.map.invalidateSize(), 100); return; }
    state.mapReady = true;
    state.map = L.map("weatherMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.6);
    window.HavaMap.addBaseLayer(state.map);
    state.cityLayer = L.layerGroup().addTo(state.map);
    loadCityGrid();
    updateMapLegend();
  }
  async function loadCityGrid() {
    const cities = window.TR_CITIES || [];
    if (!cities.length) return;
    const lats = cities.map((c) => c.lat).join(",");
    const lons = cities.map((c) => c.lon).join(",");
    try {
      const r = await fetch(`${FORECAST_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,cloud_cover&timezone=Europe%2FIstanbul`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];
      state.cityRows = arr.map((d, i) => {
        const c = cities[i];
        if (!c || !d.current) return null;
        return { c, temp: d.current.temperature_2m, code: d.current.weather_code, humidity: d.current.relative_humidity_2m, wind: d.current.wind_speed_10m, cloud: d.current.cloud_cover };
      }).filter(Boolean);
      drawCityMarkers();
    } catch { /* sessiz */ }
    setInterval(async () => {
      try {
        const r = await fetch(`${FORECAST_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,cloud_cover&timezone=Europe%2FIstanbul`);
        const data = await r.json();
        const arr = Array.isArray(data) ? data : [data];
        state.cityRows = arr.map((d, i) => {
          const c = cities[i]; if (!c || !d.current) return null;
          return { c, temp: d.current.temperature_2m, code: d.current.weather_code, humidity: d.current.relative_humidity_2m, wind: d.current.wind_speed_10m, cloud: d.current.cloud_cover };
        }).filter(Boolean);
        drawCityMarkers();
      } catch {}
    }, REFRESH_MS);
  }
  function layerValueColor(row) {
    const L = state.mapLayer;
    if (L === "temp") return { v: `${round(row.temp)}°`, color: tempColor(row.temp) };
    if (L === "humidity") return { v: `%${round(row.humidity)}`, color: scale([[20, [214, 160, 100]], [50, [150, 175, 150]], [75, [120, 190, 190]], [100, [79, 120, 200]]], row.humidity) };
    if (L === "wind") return { v: `${round(row.wind)}`, color: scale([[0, [120, 190, 190]], [15, [150, 175, 150]], [30, [214, 160, 100]], [50, [200, 70, 70]]], row.wind) };
    if (L === "cloud") return { v: `%${round(row.cloud)}`, color: scale([[0, [90, 169, 222]], [50, [150, 160, 175]], [100, [110, 120, 135]]], row.cloud) };
    return { v: `${round(row.temp)}°`, color: tempColor(row.temp) };
  }
  function drawCityMarkers() {
    if (!state.cityLayer) return;
    state.cityLayer.clearLayers();
    state.cityRows.forEach((row) => {
      const { v, color } = layerValueColor(row);
      const active = row.c.name === state.loc.name;
      const html = `<div class="tm-wrap">
        <div class="tm-aura" style="background:${color}"></div>
        <div class="tm-dot ${active ? "tm-active" : ""}" style="background:${color}"><span>${v}</span></div>
      </div>`;
      const icon = L.divIcon({ className: "", html, iconSize: [60, 60], iconAnchor: [30, 30] });
      const m = L.marker([row.c.lat, row.c.lon], { icon }).addTo(state.cityLayer);
      m.bindPopup(`<div class="map-pop"><strong>${window.escapeHtml(row.c.name)}</strong><br/>${round(row.temp)}°C · ${window.WeatherWMO.label(row.code)}<br/>%${round(row.humidity)} nem · ${round(row.wind)} km/s</div>`);
      m.on("click", () => {
        state.loc = { name: row.c.name, lat: row.c.lat, lon: row.c.lon };
        saveJson("havasite_last_city", state.loc);
        state.archive = null;
        loadWeather();
      });
    });
  }
  function updateMapLegend() {
    const el = $("wxMapLegend"); if (!el) return;
    const map = {
      temp: ["Soğuk", "temp-bar", "Sıcak"], humidity: ["Kuru", "temp-bar", "Nemli"],
      wind: ["Sakin", "quake-bar", "Kuvvetli"], cloud: ["Açık", "temp-bar", "Kapalı"],
    };
    const [a, bar, b] = map[state.mapLayer] || map.temp;
    el.innerHTML = `<span>${a}</span><div class="legend-bar ${bar}"></div><span>${b}</span>`;
  }

  /* ============================================================
     AYLIK — takvim
     ============================================================ */
  function setupMonthNav() {
    $("wxMonthPrev") && $("wxMonthPrev").addEventListener("click", () => { state.monthOffset--; renderCalendar(); });
    $("wxMonthNext") && $("wxMonthNext").addEventListener("click", () => { state.monthOffset++; renderCalendar(); });
  }
  function forecastDayMap() {
    const map = {};
    if (!state.f) return map;
    const d = state.f.daily;
    d.time.forEach((t, i) => {
      map[t] = { hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], code: d.weather_code[i], pop: d.precipitation_probability_max[i] };
    });
    return map;
  }
  function normalDayMap() {
    // arşivden: her (ay-gün) için ortalama hi/lo
    const map = {};
    if (!state.archive || !state.archive.daily) return map;
    const a = state.archive.daily;
    const acc = {};
    a.time.forEach((t, i) => {
      const key = t.slice(5); // MM-DD
      if (!acc[key]) acc[key] = { hi: [], lo: [] };
      if (a.temperature_2m_max[i] != null) acc[key].hi.push(a.temperature_2m_max[i]);
      if (a.temperature_2m_min[i] != null) acc[key].lo.push(a.temperature_2m_min[i]);
    });
    Object.keys(acc).forEach((k) => {
      const avg = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
      map[k] = { hi: avg(acc[k].hi), lo: avg(acc[k].lo) };
    });
    return map;
  }
  function renderCalendar() {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + state.monthOffset);
    const y = base.getFullYear(), m = base.getMonth();
    $("wxMonthTitle").textContent = `${AY[m]} ${y}`;
    const fmap = forecastDayMap();
    const nmap = normalDayMap();

    const first = new Date(y, m, 1);
    let startDow = (first.getDay() + 6) % 7; // Pzt=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = iso(new Date());
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="wx-cal-cell is-empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isToday = ds === todayStr;
      let hi, lo, code, est = false;
      if (fmap[ds]) { hi = fmap[ds].hi; lo = fmap[ds].lo; code = fmap[ds].code; }
      else if (nmap[ds.slice(5)]) { hi = nmap[ds.slice(5)].hi; lo = nmap[ds.slice(5)].lo; est = true; }
      const inner = hi != null
        ? `${code != null ? window.WeatherWMO.svg(code, true) : ""}
           <span class="wcc-hi">${round(hi)}°</span><span class="wcc-lo">${round(lo)}°</span>`
        : `<span class="wcc-na">—</span>`;
      cells += `<div class="wx-cal-cell${isToday ? " is-today" : ""}${est ? " is-est" : ""}">
        <span class="wcc-day">${day}${est ? '<span class="wcc-tag">ort.</span>' : ""}</span>
        ${inner}
      </div>`;
    }
    $("wxCalendar").innerHTML = cells;
    window.hydrateIcons && window.hydrateIcons();
  }

  /* ============================================================
     EĞİLİMLER — arşiv verisi
     ============================================================ */
  async function ensureArchive() {
    const key = `${state.loc.lat.toFixed(2)},${state.loc.lon.toFixed(2)}`;
    if (state.archive && state.archiveKey === key) { renderEgilim(); renderCalendar(); return; }
    const end = new Date(Date.now() - 6 * 86400000);
    const start = new Date(end); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() - 5);
    const p = new URLSearchParams({
      latitude: state.loc.lat, longitude: state.loc.lon,
      start_date: iso(start), end_date: iso(end),
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code",
      timezone: "Europe/Istanbul",
    });
    try {
      state.archive = await fetch(`${ARCHIVE_URL}?${p}`).then((r) => r.json());
      state.archiveKey = key;
      renderEgilim();
      renderCalendar();
    } catch {
      $("wxBandChart").innerHTML = `<div class="sr-empty" style="padding:24px;color:var(--text-muted)">Geçmiş veri alınamadı.</div>`;
    }
  }

  function renderEgilim() {
    const a = state.archive && state.archive.daily;
    if (!a) return;
    const n = a.time.length;

    // 30 günlük hareketli ortalama
    const rollHi = rolling(a.temperature_2m_max, 30);
    const rollLo = rolling(a.temperature_2m_min, 30);

    // band chart
    drawBandChart(a, rollHi, rollLo);

    // donut: son 30 gün hava türü
    const last30 = a.weather_code.slice(-30);
    let clearC = 0, wetC = 0;
    last30.forEach((code) => {
      const cat = window.WeatherWMO.category(code);
      if (["rain", "snow", "drizzle", "storm"].includes(cat)) wetC++; else clearC++;
    });
    const avgHi = avg(a.temperature_2m_max.slice(-30));
    const avgLo = avg(a.temperature_2m_min.slice(-30));
    $("wxDonut").innerHTML = `
      <h3>Son 30 gün</h3>
      <div class="wx-donut-body">
        ${donutSvg(clearC, wetC)}
        <ul class="wx-donut-legend">
          <li><span class="dl-dot dl-clear"></span> Güneşli / bulutlu <strong>${clearC} gün</strong></li>
          <li><span class="dl-dot dl-wet"></span> Yağmurlu / karlı <strong>${wetC} gün</strong></li>
          <li><span class="dl-dot dl-hi"></span> Ort. en yüksek <strong>${round(avgHi)}°</strong></li>
          <li><span class="dl-dot dl-lo"></span> Ort. en düşük <strong>${round(avgLo)}°</strong></li>
        </ul>
      </div>`;

    // iklim bilgileri (aylık toplam/ortalama)
    const byMonth = {};
    a.time.forEach((t, i) => {
      const key = t.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = { hi: [], lo: [], pr: 0, wind: [] };
      byMonth[key].hi.push(a.temperature_2m_max[i]);
      byMonth[key].lo.push(a.temperature_2m_min[i]);
      byMonth[key].pr += a.precipitation_sum[i] || 0;
      byMonth[key].wind.push(a.wind_speed_10m_max[i]);
    });
    const months = Object.keys(byMonth).slice(-12);
    let hottest = null, coldest = null, wettest = null, windiest = null;
    months.forEach((k) => {
      const mm = byMonth[k];
      const mHi = avg(mm.hi), mLo = avg(mm.lo), mWind = avg(mm.wind);
      if (!hottest || mHi > hottest.v) hottest = { k, v: mHi };
      if (!coldest || mLo < coldest.v) coldest = { k, v: mLo };
      if (!wettest || mm.pr > wettest.v) wettest = { k, v: mm.pr };
      if (!windiest || mWind > windiest.v) windiest = { k, v: mWind };
    });
    const mn = (k) => AY[+k.slice(5, 7) - 1];
    $("wxClimate").innerHTML = `
      <h3>İklim bilgileri (son 12 ay)</h3>
      <div class="wx-clim-grid">
        <div class="wx-clim-row"><span class="wcr-ic">${window.HavaIcon("thermometer", { size: 15 })}</span><span>En sıcak ay</span><strong>${mn(hottest.k)} (${round(hottest.v)}°)</strong></div>
        <div class="wx-clim-row"><span class="wcr-ic">${window.HavaIcon("thermometer", { size: 15 })}</span><span>En soğuk ay</span><strong>${mn(coldest.k)} (${round(coldest.v)}°)</strong></div>
        <div class="wx-clim-row"><span class="wcr-ic">${window.HavaIcon("droplet", { size: 15 })}</span><span>En yağışlı ay</span><strong>${mn(wettest.k)} (${round(wettest.v)} mm)</strong></div>
        <div class="wx-clim-row"><span class="wcr-ic">${window.HavaIcon("wind", { size: 15 })}</span><span>En rüzgârlı ay</span><strong>${mn(windiest.k)} (${round(windiest.v)} km/s)</strong></div>
      </div>`;

    // günlük özet tablosu
    const summary = [
      ["Yüksek sıcaklık (°C)", a.temperature_2m_max],
      ["Düşük sıcaklık (°C)", a.temperature_2m_min],
      ["Yağış (mm)", a.precipitation_sum],
      ["Rüzgâr (km/s)", a.wind_speed_10m_max],
    ];
    $("wxTables").innerHTML = `
      <div class="card wx-table-card">
        <h3>Günlük özet (son 12 ay)</h3>
        <table class="wx-table">
          <thead><tr><th></th><th>Maks.</th><th>Ort.</th><th>Min.</th></tr></thead>
          <tbody>${summary.map(([lbl, arr]) => {
            const clean = arr.filter((x) => x != null);
            return `<tr><td>${lbl}</td><td>${round(Math.max(...clean))}</td><td>${(avg(clean)).toFixed(1)}</td><td>${round(Math.min(...clean))}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>`;
    window.hydrateIcons && window.hydrateIcons();
  }
  function rolling(arr, w) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const s = Math.max(0, i - w + 1);
      let sum = 0, c = 0;
      for (let j = s; j <= i; j++) if (arr[j] != null) { sum += arr[j]; c++; }
      out.push(c ? sum / c : null);
    }
    return out;
  }
  function avg(arr) { const c = arr.filter((x) => x != null); return c.reduce((s, x) => s + x, 0) / (c.length || 1); }

  function drawBandChart(a, rollHi, rollLo) {
    const W = 1000, H = 320, padL = 34, padR = 10, padT = 20, padB = 40;
    const n = a.time.length;
    const allV = [...a.temperature_2m_max, ...a.temperature_2m_min].filter((x) => x != null);
    let mn = Math.floor(Math.min(...allV) / 5) * 5 - 2;
    let mx = Math.ceil(Math.max(...allV) / 5) * 5 + 2;
    const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - mn) / (mx - mn)) * (H - padT - padB);

    const hiPath = a.temperature_2m_max.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const loPath = a.temperature_2m_min.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().map((p, i) => `${i ? "L" : "L"}${p}`).join(" ");
    const band = `${hiPath} ${loPath} Z`;

    const rHi = rollHi.map((v, i) => v == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const rLo = rollLo.map((v, i) => v == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    // y ekseni
    let yaxis = "";
    for (let t = Math.ceil(mn / 10) * 10; t <= mx; t += 10) {
      yaxis += `<line x1="${padL}" y1="${y(t).toFixed(1)}" x2="${W - padR}" y2="${y(t).toFixed(1)}" class="bc-grid"/>
        <text x="${padL - 6}" y="${(y(t) + 3).toFixed(1)}" class="bc-yt">${t}°</text>`;
    }
    // x ekseni (ay isimleri)
    let xaxis = "";
    let lastM = -1;
    a.time.forEach((t, i) => {
      const d = new Date(t);
      if (d.getMonth() !== lastM) {
        lastM = d.getMonth();
        xaxis += `<text x="${x(i).toFixed(1)}" y="${H - 14}" class="bc-xt">${AY_KISA[lastM]}</text>`;
        xaxis += `<line x1="${x(i).toFixed(1)}" y1="${padT}" x2="${x(i).toFixed(1)}" y2="${H - padB}" class="bc-vgrid"/>`;
      }
    });
    // bugün çizgisi
    const nowX = x(n - 1);

    $("wxBandChart").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="bc-svg" preserveAspectRatio="none">
        ${yaxis}${xaxis}
        <path d="${band}" class="bc-band"/>
        <path d="${a.temperature_2m_max.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" class="bc-hi"/>
        <path d="${a.temperature_2m_min.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" class="bc-lo"/>
        <path d="${rHi}" class="bc-roll"/>
        <path d="${rLo}" class="bc-roll"/>
        <line x1="${nowX.toFixed(1)}" y1="${padT}" x2="${nowX.toFixed(1)}" y2="${H - padB}" class="bc-now"/>
        <text x="${(nowX - 4).toFixed(1)}" y="${padT - 6}" class="bc-nowt" text-anchor="end">Bugün</text>
      </svg>`;
  }

  function donutSvg(clear, wet) {
    const total = clear + wet || 1;
    const r = 46, cir = 2 * Math.PI * r;
    const c1 = (clear / total) * cir;
    return `<svg viewBox="0 0 120 120" class="wx-donut-svg">
      <circle cx="60" cy="60" r="${r}" class="dn-track"/>
      <circle cx="60" cy="60" r="${r}" class="dn-clear" transform="rotate(-90 60 60)" stroke-dasharray="${c1.toFixed(1)} ${cir.toFixed(1)}"/>
      <circle cx="60" cy="60" r="${r}" class="dn-wet" transform="rotate(${-90 + (clear / total) * 360} 60 60)" stroke-dasharray="${(cir - c1).toFixed(1)} ${cir.toFixed(1)}"/>
      <text x="60" y="56" class="dn-big">${total}</text>
      <text x="60" y="72" class="dn-small">gün</text>
    </svg>`;
  }

  /* ============================================================
     hava sahnesi (page-head arka planı)
     ============================================================ */
  const SCENE = {
    "clear-day": "linear-gradient(160deg, color-mix(in srgb, #d6a064 12%, transparent), transparent 70%)",
    "clear-night": "linear-gradient(160deg, rgba(27,42,74,0.4), transparent 70%)",
    "cloudy-day": "linear-gradient(160deg, rgba(120,135,150,0.16), transparent 70%)",
    "cloudy-night": "linear-gradient(160deg, rgba(30,40,55,0.4), transparent 70%)",
    "rain-day": "linear-gradient(160deg, rgba(59,120,180,0.2), transparent 70%)",
    "rain-night": "linear-gradient(160deg, rgba(20,40,66,0.45), transparent 70%)",
    "snow-day": "linear-gradient(160deg, rgba(200,220,235,0.24), transparent 70%)",
    "storm-day": "linear-gradient(160deg, rgba(60,55,90,0.3), transparent 70%)",
  };
  function applyWeatherScene(code, isDay) {
    const scene = $("weatherScene");
    if (!scene) return;
    const cat = window.WeatherWMO.category(code);
    scene.dataset.cat = cat;
    scene.dataset.day = isDay ? "day" : "night";
    const key = `${["drizzle"].includes(cat) ? "rain" : cat}-${isDay ? "day" : "night"}`;
    scene.style.setProperty("--scene-bg", SCENE[key] || SCENE["cloudy-day"]);
  }

  /* ---------------- arama + konum ---------------- */
  let searchTimer = null;
  function setupSearch() {
    const input = $("citySearch"), results = $("searchResults");
    if (!input) return;
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.hidden = true; return; }
      searchTimer = setTimeout(() => run(q), 300);
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) results.hidden = true; });
    async function run(q) {
      try {
        const r = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=tr&format=json`);
        const data = await r.json();
        const items = (data.results || []).filter((c) => c.country_code === "TR");
        render(items.length ? items : (data.results || []).slice(0, 6));
      } catch { render([]); }
    }
    function render(items) {
      if (!items.length) { results.innerHTML = `<div class="sr-empty">Sonuç yok.</div>`; results.hidden = false; return; }
      results.innerHTML = items.map((c, i) => `<div class="sr-item" data-i="${i}">${window.escapeHtml(c.name)}${c.admin1 ? ", " + window.escapeHtml(c.admin1) : ""}</div>`).join("");
      results.hidden = false;
      results.querySelectorAll(".sr-item").forEach((el, i) => el.addEventListener("click", () => {
        const c = items[i];
        state.loc = { name: c.name, lat: c.latitude, lon: c.longitude };
        saveJson("havasite_last_city", state.loc);
        state.archive = null;
        results.hidden = true; input.value = "";
        loadWeather();
      }));
    }
  }
  function useGeolocation() {
    if (!navigator.geolocation) { window.showToast("Tarayıcın konum servisini desteklemiyor."); return; }
    window.showToast("Konumun alınıyor…");
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const near = window.nearestCity ? window.nearestCity(latitude, longitude) : null;
      state.loc = { name: (near && near.city && near.city.name) || "Konumum", lat: latitude, lon: longitude };
      state.archive = null;
      loadWeather();
    }, () => window.showToast("Konum izni alınamadı."), { timeout: 8000 });
  }
})();
