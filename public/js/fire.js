(function () {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000; // FIRMS verisi siklikla degismiyor
  let map, layer;
  let rawData = [];
  let demoMode = false;
  let lastOk = false;

  const DEMO_DATA = buildDemoData();

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    initMap();
    setupFilters();
    document.getElementById("demoBtn").addEventListener("click", () => {
      demoMode = true;
      rawData = DEMO_DATA;
      document.getElementById("setupPanel").hidden = true;
      document.getElementById("demoBanner").hidden = false;
      document.getElementById("lastUpdated").textContent = "Örnek veri gösteriliyor";
      render();
    });

    fetchFires();
    setInterval(fetchFires, REFRESH_MS);

    loadFireRiskIndex();
    setInterval(loadFireRiskIndex, 20 * 60000);
  });

  // ---------------- basit yangin riski endeksi (sezgisel, gayriresmi) ----------------
  const RISK_CITIES = [
    { name: "Muğla", lat: 37.2153, lon: 28.3636 },
    { name: "Antalya", lat: 36.8969, lon: 30.7133 },
    { name: "İzmir", lat: 38.4237, lon: 27.1428 },
    { name: "Çanakkale", lat: 40.1553, lon: 26.4142 },
  ];

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  async function loadFireRiskIndex() {
    const lats = RISK_CITIES.map((c) => c.lat).join(",");
    const lons = RISK_CITIES.map((c) => c.lon).join(",");
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=Europe%2FIstanbul`
      );
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];

      let totalScore = 0;
      const chipsHtml = arr
        .map((d, i) => {
          const c = RISK_CITIES[i];
          const t = d.current.temperature_2m;
          const h = d.current.relative_humidity_2m;
          const w = d.current.wind_speed_10m;
          const score = clamp01((t - 15) / 25) * 0.4 + clamp01((60 - h) / 60) * 0.4 + clamp01(w / 40) * 0.2;
          totalScore += score;
          return `<span class="risk-city-chip"><strong>${window.escapeHtml(c.name)}</strong> ${Math.round(t)}°C · %${Math.round(h)} nem · ${Math.round(w)} km/s</span>`;
        })
        .join("");

      const avg = totalScore / RISK_CITIES.length;
      let level, cls, label;
      if (avg < 0.35) { level = "Düşük"; cls = "risk-good"; label = "🟢"; }
      else if (avg < 0.55) { level = "Orta"; cls = "risk-warning"; label = "🟡"; }
      else if (avg < 0.75) { level = "Yüksek"; cls = "risk-serious"; label = "🟠"; }
      else { level = "Çok Yüksek"; cls = "risk-critical"; label = "🔴"; }

      const levelEl = document.getElementById("riskLevel");
      levelEl.textContent = `${label} ${level}`;
      levelEl.className = `risk-level ${cls}`;
      window.flashUpdate && window.flashUpdate(levelEl);
      document.getElementById("riskDesc").textContent =
        `Ege ve Akdeniz'deki 4 temsili il (Muğla, Antalya, İzmir, Çanakkale) için sıcaklık, nem ve rüzgâr ortalamasına göre tahmini risk seviyesi: ${level.toLowerCase()}.`;
      document.getElementById("riskCities").innerHTML = chipsHtml;
    } catch {
      document.getElementById("riskLevel").textContent = "veri alınamadı";
    }
  }

  function initMap() {
    map = L.map("fireMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function setupFilters() {
    document.getElementById("daySelect").addEventListener("change", () => { if (!demoMode) fetchFires(); });
    document.getElementById("sourceSelect").addEventListener("change", () => { if (!demoMode) fetchFires(); });
    document.getElementById("confSelect").addEventListener("change", render);

    const frpRange = document.getElementById("frpRange");
    const frpVal = document.getElementById("frpRangeVal");
    window.bindRangeFill && window.bindRangeFill(frpRange);
    frpRange.addEventListener("input", () => {
      frpVal.textContent = `${frpRange.value}+ MW`;
      window.flashUpdate && window.flashUpdate(frpVal);
      render();
    });
  }

  async function fetchFires() {
    const days = document.getElementById("daySelect").value;
    const source = document.getElementById("sourceSelect").value;
    try {
      const r = await fetch(`/api/fires?days=${days}&source=${source}`);
      const data = await r.json();

      if (data.ok) {
        if (demoMode) {
          demoMode = false;
          document.getElementById("demoBanner").hidden = true;
          window.showToast("Gerçek FIRMS verisi bulundu, örnek veri kapatıldı.", { accent: "var(--c-fire)" });
        }
        lastOk = true;
        rawData = data.data;
        document.getElementById("setupPanel").hidden = true;
        document.getElementById("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())} · kaynak: ${data.source || source}`;
        render();
        return;
      }

      if (data.reason === "no_key" && !demoMode) {
        document.getElementById("setupPanel").hidden = false;
        document.getElementById("lastUpdated").textContent = "API anahtarı bekleniyor";
        rawData = [];
        render();
        return;
      }

      if (!demoMode) {
        document.getElementById("lastUpdated").textContent = lastOk
          ? "Veri alınamadı, önceki veriler gösteriliyor."
          : "Veri alınamadı, tekrar denenecek…";
      }
    } catch {
      if (!demoMode) document.getElementById("lastUpdated").textContent = "Bağlantı hatası, tekrar denenecek…";
    }
  }

  function frpColor(frp) {
    const stops = [
      [0, [255, 210, 122]],
      [5, [255, 138, 61]],
      [15, [227, 73, 72]],
      [45, [161, 18, 27]],
    ];
    if (frp <= stops[0][0]) return rgb(stops[0][1]);
    if (frp >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [f0, c0] = stops[i];
      const [f1, c1] = stops[i + 1];
      if (frp >= f0 && frp <= f1) {
        const f = (frp - f0) / (f1 - f0);
        return rgb(c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f)));
      }
    }
    return "#e34948";
    function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  }

  function fireSize(frp) {
    return Math.max(10, Math.min(42, 10 + Math.sqrt(Math.max(frp, 0)) * 4));
  }

  function confLevel(raw) {
    if (raw === undefined || raw === null || raw === "") return 1;
    const n = Number(raw);
    if (!Number.isNaN(n)) return n >= 80 ? 2 : n >= 40 ? 1 : 0;
    const s = String(raw).toLowerCase();
    if (s.startsWith("h")) return 2;
    if (s.startsWith("n")) return 1;
    return 0;
  }

  function confLabel(raw) {
    const lvl = confLevel(raw);
    return lvl === 2 ? "Yüksek" : lvl === 1 ? "Orta" : "Düşük";
  }

  function filteredData() {
    const confFilter = document.getElementById("confSelect").value;
    const minFrp = parseFloat(document.getElementById("frpRange").value) || 0;
    return rawData
      .filter((f) => {
        if (confFilter === "all") return true;
        const lvl = confLevel(f.confidence);
        return confFilter === "high" ? lvl === 2 : lvl >= 1;
      })
      .filter((f) => (f.frp || 0) >= minFrp)
      .sort((a, b) => (b.frp || 0) - (a.frp || 0));
  }

  function render() {
    const list = filteredData();
    renderMap(list);
    renderList(list);
    renderStats(list);
    renderProvinceStats(list);
    renderFreshness();
  }

  // en yeni uydu tespitinin ne kadar once oldugu (FIRMS date+time UTC)
  function renderFreshness() {
    const el = document.getElementById("fireFreshness");
    if (!el || !rawData.length) return;
    let newest = 0;
    rawData.forEach((f) => {
      if (!f.date) return;
      const hhmm = String(f.time || "0000").padStart(4, "0");
      const iso = `${f.date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`;
      const t = new Date(iso).getTime();
      if (t > newest) newest = t;
    });
    if (!newest) { el.textContent = "—"; return; }
    el.textContent = demoMode ? "örnek veri" : window.timeAgoTR(new Date(newest));
  }

  function renderProvinceStats(list) {
    const wrap = document.getElementById("provinceBars");
    const badge = document.getElementById("psCount");
    if (!wrap) return;
    const counts = new Map();
    list.forEach((f) => {
      const near = window.nearestCity ? window.nearestCity(f.lat, f.lon) : null;
      if (!near) return;
      counts.set(near.city.name, (counts.get(near.city.name) || 0) + 1);
    });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (badge) badge.innerHTML = `<span class="live-blip"></span> ${counts.size} il`;
    if (!rows.length) {
      wrap.innerHTML = `<div class="sr-empty" style="padding:16px;color:var(--text-muted)">Seçili filtrede il eşleşmesi yok.</div>`;
      return;
    }
    const max = rows[0][1];
    wrap.innerHTML = rows
      .map(
        ([name, n]) => `
        <div class="pb-row">
          <span class="pb-name">${window.escapeHtml(name)}</span>
          <span class="pb-track"><span class="pb-fill pb-fill-fire" style="width:${Math.max((n / max) * 100, 4)}%"></span></span>
          <span class="pb-count">${n}</span>
        </div>`
      )
      .join("");
  }

  function renderMap(list) {
    layer.clearLayers();
    list.forEach((f) => {
      const size = fireSize(f.frp);
      const color = frpColor(f.frp);
      // yanan noktada gercek bir "alev" hissi: titreyen alev sekli + yukselen kor parcaciklari
      const html = `
        <div class="fire-mark">
          <div class="fmk-ring" style="width:${size * 1.6}px;height:${size * 1.6}px;background:${color}22;border:1.5px solid ${color}"></div>
          <svg class="fmk-flame" viewBox="0 0 64 64" style="width:${size}px;height:${size}px;color:${color}" aria-hidden="true">
            <path d="M32 6c4 8-3 11-3 18 0 5 4 7 7 7 5 0 9-4 9-10 6 6 9 14 9 20 0 12-10 21-22 21S10 53 10 41c0-9 5-15 9-20 1 6 5 9 9 9 3 0-3-4 4-24Z" fill="currentColor"/>
          </svg>
          <span class="fmk-ember e1"></span>
          <span class="fmk-ember e2"></span>
        </div>`;
      const icon = L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const marker = L.marker([f.lat, f.lon], { icon }).addTo(layer);
      const near = window.nearestCity ? window.nearestCity(f.lat, f.lon) : null;
      marker.bindPopup(
        `<div class="map-pop"><strong>${near ? window.escapeHtml(near.city.name) + " yakını" : "Tespit"}</strong><br/>
         FRP: ${f.frp?.toFixed ? f.frp.toFixed(1) : f.frp} MW · Güven: ${confLabel(f.confidence)}<br/>
         ${window.escapeHtml(f.date || "")} ${window.escapeHtml(f.time || "")} UTC</div>`
      );
    });
  }

  function renderList(list) {
    const wrap = document.getElementById("fireList");
    document.getElementById("sideCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;

    if (!list.length) {
      wrap.innerHTML = `<div class="sr-empty" style="padding:20px;color:var(--text-muted);text-align:center">${
        demoMode || lastOk ? "Seçili filtrede tespit bulunamadı." : "Henüz veri yok."
      }</div>`;
      return;
    }

    wrap.innerHTML = list
      .slice(0, 150)
      .map((f, i) => {
        const color = frpColor(f.frp);
        const near = window.nearestCity ? window.nearestCity(f.lat, f.lon) : null;
        return `
        <div class="side-row" style="--i:${Math.min(i, 14)}" data-lat="${f.lat}" data-lon="${f.lon}">
          <span class="mag-chip" style="background:${color}">${f.frp?.toFixed ? Math.round(f.frp) : "-"}</span>
          <div class="row-main">
            <div class="row-title">${near ? window.escapeHtml(near.city.name) + " yakını" : `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</div>
            <div class="row-sub">Güven: ${confLabel(f.confidence)} · ${window.escapeHtml(f.date || "")} ${window.escapeHtml(f.time || "")}</div>
          </div>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll(".side-row").forEach((row) => {
      row.addEventListener("click", () => {
        map.flyTo([parseFloat(row.dataset.lat), parseFloat(row.dataset.lon)], 9, { duration: 0.8 });
      });
    });
  }

  function renderStats(list) {
    document.getElementById("statCountSub").textContent = demoMode ? "örnek veri" : "seçili aralıkta";
    if (!list.length) {
      document.getElementById("statCount").textContent = "0";
      document.getElementById("statMaxFrp").textContent = "—";
      document.getElementById("statRegion").textContent = "—";
      document.getElementById("statRegionSub").textContent = "—";
      document.getElementById("statDayNight").textContent = "—";
      return;
    }
    setStatText("statCount", list.length);

    const maxF = list.reduce((a, b) => ((b.frp || 0) > (a.frp || 0) ? b : a), list[0]);
    setStatText("statMaxFrp", maxF.frp ? maxF.frp.toFixed(1) : "—");

    const cityCounts = new Map();
    list.forEach((f) => {
      const near = window.nearestCity ? window.nearestCity(f.lat, f.lon) : null;
      if (!near) return;
      cityCounts.set(near.city.name, (cityCounts.get(near.city.name) || 0) + 1);
    });
    let topCity = "—", topCount = 0;
    cityCounts.forEach((count, name) => { if (count > topCount) { topCount = count; topCity = name; } });
    document.getElementById("statRegion").textContent = topCity;
    document.getElementById("statRegionSub").textContent = topCount ? `${topCount} tespit` : "—";

    const day = list.filter((f) => (f.daynight || "").toUpperCase().startsWith("D")).length;
    const pct = Math.round((day / list.length) * 100);
    document.getElementById("statDayNight").textContent = `${pct}% / ${100 - pct}%`;
  }

  function setStatText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = String(value);
    if (el.textContent !== text) {
      el.textContent = text;
      window.flashUpdate && window.flashUpdate(el);
    }
  }

  function buildDemoData() {
    const hotspots = [
      { lat: 37.05, lon: 28.38, name: "Muğla" },
      { lat: 36.86, lon: 31.44, name: "Antalya/Manavgat" },
      { lat: 40.15, lon: 26.41, name: "Çanakkale" },
      { lat: 37.6, lon: 27.0, name: "Aydın" },
      { lat: 37.3, lon: 36.3, name: "Osmaniye" },
    ];
    const rows = [];
    let id = 0;
    hotspots.forEach((h) => {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        id++;
        rows.push({
          lat: h.lat + (Math.random() - 0.5) * 0.6,
          lon: h.lon + (Math.random() - 0.5) * 0.6,
          frp: Math.round((Math.random() * 55 + 2) * 10) / 10,
          confidence: ["l", "n", "n", "h"][Math.floor(Math.random() * 4)],
          date: new Date().toISOString().slice(0, 10),
          time: `${String(Math.floor(Math.random() * 24)).padStart(2, "0")}${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
          satellite: "DEMO",
          instrument: "ÖRNEK",
          daynight: Math.random() > 0.5 ? "D" : "N",
        });
      }
    });
    return rows;
  }
})();
