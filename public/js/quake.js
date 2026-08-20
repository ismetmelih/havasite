(function () {
  "use strict";

  const REFRESH_MS = 25000;
  let map, layer;
  let rawData = [];
  let knownIds = new Set();
  let firstLoad = true;
  let lastQuakeCityPart = "—";
  let lastQuakeDateStr = null;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    initMap();
    setupFilters();
    fetchQuakes();
    setInterval(fetchQuakes, REFRESH_MS);

    initGlobe();
    initTimeline();
    startPulseTicker();
  });

  // ---------------- canli nabiz: her saniye "X once" metnini tazeler ----------------
  function startPulseTicker() {
    setInterval(() => {
      if (!lastQuakeDateStr) return;
      const el = document.getElementById("statLastSub");
      if (el) el.textContent = `${lastQuakeCityPart} · ${window.timeAgoTR(lastQuakeDateStr)}`;
    }, 1000);
  }

  // ---------------- 3D deprem globu ----------------
  function initGlobe() {
    if (!window.QuakeGlobe) return;
    const globe = window.QuakeGlobe.create("quakeGlobeCanvas");
    if (!globe) return;
    fetch("/api/quakes/history?days=7")
      .then((r) => r.json())
      .then((data) => {
        const badge = document.getElementById("globeCount");
        if (data.ok) {
          globe.setQuakes(data.data);
          badge.innerHTML = `<span class="live-blip"></span> ${data.count} deprem (7 gün)`;
        } else {
          badge.innerHTML = `<span class="live-blip"></span> veri alınamadı`;
        }
      })
      .catch(() => {
        document.getElementById("globeCount").innerHTML = `<span class="live-blip"></span> bağlantı hatası`;
      });
  }

  // ---------------- zaman tuneli (son 30 gun replay) ----------------
  function initTimeline() {
    const sliderEl = document.getElementById("timelineSlider");
    const playBtn = document.getElementById("timelinePlay");
    const dateEl = document.getElementById("timelineDate");
    const dayStatEl = document.getElementById("timelineDayStat");
    const speedSel = document.getElementById("timelineSpeed");
    const countBadge = document.getElementById("timelineCount");
    if (!sliderEl) return;

    const tMap = L.map("timelineMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(tMap);
    const tLayer = L.layerGroup().addTo(tMap);

    let days = []; // [{key:"2026-08-01", label, quakes:[...]}] eskiden yeniye
    let playing = false;
    let playTimer = null;

    fetch("/api/quakes/history?days=30")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          countBadge.innerHTML = `<span class="live-blip"></span> veri alınamadı`;
          return;
        }
        days = buildDayBuckets(data.data, 30);
        sliderEl.max = String(days.length - 1);
        sliderEl.value = String(days.length - 1);
        countBadge.innerHTML = `<span class="live-blip"></span> ${data.count} deprem (30 gün)`;
        renderTimelineDay(parseInt(sliderEl.value, 10));
      })
      .catch(() => {
        countBadge.innerHTML = `<span class="live-blip"></span> bağlantı hatası`;
      });

    function buildDayBuckets(list, n) {
      const buckets = new Map();
      const today = new Date();
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { key, quakes: [] });
      }
      list.forEach((q) => {
        const key = (q.date || "").slice(0, 10);
        if (buckets.has(key)) buckets.get(key).quakes.push(q);
      });
      return Array.from(buckets.values());
    }

    function magColorTimeline(mag) {
      if (mag >= 5) return "#d03b3b";
      if (mag >= 3.5) return "#eb6834";
      if (mag >= 2) return "#f5a35c";
      return "#ffd08a";
    }

    function renderTimelineDay(idx) {
      if (!days.length) return;
      idx = Math.max(0, Math.min(idx, days.length - 1));
      const day = days[idx];
      const d = new Date(day.key);
      dateEl.textContent = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });

      tLayer.clearLayers();
      let cumMax = null;
      let cumCount = 0;
      for (let i = 0; i <= idx; i++) {
        days[i].quakes.forEach((q) => {
          cumCount++;
          if (!cumMax || q.mag > cumMax.mag) cumMax = q;
          const isToday = i === idx;
          const size = isToday ? Math.max(8, Math.min(28, 6 + q.mag * 3.6)) : Math.max(5, Math.min(16, 4 + q.mag * 2));
          const color = magColorTimeline(q.mag);
          const marker = L.circleMarker([q.lat, q.lon], {
            radius: size / 2,
            color,
            weight: isToday ? 2 : 0.5,
            fillColor: color,
            fillOpacity: isToday ? 0.9 : 0.35,
          });
          if (isToday) marker.bindTooltip(`M${q.mag.toFixed(1)} — ${q.title}`, { direction: "top" });
          marker.addTo(tLayer);
        });
      }

      const todayCount = day.quakes.length;
      const todayMax = day.quakes.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
      dayStatEl.textContent = todayCount
        ? `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })}: ${todayCount} deprem, en büyüğü M${todayMax.mag.toFixed(1)} (${todayMax.title}). Birikimli toplam: ${cumCount} deprem.`
        : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })}: bu gün deprem kaydı yok. Birikimli toplam: ${cumCount} deprem.`;
    }

    sliderEl.addEventListener("input", () => renderTimelineDay(parseInt(sliderEl.value, 10)));

    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "⏸ Duraklat" : "▶ Oynat";
      if (playing) {
        if (parseInt(sliderEl.value, 10) >= days.length - 1) sliderEl.value = "0";
        stepPlay();
      } else {
        clearTimeout(playTimer);
      }
    });

    function stepPlay() {
      if (!playing) return;
      let idx = parseInt(sliderEl.value, 10);
      renderTimelineDay(idx);
      if (idx >= days.length - 1) {
        playing = false;
        playBtn.textContent = "▶ Oynat";
        return;
      }
      sliderEl.value = String(idx + 1);
      playTimer = setTimeout(stepPlay, parseInt(speedSel.value, 10));
    }
  }

  function initMap() {
    map = L.map("quakeMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.6);
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

    window.bindRangeFill && window.bindRangeFill(magRange);
    magRange.addEventListener("input", () => {
      magVal.textContent = `${parseFloat(magRange.value).toFixed(1)}+`;
      window.flashUpdate && window.flashUpdate(magVal);
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
      // API'nin verdigi bolge adi (ornegin "WESTERN TURKEY") yerine, varsa daha
      // isabetli bir il ismi gostermek icin istemci tarafinda en yakin ili hesapla.
      data.data.forEach((q) => {
        if (!q.closestCity && window.nearestCity) {
          const near = window.nearestCity(q.lat, q.lon);
          if (near) q.closestCity = `${near.city.name} yakını`;
        }
      });

      const alertMag = (window.HavaPrefs && window.HavaPrefs.get().quakeAlertMag) || 3.5;
      const newOnes = firstLoad ? [] : data.data.filter((q) => !knownIds.has(q.id) && q.mag >= alertMag);
      rawData = data.data;
      knownIds = new Set(rawData.map((q) => q.id));
      firstLoad = false;

      document.getElementById("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())}`;
      const badge = document.getElementById("quakeSourceBadge");
      if (badge) {
        const label = data.source === "emsc" ? "EMSC" : "AFAD";
        badge.innerHTML = `<span class="live-blip"></span> ${label} · her 25 sn yenilenir`;
      }
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
        <div class="pulse-marker ${newIds.has(q.id) ? "pop" : ""}">
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
      .map((q, i) => {
        const color = magColor(q.mag);
        return `
        <div class="side-row ${newIds.has(q.id) ? "flash" : ""}" style="--i:${Math.min(i, 14)}" data-id="${q.id}" data-lat="${q.lat}" data-lon="${q.lon}">
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
    setStatText("statLast", `M${last.mag.toFixed(1)}`);
    lastQuakeCityPart = last.closestCity || last.title;
    lastQuakeDateStr = last.date.replace(" ", "T");
    document.getElementById("statLastSub").textContent = `${lastQuakeCityPart} · ${window.timeAgoTR(lastQuakeDateStr)}`;

    setStatText("statCount", list.length);

    const maxQ = list.reduce((a, b) => (b.mag > a.mag ? b : a), list[0]);
    setStatText("statMax", `M${maxQ.mag.toFixed(1)}`);
    document.getElementById("statMaxSub").textContent = maxQ.closestCity || maxQ.title;

    const avgDepth = list.reduce((s, q) => s + q.depth, 0) / list.length;
    setStatText("statDepth", avgDepth.toFixed(1));
  }

  // deger degistiginde kisa bir "canli" flash animasyonu oynatir
  function setStatText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = String(value);
    if (el.textContent !== text) {
      el.textContent = text;
      window.flashUpdate && window.flashUpdate(el);
    }
  }
})();
