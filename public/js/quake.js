(function () {
  "use strict";

  const REFRESH_MS = 25000;
  let map, layer;
  let rawData = [];
  let knownIds = new Set();
  let firstLoad = true;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    initMap();
    setupFilters();
    fetchQuakes();
    setInterval(fetchQuakes, REFRESH_MS);
  });

  function initMap() {
    map = L.map("quakeMap", { scrollWheelZoom: false }).setView([39.0, 35.2], 5.6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function setupFilters() {
    const magRange = document.getElementById("magRange");
    const magVal = document.getElementById("magRangeVal");
    const timeSelect = document.getElementById("timeSelect");
    const onlyFelt = document.getElementById("onlyFelt");

    magRange.addEventListener("input", () => {
      magVal.textContent = `${parseFloat(magRange.value).toFixed(1)}+`;
      render();
    });
    timeSelect.addEventListener("change", render);
    onlyFelt.addEventListener("change", render);
  }

  function magColor(mag) {
    const stops = [
      [0, [255, 208, 138]],
      [2, [245, 163, 92]],
      [3.5, [235, 104, 52]],
      [5, [208, 59, 59]],
      [6.5, [122, 22, 22]],
    ];
    if (mag <= stops[0][0]) return rgb(stops[0][1]);
    if (mag >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [m0, c0] = stops[i];
      const [m1, c1] = stops[i + 1];
      if (mag >= m0 && mag <= m1) {
        const f = (mag - m0) / (m1 - m0);
        return rgb(c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f)));
      }
    }
    return "#eb6834";
    function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  }

  function magSize(mag) {
    return Math.max(10, Math.min(46, 10 + mag * 5.4));
  }

  async function fetchQuakes() {
    try {
      const r = await fetch("/api/quakes?limit=300");
      const data = await r.json();
      if (!data.ok) {
        document.getElementById("lastUpdated").textContent = "Veri alınamadı, tekrar denenecek…";
        return;
      }
      const newOnes = firstLoad ? [] : data.data.filter((q) => !knownIds.has(q.id) && q.mag >= 3.5);
      rawData = data.data;
      knownIds = new Set(rawData.map((q) => q.id));
      firstLoad = false;

      document.getElementById("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())}`;
      render(newOnes);

      newOnes.forEach((q) => {
        window.showToast(`🟠 Yeni deprem: M${q.mag.toFixed(1)} — ${q.closestCity || q.title}`, { accent: "var(--c-quake)" });
      });
    } catch {
      document.getElementById("lastUpdated").textContent = "Bağlantı hatası, tekrar denenecek…";
    }
  }

  function filteredData() {
    const minMag = parseFloat(document.getElementById("magRange").value);
    const hours = parseInt(document.getElementById("timeSelect").value, 10);
    const onlyFelt = document.getElementById("onlyFelt").checked;
    const cutoff = Date.now() - hours * 3600 * 1000;
    const effectiveMin = onlyFelt ? Math.max(minMag, 3.0) : minMag;

    return rawData
      .filter((q) => q.mag >= effectiveMin)
      .filter((q) => new Date(q.date.replace(" ", "T")).getTime() >= cutoff)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function render(newOnes = []) {
    const list = filteredData();
    renderMap(list, newOnes);
    renderList(list, newOnes);
    renderStats(list);
  }

  function renderMap(list, newOnes) {
    layer.clearLayers();
    const newIds = new Set(newOnes.map((q) => q.id));
    const now = Date.now();

    list.forEach((q) => {
      const size = magSize(q.mag);
      const color = magColor(q.mag);
      const ageMs = now - new Date(q.date.replace(" ", "T")).getTime();
      const recent = ageMs < 3600 * 1000;
      const html = `
        <div class="pulse-marker">
          ${recent ? `<div class="ring" style="width:${size * 1.8}px;height:${size * 1.8}px;background:${color}22;border:1.5px solid ${color}"></div>` : ""}
          <div class="dot" style="width:${size}px;height:${size}px;background:${color}"></div>
        </div>`;
      const icon = L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const marker = L.marker([q.lat, q.lon], { icon }).addTo(layer);
      marker.bindPopup(
        `<div class="map-pop"><strong>M${q.mag.toFixed(1)} — ${window.escapeHtml(q.title)}</strong><br/>
         Derinlik: ${q.depth} km<br/>${window.escapeHtml(q.date)}</div>`
      );
      marker._quakeId = q.id;
      if (newIds.has(q.id)) marker.openPopup();
    });
  }

  function renderList(list, newOnes) {
    const wrap = document.getElementById("quakeList");
    document.getElementById("sideCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;

    if (!list.length) {
      wrap.innerHTML = `<div class="sr-empty" style="padding:20px;color:var(--text-muted);text-align:center">Filtreye uyan deprem bulunamadı.</div>`;
      return;
    }
    const newIds = new Set(newOnes.map((q) => q.id));

    wrap.innerHTML = list
      .slice(0, 120)
      .map((q) => {
        const color = magColor(q.mag);
        return `
        <div class="side-row ${newIds.has(q.id) ? "flash" : ""}" data-id="${q.id}" data-lat="${q.lat}" data-lon="${q.lon}">
          <span class="mag-chip" style="background:${color}">${q.mag.toFixed(1)}</span>
          <div class="row-main">
            <div class="row-title">${window.escapeHtml(q.title)}</div>
            <div class="row-sub">${q.depth} km derinlik · ${window.timeAgoTR(q.date.replace(" ", "T"))}</div>
          </div>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll(".side-row").forEach((row) => {
      row.addEventListener("click", () => {
        const lat = parseFloat(row.dataset.lat);
        const lon = parseFloat(row.dataset.lon);
        map.flyTo([lat, lon], 8, { duration: 0.8 });
        layer.eachLayer((m) => {
          if (m._quakeId === row.dataset.id) setTimeout(() => m.openPopup(), 700);
        });
      });
    });
  }

  function renderStats(list) {
    if (!list.length) {
      document.getElementById("statLast").textContent = "—";
      document.getElementById("statLastSub").textContent = "veri yok";
      document.getElementById("statCount").textContent = "0";
      document.getElementById("statMax").textContent = "—";
      document.getElementById("statMaxSub").textContent = "—";
      document.getElementById("statDepth").textContent = "—";
      return;
    }
    const last = list[0];
    document.getElementById("statLast").textContent = `M${last.mag.toFixed(1)}`;
    document.getElementById("statLastSub").textContent = `${last.closestCity || last.title} · ${window.timeAgoTR(last.date.replace(" ", "T"))}`;

    document.getElementById("statCount").textContent = list.length;

    const maxQ = list.reduce((a, b) => (b.mag > a.mag ? b : a), list[0]);
    document.getElementById("statMax").textContent = `M${maxQ.mag.toFixed(1)}`;
    document.getElementById("statMaxSub").textContent = maxQ.closestCity || maxQ.title;

    const avgDepth = list.reduce((s, q) => s + q.depth, 0) / list.length;
    document.getElementById("statDepth").textContent = avgDepth.toFixed(1);
  }
})();
