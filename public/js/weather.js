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
    if (saved && saved.lat && saved.lon) currentLoc = saved;

    loadWeatherFor(currentLoc, false);
    initMap();
    loadCityTemps();

    setupSearch();
    document.getElementById("geoBtn").addEventListener("click", useGeolocation);

    setInterval(() => loadWeatherFor(currentLoc, true), REFRESH_MS);
    setInterval(loadCityTemps, REFRESH_MS);
  });

  function safeGetJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
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
          localStorage.setItem("havasite_last_city", JSON.stringify(currentLoc));
          results.hidden = true;
          input.value = "";
          loadWeatherFor(currentLoc, false);
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
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
      timezone: "Europe/Istanbul",
      forecast_days: "7",
    });

    try {
      const r = await fetch(`${FORECAST_URL}?${params.toString()}`);
      const data = await r.json();
      renderCurrent(data);
      renderHourly(data);
      renderDaily(data);
      const now = new Date();
      document.getElementById("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(now)}`;
    } catch (err) {
      document.getElementById("lastUpdated").textContent = "Veri alınamadı, tekrar denenecek…";
    }
  }

  function renderCurrent(data) {
    const c = data.current;
    const code = c.weather_code;
    const isDay = c.is_day === 1;
    document.getElementById("wcIcon").innerHTML = window.WeatherWMO.svg(code, isDay);
    document.getElementById("wcDesc").textContent = window.WeatherWMO.label(code);
    document.getElementById("wcTemp").textContent = Math.round(c.temperature_2m);
    document.getElementById("wcFeels").textContent = `${Math.round(c.apparent_temperature)}°`;
    document.getElementById("wcHumidity").textContent = `${c.relative_humidity_2m}%`;
    document.getElementById("wcPressure").textContent = `${Math.round(c.surface_pressure)} hPa`;
    document.getElementById("wcWind").textContent = `${Math.round(c.wind_speed_10m)} km/s`;
    document.getElementById("wcCompass").style.setProperty("--deg", `${c.wind_direction_10m}deg`);

    if (data.daily && data.daily.sunrise) {
      document.getElementById("wcSunrise").textContent = formatHM(data.daily.sunrise[0]);
      document.getElementById("wcSunset").textContent = formatHM(data.daily.sunset[0]);
    }
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
    const days = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    wrap.innerHTML = d.time
      .map((t, i) => {
        const date = new Date(t);
        const label = i === 0 ? "Bugün" : days[date.getDay()];
        return `
        <div class="day-card">
          <span class="dc-day">${label}</span>
          ${window.WeatherWMO.svg(d.weather_code[i], true)}
          <span class="dc-range"><span class="hi">${Math.round(d.temperature_2m_max[i])}°</span><span class="lo">${Math.round(d.temperature_2m_min[i])}°</span></span>
          <span class="dc-pop">${d.precipitation_probability_max[i]}% 💧</span>
        </div>`;
      })
      .join("");
  }

  // ------------- harita -------------
  function initMap() {
    map = L.map("weatherMap", { scrollWheelZoom: false }).setView([39.0, 35.2], 5.6);
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
      cityLayer.clearLayers();
      arr.forEach((d, i) => {
        const city = cities[i];
        if (!city || !d.current) return;
        const t = Math.round(d.current.temperature_2m);
        const color = tempColor(t);
        const icon = L.divIcon({
          className: "temp-marker",
          html: `<div class="tm-dot" style="background:${color}"><span>${t}°</span></div>`,
          iconSize: [40, 26],
          iconAnchor: [20, 13],
        });
        const marker = L.marker([city.lat, city.lon], { icon }).addTo(cityLayer);
        marker.bindPopup(
          `<div class="map-pop"><strong>${window.escapeHtml(city.name)}</strong><br/>${t}°C · ${window.WeatherWMO.label(d.current.weather_code)}</div>`
        );
        marker.on("click", () => {
          currentLoc = { name: city.name, lat: city.lat, lon: city.lon };
          localStorage.setItem("havasite_last_city", JSON.stringify(currentLoc));
          loadWeatherFor(currentLoc, false);
        });
      });
    } catch {
      /* sessizce yeniden dene */
    }
  }
})();
