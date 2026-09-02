(function () {
  "use strict";

  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const REFRESH_MS = 10 * 60 * 1000;

  let currentLoc = { name: "Ankara", lat: 39.9208, lon: 32.8541 };
  let map, cityLayer;
  let refreshTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());

    const saved = safeGetJson("havasite_last_city");
    if (saved && saved.lat && saved.lon) {
      currentLoc = saved;
    } else if (window.HavaPrefs) {
      const favName = window.HavaPrefs.get().favoriteCity;
      const fav = favName && window.TR_CITIES.find((c) => c.name === favName);
      if (fav) currentLoc = { name: fav.name, lat: fav.lat, lon: fav.lon };
    }

    loadWeatherFor(currentLoc, false);
    initMap();
    loadCityTemps();
    setupMapFilters();

    setupSearch();
    document.getElementById("geoBtn").addEventListener("click", useGeolocation);

    setInterval(() => loadWeatherFor(currentLoc, true), REFRESH_MS);
    setInterval(loadCityTemps, REFRESH_MS);
  });

  function safeGetJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function safeSetJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.warn("Kaydedilemedi:", err); }
  }

  // ------------- arama -------------
  let searchTimer = null;
  function setupSearch() {
    const input = document.getElementById("citySearch");
    const results = document.getElementById("searchResults");

    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.hidden = true; return; }
      searchTimer = setTimeout(() => runSearch(q), 300);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) results.hidden = true;
    });

    async function runSearch(q) {
      try {
        const r = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=tr&format=json`);
        const data = await r.json();
        const items = (data.results || []).filter((c) => c.country_code === "TR");
        renderResults(items.length ? items : (data.results || []).slice(0, 5));
      } catch {
        renderResults([]);
      }
    }

    function renderResults(items) {
      if (!items.length) {
        results.innerHTML = `<div class="sr-empty">Sonuç bulunamadı.</div>`;
        results.hidden = false;
        return;
      }
      results.innerHTML = items
        .map(
          (c, i) =>
            `<div class="sr-item" data-i="${i}">${window.escapeHtml(c.name)}${c.admin1 ? ", " + window.escapeHtml(c.admin1) : ""}</div>`
        )
        .join("");
      results.hidden = false;
      results.querySelectorAll(".sr-item").forEach((el, i) => {
        el.addEventListener("click", () => {
          const c = items[i];
          currentLoc = { name: c.name, lat: c.latitude, lon: c.longitude };
          safeSetJson("havasite_last_city", currentLoc);
          results.hidden = true;
          input.value = "";
          loadWeatherFor(currentLoc, false);
          renderCityMarkers();
        });
      });
    }
  }

  function useGeolocation() {
    if (!navigator.geolocation) {
      window.showToast("Tarayıcın konum servisini desteklemiyor.");
      return;
    }
    window.showToast("Konumun alınıyor…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearest = window.nearestCity ? window.nearestCity(latitude, longitude) : null;
        currentLoc = { name: (nearest && nearest.city && nearest.city.name) || "Konumum", lat: latitude, lon: longitude };
        loadWeatherFor(currentLoc, false);
        renderCityMarkers();
      },
      () => window.showToast("Konum izni alınamadı."),
      { timeout: 8000 }
    );
  }

  // ------------- guncel + saatlik + gunluk -------------
  async function loadWeatherFor(loc, silent) {
    document.getElementById("wcCity").textContent = loc.name;
    if (!silent) document.getElementById("lastUpdated").textContent = "Yükleniyor…";

    const params = new URLSearchParams({
      latitude: loc.lat,
      longitude: loc.lon,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,precipitation",
      hourly: "temperature_2m,precipitation_probability,weather_code,visibility,dew_point_2m,uv_index",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset",
      timezone: "Europe/Istanbul",
      forecast_days: "10",
    });

    try {
      const r = await fetch(`${FORECAST_URL}?${params.toString()}`);
      const data = await r.json();
      renderCurrent(data);
      renderDetailTiles(data);
      renderTempChart(data);
      renderHourly(data);
      renderDaily(data);
      const now = new Date();
      document.getElementById("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(now)}`;
    } catch (err) {
      document.getElementById("lastUpdated").textContent = "Veri alınamadı, tekrar denenecek…";
    }
  }

  // ------------- kosula gore renk/animasyon degisen "hava sahnesi" -------------
  // Sayfa basligi arka planini gercek hava koduna gore gunes/bulut/yagmur/kar/
  // firtina katmanlariyla ve o koşula uygun bir renk gecisiyle canlandirir.
  const SCENE_GRADIENTS = {
    "clear-day": "linear-gradient(135deg, rgba(255,184,77,0.22), rgba(42,120,214,0.12))",
    "clear-night": "linear-gradient(135deg, rgba(27,42,74,0.55), rgba(58,45,107,0.35))",
    "partly-day": "linear-gradient(135deg, rgba(109,167,236,0.24), rgba(154,163,168,0.12))",
    "partly-night": "linear-gradient(135deg, rgba(27,42,74,0.5), rgba(91,107,122,0.3))",
    "cloudy-day": "linear-gradient(135deg, rgba(91,107,122,0.32), rgba(139,152,163,0.16))",
    "cloudy-night": "linear-gradient(135deg, rgba(20,26,36,0.6), rgba(60,70,84,0.3))",
    "fog-day": "linear-gradient(135deg, rgba(139,152,163,0.3), rgba(199,206,211,0.18))",
    "fog-night": "linear-gradient(135deg, rgba(30,36,46,0.55), rgba(90,98,108,0.3))",
    "drizzle-day": "linear-gradient(135deg, rgba(39,75,115,0.36), rgba(57,135,229,0.16))",
    "drizzle-night": "linear-gradient(135deg, rgba(15,26,44,0.6), rgba(39,75,115,0.35))",
    "rain-day": "linear-gradient(135deg, rgba(39,75,115,0.42), rgba(57,135,229,0.2))",
    "rain-night": "linear-gradient(135deg, rgba(12,20,36,0.65), rgba(39,75,115,0.4))",
    "snow-day": "linear-gradient(135deg, rgba(169,198,221,0.4), rgba(231,240,247,0.2))",
    "snow-night": "linear-gradient(135deg, rgba(40,54,74,0.55), rgba(169,198,221,0.25))",
    "storm-day": "linear-gradient(135deg, rgba(36,31,58,0.5), rgba(74,63,107,0.28))",
    "storm-night": "linear-gradient(135deg, rgba(12,10,22,0.7), rgba(36,31,58,0.45))",
  };

  function applyWeatherScene(code, isDay) {
    const scene = document.getElementById("weatherScene");
    if (!scene) return;
    const cat = window.WeatherWMO.category(code);
    const dayKey = isDay ? "day" : "night";
    scene.dataset.cat = cat;
    scene.dataset.day = dayKey;
    scene.style.setProperty("--scene-bg", SCENE_GRADIENTS[`${cat}-${dayKey}`] || SCENE_GRADIENTS["cloudy-day"]);
  }

  // guncel saatin hourly dizisindeki indexi (ayrinti kutulari + grafik icin)
  function currentHourIndex(data) {
    if (!data.hourly || !data.hourly.time) return 0;
    const nowIso = data.current && data.current.time;
    const i = data.hourly.time.findIndex((t) => new Date(t) >= new Date(nowIso || Date.now()));
    return Math.max(i, 0);
  }

  const WIND_DIRS = ["Kuzey", "Kuzeydoğu", "Doğu", "Güneydoğu", "Güney", "Güneybatı", "Batı", "Kuzeybatı"];
  function windDirName(deg) {
    return WIND_DIRS[Math.round(((deg % 360) / 45)) % 8];
  }
  function windForce(kmh) {
    if (kmh < 2) return "Sakin";
    if (kmh < 12) return "Hafif esinti";
    if (kmh < 20) return "Tatlı rüzgâr";
    if (kmh < 30) return "Orta rüzgâr";
    if (kmh < 40) return "Sert rüzgâr";
    if (kmh < 62) return "Fırtınamsı rüzgâr";
    return "Fırtına";
  }
  function uvLabel(uv) {
    if (uv < 3) return "Düşük";
    if (uv < 6) return "Orta";
    if (uv < 8) return "Yüksek";
    if (uv < 11) return "Çok yüksek";
    return "Aşırı";
  }

  function renderCurrent(data) {
    const c = data.current;
    const code = c.weather_code;
    const isDay = c.is_day === 1;
    applyWeatherScene(code, isDay);
    document.getElementById("wcIcon").innerHTML = window.WeatherWMO.svg(code, isDay);
    document.getElementById("wcDesc").textContent = window.WeatherWMO.label(code);
    const tempEl = document.getElementById("wcTemp");
    const tempText = String(Math.round(c.temperature_2m));
    if (tempEl.textContent !== tempText) {
      tempEl.textContent = tempText;
      window.flashUpdate && window.flashUpdate(tempEl);
    }
    document.getElementById("wcFeels").textContent = `${Math.round(c.apparent_temperature)}°`;

    const d = data.daily;
    if (d && d.temperature_2m_max) {
      const hi = Math.round(d.temperature_2m_max[0]);
      const lo = Math.round(d.temperature_2m_min[0]);
      document.getElementById("wcDayMax").textContent = `${hi}°`;
      document.getElementById("wcDayMin").textContent = `${lo}°`;
      const pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
      let sentence = `${window.WeatherWMO.label(code)}. Bugün en yüksek ${hi}°, en düşük ${lo}°.`;
      if (pop != null && pop >= 30) sentence += ` Yağış olasılığı %${pop}.`;
      const feels = Math.round(c.apparent_temperature);
      if (Math.abs(feels - Math.round(c.temperature_2m)) >= 3) sentence += ` Dışarısı ${feels}° gibi hissettiriyor.`;
      document.getElementById("wcForecast").textContent = sentence;
    }
  }

  function renderDetailTiles(data) {
    const c = data.current;
    const h = data.hourly || {};
    const i = currentHourIndex(data);
    const d = data.daily || {};

    document.getElementById("wcWind").textContent = `${Math.round(c.wind_speed_10m)} km/s`;
    document.getElementById("wcCompass").style.setProperty("--deg", `${c.wind_direction_10m}deg`);
    const gust = c.wind_gusts_10m != null ? ` · hamle ${Math.round(c.wind_gusts_10m)}` : "";
    document.getElementById("wcWindSub").textContent = `${windForce(c.wind_speed_10m)} · ${windDirName(c.wind_direction_10m)}${gust}`;

    document.getElementById("wcHumidity").textContent = `${c.relative_humidity_2m}%`;
    const dew = h.dew_point_2m ? Math.round(h.dew_point_2m[i]) : null;
    document.getElementById("wcHumiditySub").textContent = dew != null ? `çiy noktası ${dew}°` : "";

    const visKm = h.visibility ? h.visibility[i] / 1000 : null;
    document.getElementById("wcVisibility").textContent = visKm != null ? `${Math.round(visKm)} km` : "—";
    document.getElementById("wcVisibilitySub").textContent =
      visKm == null ? "" : visKm >= 10 ? "açık" : visKm >= 4 ? "orta" : "sisli/puslu";

    document.getElementById("wcPressure").textContent = `${Math.round(c.surface_pressure)} hPa`;
    document.getElementById("wcPressureSub").textContent = c.surface_pressure >= 1013 ? "yüksek basınç" : "alçak basınç";

    const uv = h.uv_index ? h.uv_index[i] : (d.uv_index_max ? d.uv_index_max[0] : null);
    document.getElementById("wcUv").textContent = uv != null ? Math.round(uv) : "—";
    document.getElementById("wcUvSub").textContent = uv != null ? uvLabel(uv) : "";

    const precip = d.precipitation_sum ? d.precipitation_sum[0] : c.precipitation;
    document.getElementById("wcPrecip").textContent = precip != null ? `${precip.toFixed(1)} mm` : "—";
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
    document.getElementById("wcPrecipSub").textContent = pop != null ? `olasılık %${pop}` : "";

    if (d.sunrise) {
      document.getElementById("wcSunrise").textContent = formatHM(d.sunrise[0]);
      document.getElementById("wcSunset").textContent = formatHM(d.sunset[0]);
      const ms = new Date(d.sunset[0]) - new Date(d.sunrise[0]);
      const hrs = Math.floor(ms / 3600000);
      const mins = Math.round((ms % 3600000) / 60000);
      document.getElementById("wcDaylenSub").textContent = `gün uzunluğu ${hrs}s ${mins}dk`;
    }
  }

  // hourly sicakligi kcompakt bir SVG cizgi grafik olarak cizer (MSN tarzi)
  function renderTempChart(data) {
    const svg = document.getElementById("tempChart");
    if (!svg || !data.hourly) return;
    const h = data.hourly;
    const start = currentHourIndex(data);
    const temps = h.temperature_2m.slice(start, start + 24);
    const times = h.time.slice(start, start + 24);
    if (temps.length < 2) return;

    const W = 720, H = 150, padX = 8, padTop = 26, padBot = 24;
    const min = Math.min(...temps), max = Math.max(...temps);
    const span = max - min || 1;
    const x = (idx) => padX + (idx / (temps.length - 1)) * (W - padX * 2);
    const y = (t) => padTop + (1 - (t - min) / span) * (H - padTop - padBot);

    const linePts = temps.map((t, idx) => `${x(idx).toFixed(1)},${y(t).toFixed(1)}`).join(" ");
    const areaPts = `${x(0).toFixed(1)},${(H - padBot).toFixed(1)} ${linePts} ${x(temps.length - 1).toFixed(1)},${(H - padBot).toFixed(1)}`;

    let labels = "";
    temps.forEach((t, idx) => {
      if (idx % 3 !== 0) return;
      const d = new Date(times[idx]);
      labels += `<text x="${x(idx).toFixed(1)}" y="14" class="tc-temp">${Math.round(t)}°</text>`;
      labels += `<text x="${x(idx).toFixed(1)}" y="${H - 6}" class="tc-time">${idx === 0 ? "Şimdi" : d.getHours() + ":00"}</text>`;
    });

    svg.innerHTML = `
      <polygon points="${areaPts}" class="tc-area" />
      <polyline points="${linePts}" class="tc-line" />
      ${labels}`;
  }

  function formatHM(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function renderHourly(data) {
    const wrap = document.getElementById("hourlyStrip");
    const h = data.hourly;
    const nowIdx = h.time.findIndex((t) => new Date(t) >= new Date(data.current.time));
    const start = Math.max(nowIdx, 0);
    const slice = h.time.slice(start, start + 24);

    wrap.innerHTML = slice
      .map((t, i) => {
        const idx = start + i;
        const d = new Date(t);
        const hourLabel = i === 0 ? "Şimdi" : `${d.getHours()}:00`;
        const temp = Math.round(h.temperature_2m[idx]);
        const pop = h.precipitation_probability[idx];
        return `
        <div class="hour-card">
          <span class="hc-time">${hourLabel}</span>
          ${window.WeatherWMO.svg(h.weather_code[idx], d.getHours() >= 7 && d.getHours() <= 19)}
          <span class="hc-temp">${temp}°</span>
          <span class="hc-pop">${pop}% 💧</span>
        </div>`;
      })
      .join("");
  }

  function renderDaily(data) {
    const wrap = document.getElementById("dailyGrid");
    const d = data.daily;
    const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const daysShort = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

    // tum hafta icin ortak min/max -> hi/lo bar olceklemesi
    const weekMin = Math.min(...d.temperature_2m_min);
    const weekMax = Math.max(...d.temperature_2m_max);
    const weekSpan = weekMax - weekMin || 1;

    wrap.innerHTML = d.time
      .map((t, i) => {
        const date = new Date(t);
        const label = i === 0 ? "Bugün" : `${daysShort[date.getDay()]} ${date.getDate()}`;
        const full = i === 0 ? "Bugün" : days[date.getDay()];
        const hi = Math.round(d.temperature_2m_max[i]);
        const lo = Math.round(d.temperature_2m_min[i]);
        const barLeft = ((d.temperature_2m_min[i] - weekMin) / weekSpan) * 100;
        const barWidth = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / weekSpan) * 100;
        const pop = d.precipitation_probability_max[i];
        return `
        <div class="day-row" title="${full}">
          <span class="dr-day">${label}</span>
          <span class="dr-icon">${window.WeatherWMO.svg(d.weather_code[i], true)}</span>
          <span class="dr-pop">${pop >= 10 ? pop + "%" : ""}</span>
          <span class="dr-lo">${lo}°</span>
          <span class="dr-bar"><span class="dr-bar-fill" style="left:${barLeft.toFixed(0)}%;width:${Math.max(barWidth, 6).toFixed(0)}%"></span></span>
          <span class="dr-hi">${hi}°</span>
        </div>`;
      })
      .join("");
  }

  // ------------- harita -------------
  function initMap() {
    map = L.map("weatherMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    cityLayer = L.layerGroup().addTo(map);
  }

  function tempColor(t) {
    const stops = [
      [-10, [24, 79, 149]],
      [0, [57, 135, 229]],
      [12, [109, 167, 236]],
      [18, [154, 163, 168]],
      [26, [245, 163, 92]],
      [33, [235, 104, 52]],
      [42, [208, 59, 59]],
    ];
    if (t <= stops[0][0]) return rgb(stops[0][1]);
    if (t >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        const c = c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f));
        return rgb(c);
      }
    }
    return "#9aa3a8";
    function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  }

  // ------------- harita filtreleri (min. sicaklik, sirala, sadece olumsuz hava) -------------
  let lastCityRows = []; // [{city, temp, code}]

  const BAD_WEATHER_CODES = new Set([
    51, 53, 55, 56, 57, // ciseleme
    61, 63, 65, 66, 67, // yagmur
    71, 73, 75, 77, // kar
    80, 81, 82, 85, 86, // saganak
    95, 96, 99, // firtina
  ]);

  function setupMapFilters() {
    const tempRange = document.getElementById("tempRange");
    const tempVal = document.getElementById("tempRangeVal");
    const sortSelect = document.getElementById("sortSelect");
    const onlyBad = document.getElementById("onlyBadWeather");
    if (!tempRange) return;

    window.bindRangeFill && window.bindRangeFill(tempRange);
    tempRange.addEventListener("input", () => {
      tempVal.textContent = `${tempRange.value}°C+`;
      window.flashUpdate && window.flashUpdate(tempVal);
      renderCityMarkers();
    });
    sortSelect.addEventListener("change", renderCityMarkers);
    onlyBad.addEventListener("change", renderCityMarkers);
  }

  function renderCityMarkers() {
    if (!cityLayer) return;
    const minTemp = parseFloat(document.getElementById("tempRange")?.value ?? "-100");
    const sort = document.getElementById("sortSelect")?.value || "none";
    const onlyBad = document.getElementById("onlyBadWeather")?.checked;

    let rows = lastCityRows.filter((row) => row.temp >= minTemp);
    if (onlyBad) rows = rows.filter((row) => BAD_WEATHER_CODES.has(row.code));
    if (sort === "hot") rows = [...rows].sort((a, b) => b.temp - a.temp);
    if (sort === "cold") rows = [...rows].sort((a, b) => a.temp - b.temp);

    cityLayer.clearLayers();
    rows.forEach(({ city, temp, code }) => {
      const color = tempColor(temp);
      // asiri sicak/soguk illerde nabiz gibi atan bir vurgu (renk hava durumuna uygun)
      const heatClass = temp >= 32 ? "tm-hot" : temp <= 0 ? "tm-cold" : "";
      const isActive = city.name === currentLoc.name;
      // her il icin sicakliga gore renklenen, nefes alir gibi yavasca nabzi atan bir
      // "isi halesi" — harita tek tek pinler yerine canli, renkli bir alan gibi hissettirsin
      const html = `
        <div class="tm-wrap">
          <div class="tm-aura" style="background:${color}"></div>
          <div class="tm-dot ${heatClass} ${isActive ? "tm-active" : ""}" style="background:${color}"><span>${temp}°</span></div>
        </div>`;
      const icon = L.divIcon({ className: "", html, iconSize: [60, 60], iconAnchor: [30, 30] });
      const marker = L.marker([city.lat, city.lon], { icon }).addTo(cityLayer);
      marker.bindPopup(
        `<div class="map-pop"><strong>${window.escapeHtml(city.name)}</strong><br/>${temp}°C · ${window.WeatherWMO.label(code)}</div>`
      );
      marker.on("click", () => {
        currentLoc = { name: city.name, lat: city.lat, lon: city.lon };
        safeSetJson("havasite_last_city", currentLoc);
        loadWeatherFor(currentLoc, false);
        renderCityMarkers(); // aktif il vurgusu hemen guncellensin
      });
    });
  }

  async function loadCityTemps() {
    if (!map) return;
    const cities = window.TR_CITIES;
    const lats = cities.map((c) => c.lat).join(",");
    const lons = cities.map((c) => c.lon).join(",");
    const params = new URLSearchParams({
      latitude: lats,
      longitude: lons,
      current: "temperature_2m,weather_code",
      timezone: "Europe/Istanbul",
    });
    try {
      const r = await fetch(`${FORECAST_URL}?${params.toString()}`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];
      lastCityRows = arr
        .map((d, i) => {
          const city = cities[i];
          if (!city || !d.current) return null;
          return { city, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code };
        })
        .filter(Boolean);
      renderCityMarkers();
    } catch {
      /* sessizce yeniden dene */
    }
  }
})();
