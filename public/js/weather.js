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
    map: null, labelLayer: null, provLayer: null, mapReady: false, cityByName: null, labels: null,
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
      // yeni bir cihazda hesaptaki favori sehir oturum gelince ogrenilir
      document.addEventListener("havaprefs:sync", () => {
        const fav2 = window.HavaPrefs.get().favoriteCity;
        const c2 = fav2 && (window.TR_CITIES || []).find((x) => x.name === fav2);
        if (c2 && (!state.loc || state.loc.name !== c2.name) && !safeJson("havasite_last_city")) {
          state.loc = { name: c2.name, lat: c2.lat, lon: c2.lon };
          loadWeather();
        }
      }, { once: true });
    }

    const wantView = (new URLSearchParams(location.search).get("v") || location.hash.slice(1) || "").toLowerCase();
    if (["genel", "saatlik", "ayrinti", "harita", "aylik", "egilim", "modeller"].includes(wantView)) state.view = wantView;

    setupTabs();
    setupSearch();
    setupPicker();
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
    $("wcCity").textContent = state.loc.region ? `${state.loc.name}, ${state.loc.region}` : state.loc.name;

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
    if (v === "modeller") renderModels();
    window.hydrateIcons && window.hydrateIcons();
  }

  /* ---------------- üst başlık + şehir şeridi ---------------- */
  function renderCurrentHeader() {
    const c = state.f.current, d = state.f.daily, di = todayIndex();
    const isDay = c.is_day === 1;
    applyWeatherScene(c.weather_code, isDay);
    $("wcIcon").innerHTML = window.WeatherWMO.svg(c.weather_code, isDay);
    if ($("phWxIcon")) $("phWxIcon").innerHTML = window.WeatherWMO.svg(c.weather_code, isDay);
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
    renderNextHours();
  }
  // baslik kartinin sagi: siradaki 8 saat + gun dogumu/batimi
  function renderNextHours() {
    const h = state.f.hourly, d = state.f.daily, ni = nowIndex(), di = todayIndex();
    const el = $("wcNext");
    if (!el) return;
    const items = [];
    const c = state.f.current;
    // ilk kutu anlik olcum ("Simdi"), ardindan simdiden sonraki 7 tam saat
    const nowT = new Date(c.time).getTime();
    const first = new Date(h.time[ni]).getTime() > nowT ? ni : ni + 1;
    const cell = (label, code, day, temp, pop, now) => `<div class="wx-nh${now ? " now" : ""}">
        <span class="nh-t">${label}</span>
        <span class="nh-ic">${window.WeatherWMO.svg(code, day)}</span>
        <b class="nh-v">${round(temp)}°</b>
        <span class="nh-p">${pop >= 20 ? `%${pop}` : ""}</span>
      </div>`;
    const pp = h.precipitation_probability || [];
    items.push(cell("Şimdi", c.weather_code, c.is_day === 1, c.temperature_2m, pp[ni], true));
    for (let i = first; i < Math.min(first + 7, h.time.length); i++) {
      items.push(cell(fmtHM(h.time[i]), h.weather_code[i], h.is_day ? h.is_day[i] === 1 : true, h.temperature_2m[i], pp[i], false));
    }
    el.innerHTML = items.join("");
    const sun = $("wcSun");
    if (sun && d.sunrise && d.sunrise[di]) {
      sun.innerHTML = `${window.HavaIcon ? window.HavaIcon("sun", { size: 13 }) : ""}${fmtHM(d.sunrise[di])}<span class="wx-dot">·</span>${window.HavaIcon ? window.HavaIcon("moon", { size: 13 }) : ""}${fmtHM(d.sunset[di])}`;
    }
  }
  function setFlash(id, val) {
    const el = $(id); if (!el) return;
    const t = String(val);
    if (el.textContent !== t) { el.textContent = t; window.flashUpdate && window.flashUpdate(el); }
  }

  async function loadCityData() {
    const wrap = $("wxCities");
    try {
      const d = await window.HavaCityWeather();
      // sunucu onbelleginden; eski alan adlariyla (Open-Meteo 'current' bicimi) eslenir
      const arr = QUICK_CITIES.map((c) => { const x = d.byName.get(c.name); return x ? { current: { temperature_2m: x.temp, weather_code: x.code, is_day: x.isDay ? 1 : 0 } } : null; });
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
      // sayfa girisindeki yuzen sehir kartlari (secili sehir haric ilk uc)
      QUICK_CITIES.map((c, i) => ({ c, cur: arr[i] && arr[i].current })).filter((x) => x.cur && x.c.name !== state.loc.name).slice(0, 3).forEach(({ c, cur }, i) => {
        const el = $(`phC${i}`);
        if (!el) return;
        el.innerHTML = `<span class="ic-box" style="--c: var(--c-weather)">${window.WeatherWMO.svg(cur.weather_code, cur.is_day === 1)}</span><div><b>${round(cur.temperature_2m)}°</b><small>${c.name} · ${window.WeatherWMO.label(cur.weather_code)}</small></div>`;
        el.hidden = false;
      });
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
    drawGradientChart($("wxGChart"), buildSeries("temp", 48), { unit: "°C" });
    drawRainChart($("wxRainChart"), 48);

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
    { key: "temp", label: "Sıcaklık", unit: "°C", field: "temperature_2m", colorByTemp: true, color: "#f87171" },
    { key: "feels", label: "Hissedilen", unit: "°C", field: "apparent_temperature", colorByTemp: true, color: "#fb923c" },
    { key: "pop", label: "Yağış olasılığı", unit: "%", field: "precipitation_probability", color: "#34d399", min: 0, max: 100 },
    { key: "precip", label: "Yağış", unit: " mm", field: "precipitation", color: "#38bdf8", beginAtZero: true },
    { key: "wind", label: "Rüzgâr", unit: " km/s", field: "wind_speed_10m", color: "#2dd4bf", beginAtZero: true },
    { key: "humidity", label: "Nem", unit: "%", field: "relative_humidity_2m", color: "#60a5fa", min: 0, max: 100 },
    { key: "cloud", label: "Bulut örtüsü", unit: "%", field: "cloud_cover", color: "#94a3b8", min: 0, max: 100 },
    { key: "pressure", label: "Basınç", unit: " hPa", field: "pressure_msl", color: "#a78bfa" },
    { key: "uv", label: "UV", unit: "", field: "uv_index", color: "#fbbf24", beginAtZero: true },
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
    drawGradientChart($("wxHourlyChart"), series, { unit: m.unit, height: 320 });

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
     SAATLIK GRAFIKLER (Chart.js — js/charts.js)
     ============================================================ */
  function hourLabel(t, i) {
    const dt = new Date(t);
    if (i === 0) return "Şimdi";
    if (dt.getHours() === 0) return `${dt.getDate()} ${AY_KISA[dt.getMonth()]}`;
    return `${String(dt.getHours()).padStart(2, "0")}:00`;
  }
  function hourTitle(t, i) {
    const dt = new Date(t);
    return `${i === 0 ? "Şimdi · " : ""}${dt.getDate()} ${AY_KISA[dt.getMonth()]} ${String(dt.getHours()).padStart(2, "0")}:00`;
  }

  // kucuk sparkline'lar (Ayrintilar kartlari) icin yumusak egri
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

  function drawGradientChart(container, series, opts) {
    if (!container || !series.vals || series.vals.length < 2) return;
    opts = opts || {};
    const m = series.m;
    window.HavaChart.line(container, {
      labels: series.times.map(hourLabel),
      datasets: [{ label: m.label, data: series.vals.map((v) => (v == null ? null : Math.round(v * 10) / 10)), color: m.color || "#38bdf8", fill: true }],
      unit: opts.unit != null ? opts.unit : m.unit,
      height: opts.height || 280,
      min: m.min, max: m.max, beginAtZero: m.beginAtZero,
      tooltipTitle: (i) => hourTitle(series.times[i], i),
      tooltipExtra: (i) => {
        const lines = [" " + window.WeatherWMO.label(series.codes[i])];
        if (m.key !== "pop" && series.pop[i] >= 10) lines.push(` Yağış ihtimali: %${series.pop[i]}`);
        return lines;
      },
    });
  }

  // gonderilen ornekteki gibi: saatlik yagis miktari (cubuk) + ihtimal (cizgi)
  function drawRainChart(container, hours) {
    if (!container) return;
    const h = state.f.hourly, s = nowIndex();
    const n = Math.min(hours, h.time.length - s);
    const times = h.time.slice(s, s + n);
    window.HavaChart.rain(container, {
      labels: times.map(hourLabel),
      amount: (h.precipitation || []).slice(s, s + n).map((v) => (v == null ? 0 : Math.round(v * 10) / 10)),
      probability: (h.precipitation_probability || []).slice(s, s + n),
      tooltipTitle: (i) => hourTitle(times[i], i),
      height: 280,
    });
    const total = (h.precipitation || []).slice(s, s + n).reduce((a, v) => a + (v || 0), 0);
    const maxP = Math.max(0, ...(h.precipitation_probability || []).slice(s, s + n));
    const hint = $("wxRainHint");
    if (hint) hint.textContent = `Önümüzdeki ${n} saat · toplam ${total.toFixed(1)} mm · en yüksek ihtimal %${maxP}`;
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
     HARİTA — il sınırları seçilen değere göre renklenir, il etiketleri
     çakışmayacak şekilde seyreltilir (öncelik: seçili il, büyük şehirler).
     Sınırlar: geoBoundaries (© OpenStreetMap katkıcıları, CC BY-SA)
     ============================================================ */
  const TR_BOUNDS = [[35.8, 25.7], [42.1, 44.8]];
  const MAP_LAYERS = {
    temp: { label: "Sıcaklık", unit: "°C", key: "temp", fmt: (v) => `${round(v)}°`, hi: "En sıcak", lo: "En soğuk",
      stops: [[-10, [124, 92, 214]], [0, [64, 132, 232]], [8, [45, 182, 214]], [15, [72, 196, 140]], [21, [226, 206, 80]], [27, [242, 146, 52]], [34, [226, 64, 64]], [40, [168, 34, 74]]] },
    humidity: { label: "Nem", unit: "%", key: "humidity", fmt: (v) => `%${round(v)}`, hi: "En nemli", lo: "En kuru",
      stops: [[10, [214, 150, 80]], [35, [222, 200, 110]], [55, [92, 196, 160]], [75, [52, 160, 220]], [100, [72, 92, 214]]] },
    wind: { label: "Rüzgâr", unit: "km/s", key: "wind", fmt: (v) => `${round(v)}`, hi: "En rüzgârlı", lo: "En sakin",
      stops: [[0, [72, 170, 200]], [10, [92, 196, 140]], [20, [226, 206, 80]], [35, [242, 128, 52]], [55, [214, 52, 80]], [75, [150, 60, 190]]] },
    cloud: { label: "Bulut", unit: "%", key: "cloud", fmt: (v) => `%${round(v)}`, hi: "En bulutlu", lo: "En açık",
      stops: [[0, [64, 150, 232]], [40, [120, 160, 200]], [80, [150, 160, 176]], [100, [196, 200, 210]]] },
  };
  const MAP_PRIORITY = ["İstanbul", "Ankara", "İzmir", "Antalya", "Bursa", "Adana", "Konya", "Gaziantep", "Diyarbakır", "Samsun", "Trabzon", "Erzurum", "Van", "Kayseri", "Eskişehir", "Mersin", "Şanlıurfa", "Malatya", "Sivas", "Edirne", "Muğla", "Kastamonu", "Hatay"];
  const mapMeta = () => MAP_LAYERS[state.mapLayer] || MAP_LAYERS.temp;
  const mapColor = (row) => scale(mapMeta().stops, row[mapMeta().key]);
  const activeProvince = () => state.loc.region || state.loc.name;

  function setupMapLayers() {
    const wrap = $("wxMapLayers");
    if (!wrap) return;
    wrap.innerHTML = Object.entries(MAP_LAYERS).map(([k, m]) => `<button class="wx-mchip${k === state.mapLayer ? " active" : ""}" type="button" data-layer="${k}">${m.label}</button>`).join("");
    wrap.querySelectorAll(".wx-mchip").forEach((b) => b.addEventListener("click", () => {
      state.mapLayer = b.dataset.layer;
      wrap.querySelectorAll(".wx-mchip").forEach((x) => x.classList.toggle("active", x === b));
      paintMap();
      updateMapLegend();
    }));
  }
  function initMap() {
    if (state.mapReady) { setTimeout(() => { state.map.invalidateSize(); paintMap(); }, 100); return; }
    state.mapReady = true;
    const map = L.map("weatherMap", { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 4.5, maxZoom: 10, maxBounds: [[32, 20], [46, 50]], maxBoundsViscosity: 0.8 });
    state.map = map;
    L.control.zoom({ position: "topright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(map);
    // genis ekranda soldaki ozet paneli ve alttaki olcek Turkiye'nin ustune binmesin
    const wide = window.innerWidth > 700;
    map.fitBounds(TR_BOUNDS, wide ? { paddingTopLeft: [200, 10], paddingBottomRight: [10, 40] } : { padding: [6, 6] });
    window.HavaMap.addBaseLayer(map, { labels: false });
    map.attributionControl.addAttribution("Sınırlar: geoBoundaries");
    // sayfa kaydirilirken harita tekerlegi yakalamasin; haritaya tiklayinca acilir
    map.once("click", () => map.scrollWheelZoom.enable());
    state.labelLayer = L.layerGroup().addTo(map);
    map.on("zoomend", () => map.getContainer().classList.toggle("show-names", map.getZoom() >= 7));
    map.on("moveend", declutterLabels);
    loadMapData();
    updateMapLegend();
  }
  async function refreshCityRows() {
    try {
      const d = await window.HavaCityWeather();
      state.cityRows = d.data.map((x) => ({ c: { name: x.name, lat: x.lat, lon: x.lon }, temp: x.temp, code: x.code, humidity: x.humidity, wind: x.wind, cloud: x.cloud }));
      state.cityByName = new Map(state.cityRows.map((row) => [row.c.name, row]));
      state.mapUpdated = new Date(d.updated);
    } catch { /* sessiz */ }
  }
  async function loadMapData() {
    const geoP = fetch("/data/tr-iller.geojson").then((r) => r.json()).catch(() => null);
    await refreshCityRows();
    const geo = await geoP;
    if (geo) {
      state.provLayer = L.geoJSON(geo, {
        style: provStyle,
        onEachFeature: (f, layer) => {
          layer.on({ mouseover: () => layer.bringToFront(), click: () => pickCity(f.properties.n) });
          layer.bindTooltip(() => provTooltip(f.properties.n), { sticky: true, direction: "top", offset: [0, -10], className: "prov-tip" });
        },
      }).addTo(state.map);
    }
    paintMap();
    setInterval(async () => { await refreshCityRows(); paintMap(); }, REFRESH_MS);
  }
  function provStyle(f) {
    const row = state.cityByName && state.cityByName.get(f.properties.n);
    const active = f.properties.n === activeProvince();
    return { className: "prov", fillColor: row ? mapColor(row) : "#55606e", fillOpacity: active ? 0.85 : 0.6, weight: active ? 2.5 : 0.8, color: active ? "#ffffff" : "#0b1626" };
  }
  function provTooltip(name) {
    const row = state.cityByName && state.cityByName.get(name);
    if (!row) return window.escapeHtml(name);
    return `<strong>${window.escapeHtml(name)}</strong><span class="pt-main">${round(row.temp)}°C · ${window.WeatherWMO.label(row.code)}</span><span class="pt-sub">%${round(row.humidity)} nem · ${round(row.wind)} km/s rüzgâr · %${round(row.cloud)} bulut</span>`;
  }
  function pickCity(name) {
    const row = state.cityByName && state.cityByName.get(name);
    if (!row) return;
    selectPlace({ name: row.c.name, lat: row.c.lat, lon: row.c.lon });
    paintMap();
    window.showToast && window.showToast(`${row.c.name} seçildi — ayrıntılar Genel sekmesinde.`);
  }
  function paintMap() {
    if (!state.map) return;
    if (state.provLayer) {
      state.provLayer.setStyle(provStyle);
      state.provLayer.eachLayer((l) => { if (l.feature.properties.n === activeProvince()) l.bringToFront(); });
    }
    drawLabels();
    renderMapStats();
  }
  function drawLabels() {
    if (!state.labelLayer) return;
    state.labelLayer.clearLayers();
    const meta = mapMeta();
    const act = activeProvince();
    state.labels = state.cityRows.map((row) => {
      const active = row.c.name === act;
      const html = `<div class="pl${active ? " pl-active" : ""}"><b>${meta.fmt(row[meta.key])}</b><span>${window.escapeHtml(row.c.name)}</span></div>`;
      const m = L.marker([row.c.lat, row.c.lon], { icon: L.divIcon({ className: "pl-anchor", html, iconSize: [0, 0] }), title: row.c.name, riseOnHover: true })
        .on("click", () => pickCity(row.c.name))
        .addTo(state.labelLayer);
      const pri = MAP_PRIORITY.indexOf(row.c.name);
      return { m, active, rank: active ? -1 : pri === -1 ? 100 : pri };
    });
    declutterLabels();
  }
  function declutterLabels() {
    if (!state.labels || !state.map) return;
    const placed = [];
    [...state.labels].sort((a, b) => a.rank - b.rank).forEach((it) => {
      const el = it.m.getElement();
      const box = el && el.firstElementChild;
      if (!box) return;
      const p = state.map.latLngToContainerPoint(it.m.getLatLng());
      const w = box.offsetWidth / 2 + 3, h = box.offsetHeight / 2 + 3;
      const r = { x1: p.x - w, x2: p.x + w, y1: p.y - h, y2: p.y + h };
      const hit = !it.active && placed.some((q) => r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1);
      el.classList.toggle("pl-hidden", hit);
      if (!hit) placed.push(r);
    });
  }
  function renderMapStats() {
    const el = $("wxMapStats");
    if (!el || !state.cityRows.length) return;
    const meta = mapMeta();
    const vals = state.cityRows.filter((r) => Number.isFinite(r[meta.key]));
    if (!vals.length) return;
    const hi = vals.reduce((a, b) => (b[meta.key] > a[meta.key] ? b : a));
    const lo = vals.reduce((a, b) => (b[meta.key] < a[meta.key] ? b : a));
    const avg = vals.reduce((s, r) => s + r[meta.key], 0) / vals.length;
    const t = state.mapUpdated ? state.mapUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "";
    const chip = (lbl, row) => `<button type="button" class="ms-item" data-city="${window.escapeHtml(row.c.name)}"><span>${lbl}</span><b>${window.escapeHtml(row.c.name)} <i style="color:${mapColor(row)}">${meta.fmt(row[meta.key])}</i></b></button>`;
    el.innerHTML = `${chip(meta.hi, hi)}${chip(meta.lo, lo)}
      <div class="ms-item"><span>Türkiye ortalaması</span><b>${meta.fmt(avg)}${meta.key === "wind" ? " km/s" : ""}</b></div>
      <div class="ms-live"><i></i>Canlı · ${t}</div>`;
    el.querySelectorAll("button[data-city]").forEach((b) => b.addEventListener("click", () => {
      const row = state.cityByName.get(b.dataset.city);
      if (row) state.map.flyTo([row.c.lat, row.c.lon], 7.25, { duration: 0.8 });
    }));
  }
  function updateMapLegend() {
    const el = $("wxMapLegend"); if (!el) return;
    const meta = mapMeta();
    const s = meta.stops, min = s[0][0], max = s[s.length - 1][0];
    const pos = (v) => ((v - min) / (max - min)) * 100;
    const grad = s.map(([v, c]) => `${rgb(c)} ${pos(v).toFixed(1)}%`).join(", ");
    el.innerHTML = `<span class="ml-title">${meta.label} <small>${meta.unit}</small></span>
      <div class="ml-scale"><div class="ml-bar" style="background:linear-gradient(90deg, ${grad})"></div>
      <div class="ml-ticks">${s.map(([v]) => `<span style="left:${pos(v).toFixed(1)}%">${v}</span>`).join("")}</div></div>`;
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
      <h3><span class="h-icon">${window.HavaIcon("pie", { size: 17 })}</span>Son 30 gün</h3>
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
      <h3><span class="h-icon">${window.HavaIcon("mountains", { size: 17 })}</span>İklim bilgileri (son 12 ay)</h3>
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
        <h3><span class="h-icon">${window.HavaIcon("table", { size: 17 })}</span>Günlük özet (son 12 ay)</h3>
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
    const r1 = (arr) => arr.map((v) => (v == null ? null : Math.round(v * 10) / 10));
    window.HavaChart.line($("wxBandChart"), {
      labels: a.time.map((t) => { const d = new Date(t); return `${d.getDate()} ${AY_KISA[d.getMonth()]}`; }),
      datasets: [
        { label: "En düşük", data: r1(a.temperature_2m_min), color: "#60a5fa", width: 1.5 },
        { label: "En yüksek", data: r1(a.temperature_2m_max), color: "#f87171", width: 1.5, fill: "between" },
        { label: "30 gün ort. (yüksek)", data: r1(rollHi), color: "#fca5a5", dashed: true, width: 2 },
        { label: "30 gün ort. (düşük)", data: r1(rollLo), color: "#93c5fd", dashed: true, width: 2 },
      ],
      unit: "°C",
      height: 320,
      legend: true,
      tooltipTitle: (i) => { const d = new Date(a.time[i]); return `${d.getDate()} ${AY_KISA[d.getMonth()]} ${d.getFullYear()}`; },
    });
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
  /* ============================================================
     MODELLER: 6 sayisal modelin 3 gunluk yagis/sicaklik beklentisi
     (Open-Meteo, tek istekte coklu model)
     ============================================================ */
  const MODELS = [
    { id: "ecmwf_ifs025", name: "ECMWF", org: "Avrupa" },
    { id: "gfs_seamless", name: "GFS", org: "ABD" },
    { id: "icon_seamless", name: "ICON", org: "Almanya" },
    { id: "meteofrance_seamless", name: "ARPEGE", org: "Fransa" },
    { id: "gem_seamless", name: "GEM", org: "Kanada" },
    { id: "ukmo_seamless", name: "UKMO", org: "İngiltere" },
  ];
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const fmtMm = (v) => (v == null ? "—" : `${v.toFixed(1)} mm`);
  function dayShort(iso) { const d = new Date(`${iso}T12:00:00`); return `${d.getDate()} ${AY_KISA[d.getMonth()]}`; }
  // bilgi amacli siniflama (24 saatlik toplam, mm)
  function rainLabel(mm) {
    if (mm == null || mm < 0.5) return null;
    if (mm < 5) return { text: "Hafif yağış", cls: "lv-1" };
    if (mm < 20) return { text: "Orta şiddette yağış", cls: "lv-2" };
    if (mm < 50) return { text: "Kuvvetli yağış", cls: "lv-3" };
    return { text: "Çok kuvvetli yağış", cls: "lv-4" };
  }

  async function renderModels() {
    const grid = $("wxModelGrid");
    if (!grid || !state.loc) return;
    const key = `${state.loc.lat.toFixed(3)},${state.loc.lon.toFixed(3)}`;
    if (!state.models || state.models.key !== key) {
      try {
        const p = new URLSearchParams({
          latitude: state.loc.lat, longitude: state.loc.lon,
          daily: "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code",
          models: MODELS.map((m) => m.id).join(","),
          timezone: "Europe/Istanbul", forecast_days: 3,
        });
        const data = await fetch(`${FORECAST_URL}?${p}`).then((r) => r.json());
        if (!data.daily) throw new Error("veri yok");
        state.models = { key, daily: data.daily };
      } catch {
        grid.innerHTML = `<div class="sr-empty">Model verisi alınamadı, biraz sonra tekrar dene.</div>`;
        return;
      }
    }
    const dl = state.models.daily, days = dl.time;
    const get = (field, m) => (dl[`${field}_${m}`] || []).map(r1);

    const rows = MODELS.map((m) => {
      const pr = get("precipitation_sum", m.id);
      const has = pr.some((v) => v != null);
      return { ...m, pr, tmax: get("temperature_2m_max", m.id), total: has ? r1(pr.reduce((a, v) => a + (v || 0), 0)) : null };
    }).filter((m) => m.total != null);
    if (!rows.length) { grid.innerHTML = `<div class="sr-empty">Bu konum için model verisi yok.</div>`; return; }

    // model ortalamasi (her gun icin, verisi olan modellerin ortalamasi)
    const avgAt = (arrs, i) => { const v = arrs.map((a) => a[i]).filter((x) => x != null); return v.length ? r1(v.reduce((a, x) => a + x, 0) / v.length) : null; };
    const mean = {
      name: "Ortalama", org: `${rows.length} model`, consensus: true,
      pr: days.map((_, i) => avgAt(rows.map((r) => r.pr), i)),
      tmax: days.map((_, i) => avgAt(rows.map((r) => r.tmax), i)),
    };
    mean.total = r1(mean.pr.reduce((a, v) => a + (v || 0), 0));
    const maxTotal = Math.max(...rows.map((r) => r.total));

    const card = (m) => `
      <article class="wx-model${m.consensus ? " is-consensus" : ""}${!m.consensus && m.total === maxTotal && maxTotal >= 1 ? " is-wettest" : ""}">
        <header><strong>${m.name}</strong><span>${m.org}</span></header>
        <div class="wm-days">${days.map((d, i) => `
          <div class="wm-day"><span class="wm-date">${dayShort(d)}</span><span class="wm-mm${(m.pr[i] || 0) >= 0.5 ? " wet" : ""}">${m.pr[i] == null ? "—" : m.pr[i].toFixed(1)}</span><span class="wm-t">${m.tmax[i] == null ? "" : Math.round(m.tmax[i]) + "°"}</span></div>`).join("")}
        </div>
        <footer><span>3 günlük toplam</span><b>${m.total.toFixed(1)}<small> mm</small></b></footer>
      </article>`;
    grid.innerHTML = rows.map(card).join("") + card(mean);

    // model uyumu: toplamlarin yayilimi
    const totals = rows.map((r) => r.total);
    const spread = Math.max(...totals) - Math.min(...totals);
    const agree = $("wxModelsAgree");
    let level;
    if (mean.total < 1 && spread < 2) level = { t: "Modeller kuru hava konusunda hemfikir", c: "ok" };
    else if (maxTotal < 5) level = { t: "Modeller yalnızca hafif yağış öngörüyor", c: "ok" };
    else { const ratio = spread / Math.max(mean.total, 1); level = ratio < 0.6 ? { t: "Model uyumu: yüksek", c: "ok" } : ratio < 1.2 ? { t: "Model uyumu: orta", c: "mid" } : { t: "Model uyumu: düşük — belirsizlik yüksek", c: "low" }; }
    agree.textContent = level.t; agree.className = `badge wx-agree ${level.c}`; agree.hidden = false;
    $("wxModelsHint").textContent = `${state.loc.region ? state.loc.name + ", " + state.loc.region : state.loc.name} için ${rows.length} modelin tahmini · en yağışlı: ${rows.find((r) => r.total === maxTotal).name} (${maxTotal.toFixed(1)} mm)`;

    // gunluk ozet (ortalama)
    const pop = (i) => avgAt(MODELS.map((m) => get("precipitation_probability_max", m.id)), i);
    const tmin = (i) => avgAt(MODELS.map((m) => get("temperature_2m_min", m.id)), i);
    const code = (i) => { const c = (dl[`weather_code_${MODELS[0].id}`] || [])[i]; return c != null ? c : (dl[`weather_code_${rows[0].id}`] || [])[i]; };
    $("wxModelDays").innerHTML = days.map((d, i) => {
      const lbl = rainLabel(mean.pr[i]);
      const pp = pop(i);
      // ikon ortalamayla celismesin: ortalama kuruysa yagisli ikon yerine bulutlu goster
      let ic = code(i);
      if (!lbl && ["rain", "drizzle", "storm", "snow"].includes(window.WeatherWMO.category(ic))) ic = 3;
      return `<article class="wx-mday">
        <header>${dayShort(d)}</header>
        <div class="wx-mday-ic">${window.WeatherWMO.svg(ic, true)}</div>
        <dl>
          <div><dt>Yağış</dt><dd class="c-rain">${fmtMm(mean.pr[i])}</dd></div>
          <div><dt>En düşük / en yüksek</dt><dd>${Math.round(tmin(i))}° / <span class="c-hot">${Math.round(mean.tmax[i])}°</span></dd></div>
          ${pp != null ? `<div><dt>Yağış ihtimali</dt><dd class="c-prob">%${Math.round(pp)}</dd></div>` : ""}
        </dl>
        ${lbl ? `<span class="wx-rain-pill ${lbl.cls}">${window.HavaIcon("droplet", { size: 13 })} ${lbl.text}</span>` : `<span class="wx-rain-pill lv-0">Yağış beklenmiyor</span>`}
      </article>`;
    }).join("");
  }

  /* ============================================================
     IL / ILCE: 81 il + 973 ilce (data/iller.json — TurkiyeAPI MIT,
     koordinatlar GeoNames CC BY 4.0 / © OpenStreetMap katkicilari ODbL)
     ============================================================ */
  let placesPromise = null;
  function loadPlaces() {
    if (!placesPromise) {
      placesPromise = fetch("/data/iller.json").then((r) => r.json()).catch(() => { placesPromise = null; return []; });
    }
    return placesPromise;
  }
  const foldTR = (str) => String(str || "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[âî]/g, (m) => (m === "â" ? "a" : "i"));

  function selectPlace(loc) {
    state.loc = loc;
    saveJson("havasite_last_city", state.loc);
    state.archive = null;
    loadWeather();
  }

  // yerel il/ilce eslesmeleri: tam ad > ad basi > icinde gecer; il merkezleri once
  function localMatches(places, q) {
    const fq = foldTR(q);
    const out = [];
    places.forEach((il) => {
      const fi = foldTR(il.n);
      if (fi.includes(fq)) out.push({ score: fi === fq ? 0 : fi.startsWith(fq) ? 1 : 3, label: il.n, sub: "il merkezi", loc: { name: il.n, lat: il.la, lon: il.lo } });
      il.d.forEach(([name, lat, lon, pop]) => {
        if (name === "Merkez") return;
        const fn = foldTR(name);
        if (fn.includes(fq)) out.push({ score: (fn === fq ? 0 : fn.startsWith(fq) ? 1 : 3) + 0.5, pop, label: name, sub: il.n, loc: { name, region: il.n, lat, lon } });
      });
    });
    return out.sort((x, y) => x.score - y.score || (y.pop || 0) - (x.pop || 0)).slice(0, 8);
  }

  function setupSearch() {
    const input = $("citySearch"), results = $("searchResults");
    if (!input) return;
    input.addEventListener("focus", loadPlaces, { once: true });
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.hidden = true; return; }
      runLocal(q);
      searchTimer = setTimeout(() => runRemote(q), 350);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = results.querySelector(".sr-item"); if (first) first.click(); }
      if (e.key === "Escape") results.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) results.hidden = true; });

    let localItems = [];
    async function runLocal(q) {
      localItems = localMatches(await loadPlaces(), q);
      render(localItems, false);
    }
    // il/ilce disindaki yerler (koy, mahalle, yurt disi) icin Open-Meteo aramasi
    async function runRemote(q) {
      try {
        const r = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=10&language=tr&format=json`);
        const data = await r.json();
        if (input.value.trim() !== q) return;
        const seen = new Set(localItems.map((x) => foldTR(x.label)));
        const extra = (data.results || [])
          .filter((c) => c.country_code === "TR" && !seen.has(foldTR(c.name)))
          .slice(0, Math.max(0, 10 - localItems.length))
          .map((c) => ({ label: c.name, sub: [c.admin2 && c.admin2.replace(/ İlçesi$/, ""), c.admin1 && c.admin1.replace(/ İli$/, "")].filter(Boolean).join(", "), loc: { name: c.name, region: c.admin1 ? c.admin1.replace(/ İli$/, "") : "", lat: c.latitude, lon: c.longitude } }));
        render(localItems.concat(extra), true);
      } catch { render(localItems, true); }
    }
    function render(items, final) {
      if (!items.length) {
        if (final) { results.innerHTML = `<div class="sr-empty">Sonuç yok.</div>`; results.hidden = false; }
        return;
      }
      results.innerHTML = items.map((c, i) => `<div class="sr-item" role="option" data-i="${i}"><strong>${window.escapeHtml(c.label)}</strong>${c.sub ? `<span class="sr-sub">${window.escapeHtml(c.sub)}</span>` : ""}</div>`).join("");
      results.hidden = false;
      results.querySelectorAll(".sr-item").forEach((el, i) => el.addEventListener("click", () => {
        results.hidden = true; input.value = "";
        selectPlace(items[i].loc);
      }));
    }
  }

  function setupPicker() {
    const dlg = $("locPicker"), ilSel = $("lpIl"), ilceSel = $("lpIlce");
    if (!dlg || !$("pickBtn")) return;
    let places = [];
    function fillIlce() {
      const il = places[ilSel.value];
      if (!il) return;
      ilceSel.innerHTML = `<option value="-1">${window.escapeHtml(il.n)} (il merkezi)</option>` +
        il.d.map((x, i) => (x[0] === "Merkez" ? "" : `<option value="${i}">${window.escapeHtml(x[0])}</option>`)).join("");
    }
    $("pickBtn").addEventListener("click", async () => {
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      places = await loadPlaces();
      if (!places.length) { ilSel.innerHTML = "<option>Liste yüklenemedi</option>"; return; }
      ilSel.innerHTML = places.map((x, i) => `<option value="${i}">${window.escapeHtml(x.n)}</option>`).join("");
      const cur = state.loc && (state.loc.region || state.loc.name);
      const idx = Math.max(0, places.findIndex((x) => x.n === cur));
      ilSel.value = String(idx);
      fillIlce();
      if (state.loc && state.loc.region) {
        const j = places[idx].d.findIndex((x) => x[0] === state.loc.name);
        if (j >= 0) ilceSel.value = String(j);
      }
    });
    ilSel.addEventListener("change", fillIlce);
    const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute("open"));
    $("lpClose").addEventListener("click", close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    $("lpGo").addEventListener("click", () => {
      const il = places[ilSel.value];
      if (!il) return;
      const j = Number(ilceSel.value);
      const x = j >= 0 ? il.d[j] : null;
      close();
      selectPlace(x && x[0] !== "Merkez" ? { name: x[0], region: il.n, lat: x[1], lon: x[2] } : { name: il.n, lat: il.la, lon: il.lo });
    });
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
